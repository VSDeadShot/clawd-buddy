import type { MoodRow } from './registry-types.ts'

export const BODY_CELLS = 9
export const LABEL_CELLS = 10
// Body, space, tag, space, label.
export const PERCH_CELLS = BODY_CELLS + 1 + 1 + 1 + LABEL_CELLS

// Clawd as the Claude Code welcome banner draws him, padded to 9 cells a row.
const RESTING = [' ▐▛███▜▌ ', '▝▜█████▛▘', '  ▘▘ ▝▝  '] as const
// The same with the eye holes filled in.
const EYES_SHUT = [' ▐█████▌ ', RESTING[1], RESTING[2]] as const

export const MOODS: readonly MoodRow[] = [
  {
    id: 'idle',
    label: 'idle',
    priority: 0,
    frames: [
      { body: RESTING, tag: '·' },
      { body: EYES_SHUT, tag: '·' },
    ],
    frameMs: [3800, 200],
  },
]

export const IDLE: MoodRow = MOODS[0]!

// How long frame `index` of a mood holds, or null when the mood never moves.
export function holdOf(mood: MoodRow, index: number): number | null {
  if (mood.frameMs === null) return null
  return typeof mood.frameMs === 'number' ? mood.frameMs : (mood.frameMs[index] ?? null)
}
