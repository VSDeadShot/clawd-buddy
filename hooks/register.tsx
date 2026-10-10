import type { Register } from 'claude-code'

import { BODY_CELLS, IDLE } from './moods.ts'

// Columns left empty between Clawd and the engine's [-] collapse mark, which
// sits just past the band's bodyColumns.
const GAP_BEFORE_MARK = 1

export const register: Register = on => {
  // The perch: three rows at the right end of the band above the prompt,
  // never a pane. Desktop and the other surfaces keep the engine's own band
  // in v1.
  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const mood = IDLE
    const frame = mood.frames[0]
    const [top, middle, bottom] = frame.body
    // Each row is pushed right by its own width, so the body's right edge
    // lines up on every row whatever the label's length. Labels are
    // single-cell characters only (tests/cells.ts), so length is width.
    const rightEdge = e.props.bodyColumns - GAP_BEFORE_MARK
    const startOf = (width: number) => Math.max(0, rightEdge - width)
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
