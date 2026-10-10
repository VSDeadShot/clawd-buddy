import type { On } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import { cells } from './cells.ts'

const PLUGIN = 'clawd-buddy'

// Stands in for the engine beneath the plugin: its own band, drawn from the
// original props.
function engineBand(on: On) {
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'engine', ref: 0 }))
}
const BODY_TOP = /▐▛███▜▌/
const LABEL = /^idle$/

// The text a drawn element shows, its children read in order.
function textOf(node: unknown): string {
  if (typeof node === 'string') return node
  if (node !== null && typeof node === 'object') {
    return ((node as { children?: unknown[] }).children ?? []).map(textOf).join('')
  }
  return ''
}

// Each row of the perch as [the column its text starts at, the text].
function rowsOf(perch: { children: unknown[] } | undefined): [number, string][] {
  return (perch?.children ?? [])
    .filter(child => child !== null && typeof child === 'object')
    .map(child => {
      const row = child as { props?: { marginLeft?: number } }
      return [row.props?.marginLeft ?? 0, textOf(child)]
    })
}

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

  test('takes no more than three rows', async ($, on) => {
    engineBand(on)
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    const perch = await ui.find({ key: 'perch' })
    expect(perch, 'the perch has one root').toBeDefined()
    const rows = (perch?.children ?? []).filter(child => typeof child === 'object')
    expect(rows.length, 'the perch is three rows tall').toBe(3)
    await ui.unmount()
  })

  for (const bodyColumns of [40, 80, 157]) {
    test(`sits at the right end of a ${bodyColumns}-column band, one column short of [-]`, async ($, on) => {
      engineBand(on)
      const ui = await $.ui.mount({ ...band({ bodyColumns }), surface: 'terminal' })
      const rows = rowsOf(await ui.find({ key: 'perch' }))
      expect(rows.length, 'every row is measured').toBe(3)
      for (const [start, text] of rows) {
        const end = start + (cells(text) ?? Infinity)
        expect(end, 'each row ends one column before the band’s edge, leaving a gap before [-]').toBe(bodyColumns - 1)
      }
      await ui.unmount()
    })
  }

  test('puts the label and tag on his left', async ($, on) => {
    engineBand(on)
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    const [[, top] = [0, '']] = rowsOf(await ui.find({ key: 'perch' }))
    expect(top.startsWith('idle · '), 'the top row reads label, tag, then Clawd').toBe(true)
    expect(BODY_TOP.test(top.slice('idle · '.length)), 'the body follows the label and tag').toBe(true)
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
