import { describe, expect, test } from 'claude-code/testing'

import { OPEN_EYES, band, engine } from './band.ts'

// The widest top row any mood can draw (a 10-cell label, space, tag, space,
// 9-cell body) plus the one-column gap before [-].
const NEEDS_COLUMNS = 23
// The body's three rows.
const NEEDS_ROWS = 3

describe('a narrow or short terminal', () => {
  test(`shows Clawd when the band has exactly ${NEEDS_COLUMNS} columns`, async ($, on) => {
    engine(on)
    const ui = await $.ui.mount({ ...band({ bodyColumns: NEEDS_COLUMNS }), surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: OPEN_EYES }), 'the widest label still fits').toBeDefined()
    await ui.unmount()
  })

  test(`hides Clawd below ${NEEDS_COLUMNS} columns rather than wrap or overflow`, async ($, on) => {
    engine(on)
    const ui = await $.ui.mount({ ...band({ bodyColumns: NEEDS_COLUMNS - 1 }), surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: OPEN_EYES }), 'the band is left to the engine').toBeUndefined()
    await ui.unmount()
  })

  test('hides Clawd at any width a long label would not fit, whatever the current label', async ($, on) => {
    // Idle's label is short, but a narrow band that fits it would lose Clawd
    // again the moment a longer label shows; he hides at the same width always.
    engine(on)
    const ui = await $.ui.mount({ ...band({ bodyColumns: 17 }), surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: OPEN_EYES }), 'hidden even though "idle" would fit').toBeUndefined()
    await ui.unmount()
  })

  test(`shows Clawd when the band can take exactly ${NEEDS_ROWS} rows`, async ($, on) => {
    engine(on)
    const ui = await $.ui.mount({ ...band({ maxRows: NEEDS_ROWS }), surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: OPEN_EYES }), 'three rows hold the body').toBeDefined()
    await ui.unmount()
  })

  test(`hides Clawd when the band can take fewer than ${NEEDS_ROWS} rows, so he never scrolls`, async ($, on) => {
    engine(on)
    const ui = await $.ui.mount({ ...band({ maxRows: NEEDS_ROWS - 1 }), surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: OPEN_EYES }), 'the band is left to the engine').toBeUndefined()
    await ui.unmount()
  })
})
