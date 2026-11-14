import { factKey, pickAdaptiveFact, type Fact } from '../adaptive'
import type { GenCtx, Question } from '../types'
import { fmt, pick, randInt, round } from '../util'

/* ───────────────────────── Times tables ───────────────────────── */

export interface TablesOpts {
  aMin: number
  aMax: number
  bMin: number
  bMax: number
  /** Specific tables for the first factor (overrides aMin/aMax). */
  aSet?: number[]
  /** Specific values for the second factor (overrides bMin/bMax). */
  bSet?: number[]
  adaptive: boolean
}

export const DEFAULT_TABLES: TablesOpts = { aMin: 1, aMax: 100, bMin: 1, bMax: 100, adaptive: true }

const span = (lo: number, hi: number): number[] => {
  const a = Math.max(1, Math.min(lo, hi))
  const b = Math.min(100, Math.max(lo, hi))
  return Array.from({ length: b - a + 1 }, (_, i) => a + i)
}

export function tableCandidates(o: TablesOpts): Fact[] {
  const as = o.aSet?.length ? o.aSet : span(o.aMin, o.aMax)
  const bs = o.bSet?.length ? o.bSet : span(o.bMin, o.bMax)
  const out: Fact[] = []
  for (const a of as) for (const b of bs) out.push([a, b])
  return out
}

export function factQuestion(a: number, b: number): Question {
  return {
    key: 't:' + factKey(a, b),
    category: 'tables',
    prompt: `${a} × ${b}`,
    answer: a * b,
    tolerance: 0,
    explanation: explainProduct(a, b),
    fact: [a, b],
    level: 1,
  }
}

export function makeTables(o: TablesOpts, ctx: GenCtx, cands = tableCandidates(o)): Question {
  const [a, b] = o.adaptive ? pickAdaptiveFact(cands, ctx) : pick(cands)
  return factQuestion(a, b)
}

/* ───────────────────────── Explanations ───────────────────────── */

/** Place-value split of the factor with fewer non-zero digits. */
export function explainProduct(a: number, b: number): string {
  const exact = `${fmt(a)} × ${fmt(b)} = ${fmt(a * b)}`
  if (a <= 12 && b <= 12) return exact
  const nz = (n: number) => String(n).replace(/0/g, '').length
  let [x, y] = nz(b) <= nz(a) ? [a, b] : [b, a]
  // near a round number → round and adjust
  for (const base of [1000, 100, 10]) {
    for (const n of [y, x]) {
      const d = n - Math.round(n / base) * base
      const r = n - d
      if (r > 0 && d !== 0 && Math.abs(d) <= (base === 10 ? 1 : base * 0.03) && nz(r) === 1) {
        const o = n === y ? x : y
        return `${fmt(o)} × ${fmt(r)} = ${fmt(o * r)}, ${d < 0 ? 'minus' : 'plus'} ${fmt(o)} × ${Math.abs(d)} = ${fmt(
          o * Math.abs(d),
        )} → ${fmt(a * b)}`
      }
    }
  }
  const parts: number[] = []
  String(y)
    .split('')
    .forEach((d, i, arr) => {
      if (d !== '0') parts.push(Number(d) * 10 ** (arr.length - 1 - i))
    })
  if (parts.length <= 1) return exact
  return `${parts.map((p) => `${fmt(x)} × ${fmt(p)} = ${fmt(x * p)}`).join(', ')} → sum ${fmt(a * b)}`
}

function explainSquare(n: number): string {
  if (n % 10 === 5) {
    const t = (n - 5) / 10
    return `Ends in 5: ${t} × ${t + 1} = ${t * (t + 1)}, append 25 → ${fmt(n * n)}`
  }
  if (n <= 12) return `${n}² = ${n * n}`
  const base = Math.round(n / 10) * 10
  const d = n - base
  return `${n}² = ${n - d} × ${n + d} + ${Math.abs(d)}² = ${fmt((n - d) * (n + d))} + ${d * d} = ${fmt(n * n)}`
}

/* ───────────────────────── Mental multiplication ───────────────────────── */

export const MULT_LEVELS = [
  '1 digit × 1 digit',
  '2 digits × 1 digit',
  '2 digits × 2 digits',
  '3 digits × 2 digits',
  '3 digits × 3 digits',
  'Near 10, 100 & 1,000',
]

