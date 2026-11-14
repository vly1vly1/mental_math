import { describe, expect, it } from 'vitest'
import { buildDailyPlan, factKey, factWeight, pickAdaptiveFact, updateFact, weakestFacts } from './adaptive'
import { checkAnswer, formatAnswer, parseAnswer, parseNumber } from './answer'
import {
  explainProduct,
  makeDivision,
  makeMultiplication,
  makePercentage,
  makePower,
  makeTables,
  tableCandidates,
} from './generators/core'
import { makeTrading, TRADING_TOPICS } from './generators/trading'
import { makeMixed, makeWeak, MODES } from './modes'
import { applyAnswer, compareSessions, dailyStreak, emptyData, personalBests, scoreFor, summarize } from './progress'
import { sanitize } from './storage'
import { makeTechnique, TECHNIQUES } from './techniques'
import type { GenCtx, Question, SessionRecord } from './types'
import { dateKey, DAY, round } from './util'

const ctx = (): GenCtx => ({ facts: {}, now: Date.now(), recent: [] })
const N = 400
const many = (f: () => Question, n = N) => Array.from({ length: n }, f)
const digits = (n: number) => String(Math.abs(n)).length

/** Independently evaluate simple "a op b" prompts. */
function evalPrompt(p: string): number | null {
  const s = p.replace(/,/g, '')
  let m = s.match(/^(\d+) × (\d+)$/)
  if (m) return Number(m[1]) * Number(m[2])
  m = s.match(/^(\d+) ÷ (\d+)$/)
  if (m) return Number(m[1]) / Number(m[2])
  m = s.match(/^(\d+)²$/)
  if (m) return Number(m[1]) ** 2
  m = s.match(/^(\d+)³$/)
  if (m) return Number(m[1]) ** 3
  m = s.match(/^√(\d+)$/)
  if (m) return Math.sqrt(Number(m[1]))
  m = s.match(/^(\d+)² − (\d+)²$/)
  if (m) return Number(m[1]) ** 2 - Number(m[2]) ** 2
  return null
}

describe('answer parsing', () => {
  it('parses plain, signed and decorated numbers', () => {
    expect(parseNumber('42')).toBe(42)
    expect(parseNumber(' -3.5 ')).toBe(-3.5)
    expect(parseNumber('−196')).toBe(-196)
    expect(parseNumber('€24,500')).toBe(24500)
    expect(parseNumber('1,234,567')).toBe(1234567)
    expect(parseNumber('12.5%')).toBe(12.5)
    expect(parseNumber('25 bps')).toBe(25)
    expect(parseNumber('4x')).toBe(4)
    expect(parseNumber('2.5:1')).toBe(2.5)
    expect(parseNumber('120 shares')).toBe(120)
    expect(parseNumber('.5')).toBe(0.5)
  })
  it('treats a lone comma as decimal unless it is a thousands group', () => {
    expect(parseNumber('12,5')).toBe(12.5)
    expect(parseNumber('0,125')).toBe(0.125)
    expect(parseNumber('1,250')).toBe(1250)
    expect(parseNumber('1,250.5')).toBe(1250.5)
  })
  it('parses fractions and k/m suffixes', () => {
    expect(parseNumber('3/8')).toBe(0.375)
    expect(parseNumber('24.5k')).toBe(24500)
    expect(parseNumber('1.2m')).toBe(1200000)
    expect(parseNumber('1/0')).toBeNull()
  })
  it('rejects junk', () => {
    for (const s of ['', 'abc', '1.2.3', '--4', '12 34 x y']) expect(parseNumber(s)).toBeNull()
  })
  it('parses remainders', () => {
    expect(parseAnswer('12 r 3', true)).toEqual({ value: 12, remainder: 3 })
    expect(parseAnswer('12r3', true)).toEqual({ value: 12, remainder: 3 })
    expect(parseAnswer('12 3', true)).toEqual({ value: 12, remainder: 3 })
  })
  it('validates with tolerance and remainders', () => {
    const q = makeMultiplication(3)
    expect(checkAnswer(q, String(q.answer))).toBe(true)
    expect(checkAnswer(q, String(q.answer + 1))).toBe(false)
    expect(checkAnswer(q, '')).toBe(false)
    const r = makeDivision(4)
    expect(checkAnswer(r, `${r.answer} r ${r.remainder}`)).toBe(true)
    expect(checkAnswer(r, `${r.answer}`)).toBe(false)
    expect(checkAnswer(r, `${r.answer} r ${r.remainder! + 1}`)).toBe(false)
    const t: Question = { ...q, answer: 33.3333, tolerance: 0.05 }
    expect(checkAnswer(t, '33.33')).toBe(true)
    expect(checkAnswer(t, '33.5')).toBe(false)
  })
})

