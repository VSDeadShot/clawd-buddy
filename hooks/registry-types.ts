import type { ThemeKey } from 'claude-code'

// What the hooks tell the engine. Each comes from one pass-through hook and
// carries only what a mood's trigger can match on.
export type Signal =
  | { readonly kind: 'session.start' }
  | { readonly kind: 'session.end' }
  | { readonly kind: 'turn.start' }
  | { readonly kind: 'turn.complete'; readonly reason: TurnReason }
  | {
      readonly kind: 'tool.start'
      readonly callId: string
      readonly tool: string
      readonly command?: string
      readonly path?: string
      readonly subagentType?: string
    }
  | { readonly kind: 'tool.end'; readonly callId: string; readonly tool: string; readonly isError: boolean }
  | { readonly kind: 'notification'; readonly type: string }
  | { readonly kind: 'cwd.changed' }
  | { readonly kind: 'compact' }
  // Raised by the engine's own deadline timer: a timed mood ran out, or a
  // quiet spell reached a quiet trigger's threshold.
  | { readonly kind: 'tick' }

export type TurnReason = 'answer' | 'aborted' | 'refusal' | 'error'

// When a mood starts. A mood with several triggers starts on any of them.
export type Trigger =
  | { readonly on: 'session.start' | 'turn.start' | 'cwd.changed' | 'compact' }
  | { readonly on: 'turn.complete'; readonly reason?: readonly TurnReason[] }
  | {
      readonly on: 'tool.start'
      readonly tool?: string | RegExp
      readonly command?: RegExp
      readonly path?: RegExp
      readonly subagentType?: string
    }
  | { readonly on: 'tool.end'; readonly isError: true }
  | { readonly on: 'notification'; readonly type: string }
  // No signal for `ms` while the mood `while` is the one shown.
  | { readonly on: 'quiet'; readonly ms: number; readonly while: string }

// How long a mood stays active once started:
// - a number: that many milliseconds
// - 'call': while the tool call that started it runs, and a moment after
// - 'tool.end': until the next tool call finishes
// - 'turn': until the turn ends
// - 'sticky': until another sticky mood takes its place
export type Lifetime = number | 'call' | 'tool.end' | 'turn' | 'sticky'

// One pose of Clawd: three body rows of exactly 9 cells, and the one-cell tag
// drawn beside the top row.
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
  readonly trigger: Trigger | readonly Trigger[]
  // Unique; when several moods are active the highest one is shown, and when
  // one signal matches several moods the highest one starts.
  readonly priority: number
  readonly frames: readonly [Frame, ...Frame[]]
  // How long each frame holds: one time for every frame, one time per frame
  // (a blink holds its open frame far longer than its closed one), or null
  // for exactly one frame and no animation timer.
  readonly frameMs: number | readonly number[] | null
  readonly durationMs: Lifetime
  // The tag's colour; the body is always the theme's `claude` colour.
  readonly tagColor?: ThemeKey
}
