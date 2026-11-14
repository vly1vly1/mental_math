import { explainProduct } from './generators/core'
import type { Question } from './types'
import { fmt, pick, randInt, round } from './util'

type Draft = Pick<Question, 'prompt' | 'answer' | 'explanation'> & Partial<Question>

export interface Technique {
  id: string
  title: string
  summary: string
  explanation: string[]
  examples: { problem: string; steps: string[] }[]
  levels: [string, string, string]
  gen: (level: number) => Draft
}

const mul = (a: number, b: number, explanation: string): Draft => ({
  prompt: `${fmt(a)} × ${fmt(b)}`,
  answer: a * b,
  explanation,
})

export const TECHNIQUES: Technique[] = [
  {
    id: 'distributive',
    title: 'Distributive multiplication',
    summary: 'Split one factor by place value, multiply the pieces, add.',
    explanation: [
      'Any product can be broken into easier products: a × (b + c) = a × b + a × c. Split the awkward factor into tens and units (or hundreds, tens and units).',
      'Work left to right — largest piece first — so your running total is already close to the answer and you only ever hold one number in memory.',
    ],
    examples: [
      { problem: '7 × 46', steps: ['Split 46 into 40 + 6', '7 × 40 = 280', '7 × 6 = 42', '280 + 42 = 322'] },
      { problem: '34 × 27', steps: ['Split 27 into 20 + 7', '34 × 20 = 680', '34 × 7 = 238', '680 + 238 = 918'] },
    ],
    levels: ['2 digits × 1 digit', '2 digits × 2 digits', '3 digits × 2 digits'],
    gen: (lv) => {
      const a = lv === 3 ? randInt(101, 999) : randInt(12, 99)
      const b = lv === 1 ? randInt(3, 9) : randInt(12, 99)
      return mul(a, b, explainProduct(a, b))
    },
  },
  {
    id: 'rounding',
    title: 'Rounding and adjusting',
    summary: 'Round to a friendly number, multiply, then correct the overshoot.',
    explanation: [
      'When a factor sits just below or above a round number, use the round number and repair the difference afterwards: 49 × 6 = 50 × 6 − 1 × 6.',
      'The correction is always "the other factor × how far you rounded". Subtract it if you rounded up, add it if you rounded down.',
    ],
    examples: [
      { problem: '49 × 6', steps: ['Round 49 up to 50', '50 × 6 = 300', 'Rounded up by 1 → subtract 1 × 6 = 6', '300 − 6 = 294'] },
      { problem: '198 × 23', steps: ['Round 198 up to 200', '200 × 23 = 4,600', 'Subtract 2 × 23 = 46', '4,600 − 46 = 4,554'] },
    ],
    levels: ['Near tens × 1 digit', 'Near tens × 2 digits', 'Near hundreds'],
    gen: (lv) => {
      const d = pick([-2, -1, 1, 2])
      const r = lv === 3 ? randInt(2, 9) * 100 : randInt(2, 9) * 10
      const a = r + d
      const b = lv === 1 ? randInt(3, 9) : lv === 2 ? randInt(12, 60) : randInt(6, 40)
      return mul(
        a,
        b,
        `${fmt(r)} × ${b} = ${fmt(r * b)}; ${d < 0 ? 'subtract' : 'add'} ${Math.abs(d)} × ${b} = ${Math.abs(d) * b} → ${fmt(a * b)}`,
      )
    },
  },
  {
    id: 'fives',
    title: 'Multiplying by 5, 25, 50, 75 and 125',
    summary: 'These are fractions of 10, 100 and 1,000 — divide instead of multiplying.',
    explanation: [
      '5 = 10 ÷ 2, 50 = 100 ÷ 2, 25 = 100 ÷ 4, 75 = ¾ of 100, 125 = 1,000 ÷ 8.',
      'So × 5 means "halve, then × 10"; × 25 means "quarter, then × 100"; × 75 means "three quarters, then × 100"; × 125 means "divide by 8, then × 1,000". Halving twice is a quick way to quarter.',
    ],
    examples: [
      { problem: '48 × 25', steps: ['25 = 100 ÷ 4', '48 ÷ 4 = 12', '12 × 100 = 1,200'] },
      { problem: '64 × 75', steps: ['75 = ¾ × 100', '64 ÷ 4 = 16, × 3 = 48', '48 × 100 = 4,800'] },
      { problem: '56 × 125', steps: ['125 = 1,000 ÷ 8', '56 ÷ 8 = 7', '7 × 1,000 = 7,000'] },
    ],
    levels: ['× 5 and × 50', '× 25 and × 75', '× 125 and odd cases'],
    gen: (lv) => {
      const k = lv === 1 ? pick([5, 50]) : lv === 2 ? pick([25, 75]) : pick([125, 125, 25, 75])
      const n =
        lv === 1 ? randInt(12, 198) : lv === 2 ? randInt(3, 60) * 4 : k === 125 ? randInt(2, 40) * 8 : randInt(13, 99)
      const how: Record<number, string> = {
        5: `${n} ÷ 2 = ${fmt(n / 2)}, × 10`,
        50: `${n} ÷ 2 = ${fmt(n / 2)}, × 100`,
        25: `${n} ÷ 4 = ${fmt(n / 4)}, × 100`,
        75: `${n} ÷ 4 = ${fmt(n / 4)}, × 3 = ${fmt((n / 4) * 3)}, × 100`,
        125: `${n} ÷ 8 = ${fmt(n / 8)}, × 1,000`,
      }
      return mul(n, k, `${how[k]} → ${fmt(n * k)}`)
    },
  },
  {
    id: 'near100',
    title: 'Multiplying numbers close to 100',
    summary: 'Cross-add the distances from 100, then multiply the distances.',
    explanation: [
      'Write each number as 100 plus or minus a small distance. Add one number to the other number’s distance — that gives the hundreds. Then multiply the two distances — that gives the last two digits.',
      'For 97 × 94 the distances are −3 and −6: 97 − 6 = 91 (hundreds) and 3 × 6 = 18 → 9,118. If one number is above 100 and one below, the product of the distances is negative, so subtract it.',
    ],
    examples: [
      { problem: '97 × 94', steps: ['Distances from 100: −3 and −6', '97 − 6 = 91 → 9,100', '(−3) × (−6) = +18', '9,100 + 18 = 9,118'] },
      { problem: '104 × 107', steps: ['Distances: +4 and +7', '104 + 7 = 111 → 11,100', '4 × 7 = 28', '11,100 + 28 = 11,128'] },
      { problem: '103 × 96', steps: ['Distances: +3 and −4', '103 − 4 = 99 → 9,900', '3 × (−4) = −12', '9,900 − 12 = 9,888'] },
    ],
    levels: ['Both below 100', 'Both above 100', 'One above, one below'],
    gen: (lv) => {
      const da = lv === 2 ? randInt(1, 12) : -randInt(1, 10)
      const db = lv === 1 ? -randInt(1, 10) : randInt(1, 12)
      const a = 100 + da
      const b = 100 + db
      return mul(
        a,
        b,
        `${a} ${db < 0 ? '−' : '+'} ${Math.abs(db)} = ${a + db} → ${fmt((a + db) * 100)}; ${da} × ${db} = ${da * db} → ${fmt(a * b)}`,
      )
    },
  },
  {
    id: 'eleven',
    title: 'Multiplication by 11',
    summary: 'Keep the outer digits, insert the sums of neighbours.',
    explanation: [
      'For a two-digit number, write the first digit, then the sum of the two digits, then the last digit: 11 × 43 → 4 | 4+3 | 3 = 473.',
      'If a sum reaches 10 or more, carry the 1 to the left. For longer numbers, every inner digit is the sum of two neighbours: 11 × 254 → 2 | 2+5 | 5+4 | 4 = 2,794.',
    ],
    examples: [
      { problem: '11 × 43', steps: ['Outer digits: 4 … 3', 'Middle: 4 + 3 = 7', 'Answer 473'] },
      { problem: '11 × 78', steps: ['Outer digits: 7 … 8', 'Middle: 7 + 8 = 15 → write 5, carry 1', '7 + 1 = 8 → 858'] },
      { problem: '11 × 254', steps: ['2 | 2+5 | 5+4 | 4', '2 | 7 | 9 | 4', 'Answer 2,794'] },
    ],
    levels: ['2 digits, no carry', '2 digits with carry', '3 digits'],
    gen: (lv) => {
      let n: number
      do {
        n = lv === 3 ? randInt(112, 989) : randInt(12, 98)
      } while (
        n % 10 === 0 ||
        (lv === 1 && Math.floor(n / 10) + (n % 10) > 9) ||
        (lv === 2 && Math.floor(n / 10) + (n % 10) < 10)
      )
      return mul(11, n, `${fmt(n)} × 10 = ${fmt(n * 10)}, plus ${fmt(n)} → ${fmt(n * 11)} (digits: outer kept, neighbours summed)`)
    },
  },
  {
    id: 'square5',
    title: 'Squaring numbers ending in 5',
    summary: 'Multiply the leading part by the next integer, then append 25.',
    explanation: [
      'For a number written as "n5", the square is n × (n + 1) followed by 25. For 65²: 6 × 7 = 42 → 4,225.',
      'It works because (10n + 5)² = 100·n(n + 1) + 25. The same rule holds for larger numbers: 115² → 11 × 12 = 132 → 13,225.',
    ],
    examples: [
      { problem: '65²', steps: ['Leading part: 6', '6 × 7 = 42', 'Append 25 → 4,225'] },
      { problem: '115²', steps: ['Leading part: 11', '11 × 12 = 132', 'Append 25 → 13,225'] },
    ],
    levels: ['15² to 95²', '105² to 195²', '205² to 495²'],
    gen: (lv) => {
      const t = lv === 1 ? randInt(1, 9) : lv === 2 ? randInt(10, 19) : randInt(20, 49)
      const n = t * 10 + 5
      return {
        prompt: `${n}²`,
        answer: n * n,
        explanation: `${t} × ${t + 1} = ${fmt(t * (t + 1))}, append 25 → ${fmt(n * n)}`,
      }
    },
  },
  {
    id: 'square50',
    title: 'Squaring numbers close to 50 or 100',
    summary: 'Anchor on 2,500 or 10,000 and adjust by the distance.',
    explanation: [
      'Near 50: (50 + d)² = 2,500 + 100·d + d². So 53² = 2,500 + 300 + 9 = 2,809 and 47² = 2,500 − 300 + 9 = 2,209. In practice: 25 ± d gives the hundreds, d² the last two digits.',
      'Near 100: (100 + d)² = 10,000 + 200·d + d². So 104² = 10,000 + 800 + 16 = 10,816 and 97² = 10,000 − 600 + 9 = 9,409.',
    ],
    examples: [
      { problem: '53²', steps: ['d = +3', '25 + 3 = 28 → 2,800', 'd² = 9', '2,809'] },
      { problem: '97²', steps: ['d = −3', '100 − 2 × 3 = 94 → 9,400', 'd² = 9', '9,409'] },
    ],
    levels: ['Near 50', 'Near 100', 'Near 500 and 1,000'],
    gen: (lv) => {
      const base = lv === 1 ? 50 : lv === 2 ? 100 : pick([500, 1000])
      const d = randInt(1, 9) * pick([1, -1])
      const n = base + d
      return {
        prompt: `${fmt(n)}²`,
        answer: n * n,
        explanation: `${fmt(base)}² = ${fmt(base * base)}; ${d < 0 ? '−' : '+'} ${fmt(2 * base)} × ${Math.abs(d)} = ${fmt(
          2 * base * Math.abs(d),
        )}; + ${Math.abs(d)}² = ${d * d} → ${fmt(n * n)}`,
      }
    },
  },
  {
    id: 'percent',
    title: 'Percentage shortcuts',
    summary: 'Swap the numbers, or build from 10%, 5% and 1%.',
    explanation: [
      'Percentages commute: x% of y equals y% of x. So 8% of 50 is 50% of 8 = 4, and 36% of 25 is 25% of 36 = 9. Always check whether the swapped version is easier.',
      'Otherwise build the answer from blocks: 10% (move the decimal), 5% (half of that), 1% (move it again), 2.5% (half of 5%). 15% = 10% + 5%; 17.5% = 10% + 5% + 2.5%; 9% = 10% − 1%.',
    ],
    examples: [
      { problem: '36% of 25', steps: ['Swap: 25% of 36', '36 ÷ 4 = 9'] },
      { problem: '15% of 240', steps: ['10% = 24', '5% = 12', '24 + 12 = 36'] },
      { problem: '17.5% of 800', steps: ['10% = 80', '5% = 40', '2.5% = 20', '80 + 40 + 20 = 140'] },
    ],
    levels: ['Swap the numbers', 'Build from 10% and 5%', 'Fine blocks: 2.5%, 1%'],
    gen: (lv) => {
      if (lv === 1) {
        const y = pick([50, 25, 20, 10, 75])
        const x = y === 25 || y === 75 ? randInt(2, 22) * 4 : y === 20 ? randInt(2, 19) * 5 : randInt(2, 48) * 2
        return {
          prompt: `${x}% of ${y}`,
          answer: round((x * y) / 100, 2),
          explanation: `Swap: ${y}% of ${x} = ${fmt(round((x * y) / 100, 2))}`,
        }
      }
      const p = lv === 2 ? pick([15, 35, 45, 55, 65]) : pick([17.5, 2.5, 9, 11, 19, 21, 7.5])
      const n = randInt(2, 60) * (lv === 2 ? 20 : 40)
      return {
        prompt: `${fmt(p)}% of ${fmt(n)}`,
        answer: round((n * p) / 100, 2),
        explanation: `10% = ${fmt(n / 10)}, 5% = ${fmt(n / 20)}, 1% = ${fmt(n / 100)} → ${fmt(p)}% = ${fmt(round((n * p) / 100, 2))}`,
      }
    },
  },
  {
    id: 'fractions',
    title: 'Fraction-to-decimal conversions',
    summary: 'Memorise the unit fractions; everything else is a multiple.',
    explanation: [
      'Know these cold: ½ = 0.5, ⅓ ≈ 0.333, ¼ = 0.25, ⅕ = 0.2, ⅙ ≈ 0.167, ⅛ = 0.125, 1/12 ≈ 0.083, 1/16 = 0.0625, 1/20 = 0.05, 1/25 = 0.04.',
      'Any other fraction is a multiple of its unit fraction: ⅜ = 3 × 0.125 = 0.375, ⅚ = 1 − ⅙ ≈ 0.833, 7/20 = 7 × 0.05 = 0.35. Price ticks in eighths and sixteenths, odds and probabilities all rely on these.',
    ],
    examples: [
      { problem: '5/8', steps: ['⅛ = 0.125', '5 × 0.125 = 0.625'] },
      { problem: '5/6', steps: ['⅙ ≈ 0.1667', '1 − 0.1667 = 0.8333', 'Answer 0.833'] },
    ],
    levels: ['Halves, quarters, fifths, tenths', 'Eighths, twentieths, twenty-fifths', 'Thirds, sixths, twelfths, sixteenths'],
    gen: (lv) => {
      const d = lv === 1 ? pick([2, 4, 5, 10]) : lv === 2 ? pick([8, 20, 25]) : pick([3, 6, 12, 16])
      let n: number
      const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
      do n = randInt(1, d - 1)
      while (gcd(n, d) !== 1)
      const ans = round(n / d, 4)
      return {
        prompt: `${n}/${d} as a decimal`,
        answer: ans,
        tolerance: 0.0006,
        hint: lv === 3 ? 'to 3 decimal places' : 'exact decimal',
        explanation: `1/${d} = ${fmt(round(1 / d, 4))}; × ${n} = ${fmt(ans)}`,
      }
    },
  },
  {
    id: 'estimation',
    title: 'Estimation techniques',
    summary: 'Round in opposite directions and get within a few percent — fast.',
    explanation: [
      'On a desk, a fast answer within 2–5% beats a slow exact one. Round each number to one or two significant figures, and where possible round one factor up and the other down so the errors cancel.',
      'For division, round the divisor to something friendly and scale the dividend the same way. Then sanity-check the order of magnitude: count the digits.',
    ],
    examples: [
      { problem: '487 × 52', steps: ['487 → 500 (up 2.7%)', '52 → 50 (down 3.8%)', '500 × 50 = 25,000', 'Exact: 25,324 — within 1.3%'] },
      { problem: '7,812 ÷ 38', steps: ['38 → 40, so scale 7,812 → about 8,200', '8,200 ÷ 40 = 205', 'Exact: 205.6'] },
    ],
    levels: ['2 × 2 digits, within 10%', '3 × 2 digits, within 5%', 'Division, within 5%'],
    gen: (lv) => {
      const tolPct = lv === 1 ? 10 : 5
      if (lv === 3) {
        const d = randInt(13, 97)
        const n = randInt(1200, 9800)
        const ans = round(n / d, 2)
        return {
          prompt: `Estimate ${fmt(n)} ÷ ${d}`,
          answer: ans,
          tolerance: (ans * tolPct) / 100,
          hint: `within ${tolPct}%`,
          explanation: `Round to friendly numbers: about ${fmt(Math.round(n / 100) * 100)} ÷ ${Math.round(d / 5) * 5} ≈ ${fmt(
            round((Math.round(n / 100) * 100) / (Math.round(d / 5) * 5), 1),
          )}. Exact: ${fmt(ans)}`,
        }
      }
      const a = lv === 1 ? randInt(21, 98) : randInt(121, 989)
      const b = randInt(21, 98)
      const ra = lv === 1 ? Math.round(a / 10) * 10 : Math.round(a / 50) * 50
      const rb = Math.round(b / 10) * 10
      return {
        prompt: `Estimate ${fmt(a)} × ${b}`,
        answer: a * b,
        tolerance: (a * b * tolPct) / 100,
        hint: `within ${tolPct}%`,
        explanation: `${fmt(ra)} × ${rb} = ${fmt(ra * rb)}. Exact: ${fmt(a * b)}`,
      }
    },
  },
]

export function makeTechnique(t: Technique, level: number): Question {
  const lv = Math.min(3, Math.max(1, level))
  const d = t.gen(lv)
  return {
    tolerance: 0,
    ...d,
    key: `k:${t.id}:${d.prompt}`,
    category: 'techniques',
    level: lv,
    topic: t.title,
  }
}
