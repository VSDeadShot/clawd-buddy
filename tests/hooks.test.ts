import { describe, expect, mock, test } from 'claude-code/testing'

import { ANSWERED, CLOSED_EYES, LABEL, OPEN_EYES, SESSION, TURN, band, engine } from './band.ts'

const EDIT = { tool: 'Edit' as const, tool_use_id: 'call-1', file_path: '/work/a.ts', old_string: 'a', new_string: 'b' }
const OK = { result: 'ok', text: 'ok' }

describe('every hook passes its result through unchanged', () => {
  test('session.end', async ($, on) => {
    mock.clock(on)
    engine(on)
    expect(await $.session.end({ reason: 'other', sessionId: 's1', resume: { id: 's1' } }), 'as the engine answered').toEqual({ sessionId: 's1' })
  })

  test('turn.start', async ($, on) => {
    mock.clock(on)
    engine(on)
    expect(await $.turn.start(TURN), 'as the engine answered').toEqual({ turnId: 't1' })
  })

  test('turn.complete', async ($, on) => {
    mock.clock(on)
    engine(on)
    expect(await $.turn.complete(ANSWERED), 'the answer is never rewritten').toEqual({ text: 'done' })
  })

  test('tool.call, when the tool succeeds', async ($, on) => {
    mock.clock(on)
    engine(on)
    on('tool.call', () => OK)
    expect(await $.tool.call(EDIT), 'the tool’s result as it came').toEqual(OK)
  })

  test('tool.call, when the tool fails', async ($, on) => {
    mock.clock(on)
    engine(on)
    on('tool.call', () => ({ isError: true as const, result: 'boom', text: 'boom' }))
    expect(await $.tool.call(EDIT), 'the error as it came').toEqual({ isError: true, result: 'boom', text: 'boom' })
  })

  test('tool.call, when the call is refused beneath', async ($, on) => {
    mock.clock(on)
    engine(on)
    on('tool.call', () => ({ deny: 'not allowed' }))
    expect(await $.tool.call(EDIT), 'the refusal as it came; Clawd never decides').toEqual({ deny: 'not allowed' })
  })

  test('classic.Notification', async ($, on) => {
    mock.clock(on)
    engine(on)
    expect(await $.classic.Notification({ message: 'Claude needs your permission', notification_type: 'permission_prompt' }), 'nothing added').toEqual({})
  })

  test('classic.CwdChanged', async ($, on) => {
    mock.clock(on)
    engine(on)
    expect(await $.classic.CwdChanged({ old_cwd: '/work', new_cwd: '/work/src' }), 'nothing added').toEqual({})
  })

  test('classic.PreCompact', async ($, on) => {
    mock.clock(on)
    engine(on)
    expect(await $.classic.PreCompact({ trigger: 'auto', custom_instructions: null }), 'nothing added, compaction goes ahead').toEqual({})
  })
})

describe('moods follow the session live', () => {
  test('thinking while a turn runs, idle once it ends', async ($, on) => {
    const clock = mock.clock(on)
    engine(on)
    await $.session.start(SESSION)
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: LABEL('idle') }), 'resting before the turn').toBeDefined()

    await $.turn.start(TURN)
    await clock.settle()
    expect(await ui.find({ type: 'Text', text: LABEL('thinking') }), 'thinking once the turn starts').toBeDefined()

    await $.turn.complete(ANSWERED)
    await clock.settle()
    expect(await ui.find({ type: 'Text', text: LABEL('idle') }), 'idle once it ends').toBeDefined()
    await ui.unmount()
  })

  test('writing while an Edit runs, and thinking 600 ms after it ends', async ($, on) => {
    const clock = mock.clock(on)
    engine(on)
    on('tool.call', async () => {
      await clock.sleep(1000)
      return OK
    })
    await $.session.start(SESSION)
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    await $.turn.start(TURN)

    const running = $.tool.call(EDIT)
    await clock.settle()
    expect(await ui.find({ type: 'Text', text: LABEL('writing') }), 'writing while the edit runs').toBeDefined()

    await clock.advance(1000)
    await running
    await clock.settle()
    expect(await ui.find({ type: 'Text', text: LABEL('writing') }), 'still writing just after it ends').toBeDefined()
    await clock.advance(600)
    expect(await ui.find({ type: 'Text', text: LABEL('thinking') }), 'back to thinking 600 ms later').toBeDefined()
    await ui.unmount()
  })

  test('oops for three seconds after a tool fails', async ($, on) => {
    const clock = mock.clock(on)
    engine(on)
    on('tool.call', () => ({ isError: true as const, result: 'boom', text: 'boom' }))
    await $.session.start(SESSION)
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    await $.turn.start(TURN)

    await $.tool.call(EDIT)
    await clock.settle()
    expect(await ui.find({ type: 'Text', text: LABEL('oops') }), 'oops at once').toBeDefined()
    await clock.advance(2999)
    expect(await ui.find({ type: 'Text', text: LABEL('oops') }), 'still oops just under three seconds').toBeDefined()
    await clock.advance(1)
    expect(await ui.find({ type: 'Text', text: LABEL('thinking') }), 'thinking again after three').toBeDefined()
    await ui.unmount()
  })

  test('a subagent’s tool calls leave the mood alone', async ($, on) => {
    const clock = mock.clock(on)
    engine(on)
    on('tool.call', () => OK)
    await $.session.start(SESSION)
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    await $.turn.start(TURN)

    await $.tool.call({ ...EDIT, agentId: 'helper-1' } as typeof EDIT)
    await clock.settle()
    expect(await ui.find({ type: 'Text', text: LABEL('thinking') }), 'the main loop is still thinking').toBeDefined()
    await ui.unmount()
  })

  test('changing mood cancels the old mood’s frame timer', async ($, on) => {
    const clock = mock.clock(on)
    engine(on)
    await $.session.start(SESSION)
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })

    // Idle's blink timer is set for 3.8 s. Thinking takes over at 1 s and
    // hands back at 2 s, which starts a fresh blink timer for 5.8 s.
    await clock.advance(1000)
    await $.turn.start(TURN)
    await clock.advance(1000)
    await $.turn.complete(ANSWERED)
    await clock.settle()

    await clock.advance(1900)
    expect(await ui.find({ type: 'Text', text: OPEN_EYES }), 'the first timer’s blink at 3.8 s never comes').toBeDefined()
    await clock.advance(1900)
    expect(await ui.find({ type: 'Text', text: CLOSED_EYES }), 'the fresh timer blinks 3.8 s after idle came back').toBeDefined()
    await ui.unmount()
  })
})
