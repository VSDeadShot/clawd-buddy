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

- Drawn only in the `AbovePrompt` band, never a `Pane`. Right-aligned: the
  body ends one column before the engine's `[-]` mark, and the label and tag
  sit on its left.
- Three text rows. The body is 9 cells wide; the top row is label, space, tag,
  space, body, at most 22 cells. Every frame of every mood is the same size.
- Bodies use only █ ▀ ▄ ▌ ▐ and space: the blocks in code page 437, which
  every console font has. Quadrant blocks (▖▗▘▝▚▞▙▛▜▟) draw as "?" boxes in
  the Windows console's fonts and are refused by a registry test. Draw each
  pose as a 9 x 6 `#`/`.` pixel grid and let `pack` (`hooks/pack.ts`) turn it
  into text rows.
- Tags keep to ASCII and Latin-1 (`·`, `×`) for the same reason; labels to
  single-cell characters (`tests/cells.ts`). No emoji.
- Moods are rows in the registry (`hooks/moods.ts`) read by one engine.
  Adding a mood is a row, its frames and a test, never a change to the engine.
- clawdhouse (ishuagrawal/clawdhouse, MIT) was read for its list of moods
  only. None of its art or code is copied.

## What the engine's module scan refuses

The engine reads the hooks module's source before loading it and refuses
the whole module when:

- `$` is passed into a function imported from another file. Code that calls
  `$` lives in `hooks/register.tsx`; other files hold pure data and logic.
- `read` / `update` are given a state reference not declared in the same
  file. Atoms live in `hooks/register.tsx`, and every key is declared in
  `types/index.d.ts`.

`claude plugin validate` reads that contract strictly. Keep it in the form it
accepts: value types exported at the top level, then
`declare module 'claude-code' { interface PluginState { 'clawd-buddy': { ... } } }`
with no comments inside the interface. A bare `export {}` with comments inside
the interface was not read.

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