describe('question generation', () => {
  it('multiplication levels respect digit counts and are correct', () => {
    const shape: Record<number, [number, number]> = { 1: [1, 1], 2: [1, 2], 3: [2, 2], 4: [2, 3], 5: [3, 3] }
    for (let lv = 1; lv <= 6; lv++)
      for (const q of many(() => makeMultiplication(lv))) {
        expect(evalPrompt(q.prompt)).toBe(q.answer)
        if (lv <= 5) {
          const [a, b] = q.prompt.replace(/,/g, '').split(' × ').map(Number)
          expect([digits(a), digits(b)].sort()).toEqual(shape[lv])
        }
      }
  })
  it('division is exact, with correct remainders and decimals', () => {
    for (let lv = 1; lv <= 5; lv++)
      for (const q of many(() => makeDivision(lv))) {
        const [n, d] = q.prompt.replace(/,/g, '').split(' ÷ ').map(Number)
        if (lv <= 3) {
          expect(Number.isInteger(q.answer)).toBe(true)
          expect(q.answer * d).toBe(n)
        } else if (lv === 4) {
          expect(q.answer * d + q.remainder!).toBe(n)
          expect(q.remainder!).toBeGreaterThan(0)
          expect(q.remainder!).toBeLessThan(d)
        } else {
          expect(Math.abs(q.answer - n / d)).toBeLessThan(1e-9)
          expect(Number.isInteger(q.answer)).toBe(false)
        }
      }
  })
  it('percentages are mathematically right', () => {
    for (const q of many(() => makePercentage(1)).concat(many(() => makePercentage(2)))) {
      const m = q.prompt.replace(/,/g, '').match(/^([\d.⅓]+)% of (\d+)$/)!
      const p = m[1] === '33⅓' ? 100 / 3 : Number(m[1])
      expect(Math.abs(q.answer - (p * Number(m[2])) / 100)).toBeLessThan(0.006)
    }
    for (const q of many(() => makePercentage(3))) {
      const m = q.prompt.replace(/,/g, '').match(/^(\d+) (increased|decreased) by ([\d.]+)%$/)!
      const f = 1 + (m[2] === 'increased' ? 1 : -1) * (Number(m[3]) / 100)
      expect(Math.abs(q.answer - Number(m[1]) * f)).toBeLessThan(0.006)
    }
    for (const q of many(() => makePercentage(4))) {
      const s = q.prompt.replace(/,/g, '')
      const rev = s.match(/^After a ([\d.]+)% (increase|decrease) the price is ([\d.]+)/)
      if (rev) {
        const f = 1 + (rev[2] === 'increase' ? 1 : -1) * (Number(rev[1]) / 100)
        expect(Math.abs(q.answer * f - Number(rev[3]))).toBeLessThan(0.006)
      } else {
        const m = s.match(/^([\d.]+) is ([\d.]+)% of/)!
        expect(Math.abs((q.answer * Number(m[2])) / 100 - Number(m[1]))).toBeLessThan(0.006)
      }
    }
    for (const q of many(() => makePercentage(5))) {
      const ps = [...q.prompt.matchAll(/([+−])(\d+)%/g)].map((m) => (m[1] === '+' ? 1 : -1) * Number(m[2]))
      const f = (1 + ps[0] / 100) * (1 + ps[1] / 100)
      const start = q.prompt.replace(/,/g, '').match(/^(\d+) changes/)
      const want = start ? Number(start[1]) * f : (f - 1) * 100
      expect(Math.abs(q.answer - want)).toBeLessThan(0.006)
    }
  })
  it('powers and roots are right and within range', () => {
    for (let lv = 1; lv <= 5; lv++)
      for (const q of many(() => makePower(lv))) {
        expect(evalPrompt(q.prompt)).toBe(q.answer)
        if (lv === 2) expect(q.answer).toBeGreaterThanOrEqual(26 * 26)
        if (lv === 3) expect(q.answer).toBeLessThanOrEqual(8000)
        if (lv === 4) expect(q.answer).toBeLessThanOrEqual(100)
      }
  })
  it('tables respect ranges and selected tables', () => {
    const o = { aMin: 7, aMax: 9, bMin: 12, bMax: 15, adaptive: true }
    for (const q of many(() => makeTables(o, ctx()))) {
      const [a, b] = q.fact!
      expect(a).toBeGreaterThanOrEqual(7)
      expect(a).toBeLessThanOrEqual(9)
      expect(b).toBeGreaterThanOrEqual(12)
      expect(b).toBeLessThanOrEqual(15)
      expect(q.answer).toBe(a * b)
    }
    const sel = { ...o, aSet: [17, 23], adaptive: false }
    for (const q of many(() => makeTables(sel, ctx()), 100)) expect([17, 23]).toContain(q.fact![0])
    expect(tableCandidates({ aMin: 1, aMax: 100, bMin: 1, bMax: 100, adaptive: true })).toHaveLength(10000)
  })
  it('every trading topic produces finite, clean, self-consistent questions', () => {
    for (const t of TRADING_TOPICS)
      for (let lv = 1; lv <= 3; lv++)
        for (const q of many(() => makeTrading(lv, [t.id]), 150)) {
          expect(Number.isFinite(q.answer)).toBe(true)
          expect(q.prompt).not.toMatch(/NaN|undefined|Infinity/)
          expect(q.explanation).not.toMatch(/NaN|undefined|Infinity/)
          // at most 4 decimals, and the canonical formatted answer is accepted
          expect(round(q.answer, 4)).toBe(q.answer)
          expect(checkAnswer(q, formatAnswer(q))).toBe(true)
          expect(checkAnswer(q, String(q.answer))).toBe(true)
          expect(q.topic).toBe(t.name)
        }
  })
  it('trading maths spot checks', () => {
    for (const q of many(() => makeTrading(2, ['pnl']), 200)) {
      const m = q.prompt.replace(/,/g, '').match(/notional value of €(\d+)\. The asset (rises|falls) ([\d.]+)%/)!
      const want = ((Number(m[1]) * Number(m[3])) / 100) * (m[2] === 'rises' ? 1 : -1)
      expect(Math.abs(q.answer - want)).toBeLessThan(0.006)
    }
    for (const q of many(() => makeTrading(1, ['ev']), 200)) {
      const m = q.prompt.replace(/,/g, '').match(/a (\d+)% probability of winning €(\d+) and a (\d+)% probability of losing €(\d+)/)!
      expect(Number(m[1]) + Number(m[3])).toBe(100)
      expect(Math.abs(q.answer - (Number(m[1]) * Number(m[2]) - Number(m[3]) * Number(m[4])) / 100)).toBeLessThan(0.006)
    }
    for (const q of many(() => makeTrading(2, ['wavg']), 200)) {
      const m = q.prompt.replace(/,/g, '').match(/buy (\d+) shares at €(\d+(?:\.\d+)?) and (\d+) shares at €(\d+(?:\.\d+)?)/)!
      const [q1, p1, q2, p2] = m.slice(1).map(Number)
      expect(Math.abs(q.answer - (q1 * p1 + q2 * p2) / (q1 + q2))).toBeLessThan(0.006)
    }
    for (const q of many(() => makeTrading(3, ['spread']), 200)) {
      const m = q.prompt.match(/is ([\d.]+) \/ ([\d.]+)\./)!
      const [b, a] = [Number(m[1]), Number(m[2])]
      expect(Math.abs(q.answer - ((a - b) / ((a + b) / 2)) * 10000)).toBeLessThan(0.01)
    }
  })
  it('techniques generate correct exercises at all levels', () => {
    for (const t of TECHNIQUES)
      for (let lv = 1; lv <= 3; lv++)
        for (const q of many(() => makeTechnique(t, lv), 150)) {
          expect(Number.isFinite(q.answer)).toBe(true)
          expect(q.explanation).not.toMatch(/NaN|undefined/)
          const v = evalPrompt(q.prompt)
          if (v !== null) expect(v).toBe(q.answer)
          const pct = q.prompt.replace(/,/g, '').match(/^([\d.]+)% of (\d+)$/)
          if (pct) expect(Math.abs(q.answer - (Number(pct[1]) * Number(pct[2])) / 100)).toBeLessThan(0.006)
          const fr = q.prompt.match(/^(\d+)\/(\d+) as a decimal$/)
          if (fr) expect(Math.abs(q.answer - Number(fr[1]) / Number(fr[2]))).toBeLessThan(0.0006)
          expect(checkAnswer(q, String(q.answer))).toBe(true)
        }
  })
  it('all modes build and generate; mixed covers several categories', () => {
    for (const m of MODES.filter((x) => x.id !== 'weak')) {
      const make = m.build({})
      for (let lv = 1; lv <= Math.max(1, m.levels.length); lv++) expect(make(lv, ctx())).not.toBeNull()
    }
    const cats = new Set(many(() => makeMixed(3, ctx())).map((q) => q.category))
    expect(cats.size).toBeGreaterThanOrEqual(5)
  })
  it('explanations state the right product', () => {
    for (let i = 0; i < 300; i++) {
      const a = 2 + Math.floor(Math.random() * 998)
      const b = 2 + Math.floor(Math.random() * 998)
      expect(explainProduct(a, b).replace(/,/g, '')).toContain(String(a * b))
    }
  })
})

