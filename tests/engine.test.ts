import { describe, expect, test } from 'claude-code/testing'

import { holdAt, initialState, nextWake, paced, reduce } from '../hooks/mood-engine.ts'
import type { MoodRow, Signal } from '../hooks/registry-types.ts'
import { TESTS_FAILED, toolEnd } from '../hooks/signals.ts'

// A registry made for these tests, so the engine's rules are checked apart
// from any real mood's art or timing.
const F = { body: [' ', ' ', ' '] as const, tag: '·' }
const row = (r: Omit<MoodRow, 'label' | 'frames' | 'frameMs'>): MoodRow => ({ ...r, label: r.id, frames: [F], frameMs: null })

const REGISTRY: readonly MoodRow[] = [
  row({ id: 'rest', trigger: [{ on: 'session.start' }, { on: 'turn.complete' }], priority: 0, durationMs: 'sticky' }),
  row({ id: 'nap', trigger: { on: 'quiet', ms: 60_000, while: 'rest' }, priority: 10, durationMs: 'sticky' }),
  row({ id: 'busy', trigger: { on: 'turn.start' }, priority: 20, durationMs: 'turn' }),
  row({ id: 'tool', trigger: { on: 'tool.start' }, priority: 40, durationMs: 'call' }),
  row({ id: 'edit', trigger: { on: 'tool.start', tool: /^(Edit|Write)$/ }, priority: 50, durationMs: 'call' }),
  row({ id: 'test', trigger: { on: 'tool.start', tool: 'Bash', command: /\btest\b/ }, priority: 55, durationMs: 'call' }),
  row({ id: 'done', trigger: { on: 'turn.complete', reason: ['answer'] }, priority: 80, durationMs: 2000 }),
  row({ id: 'yay', trigger: { on: 'tool.end', outcome: 'ok', tool: 'Bash', command: /\btest\b/ }, priority: 87, durationMs: 1200 }),
  row({ id: 'ouch', trigger: { on: 'tool.end', outcome: 'error' }, priority: 90, durationMs: 3000 }),
  row({
    id: 'slump',
    trigger: [
      { on: 'tool.end', outcome: 'error', tool: 'Bash', command: /\btest\b/ },
      { on: 'tool.end', outcome: 'ok', tool: 'Bash', command: /\btest\b/, text: TESTS_FAILED },
    ],
    priority: 92,
    durationMs: 2000,
  }),
  row({ id: 'ask', trigger: { on: 'notification', type: 'permission_prompt' }, priority: 100, durationMs: 'tool.end' }),
]

// Runs signals in order, each at its own time, from a fresh state.
function run(steps: readonly (readonly [number, Signal])[]) {
  return steps.reduce((state, [now, signal]) => reduce(REGISTRY, state, signal, now), initialState('rest'))
}

const call = (callId: string, tool = 'Read', command?: string): Signal => ({ kind: 'tool.start', callId, tool, command })
type Outcome = Extract<Signal, { kind: 'tool.end' }>['outcome']
const end = (callId: string, outcome: Outcome = 'ok', tool = 'Read', command?: string, text?: string): Signal => ({
  kind: 'tool.end',
  callId,
  tool,
  command,
  outcome,
  text,
})
const TICK: Signal = { kind: 'tick' }

