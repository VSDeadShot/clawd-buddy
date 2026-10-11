import { describe, expect, mock, test } from 'claude-code/testing'

import { perchRows } from '../hooks/layout.ts'
import { MOODS } from '../hooks/moods.ts'
import { ANSWERED, CLOSED_EYES, LABEL, OPEN_EYES, SESSION, TURN, band, engine, textOf } from './band.ts'
import { ABORTED_OUTPUT, DECLINED, coreError } from './results.ts'

// The perch's text as thinking's frame i draws it in the default band.
const THINKING = MOODS.find(row => row.id === 'thinking') ?? MOODS[0]!
const thinkingFrame = (i: number) =>
  perchRows(THINKING, THINKING.frames[i] ?? THINKING.frames[0], band().props.bodyColumns)
    .map(row => ('label' in row ? `${row.label} ${row.tag} ${row.body}` : row.body))
    .join('')

const EDIT = { tool: 'Edit' as const, tool_use_id: 'call-1', file_path: '/work/a.ts', old_string: 'a', new_string: 'b' }
const MKDIR = { tool: 'Bash' as const, tool_use_id: 'call-2', command: 'mkdir decline-test' }
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

  test('tool.call, when the result is longer than Clawd reads', async ($, on) => {
    mock.clock(on)
    engine(on)
    const long = { result: 'x'.repeat(10_000), text: `${'x'.repeat(10_000)}\n3 failed` }
    on('tool.call', () => long)
    expect(await $.tool.call(EDIT), 'the whole result, not the 2 KB Clawd keeps').toEqual(long)
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

  for (const [what, answer] of [
    ['declining at the permission prompt', DECLINED],
    ['Esc cutting a running command', coreError(ABORTED_OUTPUT)],
  ] as const) {
    test(`no oops for ${what}`, async ($, on) => {
      const clock = mock.clock(on)
      engine(on)
      on('tool.call', () => answer)
      await $.session.start(SESSION)
      const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
      await $.turn.start(TURN)

      await $.tool.call(MKDIR)
      await clock.settle()
      expect(await ui.find({ type: 'Text', text: LABEL('oops') }), 'the person’s choice is no failure').toBeUndefined()
      expect(await ui.find({ type: 'Text', text: LABEL('thinking') }), 'still thinking').toBeDefined()
      await ui.unmount()
    })
  }

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

  test('thinking runs its 8 frames every 140 ms on one timer and loops', async ($, on) => {
    const clock = mock.clock(on)
    engine(on)
    await $.session.start(SESSION)
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    await $.turn.start(TURN)
    await clock.settle()

    // The tag is drawn as " <tag> " beside the label.
    const tags: string[] = []
    for (let i = 0; i < 10; i += 1) {
      const tag = await ui.find({ type: 'Text', text: /^ [.oO] $/ })
      tags.push(tag?.text.trim() ?? '?')
      await clock.advance(140)
    }
    expect(tags, 'one step per 140 ms, wrapping from f7 back to f0').toEqual(['.', 'o', 'o', 'O', 'O', 'o', '.', '.', '.', 'o'])
    await ui.unmount()
  })

  test('thinking quickens as a turn runs long: 140 ms, 105 ms from 10 s, 100 ms from 30 s', async ($, on) => {
    const clock = mock.clock(on)
    engine(on)
    await $.session.start(SESSION)
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    await $.turn.start(TURN)
    await clock.settle()
    const shows = async (i: number) => textOf(await ui.find({ key: 'perch' })) === thinkingFrame(i)

    await clock.advance(139)
    expect(await shows(0), 'the first frame holds its full 140 ms').toBe(true)
    await clock.advance(1)
    expect(await shows(1), 'the second at 140 ms').toBe(true)

    // Frames turn every 140 ms up to the one at 9 940, still under 10 s, so
    // the next lands at 10 080: 72 frames on, back to f0, and held 105 ms.
    await clock.advance(10_080 - 140)
    expect(await shows(0), 'f0 at 10 080').toBe(true)
    await clock.advance(104)
    expect(await shows(0), 'held past 104 ms').toBe(true)
    await clock.advance(1)
    expect(await shows(1), 'f1 105 ms on').toBe(true)

    // Then every 105 ms up to 29 925, still under 30 s, so the next lands at
    // 30 030: 262 frames on, f6, and held 100 ms (84 would be under the floor).
    await clock.advance(30_030 - 10_185)
    expect(await shows(6), 'f6 at 30 030').toBe(true)
    await clock.advance(99)
    expect(await shows(6), 'held past 99 ms').toBe(true)
    await clock.advance(1)
    expect(await shows(7), 'f7 100 ms on').toBe(true)
    await ui.unmount()
  })

  test('a mood change as a frame ends leaves one animation running', async ($, on) => {
    const clock = mock.clock(on)
    engine(on)
    await $.session.start(SESSION)
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    await $.turn.start(TURN)
    await clock.settle()

    // The turn ends just as thinking's first frame does.
    await clock.advance(139)
    const ending = $.turn.complete(ANSWERED)
    await clock.advance(1)
    await ending
    await clock.settle()

    // Idle from here: eyes open until the blink 3.8 s on. A stray thinking
    // timer would keep turning frames and shut them early.
    for (let at = 140; at < 3_900; at += 70) {
      expect(await ui.find({ type: 'Text', text: OPEN_EYES }), `eyes open at ${at} ms`).toBeDefined()
      await clock.advance(70)
    }
    await ui.unmount()
  })

  test('sleepy after five quiet minutes, breathing every 1.2 s', async ($, on) => {
    const clock = mock.clock(on)
    engine(on)
    await $.session.start(SESSION)
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })

    await clock.advance(299_999)
    expect(await ui.find({ type: 'Text', text: LABEL('idle') }), 'awake just short of five minutes').toBeDefined()
    await clock.advance(1)
    expect(await ui.find({ type: 'Text', text: LABEL('sleepy') }), 'asleep at five').toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^ z $/ }), 'breathing in').toBeDefined()
    await clock.advance(1200)
    expect(await ui.find({ type: 'Text', text: /^ Z $/ }), 'breathing out 1.2 s later').toBeDefined()
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
