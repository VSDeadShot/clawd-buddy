import { GAP_BEFORE_MARK } from './fit.ts'
import { BODY_CELLS } from './moods.ts'
import type { Frame, MoodRow } from './registry-types.ts'

// The perch's three rows as the band draws them: where each starts, and what
// it holds. The top row carries the label and tag on Clawd's left.
export type TopRow = { readonly start: number; readonly label: string; readonly tag: string; readonly body: string }
export type BodyRow = { readonly start: number; readonly body: string }

// Each row is pushed right by its own width, so the body's right edge lines
// up on every row whatever the label's length, one column short of the
// engine's [-] mark. Labels and tags are ASCII (tests/registry.test.ts), so
// their length is their width. Called only once fits() has said the band is
// wide enough, so no start is negative.
export function perchRows(mood: MoodRow, frame: Frame, bodyColumns: number): readonly [TopRow, BodyRow, BodyRow] {
  const rightEdge = bodyColumns - GAP_BEFORE_MARK
  const [top, middle, bottom] = frame.body
  const topWidth = mood.label.length + 1 + frame.tag.length + 1 + BODY_CELLS
  return [
    { start: rightEdge - topWidth, label: mood.label, tag: frame.tag, body: top },
    { start: rightEdge - BODY_CELLS, body: middle },
    { start: rightEdge - BODY_CELLS, body: bottom },
  ]
}
