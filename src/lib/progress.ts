import { factKey, updateFact } from './adaptive'
import type { AppData, Category, SessionRecord, Settings, Tally } from './types'
import { dateKey, DAY } from './util'

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  questionLimit: 0,
  defaultLevel: 0,
  holdOnMistake: true,
}

export const emptyData = (): AppData => ({
  version: 1,
  settings: { ...DEFAULT_SETTINGS },
  totals: { answered: 0, correct: 0, skipped: 0, ms: 0, currentStreak: 0, bestStreak: 0 },
  categories: {},
  facts: {},
  daily: {},
  dailyDone: [],
  sessions: [],
})

export interface AnswerEvent {
  category: Category
  fact?: [number, number]
  correct: boolean
  skipped?: boolean
  ms: number
  now: number
}

const bump = (t: Tally | undefined, correct: boolean, ms: number): Tally => ({
  n: (t?.n ?? 0) + 1,
  c: (t?.c ?? 0) + (correct ? 1 : 0),
  ms: (t?.ms ?? 0) + ms,
})

/** Pure reducer: fold one answer into the stored progress. */
export function applyAnswer(d: AppData, e: AnswerEvent): AppData {
  if (e.skipped) {
    return { ...d, totals: { ...d.totals, skipped: d.totals.skipped + 1, currentStreak: 0 } }
  }
  const streak = e.correct ? d.totals.currentStreak + 1 : 0
  const day = dateKey(e.now)
  const next: AppData = {
    ...d,
    totals: {
      ...d.totals,
      answered: d.totals.answered + 1,
      correct: d.totals.correct + (e.correct ? 1 : 0),
      ms: d.totals.ms + e.ms,
      currentStreak: streak,
      bestStreak: Math.max(d.totals.bestStreak, streak),
    },
    categories: { ...d.categories, [e.category]: bump(d.categories[e.category], e.correct, e.ms) },
    daily: { ...d.daily, [day]: bump(d.daily[day], e.correct, e.ms) },
  }
  if (e.fact && e.fact[0] >= 1 && e.fact[1] >= 1 && e.fact[0] <= 100 && e.fact[1] <= 100) {
    const k = factKey(e.fact[0], e.fact[1])
    next.facts = { ...d.facts, [k]: updateFact(d.facts[k], e.fact[0], e.fact[1], e.correct, e.ms, e.now) }
  }
  return next
}

export interface AnswerLog {
  correct: boolean
  skipped: boolean
  ms: number
}

export interface Summary {
  correct: number
  incorrect: number
  skipped: number
  avgMs: number
  fastestMs: number
  accuracy: number
  qpm: number
  bestStreak: number
}

export function summarize(log: readonly AnswerLog[], durationMs: number): Summary {
  let correct = 0
  let incorrect = 0
  let skipped = 0
  let ms = 0
  let fastest = Infinity
  let run = 0
  let best = 0
  for (const a of log) {
    if (a.skipped) {
      skipped++
      run = 0
      continue
    }
    ms += a.ms
    if (a.correct) {
      correct++
      run++
      best = Math.max(best, run)
      fastest = Math.min(fastest, a.ms)
    } else {
      incorrect++
      run = 0
    }
  }
  const answered = correct + incorrect
  return {
    correct,
    incorrect,
    skipped,
    avgMs: answered ? ms / answered : 0,
    fastestMs: isFinite(fastest) ? fastest : 0,
    accuracy: answered ? correct / answered : 0,
    qpm: durationMs > 0 ? answered / (durationMs / 60000) : 0,
    bestStreak: best,
  }
}

/** Headline score for a format: what "better" means differs per challenge. */
export function scoreFor(formatId: string, s: Summary): number {
  if (formatId === 'accuracy') return Math.round(s.accuracy * 1000) / 10
  if (formatId === 'streak') return s.bestStreak
  return s.correct
}

/** Positive when `a` is the better result. Ties are broken by speed. */
export function compareSessions(a: SessionRecord, b: SessionRecord): number {
  if (a.score !== b.score) return a.score - b.score
  const timed = a.formatId.startsWith('sprint') || a.formatId.startsWith('endurance') || a.formatId.startsWith('timed')
  if (timed) return a.accuracy - b.accuracy
  return b.durationMs - a.durationMs
}

export const pbKey = (r: Pick<SessionRecord, 'formatId' | 'modeId'>) => `${r.formatId}|${r.modeId}`

/** Best session per format + mode combination (open practice has no score). */
export function personalBests(sessions: readonly SessionRecord[]): SessionRecord[] {
  const best = new Map<string, SessionRecord>()
  for (const s of sessions) {
    if (s.formatId === 'practice' || s.formatId === 'daily') continue
    const k = pbKey(s)
    const cur = best.get(k)
    if (!cur || compareSessions(s, cur) > 0) best.set(k, s)
  }
  return [...best.values()].sort((a, b) => b.ts - a.ts)
}

/** Consecutive days with practice, counting back from today (or yesterday). */
export function dailyStreak(daily: Record<string, Tally>, now: number): number {
  let t = now
  if (!daily[dateKey(t)]) t -= DAY
  let n = 0
  while (daily[dateKey(t)]?.n) {
    n++
    const d = new Date(t)
    d.setDate(d.getDate() - 1)
    t = d.getTime()
  }
  return n
}

export const accuracyOf = (t?: { n: number; c: number }) => (t && t.n ? t.c / t.n : NaN)
export const avgMsOf = (t?: { n: number; ms: number }) => (t && t.n ? t.ms / t.n : NaN)
