import { describe, expect, test } from 'claude-code/testing'

import { initialState, reduce } from '../hooks/mood-engine.ts'
import { MOODS } from '../hooks/moods.ts'
import type { Signal } from '../hooks/registry-types.ts'

// One test per mood: the signals that bring it on, through the real registry.
function showing(steps: readonly (readonly [number, Signal])[], at?: number) {
  let state = steps.reduce((s, [now, signal]) => reduce(MOODS, s, signal, now), initialState('idle'))
  if (at !== undefined) state = reduce(MOODS, state, { kind: 'tick' }, at)
  return state.showing
}

const TURN: Signal = { kind: 'turn.start' }
const tool = (tool: string, callId = 'c1'): Signal => ({ kind: 'tool.start', callId, tool })
const end = (isError: boolean, callId = 'c1'): Signal => ({ kind: 'tool.end', callId, tool: 'Bash', outcome: isError ? 'error' : 'ok' })

describe('moods', () => {
  test('idle: when the session starts, and again when a turn ends', async () => {
    expect(showing([[0, { kind: 'session.start' }]]), 'a new session').toBe('idle')
    expect(showing([[0, TURN], [5000, { kind: 'turn.complete', reason: 'answer' }]]), 'after a turn').toBe('idle')
  })

  test('thinking: from the start of a turn to its end', async () => {
    expect(showing([[0, TURN]]), 'a turn has started').toBe('thinking')
  })

  for (const name of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']) {
    test(`writing: while ${name} runs`, async () => {
      expect(showing([[0, TURN], [10, tool(name)]]), `${name} edits a file`).toBe('writing')
    })
  }

  test('writing: not for a tool that only reads', async () => {
    expect(showing([[0, TURN], [10, tool('Read')]]), 'Read changes nothing').toBe('thinking')
  })

  test('oops: for three seconds after a tool call fails', async () => {
    const failed = [[0, TURN], [10, tool('Bash')], [20, end(true)]] as const
    expect(showing(failed), 'the call failed').toBe('oops')
    expect(showing(failed, 3019), 'still sore just under three seconds on').toBe('oops')
    expect(showing(failed, 3020), 'back to thinking').toBe('thinking')
  })

  test('sleepy: after five quiet minutes resting', async () => {
    const start = [[0, { kind: 'session.start' }]] as const
    expect(showing(start, 299_999), 'not yet').toBe('idle')
    expect(showing(start, 300_000), 'five minutes of nothing').toBe('sleepy')
  })

  test('sleepy: never during a turn, however long it runs', async () => {
    expect(showing([[0, TURN]], 600_000), 'a long turn').toBe('thinking')
  })

  test('sleepy: a turn wakes him, and he rests awake after it', async () => {
    const napped = [[0, { kind: 'session.start' }], [300_000, { kind: 'tick' }]] as const
    expect(showing([...napped, [310_000, TURN]]), 'thinking over the nap').toBe('thinking')
    expect(showing([...napped, [310_000, TURN], [320_000, { kind: 'turn.complete', reason: 'answer' }]]), 'awake after').toBe('idle')
  })

  test('oops: not when a call succeeds', async () => {
    expect(showing([[0, TURN], [10, tool('Bash')], [20, end(false)], [700, { kind: 'tick' }]]), 'a call that worked').toBe('thinking')
  })
})
