import { DEFAULT_SETTINGS, emptyData } from './progress'
import type { AppData } from './types'

export const STORAGE_KEY = 'mental-maths-lab:v1'

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const num = (x: unknown, d = 0) => (typeof x === 'number' && isFinite(x) ? x : d)

/** Validate and normalise untrusted JSON into AppData. Throws on a wrong shape. */
export function sanitize(raw: unknown): AppData {
  if (!isObj(raw) || raw.version !== 1 || !isObj(raw.totals)) throw new Error('Not a Mental Maths Lab export file.')
  const base = emptyData()
  const t = raw.totals
  const tallies = (o: unknown) => {
    const out: Record<string, { n: number; c: number; ms: number }> = {}
    if (isObj(o))
      for (const [k, v] of Object.entries(o)) if (isObj(v)) out[k] = { n: num(v.n), c: num(v.c), ms: num(v.ms) }
    return out
  }
  const facts: AppData['facts'] = {}
  if (isObj(raw.facts))
    for (const [k, v] of Object.entries(raw.facts)) {
      if (!/^\d{1,3}x\d{1,3}$/.test(k) || !isObj(v)) continue
      facts[k] = {
        n: num(v.n),
        c: num(v.c),
        ms: num(v.ms),
        last: num(v.last),
        m: Math.min(100, Math.max(0, num(v.m))),
        iv: num(v.iv),
        due: num(v.due),
        s: num(v.s),
      }
    }
  const s = isObj(raw.settings) ? raw.settings : {}
  return {
    version: 1,
    settings: {
      sound: typeof s.sound === 'boolean' ? s.sound : DEFAULT_SETTINGS.sound,
      questionLimit: Math.max(0, num(s.questionLimit)),
      defaultLevel: Math.max(0, num(s.defaultLevel)),
      holdOnMistake: typeof s.holdOnMistake === 'boolean' ? s.holdOnMistake : DEFAULT_SETTINGS.holdOnMistake,
    },
    totals: {
      answered: num(t.answered),
      correct: num(t.correct),
      skipped: num(t.skipped),
      ms: num(t.ms),
      currentStreak: num(t.currentStreak),
      bestStreak: num(t.bestStreak),
    },
    categories: tallies(raw.categories),
    facts,
    daily: tallies(raw.daily),
    dailyDone: Array.isArray(raw.dailyDone) ? raw.dailyDone.filter((x): x is string => typeof x === 'string') : base.dailyDone,
    sessions: Array.isArray(raw.sessions)
      ? raw.sessions
          .filter(isObj)
          .filter((r) => typeof r.formatId === 'string' && typeof r.modeId === 'string')
          .map((r) => ({
            id: String(r.id ?? ''),
            ts: num(r.ts),
            formatId: String(r.formatId),
            formatLabel: String(r.formatLabel ?? r.formatId),
            modeId: String(r.modeId),
            modeLabel: String(r.modeLabel ?? r.modeId),
            correct: num(r.correct),
            incorrect: num(r.incorrect),
            skipped: num(r.skipped),
            avgMs: num(r.avgMs),
            fastestMs: num(r.fastestMs),
            accuracy: num(r.accuracy),
            qpm: num(r.qpm),
            durationMs: num(r.durationMs),
            bestStreak: num(r.bestStreak),
            score: num(r.score),
          }))
      : [],
  }
}

export function load(): AppData {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    return s ? sanitize(JSON.parse(s)) : emptyData()
  } catch {
    return emptyData()
  }
}

export function save(d: AppData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d))
  } catch {
    /* storage full or unavailable: keep running in memory */
  }
}
