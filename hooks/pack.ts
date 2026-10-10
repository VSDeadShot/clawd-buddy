// Turns a pixel grid into text rows. Each text row carries two pixel rows,
// using the half blocks ▀ ▄ █ and a space, one pixel per column. These are
// in code page 437, so every console font draws them; the quadrant blocks
// that would double the horizontal detail are missing from the Windows
// console's fonts and draw as "?" boxes.
//
// The grid is written with # for a lit pixel and . for an unlit one.
const HALF: Record<string, string> = { '##': '█', '#.': '▀', '.#': '▄', '..': ' ' }

export function pack(grid: readonly string[]): string[] {
  if (grid.length % 2 !== 0) {
    throw new Error(`pack: ${grid.length} pixel rows; they pair up into text rows, so the count must be even`)
  }
  const width = grid[0]?.length ?? 0
  for (const row of grid) {
    if (row.length !== width) throw new Error(`pack: pixel rows of ${width} and ${row.length}; every row is the same width`)
    if (!/^[#.]*$/.test(row)) throw new Error(`pack: "${row}" holds something other than # and .`)
  }

  const rows: string[] = []
  for (let y = 0; y < grid.length; y += 2) {
    const top = grid[y] ?? ''
    const bottom = grid[y + 1] ?? ''
    let line = ''
    for (let x = 0; x < width; x += 1) line += HALF[`${top[x]}${bottom[x]}`]
    rows.push(line)
  }
  return rows
}
