import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { EngineState, Tween } from '../types'
import { fits } from './fit.ts'
import { perchRows } from './layout.ts'
import { holdAt, initialState, nextWake, reduce } from './mood-engine.ts'
import { IDLE, MOODS } from './moods.ts'
import { pack } from './pack.ts'
import type { MoodRow, Signal } from './registry-types.ts'
import { toolEnd, toolStart } from './signals.ts'
import { TWEEN_MS, tweenFrames } from './tween.ts'

// Every hook here follows one rule (AGENTS.md): it returns exactly what
// next(e) resolved to and never decides anything. Signals go to the engine
// unawaited, so no call, turn or prompt waits on Clawd, and each hook's
// .catch passes through if Clawd's own code throws.

// The mood engine's state. Held by the host, so a hot reload keeps the mood.
const engineState = atom({ plugin: 'clawd-buddy', key: 'engine' } as const, initialState(IDLE.id) as EngineState)

// The frame of the shown mood, read while drawing, so a write redraws the
// perch alone.
const frameIndex = atom({ plugin: 'clawd-buddy', key: 'frame' } as const, 0)

// The body of the in-between on screen while Clawd eases into a new mood,
// drawn in place of the frame's own; null once the mood's own frames play.
const tweenRows = atom({ plugin: 'clawd-buddy', key: 'tween' } as const, null as Tween)

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

// The engine's state as the last signal left it, kept here so a frame tick
// reads its mood's age without waiting on the host.
let latest: EngineState | undefined

// The pixel grid the frame timer last put on screen, an in-between's
// included, so a change mid-way eases on from what is there.
let onScreen: readonly string[] | undefined

// Whether the band last drew without him (too narrow or short, a survey, not
// the terminal). A mood that changes then starts without easing in, and its
// frame becomes the one on screen, so he comes back in his current pose
// rather than easing on from one nobody saw.
let perchHidden = false

// Each frame's hold is read as the frame starts, at `at`: the time the mood
// came on screen plus the holds since. So a mood that runs long speeds up
// mid-animation without a restart, and the tick stays synchronous: no await
// in which a mood change could slip a second timer in beside this one.
//
// A new mood first eases in from the pose on screen: two in-betweens of
// TWEEN_MS on the same timer, then its own frames from the first.
function startFrames($: EngineInterface, mood: MoodRow, now: number) {
  frameTimer?.cancel()
  frameTimer = undefined
  const first = mood.frames[0].grid
  const between = mood.snap === true || perchHidden || onScreen === undefined ? [] : tweenFrames(onScreen, first)

  const schedule = (index: number, at: number) => {
    const hold = latest === undefined ? null : holdAt(MOODS, latest, mood.id, index, at)
    if (hold === null) return
    frameTimer = $.clock.after(hold, () => {
      const next = (index + 1) % mood.frames.length
      onScreen = mood.frames[next]?.grid
      void update($, frameIndex, () => next).catch(() => {})
      schedule(next, at + hold)
    })
  }

  // The in-between goes on screen before the frame index resets, so the new
  // mood's first frame never flashes up ahead of it.
  const ease = (step: number, at: number) => {
    const grid = between[step]
    if (grid === undefined) {
      onScreen = first
      void update($, tweenRows, () => null).catch(() => {})
      schedule(0, at)
      return
    }
    onScreen = grid
    void update($, tweenRows, () => pack(grid)).catch(() => {})
    frameTimer = $.clock.after(TWEEN_MS, () => ease(step + 1, at + TWEEN_MS))
  }
  ease(0, now)
  void update($, frameIndex, () => 0).catch(() => {})
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
  latest = state
  if (state.showing !== animating) {
    animating = state.showing
    startFrames($, moodOf(state.showing), now)
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
    perchHidden = e.surface !== 'terminal' || e.props.hasSurvey || !fits(e.props.bodyColumns, e.props.maxRows)
    if (perchHidden) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const mood = moodOf((await read($, engineState)).showing)
    const frame = mood.frames[(await read($, frameIndex)) % mood.frames.length] ?? mood.frames[0]
    const between = await read($, tweenRows)
    const body = between === null ? frame.body : ([between[0] ?? '', between[1] ?? '', between[2] ?? ''] as const)
    const [top, middle, bottom] = perchRows(mood, { ...frame, body }, e.props.bodyColumns)

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
