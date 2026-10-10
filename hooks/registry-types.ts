import type { ThemeKey } from 'claude-code'

// One pose of Clawd: three body rows of exactly 9 cells, and the one-cell tag
// drawn after the top row.
export type Frame = {
  readonly body: readonly [string, string, string]
  readonly tag: string
}

// One mood. The engine reads these rows and nothing else, so a new mood is a
// new row, its frames and a test.
export type MoodRow = {
  readonly id: string
  // Dim word beside the tag; at most 10 cells, unique across the registry.
  readonly label: string
  // Unique; when several moods are active the highest one is shown.
  readonly priority: number
  readonly frames: readonly [Frame, ...Frame[]]
  // How long each frame holds: one time for every frame, one time per frame
  // (a blink holds its open frame far longer than its closed one), or null
  // for exactly one frame and no animation timer.
  readonly frameMs: number | readonly number[] | null
  // The tag's colour; the body is always the theme's `claude` colour.
  readonly tagColor?: ThemeKey
}
