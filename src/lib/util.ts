export const randInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min

export const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]

export const sign = (): 1 | -1 => (Math.random() < 0.5 ? 1 : -1)

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const round = (x: number, dp = 4): number => {
  const f = 10 ** dp
  const r = Math.round((x + Number.EPSILON * Math.sign(x)) * f) / f
  return r === 0 ? 0 : r
}

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 })
/** 24500 → "24,500", -3.5 → "−3.5" */
export const fmt = (n: number): string => nf.format(round(n, 4)).replace('-', '−')

/** Money with 2 d.p. only when needed. */
export const eur = (n: number): string => {
  const r = round(n, 2)
  const s = Number.isInteger(r)
    ? nf.format(Math.abs(r))
    : Math.abs(r).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (r < 0 ? '−€' : '€') + s
}

export const fmtMs = (ms: number): string =>
  !isFinite(ms) || ms <= 0 ? '—' : ms < 10000 ? (ms / 1000).toFixed(2) + 's' : (ms / 1000).toFixed(1) + 's'

export const fmtDuration = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export const fmtPct = (x: number, dp = 1): string => (isFinite(x) ? (x * 100).toFixed(dp) + '%' : '—')

export const dateKey = (ts: number): string => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const DAY = 86_400_000
