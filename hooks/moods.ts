import type { MoodRow } from './registry-types.ts'

export const BODY_CELLS = 7
export const LABEL_CELLS = 10
// Body, space, tag, space, label.
export const PERCH_CELLS = BODY_CELLS + 1 + 1 + 1 + LABEL_CELLS

// Clawd as the Claude Code welcome banner draws him, redrawn on a 14 x 4 pixel
// grid and packed two pixels by two into quadrant blocks:
//
//   ..##########..   head
//   ..##.####.##..   eyes
//   ##############   arms
//   ...#.#..#.#...   legs
const RESTING = [' █▜█▛█ ', '▀▜▜▀▛▛▀'] as const

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
