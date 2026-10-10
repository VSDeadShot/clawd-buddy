import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { EngineState } from '../types'
import { GAP_BEFORE_MARK, fits } from './fit.ts'
import { initialState, nextWake, reduce } from './mood-engine.ts'
import { BODY_CELLS, IDLE, MOODS, holdOf } from './moods.ts'
import type { MoodRow, Signal } from './registry-types.ts'

// Every hook here follows one rule (AGENTS.md): it returns exactly what
// next(e) resolved to and never decides anything. Signals go to the engine
// unawaited, so no call, turn or prompt waits on Clawd, and each hook's
// .catch passes through if Clawd's own code throws.

// The mood engine's state. Held by the host, so a hot reload keeps the mood.
const engineState = atom({ plugin: 'clawd-buddy', key: 'engine' } as const, initialState(IDLE.id) as EngineState)

// The frame of the shown mood, read while drawing, so a write redraws the
// perch alone.
const frameIndex = atom({ plugin: 'clawd-buddy', key: 'frame' } as const, 0)

const moodOf = (id: string): MoodRow => MOODS.find(row => row.id === id) ?? IDLE

// The mood whose frames are running. Starts unset in every load, so the
// first signal after a hot reload starts its frames again.
let animating: string | undefined

// At most one frame timer: the wait for the current frame to end. Each tick
// schedules the next, so frames with different hold times (a blink) need no
// fast interval underneath them, and a static mood has no timer at all.
let frameTimer: Timer | undefined

// At most one deadline timer: the engine's next wake, when a timed mood runs
// out or a quiet spell reaches its threshold.
let wakeTimer: Timer | undefined

function startFrames($: EngineInterface, mood: MoodRow) {
  frameTimer?.cancel()
  frameTimer = undefined
  void update($, frameIndex, () => 0).catch(() => {})

  const schedule = (index: number) => {
    const hold = holdOf(mood, index)
    if (hold === null) return
    frameTimer = $.clock.after(hold, () => {
      const next = (index + 1) % mood.frames.length
      void update($, frameIndex, () => next).catch(() => {})
      schedule(next)
    })
  }
  schedule(0)
}

function armWake($: EngineInterface, state: EngineState, now: number) {
  wakeTimer?.cancel()
  wakeTimer = undefined
  const at = nextWake(MOODS, state, now)
  if (at === null) return
  wakeTimer = $.clock.after(Math.max(0, at - now), () => {
    void dispatch($, { kind: 'tick' }).catch(() => {})
  })
}

// Runs a signal through the engine, then brings the timers in line with the
// mood it shows: a new mood restarts the frames (cancelling the old mood's
// timer), and the deadline is re-armed for whatever comes next.
async function dispatch($: EngineInterface, signal: Signal) {
  const now = await $.clock.now()
  const state = await update($, engineState, s => reduce(MOODS, s, signal, now))
  if (state.showing !== animating) {
    animating = state.showing
    startFrames($, moodOf(state.showing))
  }
  armWake($, state, now)
}

// The fields a tool call's mood can match on, read from its arguments.
function toolStart(e: { tool: string; tool_use_id: string }): Signal {
  const input = e as unknown as Record<string, unknown>
  const text = (key: string) => (typeof input[key] === 'string' ? (input[key] as string) : undefined)
  return {
    kind: 'tool.start',
    callId: e.tool_use_id,
    tool: String(e.tool),
    command: text('command'),
    path: text('file_path') ?? text('notebook_path'),
    subagentType: text('subagent_type'),
  }
}

export const register: Register = on => {
  // Also fires again after a hot reload, which restarts the frames and the
  // deadline from the mood the host kept.
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    animating = undefined
    void dispatch($, { kind: 'session.start' }).catch(() => {})
    return result
  }).catch(($, e, next) => next(e))

  on('session.end', async ($, e, next) => {
    const result = await next(e)
    void dispatch($, { kind: 'session.end' }).catch(() => {})
    return result
  }).catch(($, e, next) => next(e))

  on('turn.start', ($, e, next) => {
    void dispatch($, { kind: 'turn.start' }).catch(() => {})
    return next(e)
  }).catch(($, e, next) => next(e))

  // Subagents' turns and calls carry an agentId; Clawd follows the main loop.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) void dispatch($, { kind: 'turn.complete', reason: e.reason }).catch(() => {})
    return result
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const started = toolStart(e)
    void dispatch($, started).catch(() => {})
    const result = await next(e)
    void dispatch($, { kind: 'tool.end', callId: e.tool_use_id, tool: String(e.tool), isError: result.isError === true }).catch(() => {})
    return result
  }).catch(($, e, next) => next(e))

  on('classic.Notification', ($, e, next) => {
    void dispatch($, { kind: 'notification', type: e.notification_type }).catch(() => {})
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.CwdChanged', ($, e, next) => {
    void dispatch($, { kind: 'cwd.changed' }).catch(() => {})
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.PreCompact', ($, e, next) => {
    void dispatch($, { kind: 'compact' }).catch(() => {})
    return next(e)
  }).catch(($, e, next) => next(e))

  // The perch: three rows at the right end of the band above the prompt,
  // never a pane. Desktop and the other surfaces keep the engine's own band
  // in v1.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey || !fits(e.props.bodyColumns, e.props.maxRows)) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const mood = moodOf((await read($, engineState)).showing)
    const frame = mood.frames[(await read($, frameIndex)) % mood.frames.length] ?? mood.frames[0]
    const [top, middle, bottom] = frame.body
    // Each row is pushed right by its own width, so the body's right edge
    // lines up on every row whatever the label's length. Labels are
    // single-cell characters only (tests/cells.ts), so length is width.
    const rightEdge = e.props.bodyColumns - GAP_BEFORE_MARK
    const startOf = (width: number) => rightEdge - width
    const topWidth = [...mood.label].length + 3 + BODY_CELLS

    return (
      <Box key="perch" flexDirection="column">
        <Box flexDirection="row" marginLeft={startOf(topWidth)}>
          <Text dimColor wrap="truncate">
            {mood.label}
          </Text>
          <Text color={mood.tagColor ?? 'claude'} wrap="truncate">
            {` ${frame.tag} `}
          </Text>
          <Text color="claude" wrap="truncate">
            {top}
          </Text>
        </Box>
        <Box marginLeft={startOf(BODY_CELLS)}>
          <Text color="claude" wrap="truncate">
            {middle}
          </Text>
        </Box>
        <Box marginLeft={startOf(BODY_CELLS)}>
          <Text color="claude" wrap="truncate">
            {bottom}
          </Text>
        </Box>
      </Box>
    )
  })
}