describe('adaptive learning', () => {
  const now = 1_700_000_000_000
  it('mastery rises with fast correct answers and drops on mistakes', () => {
    let s = updateFact(undefined, 7, 8, true, 1000, now)
    expect(s.m).toBe(40)
    expect(s.n).toBe(1)
    s = updateFact(s, 7, 8, true, 1000, now)
    s = updateFact(s, 7, 8, true, 1000, now)
    s = updateFact(s, 7, 8, true, 1000, now)
    expect(s.m).toBeGreaterThan(80)
    const before = s.m
    s = updateFact(s, 7, 8, false, 1000, now)
    expect(s.m).toBeCloseTo(before * 0.6, 0)
    expect(s.s).toBe(0)
    expect(s.c).toBe(4)
    expect(s.n).toBe(5)
  })
  it('slow correct answers earn less mastery than fast ones', () => {
    const fast = updateFact(undefined, 7, 8, true, 1000, now)
    const slow = updateFact(undefined, 7, 8, true, 20000, now)
    expect(slow.m).toBeLessThan(fast.m)
  })
  it('spaced repetition: intervals grow when right, reset when wrong', () => {
    let s = updateFact(undefined, 6, 7, true, 1000, now)
    expect(s.iv).toBe(1)
    expect(s.due).toBe(now + DAY)
    s = updateFact(s, 6, 7, true, 1000, now)
    expect(s.iv).toBeGreaterThan(2)
    s = updateFact(s, 6, 7, false, 1000, now)
    expect(s.iv).toBe(0)
    expect(s.due).toBe(now + 60_000)
  })
  it('weights: weak and due > unseen > mastered and not due', () => {
    const weak = updateFact(undefined, 7, 8, false, 3000, now)
    let strong = updateFact(undefined, 3, 4, true, 800, now)
    for (let i = 0; i < 5; i++) strong = updateFact(strong, 3, 4, true, 800, now)
    const later = now + 120_000
    expect(factWeight(weak, later)).toBeGreaterThan(factWeight(undefined, later))
    expect(factWeight(undefined, later)).toBeGreaterThan(factWeight(strong, later))
    expect(factWeight(strong, later)).toBeGreaterThan(0)
  })
  it('adaptive picker favours the weak fact and avoids immediate repeats', () => {
    const facts = { [factKey(7, 8)]: updateFact(undefined, 7, 8, false, 3000, now) }
    const cands = tableCandidates({ aMin: 2, aMax: 9, bMin: 2, bMax: 9, adaptive: true })
    let hits = 0
    for (let i = 0; i < 2000; i++) {
      const [a, b] = pickAdaptiveFact(cands, { facts, now: now + 120_000, recent: [] })
      if (factKey(a, b) === '7x8') hits++
    }
    // uniform would give 2/64 ≈ 3%; weighting should give far more
    expect(hits / 2000).toBeGreaterThan(0.1)
    for (let i = 0; i < 200; i++) {
      const [a, b] = pickAdaptiveFact(cands, { facts, now: now + 120_000, recent: ['t:7x8'] })
      expect(factKey(a, b)).not.toBe('7x8')
    }
  })
  it('weakest facts are ranked and the weak mode only asks them', () => {
    let d = emptyData()
    const ev = (a: number, b: number, correct: boolean, ms = 1200) =>
      (d = applyAnswer(d, { category: 'tables', fact: [a, b], correct, ms, now }))
    expect(makeWeak({ facts: d.facts, now, recent: [] })).toBeNull()
    ev(7, 8, false)
    ev(7, 8, false)
    ev(6, 9, false)
    ev(12, 13, true, 14000)
    for (let i = 0; i < 6; i++) ev(2, 3, true, 700)
    const weak = weakestFacts(d.facts)
    expect(weak[0].a * weak[0].b).toBe(56)
    expect(weak.map((w) => factKey(w.a, w.b))).not.toContain('2x3')
    const allowed = new Set(weak.map((w) => factKey(w.a, w.b)))
    for (let i = 0; i < 100; i++) {
      const q = makeWeak({ facts: d.facts, now, recent: [] })!
      expect(allowed.has(factKey(q.fact![0], q.fact![1]))).toBe(true)
    }
  })
  it('daily plan mixes due, new and review facts', () => {
    const empty = buildDailyPlan({}, now)
    expect(empty.facts).toHaveLength(30)
    expect(empty.fresh).toBe(30)
    expect(new Set(empty.facts.map(([a, b]) => factKey(a, b))).size).toBe(30)
    expect(Math.max(...empty.facts.flat())).toBeLessThanOrEqual(10)

    let d = emptyData()
    d = applyAnswer(d, { category: 'tables', fact: [7, 8], correct: false, ms: 2000, now: now - DAY })
    for (let i = 0; i < 6; i++) d = applyAnswer(d, { category: 'tables', fact: [3, 4], correct: true, ms: 700, now: now - DAY })
    const plan = buildDailyPlan(d.facts, now)
    const keys = plan.facts.map(([a, b]) => factKey(a, b))
    expect(plan.due).toBe(1)
    expect(plan.review).toBe(1)
    expect(keys).toContain('7x8')
    expect(keys).toContain('3x4')
    expect(plan.facts).toHaveLength(30)
  })
})

