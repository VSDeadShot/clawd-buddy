import { describe, expect, mock, test } from 'claude-code/testing'

import { CLOSED_EYES, OPEN_EYES, SESSION, band, engine } from './band.ts'

describe('the idle blink', () => {
  test('closes his eyes for 200 ms every 4 s', async ($, on) => {
    const clock = mock.clock(on)
    engine(on)
    await $.session.start(SESSION)
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    const eyes = async () =>
      (await ui.find({ type: 'Text', text: CLOSED_EYES })) ? 'closed' : (await ui.find({ type: 'Text', text: OPEN_EYES })) ? 'open' : 'none'

    expect(await eyes(), 'he starts with his eyes open').toBe('open')
    await clock.advance(3799)
    expect(await eyes(), 'still open just before the blink').toBe('open')
    await clock.advance(1)
    expect(await eyes(), 'closed at 3.8 s').toBe('closed')
    await clock.advance(199)
    expect(await eyes(), 'still closed 199 ms later').toBe('closed')
    await clock.advance(1)
    expect(await eyes(), 'open again after 200 ms').toBe('open')
    await clock.advance(3800)
    expect(await eyes(), 'and the next blink comes 4 s after the first').toBe('closed')
    await ui.unmount()
  })

  test('keeps a single blink timer when the session starts again', async ($, on) => {
    const clock = mock.clock(on)
    engine(on)
    await $.session.start(SESSION)
    await clock.advance(1000)
    // A hot reload fires session.start again; the first timer must not survive it.
    await $.session.start(SESSION)
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })

    await clock.advance(2900)
    expect(await ui.find({ type: 'Text', text: OPEN_EYES }), 'the first timer’s blink at 3.8 s never comes').toBeDefined()
    await clock.advance(900)
    expect(await ui.find({ type: 'Text', text: CLOSED_EYES }), 'the blink comes 3.8 s after the restart').toBeDefined()
    await ui.unmount()
  })

  test('passes session.start through unchanged', async ($, on) => {
    mock.clock(on)
    engine(on)
    expect(await $.session.start(SESSION), 'the engine’s own answer comes back as it was').toEqual({ cwd: '/work' })
  })
})
