import { weakestFacts, pickWeighted } from './adaptive'
import {
  DEFAULT_TABLES,
  DIV_LEVELS,
  factQuestion,
  makeDivision,
  makeMultiplication,
  makePercentage,
  makePower,
  makeTables,
  MULT_LEVELS,
  PCT_LEVELS,
  POWER_LEVELS,
  tableCandidates,
  type TablesOpts,
} from './generators/core'
import { makeTrading, TRADING_LEVELS } from './generators/trading'
import type { GenCtx, Question } from './types'
import { clamp, pick } from './util'

export interface ModeOpts {
  tables?: TablesOpts
  topics?: string[]
}

/** Returns null when the mode cannot produce a question (e.g. no weak facts yet). */
export type Maker = (level: number, ctx: GenCtx) => Question | null

export interface ModeDef {
  id: string
  name: string
  desc: string
  /** Level labels; empty when the mode has no difficulty ladder. */
  levels: string[]
  build: (opts: ModeOpts) => Maker
}

const MIXED_LEVELS = ['Foundations', 'Developing', 'Fluent', 'Advanced', 'Expert']

/** Mixed level → level inside each sub-generator. */
const MIXED_MAP: Record<string, number[]> = {
  multiplication: [1, 2, 3, 4, 6],
  division: [1, 2, 3, 4, 5],
  percentages: [1, 2, 3, 4, 5],
  powers: [1, 2, 3, 4, 5],
  trading: [1, 1, 2, 2, 3],
}

export function makeMixed(level: number, ctx: GenCtx): Question {
  const i = clamp(level, 1, 5) - 1
  const kind = pick(['tables', 'multiplication', 'multiplication', 'division', 'percentages', 'powers', 'trading'])
  switch (kind) {
    case 'tables': {
      const max = [10, 12, 20, 30, 50][i]
      return makeTables({ aMin: 2, aMax: max, bMin: 2, bMax: max, adaptive: true }, ctx)
    }
    case 'multiplication':
      return makeMultiplication(MIXED_MAP.multiplication[i])
    case 'division':
      return makeDivision(MIXED_MAP.division[i])
    case 'percentages':
      return makePercentage(MIXED_MAP.percentages[i])
    case 'powers':
      return makePower(MIXED_MAP.powers[i])
    default:
      return makeTrading(MIXED_MAP.trading[i])
  }
}

export const MIN_WEAK_FACTS = 3

export function makeWeak(ctx: GenCtx): Question | null {
  const weak = weakestFacts(ctx.facts, 30)
  if (weak.length < MIN_WEAK_FACTS) return null
  const recent = new Set(ctx.recent.slice(-Math.min(3, weak.length - 1)))
  const pool = weak.filter((w) => !recent.has(factQuestion(w.a, w.b).key))
  const w = pickWeighted(
    pool,
    pool.map((x) => x.weakness + 5),
  )
  return Math.random() < 0.5 ? factQuestion(w.a, w.b) : factQuestion(w.b, w.a)
}

export const MODES: ModeDef[] = [
  {
    id: 'tables',
    name: 'Multiplication tables',
    desc: 'Any range up to 100 × 100, adaptive to your weak facts.',
    levels: [],
    build: (o) => {
      const t = o.tables ?? DEFAULT_TABLES
      const cands = tableCandidates(t)
      return (_l, ctx) => makeTables(t, ctx, cands)
    },
  },
  {
    id: 'multiplication',
    name: 'Mental multiplication',
    desc: 'From single digits to 3 × 3 digits and near-base products.',
    levels: MULT_LEVELS,
    build: () => (l) => makeMultiplication(l),
  },
  {
    id: 'division',
    name: 'Division',
    desc: 'Exact division, then remainders and decimal answers.',
    levels: DIV_LEVELS,
    build: () => (l) => makeDivision(l),
  },
  {
    id: 'percentages',
    name: 'Percentages',
    desc: 'Core percentages, changes, reverse and compound moves.',
    levels: PCT_LEVELS,
    build: () => (l) => makePercentage(l),
  },
  {
    id: 'powers',
    name: 'Squares and roots',
    desc: 'Squares to 100², cubes to 20³, roots and near-squares.',
    levels: POWER_LEVELS,
    build: () => (l) => makePower(l),
  },
  {
    id: 'mixed',
    name: 'Mixed arithmetic',
    desc: 'Everything combined, including trading questions.',
    levels: MIXED_LEVELS,
    build: () => makeMixed,
  },
  {
    id: 'trading',
    name: 'Trading & quant',
    desc: 'P&L, sizing, basis points, expected value, odds and more.',
    levels: TRADING_LEVELS,
    build: (o) => (l) => makeTrading(l, o.topics),
  },
  {
    id: 'weak',
    name: 'Weak facts',
    desc: 'Only the multiplication facts you miss or answer slowly.',
    levels: [],
    build: () => (_l, ctx) => makeWeak(ctx),
  },
]

export const getMode = (id: string): ModeDef => MODES.find((m) => m.id === id) ?? MODES[0]

/* ───────────────────────── Session formats ───────────────────────── */

export type Format =
  | { kind: 'practice' }
  | { kind: 'timed'; seconds: number }
  | { kind: 'fixed'; count: number }
  | { kind: 'accuracy'; count: number }
  | { kind: 'streak' }
  | { kind: 'queue' }

export interface FormatDef {
  id: string
  name: string
  desc: string
  format: Format
}

export const FORMATS: FormatDef[] = [
  { id: 'practice', name: 'Open practice', desc: 'Untimed. End whenever you like.', format: { kind: 'practice' } },
  { id: 'sprint-30', name: '30-second sprint', desc: 'Maximum correct answers in 30 s.', format: { kind: 'timed', seconds: 30 } },
  { id: 'sprint-60', name: '60-second sprint', desc: 'Maximum correct answers in 60 s.', format: { kind: 'timed', seconds: 60 } },
  { id: 'sprint-120', name: '2-minute sprint', desc: 'Maximum correct answers in 2 min.', format: { kind: 'timed', seconds: 120 } },
  { id: 'endurance-300', name: '5-minute endurance', desc: 'Sustained pace for 5 min.', format: { kind: 'timed', seconds: 300 } },
  { id: 'fixed-20', name: '20-question test', desc: '20 unique questions, scored on accuracy then time.', format: { kind: 'fixed', count: 20 } },
  { id: 'fixed-50', name: '50-question test', desc: '50 unique questions, scored on accuracy then time.', format: { kind: 'fixed', count: 50 } },
  { id: 'accuracy', name: 'Accuracy challenge', desc: '25 questions, no skipping. Only precision counts.', format: { kind: 'accuracy', count: 25 } },
  { id: 'streak', name: 'Streak challenge', desc: 'One mistake ends the run. How far can you go?', format: { kind: 'streak' } },
]

export const customTimed = (seconds: number): FormatDef => ({
  id: `timed-${seconds}`,
  name: `${seconds}-second sprint`,
  desc: 'Custom time limit.',
  format: { kind: 'timed', seconds },
})

export const getFormat = (id: string): FormatDef => {
  const f = FORMATS.find((x) => x.id === id)
  if (f) return f
  const m = id.match(/^timed-(\d+)$/)
  return m ? customTimed(Number(m[1])) : FORMATS[0]
}