describe('performance calculations', () => {
  const now = new Date(2026, 5, 15, 12).getTime()
  it('applyAnswer accumulates totals, categories, days, streaks and facts', () => {
    let d = emptyData()
    d = applyAnswer(d, { category: 'tables', fact: [8, 7], correct: true, ms: 1000, now })
    d = applyAnswer(d, { category: 'division', correct: true, ms: 3000, now })
    d = applyAnswer(d, { category: 'division', correct: false, ms: 2000, now })
    d = applyAnswer(d, { category: 'division', correct: true, ms: 2000, now })
    d = applyAnswer(d, { category: 'division', correct: false, skipped: true, ms: 500, now })
    expect(d.totals).toEqual({ answered: 4, correct: 3, skipped: 1, ms: 8000, currentStreak: 0, bestStreak: 2 })
    expect(d.categories.division).toEqual({ n: 3, c: 2, ms: 7000 })
    expect(d.daily[dateKey(now)]).toEqual({ n: 4, c: 3, ms: 8000 })
    expect(d.facts['7x8'].n).toBe(1)
    expect(Object.keys(d.facts)).toEqual(['7x8'])
  })
  it('summarize computes session metrics', () => {
    const s = summarize(
      [
        { correct: true, skipped: false, ms: 1000 },
        { correct: true, skipped: false, ms: 3000 },
        { correct: false, skipped: false, ms: 2000 },
        { correct: false, skipped: true, ms: 400 },
        { correct: true, skipped: false, ms: 2000 },
      ],
      30000,
    )
    expect(s).toEqual({
      correct: 3,
      incorrect: 1,
      skipped: 1,
      avgMs: 2000,
      fastestMs: 1000,
      accuracy: 0.75,
      qpm: 8,
      bestStreak: 2,
    })
    expect(summarize([], 0).accuracy).toBe(0)
    expect(scoreFor('sprint-60', s)).toBe(3)
    expect(scoreFor('accuracy', s)).toBe(75)
    expect(scoreFor('streak', s)).toBe(2)
  })
  it('daily streak counts consecutive days ending today or yesterday', () => {
    const t = { n: 5, c: 5, ms: 1 }
    const k = (back: number) => dateKey(now - back * DAY)
    expect(dailyStreak({}, now)).toBe(0)
    expect(dailyStreak({ [k(0)]: t, [k(1)]: t, [k(2)]: t, [k(4)]: t }, now)).toBe(3)
    expect(dailyStreak({ [k(1)]: t, [k(2)]: t }, now)).toBe(2)
    expect(dailyStreak({ [k(2)]: t, [k(3)]: t }, now)).toBe(0)
  })
  it('personal bests pick the best session per format and mode', () => {
    const rec = (p: Partial<SessionRecord>): SessionRecord => ({
      id: Math.random().toString(36),
      ts: now,
      formatId: 'sprint-60',
      formatLabel: '',
      modeId: 'tables',
      modeLabel: '',
      correct: 0,
      incorrect: 0,
      skipped: 0,
      avgMs: 0,
      fastestMs: 0,
      accuracy: 1,
      qpm: 0,
      durationMs: 60000,
      bestStreak: 0,
      score: 0,
      ...p,
    })
    const a = rec({ score: 20 })
    const b = rec({ score: 26 })
    const c = rec({ formatId: 'fixed-20', score: 18, durationMs: 90000 })
    const e = rec({ formatId: 'fixed-20', score: 18, durationMs: 70000 })
    const p = rec({ formatId: 'practice', score: 99 })
    const pbs = personalBests([a, b, c, e, p])
    expect(pbs).toHaveLength(2)
    expect(pbs).toContain(b)
    expect(pbs).toContain(e)
    expect(compareSessions(e, c)).toBeGreaterThan(0)
  })
  it('export → import round-trips and rejects foreign files', () => {
    let d = emptyData()
    d = applyAnswer(d, { category: 'tables', fact: [9, 9], correct: true, ms: 900, now })
    expect(sanitize(JSON.parse(JSON.stringify(d)))).toEqual(d)
    expect(() => sanitize({ hello: 'world' })).toThrow()
    expect(() => sanitize(null)).toThrow()
  })
})
