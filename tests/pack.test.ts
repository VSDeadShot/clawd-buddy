import { describe, expect, test } from 'claude-code/testing'

import { pack } from '../hooks/pack.ts'

describe('pack', () => {
  test('draws top-only as ▀, bottom-only as ▄, both as █ and neither as a space', async () => {
    expect(pack(['##..', '#.#.']), 'one cell of each kind').toEqual(['█▀▄ '])
  })

  test('turns six pixel rows into three text rows', async () => {
    const rows = pack(['#', '.', '.', '#', '#', '#'])
    expect(rows, 'top, bottom, both').toEqual(['▀', '▄', '█'])
  })

  test('uses only the block characters every console font has', async () => {
    const grid = ['#.#.#.#', '.##..##', '###.#.#', '#..#..#']
    const safe = new Set(['█', '▀', '▄', ' '])
    for (const row of pack(grid)) {
      for (const ch of row) expect(safe.has(ch), `"${ch}" is drawn with a widely supported block`).toBe(true)
    }
  })

  test('refuses an odd number of pixel rows', async () => {
    expect(() => pack(['#', '#', '#']), 'pixel rows pair up into text rows').toThrow()
  })

  test('refuses rows of different widths', async () => {
    expect(() => pack(['##', '#']), 'every pixel row is the same width').toThrow()
  })

  test('refuses anything but # and .', async () => {
    expect(() => pack(['#x', '##']), 'a pixel is either # (on) or . (off)').toThrow()
  })
})
