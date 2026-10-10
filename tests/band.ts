import type { On } from 'claude-code'

export const PLUGIN = 'clawd-buddy'
export const OPEN_EYES = /▐▛███▜▌/
export const CLOSED_EYES = /▐█████▌/

// Stands in for the engine beneath the plugin: its own band, drawn from the
// original props, and a session that starts.
export function engine(on: On) {
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'engine', ref: 0 }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
}

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
