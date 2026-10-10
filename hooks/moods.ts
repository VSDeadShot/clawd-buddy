import type { MoodRow } from './registry-types.ts'

export const BODY_CELLS = 9
export const LABEL_CELLS = 10
// Body, space, tag, space, label.
export const PERCH_CELLS = BODY_CELLS + 1 + 1 + 1 + LABEL_CELLS

// Clawd as the Claude Code welcome banner draws him, padded to 9 cells a row.
const RESTING = [' ▐▛███▜▌ ', '▝▜█████▛▘', '  ▘▘ ▝▝  '] as const

export const MOODS: readonly MoodRow[] = [
  {
    id: 'idle',
    label: 'idle',
    priority: 0,
    frames: [{ body: RESTING, tag: '·' }],
    frameMs: null,
  },
]

export const IDLE: MoodRow = MOODS[0]!
