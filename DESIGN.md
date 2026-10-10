# DESIGN.md: a livelier Clawd

Approved 2026-10-10. Builds on the mood registry and engine already in place
(`hooks/moods.ts`, `hooks/mood-engine.ts`). Every rule in AGENTS.md still
holds: pass-through hooks, no approval-path hooks, bodies drawn only with
█ ▀ ▄ ▌ ▐ and space, tags and labels printable ASCII.

## The standard every mood meets

All 39 moods, including the five built first (idle, sleepy, thinking,
writing, oops):

| Applies to | What |
| --- | --- |
| every mood | Frames that mime the action, at least 2; 4–8 for the frequent ones (writing, reading, searching, terminal, testing, building, thinking) |
| every mood | A smooth transition in and out: 2 in-between frames of 100 ms, made by the engine. Impact moods (oops, slump, facepalm, poke) snap in |
| every `call` or `turn` mood | Pace scaling (below) |
| moods with a result | Their reaction (below) |

A registry test enforces it once batches 1–5 are in: every row has at least
2 frames and keeps its pixel grid.

## (a) Engine changes

### Reacting to results

`tool.end` carries the same fields as `tool.start`, plus the outcome and the
end of the result's text:

```ts
Signal  tool.end: { callId, tool, command?, path?, outcome: 'ok' | 'error' | 'denied', text?: string /* LAST 2 KB */ }
Trigger tool.end: { on: 'tool.end', outcome?, tool?, command?, path?, text? /* RegExp */ }
```

- The `tool.call` hook already holds the start's fields in its closure and
  passes them on; it still returns `next(e)`'s result unchanged.
- `outcome`: `'error'` when the result has `isError` (Claude Code's Bash
  tool sets it on a non-zero exit code; confirm with a kit test and one live
  check); `'denied'` for a `{ deny }` result, which gets no reaction;
  otherwise `'ok'`.
- `text` is the **last** 2 KB of the result. Test runners print their
  "N failed" summary at the end of the output, so the first 2 KB would miss
  it on a long run. A test feeds a long output whose only failure summary is
  past the first 2 KB and expects slump.
- For tests only, a second check catches runners that exit 0 with failures:
  `/\b[1-9]\d* (failed|failing)\b/i` in `text` counts as failed.

| Reaction | Trigger | Lasts | Priority |
| --- | --- | --- | --- |
| celebrate (`yay!`) | Bash test command, `ok`, no "N failed" in `text` | 1.2 s | 87 |
| cheer (`shipped!`) | Bash push / publish / deploy or commit, `ok` | 1.2 s | 86 |
| slump (`ugh`) | Bash test command, `error`, or "N failed" in `text` | 2 s | 92 |
| facepalm | Bash build or install command, `error` | 2 s | 93 |

Generic oops (90) still covers every other error.

| Mood | On success | On failure |
| --- | --- | --- |
| testing | celebrate | slump |
| building, installing | (none) | facepalm |
| shipping, committing | cheer | oops |

### Pace scaling

Each active mood records when it started (`ActiveMood.since`). Hold times
scale by its age: ×1 under 10 s, ×0.75 from 10 to 30 s, ×0.6 past 30 s,
never below 100 ms. A pure `paced(holdMs, ageMs)`, applied by the frame
timer on each tick, so still one timer. Applies to `call` and `turn` moods;
sticky ones (idle, sleepy) keep their pace.

### Smooth transitions

- Each frame keeps its 9 x 6 pixel grid beside its packed rows (`pose()`
  already has it).
- On a mood change, the frame timer plays 2 in-between frames of 100 ms
  before the new mood's frames: `tween(from, to, step)` takes about a third,
  then two thirds, of the differing pixels from the new pose by a fixed
  dither pattern, packed through `pack()`.
- The label and tag switch at once, so text never flickers.
- A change mid-tween starts the next tween from the frame on screen.
- `snap: true` on a row skips the tween.
- Costs about 200 ms before the new pose is whole; the 600 ms call linger
  absorbs it.

## (b) State of mind (next weekend)

No new hooks. A second pure reducer runs over the **same signals** before
the mood engine. Triggers gain an optional `mind` guard and rows an optional
`group`, both additive, so nothing built tomorrow needs rework.

```ts
Mind = {
  errorsInRow: number        // + on tool.end error, reset on ok
  passStreak: number         // + on test/build ok, reset on a failed one
  waitingSince: number|null  // Notification permission_prompt → set, next tool.end → null
  valence: number            // -5..+5: +1 per pass/answer, -1 per error/abort; drifts to baseline
  energy: number             // 0..1 from the hour: night 0.3, morning 1.0, else 0.7
  lastFidgetAt: number
}
Trigger.mind?: { errorsInRow?: {gte}, passStreak?: {gte}, waitedMs?: {gte}, valence?: {lte|gte}, energy?: {lte|gte} }
Row.group?: string           // random pick within a group, never the same twice (poke needs it tomorrow)
```

| What | Row and trigger | Priority |
| --- | --- | --- |
| Frustration | `frustrated`: tool.end error with `errorsInRow ≥ 3`, snaps in, 2 s | 91 |
| Pride | `proud`: test/build ok with `passStreak ≥ 3`, 1.5 s | 88 |
| Boredom | `bored`: quiet 20 s while waiting, `waitedMs ≥ 20 s`, sticky until the wait ends | 99 |
| Idle fidgets | group `fidget` (look-around, stretch, yawn, foot-tap): quiet 15–40 s while idle, 1 s each | 5 |
| Time of day | `energy` scales quiet thresholds (sleepy after 2 min at night, 5 min by day) and weights fidgets (yawn at night, foot-tap in the morning) | (none) |
| Personality | `$.store` `temperament: { baseline, sessions }`: a running average of each session's valence, written at turn end (at most once a minute) and at session end. A happy baseline adds idle hops and a session-start greeting | (none) |

