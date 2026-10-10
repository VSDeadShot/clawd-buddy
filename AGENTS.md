# AGENTS.md

clawd-buddy is a Claude Code function-hooks plugin (built against Claude Code
2.1.296): a small Clawd perched above the prompt who reacts to session events.
This folder is the plugin root.

## The hook rule

Every hook passes `next(e)`'s result through unchanged and never returns a
decision of its own. Clawd watches; he never approves, denies, blocks,
rewrites or delays anything.

Never hook the approval path, not even read-only:

- `tool.check`
- `classic.PermissionRequest`
- `classic.PreToolUse`
- `prompt.submit`

Hooks that may be used, all pass-through:

- `session.start`, `session.end`
- `turn.start`, `turn.complete`
- `tool.call`
- `classic.Notification`, `classic.CwdChanged`, `classic.PreCompact`
- the plugin's own `$.clock` timers

A mood that can only be told from a hook outside this list is dropped, not
worked around.

## Sprite and moods

- Drawn only in the `AbovePrompt` band, never a `Pane`; left-aligned.
- Two text rows. The body is 7 cells wide; the top row is body, space, tag,
  space, label, at most 20 cells. Every frame of every mood is the same size.
- Characters are limited to ranges that draw one cell in every terminal
  (`tests/cells.ts`); no emoji.
- Moods are rows in the registry (`hooks/moods.ts`) read by one engine.
  Adding a mood is a row, its frames and a test, never a change to the engine.
- clawdhouse (ishuagrawal/clawdhouse, MIT) was read for its list of moods
  only. None of its art or code is copied.

## Toolchain

TypeScript is pinned to **5.9.3** and run through npx; there is no global tsc.
Type-check only against the repo's own `tsconfig.json`, which extends the
engine's generated `.claude-plugin/types/tsconfig.json` and adds
`allowImportingTsExtensions`.

The engine writes `.claude-plugin/types/` (gitignored) when a session loads
the folder. To lay it without an interactive session:

```bash
CLAUDE_CODE_PLUGIN_DIR_WATCH=1 claude -p --plugin-dir . --model haiku "Reply with the single word ok."
```

## Checks before every commit

Tests are written first and seen failing for the right reason. Then:

```bash
claude plugin validate .
npx --yes -p typescript@5.9.3 tsc -p tsconfig.json
claude plugin test .
```

Then the isolated check: export the staged tree to an empty folder
(`git checkout-index -a --prefix=<folder>/`), lay the types there, and run the
same three commands in it. One commit per step, Conventional Commits with a
capitalised subject and a body that explains why.

Live check:

```bash
claude --plugin-dir "C:\Users\vedan\Desktop\VSDeadShot\Projects\Buddy Mod"
```
