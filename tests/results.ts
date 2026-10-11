// tool.call results as core hands them to a hook in Claude Code 2.1.296,
// with the texts copied from its bundle. A refusal at the permission prompt
// and an Esc are errors to core, told apart only by their text.

const REJECTED =
  "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file)."

// What core answers when it raised the error itself: the text the model
// reads, and the same with "Error: " as the stored result.
export const coreError = (text: string) => ({ ref: 1, isError: true as const, result: `Error: ${text}`, text })

// No (or Esc) at the permission prompt.
export const DECLINED = coreError(`${REJECTED} STOP what you are doing and wait for the user to tell you how to proceed.`)

// No, with a reason typed for Claude.
export const declinedSaying = (reason: string) => coreError(`${REJECTED} To tell you how to proceed, the user said:\n${reason}`)

// A deny rule in the person's settings.
export const RULE_DENIED = coreError('Permission to use Bash with command rm x has been denied.')

// A call the person's Esc dropped before it answered.
export const INTERRUPTED = coreError('[Request interrupted by user for tool use]')

// A Bash command the person's Esc cut while it ran: its own output, then
// Bash's marker.
export const ABORTED_OUTPUT = 'compiling...\n<error>Command was aborted before completion</error>'
