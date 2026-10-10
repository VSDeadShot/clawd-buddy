import { describe, expect, test } from 'claude-code/testing'

import { BODY_CELLS, PERCH_CELLS, LABEL_CELLS, MOODS } from '../hooks/moods.ts'
import { cells } from './cells.ts'

describe('the mood registry', () => {
  test('sizes the perch at a 7-cell body and at most 20 cells across', async () => {
    expect(BODY_CELLS, 'the body is 7 cells wide').toBe(7)
    expect(PERCH_CELLS <= 20, 'body, tag and label fit in 20 cells').toBe(true)
  })

  test('holds at least the idle mood', async () => {
    expect(MOODS.some(row => row.id === 'idle'), 'idle is the mood Clawd rests in').toBe(true)
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
      expect((width ?? 0) <= LABEL_CELLS, `the label fits in ${LABEL_CELLS} cells`).toBe(true)
    })

    test(`${row.id}: every frame is the same size`, async () => {
      for (const frame of row.frames) {
        expect(frame.body.length, 'a frame has two body rows').toBe(2)
        for (const line of frame.body) {
          expect(cells(line), `each body row is exactly ${BODY_CELLS} single-width cells`).toBe(BODY_CELLS)
        }
        expect(cells(frame.tag), 'the tag is exactly one single-width cell').toBe(1)
        const top = `${frame.body[0]} ${frame.tag} ${row.label}`
        expect((cells(top) ?? Infinity) <= PERCH_CELLS, `the top row fits in ${PERCH_CELLS} cells`).toBe(true)
      }
    })

    test(`${row.id}: animates only when it has more than one frame`, async () => {
      if (row.frameMs === null) {
        expect(row.frames.length, 'a static mood has exactly one frame').toBe(1)
      } else {
        expect(row.frames.length > 1, 'an animated mood has several frames').toBe(true)
        expect(row.frameMs >= 100, 'frames change no faster than ten times a second').toBe(true)
      }
    })
  }
})
