// The values clawd-buddy keeps in $.state for the session.

// Which frame of the shown mood is drawn.
export type Frame = number

// The body rows of an in-between frame while Clawd eases from one mood into
// the next, drawn in place of the frame's own; null when none is playing.
export type Tween = string[] | null

// When an active mood ends: at a time, when a tool call ends, when the next
// tool call ends, or when the turn ends.
export type MoodUntil = { at: number } | { callId: string } | 'tool.end' | 'turn'

// `since`: when it started, carried over when the same mood starts again
// while still active. Absent on a mood the host kept from a load that had no
// pace, which then counts as just started.
export type ActiveMood = { id: string; until: MoodUntil; since?: number }

// The mood engine's state: the sticky mood underneath, the moods active over
// it, when the last signal came, and the mood shown as of that signal.
export type EngineState = {
  sticky: string
  active: ActiveMood[]
  lastSignalAt: number
  showing: string
}

declare module 'claude-code' {
  interface PluginState {
    'clawd-buddy': { frame: Frame; engine: EngineState; tween: Tween }
  }
}
