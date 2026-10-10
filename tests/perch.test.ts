import type { On } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

const PLUGIN = 'clawd-buddy'

// Stands in for the engine beneath the plugin: its own band, drawn from the
// original props.
function engineBand(on: On) {
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'engine', ref: 0 }))
}
const BODY_TOP = /█▜█▛█/
const LABEL = /^idle$/

function band(overrides: { hasSurvey?: boolean; bodyColumns?: number; maxRows?: number } = {}) {
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

describe('the perch above the prompt', () => {
  test('draws Clawd resting, with his label, in the terminal', async ($, on) => {
    engineBand(on)
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: BODY_TOP }), 'the top of the body is drawn').toBeDefined()
    expect((await ui.find({ type: 'Text', text: LABEL }))?.text, 'the resting label sits beside him').toBe('idle')
    await ui.unmount()
  })

  test('takes no more than two rows', async ($, on) => {
    engineBand(on)
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    const perch = await ui.find({ key: 'perch' })
    expect(perch, 'the perch has one root').toBeDefined()
    const rows = (perch?.children ?? []).filter(child => typeof child === 'object')
    expect(rows.length, 'the perch is two rows tall').toBe(2)
    await ui.unmount()
  })

  test('colours the body with the theme and dims the label', async ($, on) => {
    engineBand(on)
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: BODY_TOP }))?.props.color, 'the body follows the theme’s Claude colour').toBe('claude')
    expect((await ui.find({ type: 'Text', text: LABEL }))?.props.dimColor, 'the label is dim').toBe(true)
    await ui.unmount()
  })

  test('steps aside while a survey holds the band', async ($, on) => {
    engineBand(on)
    const ui = await $.ui.mount({ ...band({ hasSurvey: true }), surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: BODY_TOP }), 'nothing of Clawd is drawn over a survey').toBeUndefined()
    await ui.unmount()
  })

  test('draws only in the terminal in v1', async ($, on) => {
    engineBand(on)
    const ui = await $.ui.mount({ ...band(), surface: 'desktop' })
    expect(await ui.find({ type: 'Text', text: BODY_TOP }), 'the desktop band is left to the engine').toBeUndefined()
    await ui.unmount()
  })
})
