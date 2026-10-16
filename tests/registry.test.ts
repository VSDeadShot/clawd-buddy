import { describe, expect, test } from 'claude-code/testing'

import { BODY_CELLS, PERCH_CELLS, LABEL_CELLS, MOODS } from '../hooks/moods.ts'
import { pack } from '../hooks/pack.ts'
import { cells } from './cells.ts'

// The blocks every console font has: they are in code page 437, which the
// Windows console's own fonts are built around. Quadrant blocks (▖▗▘▝▚▞▙▛▜▟)
// are not, and draw as "?" boxes there.
const BODY_SAFE = new Set(['█', '▀', '▄', '▌', '▐', ' '])
// Tags and labels sit on the top row beside the [-] mark, so they keep to
// printable ASCII: every character there is one cell in every console. Latin-1
// (· ×) is not safe: the console sizes ambiguous-width characters from its font.
const isAscii = (text: string) => [...text].every(ch => ch >= ' ' && ch <= '~')

describe('the mood registry', () => {
  test('every frame keeps its pixel grid, and its body is that grid packed', async () => {
    for (const row of MOODS) {
      for (const [i, frame] of row.frames.entries()) {
        const grid = (frame as { grid?: readonly string[] }).grid
        expect(grid === undefined ? undefined : pack(grid), `${row.id} f${i}: the grid tweens ease between`).toEqual([...frame.body])
      }
    }
  })

  test('holds at least the idle mood', async () => {
    expect(MOODS.some(row => row.id === 'idle'), 'idle is the mood Clawd rests in').toBe(true)
  })

  test('idle blinks: eyes open for 3.8 s, closed for 200 ms', async () => {
    const idle = MOODS.find(row => row.id === 'idle')
    expect(idle?.frames.length, 'idle has an open and a closed frame').toBe(2)
    expect(idle?.frameMs, 'each frame holds its own time').toEqual([3800, 200])
  })

  test('thinking bobs in 8 frames of 140 ms with a growing thought bubble', async () => {
    const thinking = MOODS.find(row => row.id === 'thinking')
    expect(thinking?.frames.length, 'eight frames').toBe(8)
    expect(thinking?.frameMs, 'each held 140 ms, a 1.12 s loop').toBe(140)
    expect(thinking?.frames.map(f => f.tag), 'the bubble grows and shrinks').toEqual(['.', 'o', 'o', 'O', 'O', 'o', '.', '.'])
  })

  test('thinking loops cleanly: the last frame flows into the first', async () => {
    const frames = MOODS.find(row => row.id === 'thinking')?.frames ?? []
    expect(frames.at(-1)?.body, 'f7 is the standing pose f0 starts from').toEqual(frames[0]?.body)
  })

  test('sleepy breathes slowly in 2 frames of 1.2 s, eyes shut', async () => {
    const sleepy = MOODS.find(row => row.id === 'sleepy')
    expect(sleepy?.frames.length, 'in and out').toBe(2)
    expect(sleepy?.frameMs, 'a slow breath').toBe(1200)
    expect(sleepy?.frames.map(f => f.tag), 'z then Z').toEqual(['z', 'Z'])
  })

  test('gives every mood a unique id, label and priority', async () => {
    const unique = (values: unknown[]) => new Set(values).size === values.length
    expect(unique(MOODS.map(row => row.id)), 'no two moods share an id').toBe(true)
    expect(unique(MOODS.map(row => row.label)), 'no two moods share a label').toBe(true)
    expect(unique(MOODS.map(row => row.priority)), 'no two moods share a priority').toBe(true)
  })

  for (const row of MOODS) {
    test(`${row.id}: label is short, narrow and fits beside the body`, async () => {
      expect(row.label.length > 0, 'a label is never empty').toBe(true)
      const width = cells(row.label)
      expect(width, 'the label uses only single-cell characters').not.toBeNull()
      expect(isAscii(row.label), `the label "${row.label}" is printable ASCII`).toBe(true)
      expect((width ?? 0) <= LABEL_CELLS, `the label fits in ${LABEL_CELLS} cells`).toBe(true)
    })

    test(`${row.id}: every frame is the same size`, async () => {
      for (const frame of row.frames) {
        expect(frame.body.length, 'a frame has three body rows').toBe(3)
        for (const line of frame.body) {
          expect(cells(line), `each body row is exactly ${BODY_CELLS} single-width cells`).toBe(BODY_CELLS)
        }
        expect(cells(frame.tag), 'the tag is exactly one single-width cell').toBe(1)
        const top = `${frame.body[0]} ${frame.tag} ${row.label}`
        expect((cells(top) ?? Infinity) <= PERCH_CELLS, `the top row fits in ${PERCH_CELLS} cells`).toBe(true)
      }
    })

    test(`${row.id}: draws its body only with blocks every console font has`, async () => {
      for (const frame of row.frames) {
        for (const line of frame.body) {
          for (const ch of line) {
            expect(BODY_SAFE.has(ch), `"${ch}" is one of █ ▀ ▄ ▌ ▐ or a space`).toBe(true)
          }
        }
        expect(isAscii(frame.tag), `the tag "${frame.tag}" is printable ASCII`).toBe(true)
      }
    })

    test(`${row.id}: stands with his feet on the band's bottom edge`, async () => {
      // The band's last row sits one engine row above the prompt border, the
      // closest the band gets to it; feet drawn in the lower half of that row
      // (█ or ▄) touch its bottom edge rather than floating half a row up.
      for (const frame of row.frames) {
        const feet = frame.body[2]
        expect(/[█▄]/.test(feet), `"${feet}" reaches the bottom edge`).toBe(true)
      }
    })

    test(`${row.id}: animates only when it has more than one frame`, async () => {
      if (row.frameMs === null) {
        expect(row.frames.length, 'a static mood has exactly one frame').toBe(1)
        return
      }
      expect(row.frames.length > 1, 'an animated mood has several frames').toBe(true)
      const holds = typeof row.frameMs === 'number' ? [row.frameMs] : row.frameMs
      if (typeof row.frameMs !== 'number') {
        expect(holds.length, 'one hold time per frame').toBe(row.frames.length)
      }
      for (const ms of holds) {
        expect(ms >= 100, 'frames change no faster than ten times a second').toBe(true)
      }
    })
  }
})