export function makeMultiplication(level: number): Question {
  let a: number
  let b: number
  switch (level) {
    case 1:
      a = randInt(2, 9)
      b = randInt(2, 9)
      break
    case 2:
      a = randInt(11, 99)
      b = randInt(2, 9)
      break
    case 3:
      a = randInt(11, 99)
      b = randInt(11, 99)
      break
    case 4:
      a = randInt(101, 999)
      b = randInt(11, 99)
      break
    case 5:
      a = randInt(101, 999)
      b = randInt(101, 999)
      break
    default: {
      const kind = pick(['ten', 'hundred', 'hundred2', 'thousand'] as const)
      if (kind === 'ten') {
        a = pick([9, 11, 12, 19, 21])
        b = randInt(13, 99)
      } else if (kind === 'hundred') {
        a = 100 + pick([-1, 1]) * randInt(1, 5)
        b = randInt(12, 250)
      } else if (kind === 'hundred2') {
        a = 100 + randInt(-9, 12)
        b = 100 + randInt(-9, 12)
        if (a === 100) a = 97
        if (b === 100) b = 104
      } else {
        a = 1000 + pick([-1, 1]) * randInt(1, 5)
        b = randInt(3, 60)
      }
    }
  }
  if (Math.random() < 0.5) [a, b] = [b, a]
  let explanation = explainProduct(a, b)
  if (level >= 6 && Math.abs(a - 100) <= 12 && Math.abs(b - 100) <= 12) {
    const da = a - 100
    const db = b - 100
    explanation = `(100 ${da < 0 ? '−' : '+'} ${Math.abs(da)})(100 ${db < 0 ? '−' : '+'} ${Math.abs(db)}): ${a} ${
      db < 0 ? '−' : '+'
    } ${Math.abs(db)} = ${a + db} → ${fmt((a + db) * 100)}, ${da * db < 0 ? 'minus' : 'plus'} ${Math.abs(da)} × ${Math.abs(
      db,
    )} = ${Math.abs(da * db)} → ${fmt(a * b)}`
  }
  return {
    key: `m:${Math.min(a, b)}x${Math.max(a, b)}`,
    category: 'multiplication',
    prompt: `${fmt(a)} × ${fmt(b)}`,
    answer: a * b,
    tolerance: 0,
    explanation,
    fact: a <= 100 && b <= 100 ? [a, b] : undefined,
    level,
  }
}

/* ───────────────────────── Division ───────────────────────── */

export const DIV_LEVELS = [
  'Table facts (exact)',
  '3–4 digits ÷ 1 digit (exact)',
  '÷ 2 digits (exact)',
  'With remainders',
  'Decimal answers',
]

export function makeDivision(level: number): Question {
  const base = { category: 'division' as const, level, tolerance: 0 }
  if (level <= 3) {
    const d = level === 1 ? randInt(2, 12) : level === 2 ? randInt(3, 9) : randInt(11, 99)
    const q = level === 1 ? randInt(2, 12) : level === 2 ? randInt(21, 999) : randInt(6, 99)
    const n = d * q
    return {
      ...base,
      key: `d:${n}/${d}`,
      prompt: `${fmt(n)} ÷ ${d}`,
      answer: q,
      explanation: `${fmt(n)} ÷ ${d} = ${fmt(q)}, because ${explainProduct(q, d)}`,
    }
  }
  if (level === 4) {
    const d = randInt(3, 19)
    const q = randInt(7, 120)
    const r = randInt(1, d - 1)
    const n = d * q + r
    return {
      ...base,
      key: `d:${n}/${d}r`,
      prompt: `${fmt(n)} ÷ ${d}`,
      answer: q,
      remainder: r,
      hint: 'quotient r remainder, e.g. 12 r 3',
      explanation: `${d} × ${fmt(q)} = ${fmt(d * q)}; ${fmt(n)} − ${fmt(d * q)} leaves ${r} → ${fmt(q)} r ${r}`,
    }
  }
  const d = pick([4, 5, 8, 16, 20, 25, 40])
  let n = randInt(d + 1, d * 60)
  if (n % d === 0) n += 1
  const ans = round(n / d, 4)
  const whole = Math.floor(n / d)
  return {
    ...base,
    key: `d:${n}/${d}d`,
    prompt: `${fmt(n)} ÷ ${d}`,
    answer: ans,
    tolerance: 0.0005,
    hint: 'exact decimal',
    explanation: `${d} × ${whole} = ${d * whole}, remainder ${n - d * whole}; ${n - d * whole}/${d} = ${fmt(
      round((n - d * whole) / d, 4),
    )} → ${fmt(ans)}`,
  }
}

