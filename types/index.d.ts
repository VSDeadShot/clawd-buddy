// The values clawd-buddy keeps in $.state for the session.

// Which frame of the shown mood is drawn.
export type Frame = number

declare module 'claude-code' {
  interface PluginState {
    'clawd-buddy': { frame: Frame }
  }
}
