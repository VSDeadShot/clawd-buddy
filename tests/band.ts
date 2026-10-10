import type { On } from 'claude-code'

export const PLUGIN = 'clawd-buddy'
// Clawd's top body row, eyes open and eyes shut, drawn with half blocks only.
export const OPEN_EYES = /^ █▀███▀█ $/
export const CLOSED_EYES = /^ ███████ $/

// Stands in for the engine beneath the plugin: its own band, drawn from the
// original props, and the answers it gives to every event the plugin hooks
// apart from tool.call, which each test answers for itself.
export function engine(on: On) {
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'engine', ref: 0 }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('classic.Notification', () => ({}))
  on('classic.CwdChanged', () => ({}))
  on('classic.PreCompact', () => ({}))
}

export const TURN = { text: 'hello', turnId: 't1' }
export const ANSWERED = { answer: 'done', durationMs: 1200, isAborted: false, turnId: 't1', reason: 'answer' as const }
export const LABEL = (word: string) => new RegExp(`^${word}$`)

export const SESSION = { cwd: '/work', surface: 'terminal' as const, isInteractive: true }

// The AbovePrompt band as the engine would hand it to the plugin.
export function band(overrides: { hasSurvey?: boolean; bodyColumns?: number; maxRows?: number } = {}) {
  return {
    plugin: PLUGIN,
    component: 'AbovePrompt' as const,
    props: {
      hasSurvey: overrides.hasSurvey ?? false,
      isWorking: false,
      maxRows: overrides.maxRows ?? 20,
      bodyColumns: overrides.bodyColumns ?? 100,
      scroll: { offset: 0, bodyRows: 19 },
      view: {},
    },
    viewport: { columns: 105, rows: 40 },
  }
}

// The text a drawn element shows, its children read in order.
export function textOf(node: unknown): string {
  if (typeof node === 'string') return node
  if (node !== null && typeof node === 'object') {
    return ((node as { children?: unknown[] }).children ?? []).map(textOf).join('')
  }
  return ''
}