/* ───────────────────────── Percentages ───────────────────────── */

export const PCT_LEVELS = [
  'Core: 5, 10, 20, 25, 50%',
  'Harder: 12.5, 15, 33⅓, 75%',
  'Increase / decrease',
  'Reverse percentages',
  'Compound changes',
]

const PCT_TIP: Record<string, string> = {
  '5': 'half of 10%',
  '10': '÷ 10',
  '12.5': '÷ 8',
  '15': '10% + 5%',
  '20': '÷ 5',
  '25': '÷ 4',
  '33.3333': '÷ 3',
  '50': '÷ 2',
  '75': '½ + ¼',
}
const pctName = (p: number) => (Math.abs(p - 100 / 3) < 1e-6 ? '33⅓' : fmt(p))
const tip = (p: number) => {
  const t = PCT_TIP[String(round(p, 4))]
  return t ? ` (${t})` : ''
}
/** A base that keeps p% of it a clean number. */
function cleanBase(p: number, big = false): number {
  const step = Math.abs(p - 100 / 3) < 1e-6 ? 3 : p === 12.5 ? 8 : p === 75 || p === 25 ? 4 : 20
  return step * randInt(2, big ? 250 : 60) * (step < 20 ? pick([1, 5, 10]) : 1)
}

export function makePercentage(level: number): Question {
  const base = { category: 'percentages' as const, level, tolerance: 0.005 }
  if (level <= 2) {
    const p = level === 1 ? pick([5, 10, 20, 25, 50]) : pick([12.5, 15, 100 / 3, 75, 35, 45, 60])
    const n = cleanBase(p, level === 2)
    const ans = round((n * p) / 100, 2)
    return {
      ...base,
      key: `p:${round(p, 2)}of${n}`,
      prompt: `${pctName(p)}% of ${fmt(n)}`,
      answer: ans,
      explanation: `${pctName(p)}% of ${fmt(n)}${tip(p)} = ${fmt(ans)}`,
    }
  }
  if (level === 3) {
    const p = pick([5, 10, 12.5, 15, 20, 25, 30, 40, 50, 75])
    const n = cleanBase(p)
    const up = Math.random() < 0.5
    const delta = round((n * p) / 100, 2)
    const ans = up ? n + delta : n - delta
    return {
      ...base,
      key: `p:${n}${up ? '+' : '-'}${p}`,
      prompt: `${fmt(n)} ${up ? 'increased' : 'decreased'} by ${fmt(p)}%`,
      answer: ans,
      explanation: `${fmt(p)}% of ${fmt(n)}${tip(p)} = ${fmt(delta)}; ${fmt(n)} ${up ? '+' : '−'} ${fmt(delta)} = ${fmt(ans)}`,
    }
  }
  if (level === 4) {
    if (Math.random() < 0.4) {
      const p = pick([5, 10, 12.5, 20, 25, 40, 75])
      const whole = cleanBase(p)
      const part = round((whole * p) / 100, 2)
      return {
        ...base,
        key: `p:${part}is${p}`,
        prompt: `${fmt(part)} is ${fmt(p)}% of what number?`,
        long: true,
        answer: whole,
        explanation: `${fmt(part)} ÷ ${fmt(p / 100)} = ${fmt(whole)} (check: ${fmt(p)}% of ${fmt(whole)} = ${fmt(part)})`,
      }
    }
    const p = pick([5, 10, 12.5, 20, 25, 50])
    const orig = cleanBase(p)
    const up = Math.random() < 0.5
    const f = up ? 1 + p / 100 : 1 - p / 100
    const final = round(orig * f, 2)
    return {
      ...base,
      key: `p:rev${final}${up ? '+' : '-'}${p}`,
      prompt: `After a ${fmt(p)}% ${up ? 'increase' : 'decrease'} the price is ${fmt(final)}. What was the original price?`,
      long: true,
      answer: orig,
      explanation: `Original × ${fmt(f)} = ${fmt(final)}, so original = ${fmt(final)} ÷ ${fmt(f)} = ${fmt(orig)}`,
    }
  }
  const p1 = pick([5, 10, 20, 25, 50]) * pick([1, -1])
  const p2 = pick([5, 10, 20, 25, 50]) * pick([1, -1])
  const f = round((1 + p1 / 100) * (1 + p2 / 100), 6)
  const s = (p: number) => `${p > 0 ? '+' : '−'}${Math.abs(p)}%`
  if (Math.random() < 0.5) {
    const n = 400 * randInt(1, 25)
    const ans = round(n * f, 2)
    return {
      ...base,
      key: `p:c${n}:${p1}:${p2}`,
      prompt: `${fmt(n)} changes by ${s(p1)}, then by ${s(p2)}. What is the final value?`,
      long: true,
      answer: ans,
      explanation: `${fmt(n)} × ${fmt(1 + p1 / 100)} = ${fmt(round(n * (1 + p1 / 100), 2))}, then × ${fmt(
        1 + p2 / 100,
      )} = ${fmt(ans)}`,
    }
  }
  const ans = round((f - 1) * 100, 4)
  return {
    ...base,
    key: `p:net:${p1}:${p2}`,
    prompt: `A price changes by ${s(p1)}, then by ${s(p2)}. What is the net percentage change?`,
    long: true,
    answer: ans,
    suffix: '%',
    hint: 'negative for a net fall',
    explanation: `${fmt(1 + p1 / 100)} × ${fmt(1 + p2 / 100)} = ${fmt(f)} → net ${fmt(ans)}% (not ${fmt(p1 + p2)}%)`,
  }
}

