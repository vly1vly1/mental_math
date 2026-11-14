import type { Question } from './types'
import { fmt } from './util'

/**
 * Parse a typed number. Accepts thousands separators, a decimal comma,
 * currency/percent symbols, simple fractions ("3/8") and k/m suffixes.
 */
export function parseNumber(raw: string): number | null {
  let s = raw
    .trim()
    .toLowerCase()
    .replace(/[−–—]/g, '-')
    .replace(/[€$£%×\s_']/g, '')
    .replace(/:1$/, '')
    .replace(/(bps|bp|shares|pts|pp|x|r)$/, '')
  if (!s) return null

  if (s.includes('/')) {
    const parts = s.split('/')
    if (parts.length !== 2) return null
    const a = parseNumber(parts[0])
    const b = parseNumber(parts[1])
    return a === null || b === null || b === 0 ? null : a / b
  }

  let mult = 1
  if (/[km]$/.test(s)) {
    mult = s.endsWith('k') ? 1e3 : 1e6
    s = s.slice(0, -1)
  }

  const commas = (s.match(/,/g) ?? []).length
  if (commas > 0) {
    if (s.includes('.') || commas > 1) {
      s = s.replace(/,/g, '')
    } else {
      const [head, tail] = s.split(',')
      const thousands = tail.length === 3 && /^-?[1-9]\d{0,2}$/.test(head)
      s = thousands ? head + tail : head + '.' + tail
    }
  }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return null
  const v = Number(s) * mult
  return isFinite(v) ? v : null
}

export interface ParsedAnswer {
  value: number
  remainder?: number
}

/** Parse an answer; remainder answers look like "12 r 3", "12r3" or "12 3". */
export function parseAnswer(raw: string, wantsRemainder = false): ParsedAnswer | null {
  if (wantsRemainder) {
    const m = raw.trim().toLowerCase().match(/^(\d+)\s*(?:r|rem|remainder|\s)\s*(\d+)$/)
    if (m) return { value: Number(m[1]), remainder: Number(m[2]) }
    const v = parseNumber(raw)
    return v === null ? null : { value: v, remainder: 0 }
  }
  const v = parseNumber(raw)
  return v === null ? null : { value: v }
}

export function checkAnswer(q: Question, raw: string): boolean {
  const p = parseAnswer(raw, q.remainder !== undefined)
  if (!p) return false
  if (q.remainder !== undefined) return p.value === q.answer && p.remainder === q.remainder
  return Math.abs(p.value - q.answer) <= q.tolerance + 1e-9
}

export function formatAnswer(q: Question): string {
  if (q.remainder !== undefined) return `${fmt(q.answer)} r ${q.remainder}`
  return `${q.prefix ?? ''}${fmt(q.answer)}${q.suffix ?? ''}`.replace(/^(€)−/, '−$1')
}
