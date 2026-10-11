import type { ActiveMood, EngineState } from '../types'
import type { MoodRow, Signal, Trigger } from './registry-types.ts'

// The one engine every mood goes through. It reads the registry's rows and
// nothing else: which signal starts a mood, how long it stays, and which wins
// when several are active. Pure functions of (registry, state, signal, time),
// so every rule is tested without hooks or timers.

// How long a 'call' mood stays after its call ends, so a call that takes a
// few milliseconds (a Read) still shows rather than flickering past.
export const LINGER_MS = 600

export function initialState(rest: string): EngineState {
  return { sticky: rest, active: [], lastSignalAt: 0, showing: rest }
}

// The mood Clawd rests in: the lowest-priority row.
function restOf(registry: readonly MoodRow[]): string {
  return registry.reduce((low, row) => (row.priority < low.priority ? row : low)).id
}

const triggersOf = (row: MoodRow): readonly Trigger[] => (Array.isArray(row.trigger) ? row.trigger : [row.trigger as Trigger])

const fits = (pattern: string | RegExp | undefined, value: string | undefined) =>
  pattern === undefined || (value !== undefined && (typeof pattern === 'string' ? pattern === value : pattern.test(value)))

function matches(trigger: Trigger, signal: Signal): boolean {
  switch (trigger.on) {
    case 'session.start':
    case 'turn.start':
    case 'cwd.changed':
    case 'compact':
      return signal.kind === trigger.on
    case 'turn.complete':
      return signal.kind === 'turn.complete' && (trigger.reason === undefined || trigger.reason.includes(signal.reason))
    case 'tool.start':
      return (
        signal.kind === 'tool.start' &&
        fits(trigger.tool, signal.tool) &&
        fits(trigger.command, signal.command) &&
        fits(trigger.path, signal.path) &&
        fits(trigger.subagentType, signal.subagentType)
      )
    case 'tool.end':
      return (
        signal.kind === 'tool.end' &&
        signal.outcome === trigger.outcome &&
        fits(trigger.tool, signal.tool) &&
        fits(trigger.command, signal.command) &&
        fits(trigger.path, signal.path) &&
        fits(trigger.text, signal.text)
      )
    case 'notification':
      return signal.kind === 'notification' && signal.type === trigger.type
    case 'quiet':
      return false
  }
}

const priorityOf = (registry: readonly MoodRow[], id: string) => registry.find(row => row.id === id)?.priority ?? -Infinity

const isLive = (mood: ActiveMood, now: number) => typeof mood.until !== 'object' || !('at' in mood.until) || mood.until.at > now

// The mood on screen: the highest-priority active mood, or the sticky one.
function showingOf(registry: readonly MoodRow[], sticky: string, active: readonly ActiveMood[]): string {
  return active.reduce((best, mood) => (priorityOf(registry, mood.id) > priorityOf(registry, best) ? mood.id : best), sticky)
}

// The highest-priority mood the signal starts, if any.
function winner(registry: readonly MoodRow[], signal: Signal): MoodRow | undefined {
  return registry
    .filter(row => triggersOf(row).some(trigger => matches(trigger, signal)))
    .reduce<MoodRow | undefined>((best, row) => (best === undefined || row.priority > best.priority ? row : best), undefined)
}

// Quiet moods whose spell has run out over the mood they wait on.
function quietWinner(registry: readonly MoodRow[], state: EngineState, now: number): MoodRow | undefined {
  return registry
    .filter(row =>
      triggersOf(row).some(t => t.on === 'quiet' && state.showing === t.while && now - state.lastSignalAt >= t.ms),
    )
    .reduce<MoodRow | undefined>((best, row) => (best === undefined || row.priority > best.priority ? row : best), undefined)
}

function start(row: MoodRow, signal: Signal, now: number, sticky: string, active: ActiveMood[]): [string, ActiveMood[]] {
  const others = active.filter(mood => mood.id !== row.id)
  const lifetime = row.durationMs
  if (lifetime === 'sticky') return [row.id, others]
  if (typeof lifetime === 'number') return [sticky, [...others, { id: row.id, until: { at: now + lifetime } }]]
  if (lifetime === 'call') {
    // Only a tool call has a call to last for; anything else starts nothing.
    return signal.kind === 'tool.start' ? [sticky, [...others, { id: row.id, until: { callId: signal.callId } }]] : [sticky, active]
  }
  return [sticky, [...others, { id: row.id, until: lifetime }]]
}

export function reduce(registry: readonly MoodRow[], state: EngineState, signal: Signal, now: number): EngineState {
  if (signal.kind === 'session.end') {
    return { ...initialState(restOf(registry)), lastSignalAt: now }
  }

  // What this signal ends.
  let active = state.active.filter(mood => isLive(mood, now))
  if (signal.kind === 'tool.end') {
    active = active
      .filter(mood => mood.until !== 'tool.end')
      .map(mood =>
        typeof mood.until === 'object' && 'callId' in mood.until && mood.until.callId === signal.callId
          ? { id: mood.id, until: { at: now + LINGER_MS } }
          : mood,
      )
  }
  if (signal.kind === 'turn.complete') {
    active = active.filter(mood => mood.until !== 'turn')
  }

  // What it starts. A tick is the engine's own and starts only quiet moods,
  // and leaves the quiet clock running.
  let sticky = state.sticky
  const isTick = signal.kind === 'tick'
  const shownNow = showingOf(registry, sticky, active)
  const started = isTick ? quietWinner(registry, { ...state, active, showing: shownNow }, now) : winner(registry, signal)
  if (started !== undefined) [sticky, active] = start(started, signal, now, sticky, active)

  return {
    sticky,
    active,
    lastSignalAt: isTick ? state.lastSignalAt : now,
    showing: showingOf(registry, sticky, active),
  }
}

// When the engine next needs a tick: the first timed mood to run out, or the
// first quiet spell to reach its threshold over the mood shown. null when
// nothing will change without a signal.
export function nextWake(registry: readonly MoodRow[], state: EngineState, now: number): number | null {
  const times: number[] = []
  for (const mood of state.active) {
    if (typeof mood.until === 'object' && 'at' in mood.until && mood.until.at > now) times.push(mood.until.at)
  }
  for (const row of registry) {
    for (const t of triggersOf(row)) {
      // A threshold already passed has had its tick; waking for it again
      // would loop on a quiet mood that cannot take over.
      const due = t.on === 'quiet' ? state.lastSignalAt + t.ms : 0
      if (t.on === 'quiet' && t.while === state.showing && row.id !== state.showing && due > now) times.push(due)
    }
  }
  return times.length === 0 ? null : Math.min(...times)
}
