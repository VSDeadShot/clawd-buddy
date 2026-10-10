import { pack } from './pack.ts'
import type { Frame, MoodRow } from './registry-types.ts'

export const BODY_CELLS = 9
export const LABEL_CELLS = 10
// Body, space, tag, space, label.
export const PERCH_CELLS = BODY_CELLS + 1 + 1 + 1 + LABEL_CELLS

// A pose is drawn as 9 x 6 pixels and packed two pixel rows to a text row,
// giving the 9-cell, 3-row body every frame has.
type Grid = readonly [string, string, string, string, string, string]

function pose(grid: Grid): Frame['body'] {
  const [top = '', middle = '', bottom = ''] = pack(grid)
  return [top, middle, bottom]
}

// Clawd after the Claude Code welcome banner: head with two eye holes, arms
// out, body, four legs.
const RESTING = pose([
  '.#######.',
  '.#.###.#.',
  '#########',
  '.#######.',
  '.#.#.#.#.',
  '.........',
])

// The same with his eyes shut.
const EYES_SHUT = pose([
  '.#######.',
  '.#######.',
  '#########',
  '.#######.',
  '.#.#.#.#.',
  '.........',
])

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
