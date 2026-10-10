import { PERCH_CELLS } from './moods.ts'

// Columns left empty between Clawd and the engine's [-] collapse mark, which
// sits just past the band's bodyColumns.
export const GAP_BEFORE_MARK = 1
export const PERCH_ROWS = 3

// Whether the band can hold Clawd whole. Measured against the widest top row
// any mood draws rather than the current label, so he doesn't blink in and
// out of a narrow terminal as moods change. Below it he hides: a wrapped row
// would break the sprite, an overflowing one would push past [-], and a band
// shorter than him would scroll.
export function fits(bodyColumns: number, maxRows: number): boolean {
  return bodyColumns >= PERCH_CELLS + GAP_BEFORE_MARK && maxRows >= PERCH_ROWS
}