describe('the mood engine', () => {
  test('starts on the resting mood', async () => {
    expect(initialState('rest').showing, 'nothing has happened yet').toBe('rest')
  })

  test('leaves the mood alone on a signal no mood matches', async () => {
    expect(run([[5, { kind: 'cwd.changed' }]]).showing, 'no row triggers on a cwd change here').toBe('rest')
  })

  test('shows a turn mood from turn.start until turn.complete', async () => {
    expect(run([[0, { kind: 'turn.start' }]]).showing, 'busy while the turn runs').toBe('busy')
    const ended = run([[0, { kind: 'turn.start' }], [9000, { kind: 'turn.complete', reason: 'aborted' }]])
    expect(ended.showing, 'an aborted turn ends busy and starts no "done"').toBe('rest')
  })

  test('starts only the highest-priority mood a signal matches', async () => {
    expect(run([[0, call('c1', 'Edit')]]).showing, 'Edit matches both "tool" and "edit"; "edit" wins').toBe('edit')
    expect(run([[0, call('c1', 'Read')]]).showing, 'Read matches only the catch-all').toBe('tool')
  })

  test('matches a tool mood on its command', async () => {
    expect(run([[0, call('c1', 'Bash', 'npm test')]]).showing, 'a test command').toBe('test')
    expect(run([[0, call('c1', 'Bash', 'ls')]]).showing, 'any other command').toBe('tool')
  })

  test('keeps a call mood while the call runs and for 600 ms after it ends', async () => {
    const steps = [[0, { kind: 'turn.start' }], [100, call('c1', 'Edit')], [400, end('c1')]] as const
    expect(run(steps).showing, 'just ended, still lingering').toBe('edit')
    expect(run([...steps, [999, TICK]]).showing, '599 ms after the end').toBe('edit')
    expect(run([...steps, [1000, TICK]]).showing, '600 ms after the end it gives way').toBe('busy')
  })

  test('shows the higher of two calls running at once, then the other', async () => {
    const steps = [[0, call('a', 'Read')], [10, call('b', 'Edit')]] as const
    expect(run(steps).showing, 'edit outranks the catch-all').toBe('edit')
    expect(run([...steps, [20, end('b')], [620, TICK]]).showing, 'with b done, a still runs').toBe('tool')
  })

  test('ends a timed mood when its time is up', async () => {
    const steps = [[0, { kind: 'turn.start' }], [100, call('c1')], [200, end('c1', 'error')]] as const
    expect(run(steps).showing, 'a failed call').toBe('ouch')
    expect(run([...steps, [3199, TICK]]).showing, 'one millisecond short of three seconds').toBe('ouch')
    expect(run([...steps, [3200, TICK]]).showing, 'three seconds later').toBe('busy')
  })

  test('holds a tool.end mood until the next tool call ends', async () => {
    const steps = [[0, { kind: 'turn.start' }], [10, call('c1')], [20, { kind: 'notification', type: 'permission_prompt' }]] as const
    expect(run(steps).showing, 'waiting on the person').toBe('ask')
    expect(run([...steps, [5000, TICK]]).showing, 'however long it takes').toBe('ask')
    expect(run([...steps, [5000, end('c1')], [5600, TICK]]).showing, 'gone once the call ends').toBe('busy')
  })

  test('starts a tool.end mood on its outcome alone', async () => {
    const started = [[0, { kind: 'turn.start' }], [10, call('c1')]] as const
    expect(run([...started, [20, end('c1', 'error')]]).showing, 'an error').toBe('ouch')
    expect(run([...started, [20, end('c1', 'ok')]]).showing, 'an answer is no error; the call lingers').toBe('tool')
  })

  test('matches a tool.end mood on the command its call started with', async () => {
    const tested = [[0, call('c1', 'Bash', 'npm test')], [20, end('c1', 'ok', 'Bash', 'npm test')]] as const
    expect(run(tested).showing, 'a test run that passed').toBe('yay')
    const listed = [[0, call('c1', 'Bash', 'ls')], [20, end('c1', 'ok', 'Bash', 'ls')]] as const
    expect(run(listed).showing, 'any other command that worked; the call lingers').toBe('tool')
  })

  test('starts nothing on a refused call, but ends what a call’s end ends', async () => {
    const refused = [[0, { kind: 'turn.start' }], [10, call('c1', 'Bash', 'npm test')], [20, end('c1', 'denied', 'Bash', 'npm test')]] as const
    expect(run(refused).showing, 'no celebration, no oops; the call lingers').toBe('test')
    expect(run([...refused, [620, TICK]]).showing, 'and gives way 600 ms later').toBe('busy')
    const asked = [[0, { kind: 'turn.start' }], [10, call('c1')], [20, { kind: 'notification', type: 'permission_prompt' }]] as const
    expect(run([...asked, [5000, end('c1', 'denied')], [5600, TICK]]).showing, 'the person said no; the wait is over').toBe('busy')
  })

  test('starts nothing on an interrupted call, but ends what a call’s end ends', async () => {
    const cut = [[0, { kind: 'turn.start' }], [10, call('c1', 'Bash', 'npm test')], [20, end('c1', 'interrupted', 'Bash', 'npm test')]] as const
    expect(run(cut).showing, 'no celebration, no oops; the call lingers').toBe('test')
    expect(run([...cut, [620, TICK]]).showing, 'and gives way 600 ms later').toBe('busy')
  })

  test('reads a failure summary in the text of a run that exited cleanly', async () => {
    const ran = (command: string, text: string) =>
      run([[0, call('c1', 'Bash', command)], [20, end('c1', 'ok', 'Bash', command, text)]]).showing
    expect(ran('npm test', '97% tests passed, 1 tests failed out of 38'), 'failures reported on exit 0').toBe('slump')
    expect(ran('npm test', '100% tests passed, 0 tests failed out of 38'), 'no failures').toBe('yay')
    expect(ran('cat log.txt', '1 tests failed out of 38'), 'not a test command, so no slump').toBe('tool')
  })

  test('slumps when a long run’s only failure summary is in its last line', async () => {
    const passing = Array.from({ length: 300 }, (_, i) => `  ok ${i + 1} - case ${i + 1} passes`).join('\n')
    const output = `${passing}\n\nTests: 3 failed, 297 passed, 300 total`
    const start = call('c1', 'Bash', 'npm test')
    if (start.kind !== 'tool.start') throw new Error('a tool.start')
    const ended = toolEnd(start, { result: output, text: output })
    expect(run([[0, start], [20, ended]]).showing, 'the summary past the first 2 KB still reaches the engine').toBe('slump')
  })

  test('slumps rather than celebrates on a failed test run', async () => {
    const failed = [[0, call('c1', 'Bash', 'npm test')], [20, end('c1', 'error', 'Bash', 'npm test')]] as const
    expect(run(failed).showing, 'slump outranks oops and celebrate').toBe('slump')
  })

  test('lets one sticky mood replace another', async () => {
    const napping = run([[0, { kind: 'session.start' }], [60_000, TICK]])
    expect(napping.showing, 'a minute of quiet').toBe('nap')
    expect(napping.sticky, 'nap is now underneath').toBe('nap')
    const woken = reduce(REGISTRY, napping, { kind: 'turn.complete', reason: 'aborted' }, 61_000)
    expect(woken.sticky, 'turn.complete puts rest back underneath').toBe('rest')
  })

  test('starts a quiet mood only after its quiet spell, and only over its mood', async () => {
    expect(run([[0, { kind: 'session.start' }], [59_999, TICK]]).showing, 'not quite a minute').toBe('rest')
    expect(run([[0, { kind: 'turn.start' }], [60_000, TICK]]).showing, 'never while busy is shown').toBe('busy')
  })

  test('does not count its own ticks as signals', async () => {
    const state = run([[0, { kind: 'session.start' }], [30_000, TICK]])
    expect(state.lastSignalAt, 'a tick leaves the quiet clock running').toBe(0)
  })

  test('says when it next needs waking', async () => {
    expect(nextWake(REGISTRY, run([[0, { kind: 'session.start' }]]), 0), 'the quiet threshold').toBe(60_000)
    expect(nextWake(REGISTRY, run([[0, { kind: 'turn.start' }]]), 0), 'a turn with nothing timed').toBe(null)
    const failed = run([[0, { kind: 'turn.start' }], [100, call('c1')], [200, end('c1', 'error')]])
    expect(nextWake(REGISTRY, failed, 200), 'the failed call’s linger ends first').toBe(800)
    expect(nextWake(REGISTRY, reduce(REGISTRY, failed, TICK, 800), 800), 'then the timed mood').toBe(3200)
  })

  test('clears everything at session end', async () => {
    const state = run([[0, { kind: 'turn.start' }], [10, call('c1', 'Edit')], [20, { kind: 'session.end' }]])
    expect(state.showing, 'back to rest').toBe('rest')
    expect(state.active, 'nothing left active').toEqual([])
  })
})

