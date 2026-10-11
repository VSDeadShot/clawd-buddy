import type { ToolCallResult } from 'claude-code'

import type { Outcome, Signal } from './registry-types.ts'

// The signals a tool call raises, read from its arguments and its result.
// Pure: register.tsx's hook passes in what it got and dispatches what comes
// back, so the reading is tested apart from the hooks.

export type ToolStart = Extract<Signal, { kind: 'tool.start' }>

// How much of a result's text a mood can match on: the last 2 KB, since test
// runners print their "N failed" summary at the end of a run.
export const TEXT_KEPT = 2048

// A test run's summary reporting at least one failure, as vitest, jest,
// pytest ("3 failed"), mocha ("3 failing") and ctest ("1 tests failed out of
// 38") print it. "0 failed" is no failure. For runners that exit 0 anyway.
export const TESTS_FAILED = /\b[1-9]\d*(?: tests?)? (failed|failing)\b/i

// The fields a tool call's mood can match on, read from its arguments.
export function toolStart(e: { tool: string; tool_use_id: string }): ToolStart {
  const input = e as unknown as Record<string, unknown>
  const text = (key: string) => (typeof input[key] === 'string' ? (input[key] as string) : undefined)
  return {
    kind: 'tool.start',
    callId: e.tool_use_id,
    tool: String(e.tool),
    command: text('command'),
    path: text('file_path') ?? text('notebook_path'),
    subagentType: text('subagent_type'),
  }
}

// A refusal at the permission prompt and an Esc reach a tool.call hook as
// errors like any other: core keeps what tells them apart (toolDenialKind)
// on its own side. Only the text the model reads says which it was, so these
// are copied from the Claude Code 2.1.296 bundle and re-verified after every
// update (AGENTS.md).

// How a refusal's text starts: No at the prompt (with or without a reason
// typed for Claude), its cancel, a deny rule or a mode or safety check that
// refuses, and a classic PreToolUse hook's deny when it gives no reason.
export const REFUSED_PREFIXES = [
  "The user doesn't want to proceed with this tool use",
  "The user doesn't want to take this action right now",
  'Permission to use ',
  'Permission for this ',
  'Hook PreToolUse:',
] as const

// How the engine answers a call an abort dropped, or cut before it answered.
export const INTERRUPTED_PREFIXES = [
  '[Request interrupted by user',
  '[Tool call skipped:',
  '[Tool call did not complete:',
  '[Tool call interrupted:',
] as const

// How Bash ends the output of a command an abort cut while it ran.
export const ABORTED_SUFFIX = '<error>Command was aborted before completion</error>'

// Core wraps some error texts in this before the model reads them.
const unwrapped = (text: string) => text.trim().replace(/^<tool_use_error>/, '').replace(/<\/tool_use_error>$/, '')

// How a result that is not a hook's deny ended, read from the whole text:
// a refusal names itself at the start, where a long typed reason would push
// it out of the last 2 KB. A phrase met mid-output is the tool's own.
function outcomeOf(result: Exclude<ToolCallResult, { deny: string }>): Outcome {
  const text = unwrapped(result.text ?? '')
  if (INTERRUPTED_PREFIXES.some(prefix => text.startsWith(prefix)) || text.endsWith(ABORTED_SUFFIX)) return 'interrupted'
  if (result.isError !== true) return 'ok'
  return REFUSED_PREFIXES.some(prefix => text.startsWith(prefix)) ? 'denied' : 'error'
}

// The end of the call `start` began: the same fields, how it ended, and the
// end of what the model read. A refused call carries no text; its reason is
// not the tool's output.
export function toolEnd(start: ToolStart, result: ToolCallResult): Signal {
  const { kind: _, ...call } = start
  if (typeof result.deny === 'string') return { ...call, kind: 'tool.end', outcome: 'denied' }
  const outcome = outcomeOf(result)
  if (outcome === 'denied') return { ...call, kind: 'tool.end', outcome }
  return { ...call, kind: 'tool.end', outcome, text: result.text?.slice(-TEXT_KEPT) }
}
