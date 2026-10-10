// The values clawd-buddy keeps in $.state for the session.

// Which frame of the shown mood is drawn.
export type Frame = number

// When an active mood ends: at a time, when a tool call ends, when the next
// tool call ends, or when the turn ends.
export type MoodUntil = { at: number } | { callId: string } | 'tool.end' | 'turn'

export type ActiveMood = { id: string; until: MoodUntil }

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
    'clawd-buddy': { frame: Frame; engine: EngineState }
  }
}
