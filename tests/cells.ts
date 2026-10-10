// Terminal cells a string takes, or null when it holds a character whose width
// we can't vouch for. Emoji and East Asian wide characters draw two cells in
// some terminals (Windows Terminal among them) and one in others, so a frame
// that uses one would differ in width between machines. Only ranges that are
// one cell everywhere are allowed; widen this list when a mood needs a glyph.
const NARROW: readonly (readonly [number, number])[] = [
  [0x0020, 0x007e], // ASCII
  [0x00a0, 0x00ff], // Latin-1 punctuation and letters (· ×)
  [0x2010, 0x205e], // General punctuation (… ‼ ⁂)
  [0x2190, 0x21ff], // Arrows
  [0x2200, 0x22ff], // Mathematical operators
  [0x2500, 0x259f], // Box drawing and block elements: Clawd's body
  [0x25a0, 0x25ff], // Geometric shapes
  [0x2700, 0x2712], // Dingbats up to ✒, before the emoji-presentation ones
]

// Cells a string takes in a Windows console at worst. The console sizes
// ambiguous-width characters from its font, and a glyph the font lacks can be
// drawn two cells wide. That pushed the engine's [-] mark off the edge when
// Clawd was drawn with quadrant blocks. Only ASCII and the five half blocks
// are counted as one cell: the blocks are ambiguous too, but a sprite that
// draws right shows the console gives them one cell. Everything else,
// Latin-1's · and × included, is counted as two.
const CONSOLE_SAFE_BLOCKS = new Set(['█', '▀', '▄', '▌', '▐'])

export function consoleCells(text: string): number {
  let width = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    const isSafe = (code >= 0x20 && code <= 0x7e) || CONSOLE_SAFE_BLOCKS.has(ch)
    width += isSafe ? 1 : 2
  }
  return width
}

export function cells(text: string): number | null {
  let width = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (!NARROW.some(([lo, hi]) => code >= lo && code <= hi)) return null
    width += 1
  }
  return width
}
