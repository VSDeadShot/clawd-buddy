import { describe, expect, test } from 'claude-code/testing'

import { OPEN_EYES as BODY_TOP, band, engine as engineBand, textOf } from './band.ts'
import { cells, consoleCells } from './cells.ts'

const LABEL = /^idle$/

// Each row of the perch as [the column its text starts at, the text].
function rowsOf(perch: { children: unknown[] } | undefined): [number, string][] {
  return (perch?.children ?? [])
    .filter(child => child !== null && typeof child === 'object')
    .map(child => {
      const row = child as { props?: { marginLeft?: number } }
      return [row.props?.marginLeft ?? 0, textOf(child)]
    })
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

  test('stays clear of [-] in a 120-column cmd window even where the font lacks a glyph', async ($, on) => {
    // cmd's default window is 120 columns; the engine keeps five for its mark.
    const bodyColumns = 120 - 5
    engineBand(on)
    const ui = await $.ui.mount({ ...band({ bodyColumns }), surface: 'terminal' })
    for (const [start, text] of rowsOf(await ui.find({ key: 'perch' }))) {
      expect(start + consoleCells(text) <= bodyColumns - 1, `"${text}" ends before the gap even if the console widens an unknown glyph`).toBe(true)
    }
    await ui.unmount()
  })

  test('puts the label and tag on his left', async ($, on) => {
    engineBand(on)
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    const [[, top] = [0, '']] = rowsOf(await ui.find({ key: 'perch' }))
    expect(top.startsWith('idle . '), 'the top row reads label, tag, then Clawd').toBe(true)
    expect(BODY_TOP.test(top.slice('idle . '.length)), 'the body follows the label and tag').toBe(true)
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