/* ───────────────────────── Squares, cubes, roots ───────────────────────── */

export const POWER_LEVELS = [
  'Squares 1–25',
  'Squares 26–100',
  'Cubes 1–20',
  'Square roots',
  'Near-squares & differences',
]

export function makePower(level: number): Question {
  const base = { category: 'powers' as const, level, tolerance: 0 }
  if (level <= 2) {
    const n = level === 1 ? randInt(2, 25) : randInt(26, 100)
    return {
      ...base,
      key: `s:${n}^2`,
      prompt: `${n}²`,
      answer: n * n,
      explanation: explainSquare(n),
      fact: [n, n],
    }
  }
  if (level === 3) {
    const n = randInt(2, 20)
    return {
      ...base,
      key: `s:${n}^3`,
      prompt: `${n}³`,
      answer: n ** 3,
      explanation: `${n}² = ${n * n}, then ${n * n} × ${n} = ${fmt(n ** 3)}`,
    }
  }
  if (level === 4) {
    const n = randInt(4, 100)
    const sq = n * n
    const last = n % 10
    return {
      ...base,
      key: `s:rt${sq}`,
      prompt: `√${fmt(sq)}`,
      answer: n,
      explanation:
        n <= 12
          ? `${n} × ${n} = ${sq}`
          : `${Math.floor(n / 10) * 10}² = ${fmt((Math.floor(n / 10) * 10) ** 2)} and ${
              Math.floor(n / 10) * 10 + 10
            }² = ${fmt((Math.floor(n / 10) * 10 + 10) ** 2)} bracket it; last digit ${sq % 10} means the root ends in ${
              last === 0 || last === 5 ? last : `${Math.min(last, 10 - last)} or ${Math.max(last, 10 - last)}`
            } → ${n}`,
    }
  }
  if (Math.random() < 0.6) {
    const mid = pick([20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90, 100])
    const d = randInt(1, 4)
    return {
      ...base,
      key: `s:${mid - d}x${mid + d}`,
      prompt: `${mid - d} × ${mid + d}`,
      answer: mid * mid - d * d,
      explanation: `(${mid} − ${d})(${mid} + ${d}) = ${mid}² − ${d}² = ${fmt(mid * mid)} − ${d * d} = ${fmt(
        mid * mid - d * d,
      )}`,
      fact: mid + d <= 100 ? [mid - d, mid + d] : undefined,
    }
  }
  const a = randInt(12, 99)
  const b = a - randInt(1, 9)
  return {
    ...base,
    key: `s:${a}^2-${b}^2`,
    prompt: `${a}² − ${b}²`,
    answer: a * a - b * b,
    explanation: `a² − b² = (a + b)(a − b) = ${a + b} × ${a - b} = ${fmt(a * a - b * b)}`,
  }
}