Priority bands, higher wins:

| Band | Moods |
| --- | --- |
| 0–9 | rest and fidgets |
| 10–19 | dozing |
| 20–39 | turn moods |
| 40–74 | tool moods |
| 86–94 | reactions and failures |
| 95–100 | needs the person: asking 95, bored 99, waiting 100 |

## (c) Poses

Every pose is a 9 x 6 pixel grid through `pack()`; tags printable ASCII.

| Mood | Pose | Tag |
| --- | --- | --- |
| idle | blinks, shifts his weight foot to foot every ~8 s, breathes; 4 frames `[3800, 200, 2000, 2000]` | `.` |
| sleepy | curled lower, slow breath, head droops and jerks up every few breaths; 4 frames | `z` `Z` |
| listening | leans 1 px toward the prompt, arm cupped to his head | `)` |
| thinking | crouch-bob with a head scratch between bobs; 8 x 140 ms | `.` `o` `O` |
| pondering | still, hand at chin height, eyes up | `?` pulsing |
| reading | both arms hold a page in front, eye holes scan left to right | `=` |
| searching | arm out with a ring magnifier sweeping left and right | `/` |
| writing | two hands typing in turns, a carriage-return reach on frame 6; 6 x 120 ms | `>` `_` |
| terminal | typing, eyes fixed forward | `$` `_` |
| testing | checklist held up, a nod each frame | `?` |
| building | hammer raised, swings down over 3 frames, body dips on impact | `#` |
| installing | lowers a 3 x 2 box to the floor, crouching | `+` |
| shipping | leans and pushes a crate right, legs striding | `^` |
| committing | stamp raised, then slammed down with an impact crouch | `*` |
| cleaning | low broom sweeping side to side, a dust pixel flies | `~` |
| planning | clipboard in front, arm ticks | `v` |
| asking | one arm raised high, slow wave | `?` |
| waiting | arms crossed, one foot tapping (permission colour) | `?` |
| timing | looks at his wrist, the tag ticks like a clock hand | `\|` `/` `-` `\` |
| delegating | arm points right, a 1 x 2 helper appears at the edge | `&` |
| surfing | legs become a 7-pixel board, body sways 1 px | `~` |
| plugging | arm pushes a two-prong plug in | `=` |
| snapping | camera block over his eyes, a flash frame | `*` |
| casting | arms up, sparkle pixels above his head | `*` `+` |
| compacting | squashes down a row at a time, pops back | `=` |
| debugging | crouched, peering low, a bug pixel crawls along the floor | `x` |
| polishing | hand circles through 4 positions on a surface | `*` |
| branching | arms out at different heights like a fork, alternating | `Y` |
| querying | lifts a 3-tier database stack | `D` |
| serving | tray flat above his head, balancing sway | `^` |
| benchmarking | runs in place, arms pumping | `>` |
| designing | brush in hand, dots appear beside him | `%` |
| exploring | walks in place, looks one way then the other | `>` |
| mailing | envelope held up, then tossed right | `@` |
| remembering | taps his head, a dot pops above it | `+` |
| phoning | phone held at the side of his head, swaying | `)` |
| happy | hop with legs tucked, arms up | `!` |
| oops | snaps into the knocked-down pose, wobbles, gets up to a kneel; 4 frames | `!` |
| sad | slumped, arms down, slow sway | `.` |

Dropped: talking (only `turn.step` could tell it). The 11 clawdhouse
reactions are not moods here; celebrate, cheer, slump and facepalm above are
our own.

## (d) Plan for 2026-10-11

All of it is in scope. If the day runs short, cut from the bottom.

1. engine: `tool.end` match fields, outcome, last-2 KB text
2. engine: pace scaling
3. engine: tweens, with the `snap` flag
4. `/buddy on|off` (off persists in `$.store`)
5. Batch 1, rest and turn: idle\*, sleepy\*, thinking\*, listening, pondering, happy, sad, compacting
6. Batch 2, attention: asking, waiting†, planning, timing, delegating
7. Batch 3, files: reading, searching, writing\*, remembering, designing, exploring, casting, mailing
8. Batch 4, shell I: terminal, testing, building, installing, committing, shipping, cleaning, branching
9. Batch 5, results: oops\*, celebrate, cheer, slump, facepalm
10. The enforcement test: every row at least 2 frames and keeps its pixel grid
11. Batch 6, shell II and connectors: debugging, polishing, querying, serving, benchmarking, phoning, surfing, snapping, plugging
12. Poke: a spike first (can one plain Button hold all three rows; do clicks reach the band in cmd?), then the `group` random pick and 15 reactions (jump, wave, wink, spin, shrug, dance, sneeze, stretch, peek, salute, bounce, shiver, nod, surprised, laugh)

\* one of the five redrawn to the standard. † dropped if the band is hidden
while the permission prompt is up.

Each batch: a test per mood (trigger, frame count and timing, snap or tween,
paced or not, its reaction where it has one), red first, then validate, tsc
5.9.3 against the repo tsconfig, `claude plugin test`, the isolated check,
one commit, push, and a live "confirmed working" from the user. Live Claude
sessions are the user's to run.

The state-of-mind layer (b) is next weekend.
