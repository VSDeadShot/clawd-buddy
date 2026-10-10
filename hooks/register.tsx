import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import { GAP_BEFORE_MARK, fits } from './fit.ts'
import { BODY_CELLS, IDLE, holdOf } from './moods.ts'
import type { MoodRow } from './registry-types.ts'

// The frame of the shown mood. Held by the host, so a hot reload keeps it,
// and read while drawing, so a write redraws the perch alone.
const frameIndex = atom({ plugin: 'clawd-buddy', key: 'frame' } as const, 0)

// At most one timer at a time: the wait for the current frame to end. Each
// tick schedules the next, so frames with different hold times (a blink) need
// no fast interval underneath them, and a static mood has no timer at all.
let pending: Timer | undefined

function stopFrames() {
  pending?.cancel()
  pending = undefined
}

function startFrames($: EngineInterface, mood: MoodRow) {
  stopFrames()
  void update($, frameIndex, () => 0).catch(() => {})

  const schedule = (index: number) => {
    const hold = holdOf(mood, index)
    if (hold === null) return
    pending = $.clock.after(hold, () => {
      const next = (index + 1) % mood.frames.length
      void update($, frameIndex, () => next).catch(() => {})
      schedule(next)
    })
  }
  schedule(0)
}

export const register: Register = on => {
  // Starts the frame clock once the session is up, and again after a hot
  // reload (which fires session.start anew and drops the old timers). The
  // engine's answer is returned as it came: Clawd only watches.
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    startFrames($, IDLE)
    return result
  }).catch(($, e, next) => next(e))

  // The perch: three rows at the right end of the band above the prompt,
  // never a pane. Desktop and the other surfaces keep the engine's own band
  // in v1.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey || !fits(e.props.bodyColumns, e.props.maxRows)) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const mood = IDLE
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