// The same registry with frame times, for the pace a frame holds.
const TIMED: readonly MoodRow[] = REGISTRY.map(r => ({ ...r, frameMs: r.id === 'rest' ? [3800, 200] : r.id === 'nap' ? null : 140 }))
const sinceOf = (state: ReturnType<typeof run>, id: string) => state.active.find(mood => mood.id === id)?.since

describe('the pace of a mood that runs long', () => {
  test('holds each frame its full time for the first 10 s', async () => {
    expect(paced(140, 0), 'just started').toBe(140)
    expect(paced(140, 9_999), 'one millisecond short of 10 s').toBe(140)
  })

  test('holds three quarters as long from 10 s', async () => {
    expect(paced(140, 10_000), 'at 10 s').toBe(105)
    expect(paced(140, 29_999), 'one millisecond short of 30 s').toBe(105)
  })

  test('holds six tenths as long from 30 s', async () => {
    expect(paced(1200, 30_000), 'at 30 s').toBe(720)
    expect(paced(1200, 600_000), 'and no faster after').toBe(720)
  })

  test('never takes a hold below 100 ms', async () => {
    expect(paced(140, 30_000), '84 ms would blur').toBe(100)
  })

  test('never stretches a hold already under 100 ms', async () => {
    expect(paced(90, 40_000), 'a quick frame stays quick').toBe(90)
  })

  test('stamps when each mood started', async () => {
    const state = run([[0, { kind: 'turn.start' }], [500, call('c1', 'Edit')]])
    expect(sinceOf(state, 'busy'), 'the turn').toBe(0)
    expect(sinceOf(state, 'edit'), 'the edit').toBe(500)
  })

  test('carries the start over when the same mood starts again within its linger', async () => {
    const state = run([[0, { kind: 'turn.start' }], [100, call('c1', 'Edit')], [400, end('c1')], [999, call('c2', 'Edit')]])
    expect(sinceOf(state, 'edit'), 'one stretch of editing, still lingering at 999').toBe(100)
  })

  test('starts afresh once the mood has gone', async () => {
    const state = run([[0, { kind: 'turn.start' }], [100, call('c1', 'Edit')], [400, end('c1')], [1000, call('c2', 'Edit')]])
    expect(sinceOf(state, 'edit'), 'the linger ran out at 1000').toBe(1000)
  })

  test('paces a turn mood by its age', async () => {
    const state = run([[0, { kind: 'turn.start' }]])
    expect(holdAt(TIMED, state, 'busy', 0, 9_000), 'young').toBe(140)
    expect(holdAt(TIMED, state, 'busy', 0, 12_000), 'past 10 s').toBe(105)
    expect(holdAt(TIMED, state, 'busy', 0, 35_000), 'past 30 s, at the floor').toBe(100)
  })

  test('paces a call mood by its age', async () => {
    const state = run([[0, { kind: 'turn.start' }], [1000, call('c1', 'Edit')]])
    expect(holdAt(TIMED, state, 'edit', 0, 13_000), '12 s into the edit').toBe(105)
  })

  test('never paces a sticky mood', async () => {
    const state = run([[0, { kind: 'session.start' }]])
    expect(holdAt(TIMED, state, 'rest', 0, 60_000), 'eyes open as long as ever').toBe(3800)
    expect(holdAt(TIMED, state, 'rest', 1, 60_000), 'and the blink as short').toBe(200)
  })

  test('gives no hold for a mood of one frame', async () => {
    const state = run([[0, { kind: 'session.start' }], [60_000, TICK]])
    expect(holdAt(TIMED, state, 'nap', 0, 61_000), 'nothing to animate').toBe(null)
  })

  test('counts a mood kept from before it had a start as just started', async () => {
    const kept = { ...run([[0, { kind: 'turn.start' }]]), active: [{ id: 'busy', until: 'turn' as const }] }
    expect(holdAt(TIMED, kept as ReturnType<typeof run>, 'busy', 0, 50_000), 'no age, so full time').toBe(140)
  })
})
