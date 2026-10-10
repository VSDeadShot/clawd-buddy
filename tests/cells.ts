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
// ambiguous-width characters (block elements among them) from its font, and a
// glyph the font lacks can be drawn two cells wide. That pushed the engine's
// [-] mark off the edge when Clawd was drawn with quadrant blocks, so every
// character outside what the console fonts carry (ASCII, Latin-1 and the
// code page 437 half blocks) is counted as two here.
const CONSOLE_SAFE_BLOCKS = new Set(['█', '▀', '▄', '▌', '▐'])

export function consoleCells(text: string): number {
  let width = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    const isSafe = (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || CONSOLE_SAFE_BLOCKS.has(ch)
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
