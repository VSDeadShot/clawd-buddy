// The in-between frames the engine plays when Clawd goes from one pose to
// another. Pure, so the easing is tested apart from the timer that plays it.

// How long each in-between holds. Not paced: late in a long turn a change
// eases in as quickly as early on, and pacing would meet the 100 ms floor.
export const TWEEN_MS = 100

// The order pixels flip in: round-robin over the pixel rows, one changing
// pixel from each row in turn, so each step's share of the change is spread
// across his whole body rather than sweeping down it. (An ordered-dither
// matrix ranks every even pixel row first, and each text row packs an even
// row over an odd one, so it would ease in the tops of cells first.) Within
// a row the columns go in a fixed scattered order that shifts row to row.
const columnRank = (y: number, x: number) => (x * 4 + y * 2) % 9

// The two in-betweens from `from` to `to`: a third of the differing pixels
// flipped to the new pose, then two thirds. None when the poses match, so a
// mood that starts from the pose on screen starts at once.
export function tweenFrames(from: readonly string[], to: readonly string[]): string[][] {
  const differing: { y: number; x: number; turn: number }[] = []
  to.forEach((row, y) => {
    const changing = [...row].flatMap((pixel, x) => (pixel !== from[y]?.[x] ? [x] : []))
    changing.sort((a, b) => columnRank(y, a) - columnRank(y, b))
    changing.forEach((x, turn) => differing.push({ y, x, turn }))
  })
  if (differing.length === 0) return []
  differing.sort((a, b) => a.turn - b.turn || a.y - b.y)

  const step = (share: number) => {
    const flipped = new Set(differing.slice(0, Math.round(differing.length * share)).map(({ y, x }) => `${y},${x}`))
    return to.map((row, y) => [...row].map((pixel, x) => (flipped.has(`${y},${x}`) ? pixel : (from[y]?.[x] ?? pixel))).join(''))
  }
  return [step(1 / 3), step(2 / 3)]
}
