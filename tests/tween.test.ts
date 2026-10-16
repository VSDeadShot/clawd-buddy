import { describe, expect, test } from 'claude-code/testing'

import { pack } from '../hooks/pack.ts'
import { tweenFrames } from '../hooks/tween.ts'

// Two poses far apart: resting, and knocked down with his arms thrown up.
const RESTING = ['.#######.', '.#.###.#.', '#########', '.#######.', '.#.#.#.#.', '.#.#.#.#.'] as const
const KNOCKED = ['.........', '.#######.', '##.###.##', '.#######.', '.#######.', '#.#...#.#'] as const

// The pixels where two grids differ, as "row,column".
function differing(a: readonly string[], b: readonly string[]): string[] {
  const out: string[] = []
  a.forEach((row, y) => [...row].forEach((pixel, x) => pixel !== b[y]?.[x] && out.push(`${y},${x}`)))
  return out
}

describe('the in-between frames from one pose to the next', () => {
  test('there are none between two poses that match', async () => {
    expect(tweenFrames(RESTING, RESTING), 'nothing to ease').toEqual([])
  })

  test('there are two between poses that differ', async () => {
    expect(tweenFrames(RESTING, KNOCKED).length, 'two in-betweens').toBe(2)
  })

  test('the first takes a third of the change, the second two thirds', async () => {
    const n = differing(RESTING, KNOCKED).length
    const [one = [], two = []] = tweenFrames(RESTING, KNOCKED)
    expect(differing(RESTING, one).length, `a third of ${n}`).toBe(Math.round(n / 3))
    expect(differing(RESTING, two).length, `two thirds of ${n}`).toBe(Math.round((2 * n) / 3))
  })

  test('only pixels that differ ever change, and only to the new pose', async () => {
    for (const between of tweenFrames(RESTING, KNOCKED)) {
      for (const at of differing(RESTING, between)) {
        const [y = 0, x = 0] = at.split(',').map(Number)
        expect(between[y]?.[x], `pixel ${at} takes the new pose's value`).toBe(KNOCKED[y]?.[x])
      }
    }
  })

  test('the second keeps every pixel the first changed', async () => {
    const [one = [], two = []] = tweenFrames(RESTING, KNOCKED)
    const kept = differing(RESTING, one).every(at => differing(RESTING, two).includes(at))
    expect(kept, 'no pixel flickers back').toBe(true)
  })

  test('the change spreads across him rather than sweeping row by row', async () => {
    const [one = []] = tweenFrames(RESTING, KNOCKED)
    const rows = new Set(differing(RESTING, one).map(at => at.split(',')[0]))
    expect(rows.size, 'the first third touches most of the pixel rows that change').toBeGreaterThanOrEqual(4)
  })

  test('the same two poses always ease the same way', async () => {
    expect(tweenFrames(RESTING, KNOCKED), 'a fixed pattern, no randomness').toEqual(tweenFrames(RESTING, KNOCKED))
  })

  test('every in-between packs into the body’s blocks', async () => {
    for (const between of tweenFrames(RESTING, KNOCKED)) {
      expect(pack(between).join('').replace(/[█▀▄ ]/g, ''), 'half blocks and spaces only').toBe('')
    }
  })
})
