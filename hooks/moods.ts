import { pack } from './pack.ts'
import type { Frame, Grid, MoodRow } from './registry-types.ts'

export const BODY_CELLS = 9
export const LABEL_CELLS = 10
// Body, space, tag, space, label.
export const PERCH_CELLS = BODY_CELLS + 1 + 1 + 1 + LABEL_CELLS

// A pose is drawn as 9 x 6 pixels and packed two pixel rows to a text row,
// giving the 9-cell, 3-row body every frame has. A frame keeps both, so the
// engine can ease between poses pixel by pixel.
function pose(grid: Grid): Pick<Frame, 'grid' | 'body'> {
  const [top = '', middle = '', bottom = ''] = pack(grid)
  return { grid, body: [top, middle, bottom] }
}

// Clawd after the Claude Code welcome banner: head with two eye holes, arms
// out, body, four legs reaching the band's bottom edge.
const RESTING = pose([
  '.#######.',
  '.#.###.#.',
  '#########',
  '.#######.',
  '.#.#.#.#.',
  '.#.#.#.#.',
])

// The same with his eyes shut.
const EYES_SHUT = pose([
  '.#######.',
  '.#######.',
  '#########',
  '.#######.',
  '.#.#.#.#.',
  '.#.#.#.#.',
])

// Crouched: the whole body a pixel lower, feet still planted.
const CROUCHED = pose([
  '.........',
  '.#######.',
  '.#.###.#.',
  '#########',
  '.#######.',
  '.#.#.#.#.',
])

// Crouched with his outer feet lifted.
const CROUCHED_OUTER_UP = pose([
  '.........',
  '.#######.',
  '.#.###.#.',
  '#########',
  '.#######.',
  '.#.....#.',
])

// Standing with his inner feet lifted.
const INNER_UP = pose([
  '.#######.',
  '.#.###.#.',
  '#########',
  '.#######.',
  '.#.#.#.#.',
  '...#.#...',
])

// Crouched with his eyes shut: a breath out while asleep.
const CROUCHED_SHUT = pose([
  '.........',
  '.#######.',
  '.#######.',
  '#########',
  '.#######.',
  '.#.#.#.#.',
])

// Right arm raised to the eye line, as if holding a pen.
const PEN_UP = pose([
  '.#######.',
  '.#.###.##',
  '########.',
  '.#######.',
  '.#.#.#.#.',
  '.#.#.#.#.',
])

// Knocked down a row, both arms thrown up, legs splayed.
const KNOCKED = pose([
  '.........',
  '.#######.',
  '##.###.##',
  '.#######.',
  '.#######.',
  '#.#...#.#',
])

// The registry. The lowest-priority row is the one Clawd rests in.
export const MOODS: readonly MoodRow[] = [
  {
    id: 'idle',
    label: 'idle',
    trigger: [{ on: 'session.start' }, { on: 'turn.complete' }],
    priority: 0,
    frames: [
      { ...RESTING, tag: '.' },
      { ...EYES_SHUT, tag: '.' },
    ],
    frameMs: [3800, 200],
    durationMs: 'sticky',
  },
  {
    // Five quiet minutes resting and he dozes off; the next turn wakes him.
    id: 'sleepy',
    label: 'sleepy',
    trigger: { on: 'quiet', ms: 300_000, while: 'idle' },
    priority: 10,
    frames: [
      { ...EYES_SHUT, tag: 'z' },
      { ...CROUCHED_SHUT, tag: 'Z' },
    ],
    frameMs: 1200,
    durationMs: 'sticky',
  },
  {
    // A crouch-bob with his feet planted and a thought bubble that grows and
    // shrinks in the tag. The last frame is the standing pose the first one
    // starts from, so the loop has no seam.
    id: 'thinking',
    label: 'thinking',
    trigger: { on: 'turn.start' },
    priority: 20,
    frames: [
      { ...RESTING, tag: '.' },
      { ...RESTING, tag: 'o' },
      { ...CROUCHED, tag: 'o' },
      { ...CROUCHED, tag: 'O' },
      { ...CROUCHED_OUTER_UP, tag: 'O' },
      { ...RESTING, tag: 'o' },
      { ...INNER_UP, tag: '.' },
      { ...RESTING, tag: '.' },
    ],
    frameMs: 140,
    durationMs: 'turn',
  },
  {
    id: 'writing',
    label: 'writing',
    trigger: { on: 'tool.start', tool: /^(Edit|Write|MultiEdit|NotebookEdit)$/ },
    priority: 50,
    frames: [{ ...PEN_UP, tag: '>' }],
    frameMs: null,
    durationMs: 'call',
  },
  {
    id: 'oops',
    label: 'oops',
    trigger: { on: 'tool.end', outcome: 'error' },
    priority: 90,
    frames: [{ ...KNOCKED, tag: '!' }],
    frameMs: null,
    durationMs: 3000,
    tagColor: 'error',
    snap: true,
  },
]

export const IDLE: MoodRow = MOODS[0]!
