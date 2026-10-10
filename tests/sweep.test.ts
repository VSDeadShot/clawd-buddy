import { describe, expect, test } from 'claude-code/testing'

import { fits } from '../hooks/fit.ts'
import { perchRows } from '../hooks/layout.ts'
import { MOODS } from '../hooks/moods.ts'
import { consoleCells } from './cells.ts'

// The engine keeps five columns at the band's right end for its [-] mark.
const MARK_COLUMNS = 5

describe('the perch at every terminal width from 40 to 200', () => {
  for (const row of MOODS) {
    test(`${row.id}: every frame stays clear of [-] even where the console widens a glyph`, async () => {
      const overflows: string[] = []
      for (let width = 40; width <= 200; width += 1) {
        const bodyColumns = width - MARK_COLUMNS
        if (!fits(bodyColumns, 3)) continue
        row.frames.forEach((frame, index) => {
          const [top, middle, bottom] = perchRows(row, frame, bodyColumns)
          const drawn: [number, string][] = [
            [top.start, `${top.label} ${top.tag} ${top.body}`],
            [middle.start, middle.body],
            [bottom.start, bottom.body],
          ]
          for (const [start, text] of drawn) {
            const end = start + consoleCells(text)
            if (start < 0 || end > bodyColumns - 1) overflows.push(`${width} cols, frame ${index}: "${text}" ends at ${end}`)
          }
        })
      }
      expect(overflows, 'no row of any frame reaches the gap before [-] at any width').toEqual([])
    })
  }
})
