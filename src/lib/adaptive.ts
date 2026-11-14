import type { FactStat, GenCtx } from './types'
import { clamp, DAY, shuffle } from './util'

export type Fact = [number, number]

/** Facts are commutative: 7×8 and 8×7 share one record. */
export const factKey = (a: number, b: number): string => (a <= b ? `${a}x${b}` : `${b}x${a}`)

export const parseFactKey = (k: string): Fact => {
  const [a, b] = k.split('x').map(Number)
  return [a, b]
}

/** Response time regarded as "fluent" for a fact; 4× this is "slow". */
export function targetMs(a: number, b: number): number {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  if (hi <= 12) return 1500
  if (hi <= 20 || lo <= 5) return 2500
  if (lo <= 12) return 4000
  if (hi <= 50) return 6000
  return 8000
}

/** 1 = fluent, 0 = slow. */
export function speedScore(a: number, b: number, ms: number): number {
  const fast = targetMs(a, b)
  return clamp((fast * 4 - ms) / (fast * 3), 0, 1)
}

const ALPHA = 0.4

/**
 * Update a fact record after one attempt.
 * Mastery is an exponentially weighted average of answer quality
 * (0 when wrong; 60–100 when right depending on speed), so a single lucky
 * answer never reads as "mastered" and a mistake costs 40% of the score.
 * The spaced-repetition interval grows with fast correct answers and
 * collapses to "again in a minute" on a mistake.
 */
export function updateFact(
  prev: FactStat | undefined,
  a: number,
  b: number,
  correct: boolean,
  ms: number,
  now: number,
): FactStat {
  const p = prev ?? { n: 0, c: 0, ms: 0, last: 0, m: 0, iv: 0, due: 0, s: 0 }
  const sp = speedScore(a, b, ms)
  const quality = correct ? 60 + 40 * sp : 0
  const m = Math.round((p.m + ALPHA * (quality - p.m)) * 10) / 10
  let iv: number
  let due: number
  if (!correct) {
    iv = 0
    due = now + 60_000
  } else if (sp < 0.25) {
    // right but slow: keep it in today's rotation
    iv = Math.max(0.25, p.iv * 0.8)
    due = now + iv * DAY
  } else {
    iv = p.iv < 1 ? 1 : Math.min(120, p.iv * (1.4 + 1.2 * sp))
    due = now + iv * DAY
  }
  return {
    n: p.n + 1,
    c: p.c + (correct ? 1 : 0),
    ms: p.ms + ms,
    last: now,
    m,
    iv: Math.round(iv * 100) / 100,
    due,
    s: correct ? p.s + 1 : 0,
  }
}

export const MASTERED = 80

/** Sampling weight: weak & due facts dominate, mastered facts appear occasionally. */
export function factWeight(stat: FactStat | undefined, now: number): number {
  if (!stat) return 1
  if (stat.due <= now) return 1.5 + 6 * (1 - stat.m / 100)
  return stat.m >= MASTERED ? 0.12 : 0.4
}

export function pickWeighted<T>(items: readonly T[], weights: readonly number[]): T {
  let total = 0
  for (const w of weights) total += w
  let r = Math.random() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

/** Adaptive choice among candidate facts, avoiding the last few asked. */
export function pickAdaptiveFact(cands: readonly Fact[], ctx: GenCtx): Fact {
  const recent = new Set(ctx.recent.slice(-Math.min(4, Math.max(0, cands.length - 1))))
  const weights = cands.map(([a, b]) => {
    const k = factKey(a, b)
    return recent.has('t:' + k) ? 0 : factWeight(ctx.facts[k], ctx.now)
  })
  if (!weights.some((w) => w > 0)) return cands[Math.floor(Math.random() * cands.length)]
  return pickWeighted(cands, weights)
}

export interface WeakFact {
  a: number
  b: number
  stat: FactStat
  weakness: number
}

/**
 * Facts ranked by weakness. A fact is weak when it is not yet mastered and
 * has either been answered wrongly or is answered slowly (over twice the
 * fluent target). Facts that are merely new are not weak.
 */
export function weakestFacts(facts: Record<string, FactStat>, limit = 30): WeakFact[] {
  const out: WeakFact[] = []
  for (const k in facts) {
    const stat = facts[k]
    if (stat.n === 0) continue
    const errors = stat.n - stat.c
    if (stat.m >= MASTERED) continue
    const [a, b] = parseFactKey(k)
    if (errors === 0 && stat.ms / stat.n <= targetMs(a, b) * 2) continue
    const weakness = 100 - stat.m + Math.min(20, (errors / stat.n) * 20)
    out.push({ a, b, stat, weakness })
  }
  out.sort((x, y) => y.weakness - x.weakness)
  return out.slice(0, limit)
}

const TIERS = [10, 12, 15, 20, 25, 30, 40, 50, 60, 75, 100]

export interface DailyPlan {
  facts: Fact[]
  due: number
  fresh: number
  review: number
}

/**
 * Daily recommended session: weak facts that are due, a batch of new facts
 * from the smallest range not yet fully covered, and a few mastered facts
 * that have not been seen for the longest time.
 */
export function buildDailyPlan(facts: Record<string, FactStat>, now: number, size = 30): DailyPlan {
  const dueList: { f: Fact; m: number }[] = []
  const mastered: { f: Fact; last: number }[] = []
  for (const k in facts) {
    const s = facts[k]
    const f = parseFactKey(k)
    if (s.m >= MASTERED) mastered.push({ f, last: s.last })
    else if (s.due <= now) dueList.push({ f, m: s.m })
  }
  dueList.sort((x, y) => x.m - y.m)
  mastered.sort((x, y) => x.last - y.last)
  const due = dueList.slice(0, Math.round(size * 0.5)).map((x) => x.f)
  const review = mastered.slice(0, Math.round(size / 6)).map((x) => x.f)

  const fresh: Fact[] = []
  const need = size - due.length - review.length
  for (const t of TIERS) {
    if (fresh.length >= need) break
    const unseen: Fact[] = []
    for (let a = 2; a <= t; a++)
      for (let b = a; b <= t; b++) if (!facts[factKey(a, b)]) unseen.push([a, b])
    const have = new Set(fresh.map(([a, b]) => factKey(a, b)))
    for (const f of shuffle(unseen)) {
      if (fresh.length >= need) break
      if (!have.has(factKey(f[0], f[1]))) fresh.push(f)
    }
  }
  return {
    facts: shuffle([...due, ...fresh, ...review]).map((f) => (Math.random() < 0.5 ? f : [f[1], f[0]])),
    due: due.length,
    fresh: fresh.length,
    review: review.length,
  }
}
