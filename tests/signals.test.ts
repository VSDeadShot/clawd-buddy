import { describe, expect, test } from 'claude-code/testing'

import { TESTS_FAILED, TEXT_KEPT, toolEnd, toolStart } from '../hooks/signals.ts'
import { ABORTED_OUTPUT, DECLINED, INTERRUPTED, RULE_DENIED, coreError, declinedSaying } from './results.ts'

const BASH = { tool: 'Bash', tool_use_id: 'call-1', command: 'npm test' }
const START = toolStart(BASH)

// A test run's output: many passing lines, then the runner's summary.
const PASSING = Array.from({ length: 300 }, (_, i) => `  ok ${i + 1} - case ${i + 1} passes`).join('\n')

describe('the signal a tool call raises when it ends', () => {
  test('carries what its call started with', async () => {
    const signal = toolEnd(START, { result: 'done', text: 'done' })
    expect(signal, 'the start’s fields, so a mood can match the command that ended').toMatchObject({
      kind: 'tool.end',
      callId: 'call-1',
      tool: 'Bash',
      command: 'npm test',
    })
  })

  test('is ok when the tool answered', async () => {
    expect(toolEnd(START, { result: 'done', text: 'done' }), 'answered, with its text').toMatchObject({ outcome: 'ok', text: 'done' })
  })

  test('is an error when the tool reported one', async () => {
    const signal = toolEnd(START, { isError: true, result: 'Exit code 3', text: 'Exit code 3' })
    expect(signal, 'a non-zero exit, with its text').toMatchObject({ outcome: 'error', text: 'Exit code 3' })
  })

  test('is denied when the call was refused, and carries no text', async () => {
    const signal = toolEnd(START, { deny: 'not allowed' })
    expect(signal.kind === 'tool.end' && signal.outcome, 'refused').toBe('denied')
    expect(signal.kind === 'tool.end' && signal.text, 'a refusal’s reason is not the tool’s output').toBe(undefined)
  })

  test('keeps a short result whole', async () => {
    const signal = toolEnd(START, { result: 'Tests: 3 failed', text: 'Tests: 3 failed' })
    expect(signal.kind === 'tool.end' && signal.text, 'nothing cut').toBe('Tests: 3 failed')
  })

  test('keeps the last 2 KB of a long result, where runners print their summary', async () => {
    const output = `${PASSING}\n\nTests: 3 failed, 297 passed, 300 total`
    expect(output.length, 'the summary lies far past the first 2 KB').toBeGreaterThan(3 * TEXT_KEPT)
    const signal = toolEnd(START, { result: output, text: output })
    const text = signal.kind === 'tool.end' ? (signal.text ?? '') : ''
    expect(text.length, 'exactly 2 KB kept').toBe(TEXT_KEPT)
    expect(output.endsWith(text), 'taken from the end').toBe(true)
    expect(TESTS_FAILED.test(text), 'the failure summary is still there').toBe(true)
  })

  test('drops what came before the last 2 KB', async () => {
    const output = `Tests: 3 failed before the run\n${PASSING}`
    const signal = toolEnd(START, { result: output, text: output })
    const text = signal.kind === 'tool.end' ? (signal.text ?? '') : ''
    expect(TESTS_FAILED.test(text), 'a line only at the start is out of reach').toBe(false)
  })
})

// How the call ended, as a mood would see it.
const outcomeOf = (result: Parameters<typeof toolEnd>[1]) => {
  const signal = toolEnd(START, result)
  return signal.kind === 'tool.end' ? signal.outcome : undefined
}

describe('a call the person refused or stopped is no error', () => {
  test('declined at the permission prompt', async () => {
    expect(outcomeOf(DECLINED), 'No or Esc at the prompt').toBe('denied')
  })

  test('declined with a reason typed for Claude', async () => {
    expect(outcomeOf(declinedSaying('use a temp folder instead')), 'No, and a reason').toBe('denied')
  })

  test('declined with a reason longer than the 2 KB Clawd keeps', async () => {
    expect(outcomeOf(declinedSaying('x'.repeat(5000))), 'read from the whole text, not its tail').toBe('denied')
  })

  test('refused by a deny rule', async () => {
    expect(outcomeOf(RULE_DENIED), 'Permission to use … has been denied').toBe('denied')
  })

  test('refused, with core’s error wrapper around the text', async () => {
    const wrapped = coreError(`<tool_use_error>${RULE_DENIED.text}</tool_use_error>`)
    expect(outcomeOf(wrapped), 'the wrapper is not part of the message').toBe('denied')
  })

  test('dropped by Esc before it answered', async () => {
    expect(outcomeOf(INTERRUPTED), 'the engine’s interrupt marker').toBe('interrupted')
  })

  test('cut by Esc while Bash ran, reported as an error', async () => {
    expect(outcomeOf(coreError(ABORTED_OUTPUT)), 'Bash’s aborted marker').toBe('interrupted')
  })

  test('cut by Esc while Bash ran, reported without an error', async () => {
    expect(outcomeOf({ result: ABORTED_OUTPUT, text: ABORTED_OUTPUT }), 'never a clean run').toBe('interrupted')
  })

  test('cut by Esc while Bash ran, with a newline after the marker', async () => {
    expect(outcomeOf(coreError(`${ABORTED_OUTPUT}\n`)), 'trailing whitespace is not part of the output').toBe('interrupted')
  })

  test('a real failure that only mentions a refusal is still an error', async () => {
    const log = `FAIL prompt.test.ts\n  expected "${DECLINED.text}"\n1 failed`
    expect(outcomeOf(coreError(log)), 'the phrase mid-output is not a refusal').toBe('error')
  })
})

describe('a test summary that reports failures', () => {
  for (const line of ['3 failed', '=== 3 failed, 5 passed in 0.12s ===', 'Tests  1 failed | 37 passed (38)', '2 failing', '1 tests failed out of 38', '86% tests passed, 12 tests failed out of 88']) {
    test(`is read in "${line}"`, async () => {
      expect(TESTS_FAILED.test(line), 'failures reported').toBe(true)
    })
  }

  for (const line of ['0 failed', 'Tests  0 failed | 38 passed (38)', '100% tests passed, 0 tests failed out of 38', '38 passed', 'failed to start']) {
    test(`is not read in "${line}"`, async () => {
      expect(TESTS_FAILED.test(line), 'no failures reported').toBe(false)
    })
  }
})
