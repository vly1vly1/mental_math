export type Category =
  | 'tables'
  | 'multiplication'
  | 'division'
  | 'percentages'
  | 'powers'
  | 'trading'
  | 'techniques'

export const CATEGORY_LABEL: Record<Category, string> = {
  tables: 'Times tables',
  multiplication: 'Multiplication',
  division: 'Division',
  percentages: 'Percentages',
  powers: 'Squares & roots',
  trading: 'Trading & quant',
  techniques: 'Techniques',
}

export interface Question {
  /** Identity used to avoid duplicates inside a test. */
  key: string
  category: Category
  prompt: string
  /** Word problems render in a smaller, wrapped type size. */
  long?: boolean
  answer: number
  /** When defined the expected answer is "quotient r remainder". */
  remainder?: number
  /** Absolute tolerance accepted around `answer`. */
  tolerance: number
  prefix?: string
  suffix?: string
  hint?: string
  explanation: string
  /** Multiplication fact trained by this question (for adaptive tracking). */
  fact?: [number, number]
  level: number
  topic?: string
}

/** Per-fact performance record (keys kept short: thousands are persisted). */
export interface FactStat {
  /** attempts */ n: number
  /** correct */ c: number
  /** total response time over all attempts, ms */ ms: number
  /** last practice timestamp */ last: number
  /** mastery score 0–100 */ m: number
  /** spaced-repetition interval in days */ iv: number
  /** next due timestamp */ due: number
  /** current run of consecutive correct answers */ s: number
}

export interface Tally {
  n: number
  c: number
  ms: number
}

export interface Settings {
  sound: boolean
  /** Per-question time limit in seconds, 0 = off. */
  questionLimit: number
  /** Default difficulty: 0 = auto/progressive, otherwise fixed level. */
  defaultLevel: number
  /** Wait for Enter after a mistake in untimed sessions. */
  holdOnMistake: boolean
}

export interface SessionRecord {
  id: string
  ts: number
  formatId: string
  formatLabel: string
  modeId: string
  modeLabel: string
  correct: number
  incorrect: number
  skipped: number
  avgMs: number
  fastestMs: number
  accuracy: number
  qpm: number
  durationMs: number
  bestStreak: number
  score: number
}

export interface AppData {
  version: 1
  settings: Settings
  totals: {
    answered: number
    correct: number
    skipped: number
    ms: number
    currentStreak: number
    bestStreak: number
  }
  categories: Partial<Record<Category, Tally>>
  facts: Record<string, FactStat>
  daily: Record<string, Tally>
  dailyDone: string[]
  sessions: SessionRecord[]
}

export interface GenCtx {
  facts: Record<string, FactStat>
  now: number
  /** Keys of the most recently asked questions (newest last). */
  recent: string[]
}
