import type { Register } from 'claude-code'

import { IDLE } from './moods.ts'

export const register: Register = on => {
  // The perch: two rows above the prompt, never a pane. Desktop and the
  // other surfaces keep the engine's own band in v1.
  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const mood = IDLE
    const frame = mood.frames[0]
    const [top, bottom] = frame.body

    return (
      <Box key="perch" flexDirection="column" alignItems="flex-start">
        <Box flexDirection="row">
          <Text color="claude" wrap="truncate">
            {top}
          </Text>
          <Text color={mood.tagColor ?? 'claude'} wrap="truncate">
            {` ${frame.tag} `}
          </Text>
          <Text key="label" dimColor wrap="truncate">
            {mood.label}
          </Text>
        </Box>
        <Text color="claude" wrap="truncate">
          {bottom}
        </Text>
      </Box>
    )
  })
}
