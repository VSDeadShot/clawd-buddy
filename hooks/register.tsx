import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { EngineState } from '../types'
import { fits } from './fit.ts'
import { perchRows } from './layout.ts'
import { initialState, nextWake, reduce } from './mood-engine.ts'
import { IDLE, MOODS, holdOf } from './moods.ts'
import type { MoodRow, Signal } from './registry-types.ts'
import { toolEnd, toolStart } from './signals.ts'

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
    void dispatch($, toolEnd(started, result)).catch(() => {})
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
    const [top, middle, bottom] = perchRows(mood, frame, e.props.bodyColumns)

    return (
      <Box key="perch" flexDirection="column">
        <Box flexDirection="row" marginLeft={top.start}>
          <Text dimColor wrap="truncate">
            {top.label}
          </Text>
          <Text color={mood.tagColor ?? 'claude'} wrap="truncate">
            {` ${top.tag} `}
          </Text>
          <Text color="claude" wrap="truncate">
            {top.body}
          </Text>
        </Box>
        <Box marginLeft={middle.start}>
          <Text color="claude" wrap="truncate">
            {middle.body}
          </Text>
        </Box>
        <Box marginLeft={bottom.start}>
          <Text color="claude" wrap="truncate">
            {bottom.body}
          </Text>
        </Box>
      </Box>
    )
  })
}
