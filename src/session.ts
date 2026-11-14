import { buildDailyPlan, factKey } from './lib/adaptive'
import { factQuestion } from './lib/generators/core'
import { getFormat, type FormatDef, type Maker } from './lib/modes'
import type { AppData, Question } from './lib/types'
import { createContext, useContext } from 'react'

export interface SessionConfig {
  modeId: string
  modeLabel: string
  format: FormatDef
  make: Maker
  /** Number of difficulty levels (0 = the mode has none). */
  levels: number
  /** Fixed level, or 0 for automatic progression. */
  level: number
  levelLabels?: string[]
  report?: (q: Question, correct: boolean) => void
  remaining?: () => number
  daily?: boolean
}

export type SessionFactory = () => SessionConfig

export interface AppNav {
  route: string
  navigate: (route: string) => void
  launch: (f: SessionFactory) => void
}

export const NavCtx = createContext<AppNav | null>(null)
export const useNav = (): AppNav => {
  const n = useContext(NavCtx)
  if (!n) throw new Error('NavCtx missing')
  return n
}

/** Daily recommended session: a fixed queue; missed facts come back once, a few questions later. */
export function dailyFactory(getData: () => AppData): SessionFactory {
  return () => {
    const plan = buildDailyPlan(getData().facts, Date.now())
    const queue = plan.facts.slice()
    const retried = new Set<string>()
    return {
      modeId: 'daily',
      modeLabel: 'Daily session',
      format: { ...getFormat('practice'), id: 'daily', name: 'Recommended practice', format: { kind: 'queue' } },
      levels: 0,
      level: 0,
      daily: true,
      make: () => {
        const f = queue.shift()
        return f ? factQuestion(f[0], f[1]) : null
      },
      report: (q, correct) => {
        if (correct || !q.fact) return
        const k = factKey(q.fact[0], q.fact[1])
        if (retried.has(k)) return
        retried.add(k)
        queue.splice(Math.min(3, queue.length), 0, q.fact)
      },
      remaining: () => queue.length,
    }
  }
}
