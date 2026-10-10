import { describe, expect, test } from 'claude-code/testing'

import { initialState, nextWake, reduce } from '../hooks/mood-engine.ts'
import type { MoodRow, Signal } from '../hooks/registry-types.ts'

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
  row({ id: 'ouch', trigger: { on: 'tool.end', isError: true }, priority: 90, durationMs: 3000 }),
  row({ id: 'ask', trigger: { on: 'notification', type: 'permission_prompt' }, priority: 100, durationMs: 'tool.end' }),
]

// Runs signals in order, each at its own time, from a fresh state.
function run(steps: readonly (readonly [number, Signal])[]) {
  return steps.reduce((state, [now, signal]) => reduce(REGISTRY, state, signal, now), initialState('rest'))
}

const call = (callId: string, tool = 'Read', command?: string): Signal => ({ kind: 'tool.start', callId, tool, command })
const end = (callId: string, isError = false, tool = 'Read'): Signal => ({ kind: 'tool.end', callId, tool, isError })
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
    const steps = [[0, { kind: 'turn.start' }], [100, call('c1')], [200, end('c1', true)]] as const
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
    const failed = run([[0, { kind: 'turn.start' }], [100, call('c1')], [200, end('c1', true)]])
    expect(nextWake(REGISTRY, failed, 200), 'the failed call’s linger ends first').toBe(800)
    expect(nextWake(REGISTRY, reduce(REGISTRY, failed, TICK, 800), 800), 'then the timed mood').toBe(3200)
  })

  test('clears everything at session end', async () => {
    const state = run([[0, { kind: 'turn.start' }], [10, call('c1', 'Edit')], [20, { kind: 'session.end' }]])
    expect(state.showing, 'back to rest').toBe('rest')
    expect(state.active, 'nothing left active').toEqual([])
  })
})
