import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, Chips, masteryColor, Meter, PageHeader } from '../components/ui'
import { factKey } from '../lib/adaptive'
import { makeTables, tableCandidates } from '../lib/generators/core'
import { getFormat } from '../lib/modes'
import { fmt, fmtMs, fmtPct } from '../lib/util'
import { useNav } from '../session'
import { useStore } from '../store'

const HW = 44
const HH = 30

/** Mastery heat: red (struggling) → green (fluent); strength shown by opacity. */
const heatColor = (m: number) =>
  m < 50 ? `rgba(240,89,107,${(0.2 + 0.45 * (1 - m / 50)).toFixed(2)})` : `rgba(46,196,160,${(0.12 + 0.5 * ((m - 50) / 50)).toFixed(2)})`

const rangeLabel = (set: Set<number>) => {
  const v = [...set].sort((a, b) => a - b)
  const parts: string[] = []
  for (let i = 0; i < v.length; i++) {
    let j = i
    while (v[j + 1] === v[j] + 1) j++
    parts.push(j > i ? `${v[i]}–${v[j]}` : String(v[i]))
    i = j
  }
  return parts.join(', ')
}

export function GridPage() {
  const { data } = useStore()
  const nav = useNav()
  const [n, setN] = useState(100)
  const [sel, setSel] = useState<[number, number] | null>(null)
  const [rows, setRows] = useState<Set<number>>(new Set())
  const [cols, setCols] = useState<Set<number>>(new Set())
  const [query, setQuery] = useState('')
  const [heat, setHeat] = useState(true)
  const [fmtId, setFmtId] = useState('practice')
  const [range, setRange] = useState({ r1: '', r2: '', c1: '', c2: '' })
  const scroller = useRef<HTMLDivElement>(null)
  const lastHdr = useRef<{ axis: 'r' | 'c'; i: number } | null>(null)
  const [view, setView] = useState({ top: 0, left: 0, w: 900, h: 600 })

  const CW = n <= 10 ? 72 : n <= 20 ? 60 : 52
  const CH = n <= 10 ? 46 : n <= 20 ? 38 : 30

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    let raf = 0
    const read = () => {
      raf = 0
      setView({ top: el.scrollTop, left: el.scrollLeft, w: el.clientWidth, h: el.clientHeight })
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(read)
    ro.observe(el)
    read()
    return () => {
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [])

  // Changing the range resets anything that no longer fits.
  const changeRange = (v: number) => {
    setN(v)
    setSel((s) => (s && (s[0] > v || s[1] > v) ? null : s))
    setRows((s) => new Set([...s].filter((x) => x <= v)))
    setCols((s) => new Set([...s].filter((x) => x <= v)))
    scroller.current?.scrollTo({ top: 0, left: 0 })
  }

  const q = /^\d+$/.test(query.trim()) ? Number(query.trim()) : null
  const matches = useMemo(() => {
    if (!q) return []
    const out: [number, number][] = []
    for (let a = 1; a <= n; a++) if (q % a === 0 && q / a <= n && q / a >= a) out.push([a, q / a])
    return out
  }, [q, n])

  const scrollTo = (a: number, b: number) => {
    const el = scroller.current
    if (!el) return
    el.scrollTo({
      left: Math.max(0, (b - 1) * CW - (el.clientWidth - HW) / 2 + CW / 2),
      top: Math.max(0, (a - 1) * CH - (el.clientHeight - HH) / 2 + CH / 2),
      behavior: 'smooth',
    })
  }
  const select = (a: number, b: number, reveal = false) => {
    setSel([a, b])
    if (reveal) scrollTo(a, b)
  }

  const toggleHdr = (axis: 'r' | 'c', i: number, shift: boolean) => {
    const setter = axis === 'r' ? setRows : setCols
    const last = lastHdr.current
    setter((prev) => {
      const next = new Set(prev)
      if (shift && last && last.axis === axis) {
        for (let k = Math.min(last.i, i); k <= Math.max(last.i, i); k++) next.add(k)
      } else if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
    lastHdr.current = { axis, i }
  }

  const addRange = (axis: 'r' | 'c') => {
    const a = Number(axis === 'r' ? range.r1 : range.c1)
    const b = Number((axis === 'r' ? range.r2 : range.c2) || a)
    if (!a || !b) return
    const setter = axis === 'r' ? setRows : setCols
    setter((prev) => {
      const next = new Set(prev)
      for (let k = Math.max(1, Math.min(a, b)); k <= Math.min(n, Math.max(a, b)); k++) next.add(k)
      return next
    })
  }

  const hasSel = rows.size > 0 || cols.size > 0
  const practiceCount = (rows.size || n) * (cols.size || n)
  const practise = () => {
    const aSet = rows.size ? [...rows].sort((x, y) => x - y) : undefined
    const bSet = cols.size ? [...cols].sort((x, y) => x - y) : undefined
    const opts = { aMin: 1, aMax: n, bMin: 1, bMax: n, aSet, bSet, adaptive: true }
    const cands = tableCandidates(opts)
    const label = `Tables ${aSet ? rangeLabel(rows) : `1–${n}`} × ${bSet ? rangeLabel(cols) : `1–${n}`}`
    nav.launch(() => ({
      modeId: `tables:${aSet ? aSet.join(',') : `1-${n}`}x${bSet ? bSet.join(',') : `1-${n}`}`,
      modeLabel: label,
      format: getFormat(fmtId),
      make: (_l, ctx) => makeTables(opts, ctx, cands),
      levels: 0,
      level: 0,
    }))
  }

  // Visible window (virtualised: only on-screen cells exist in the DOM).
  const c0 = Math.max(0, Math.floor(view.left / CW) - 2)
  const c1 = Math.min(n - 1, Math.ceil((view.left + view.w - HW) / CW) + 2)
  const r0 = Math.max(0, Math.floor(view.top / CH) - 2)
  const r1 = Math.min(n - 1, Math.ceil((view.top + view.h - HH) / CH) + 2)

  const cells: React.ReactNode[] = []
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const a = r + 1
      const b = c + 1
      const stat = data.facts[factKey(a, b)]
      const isSel = sel && sel[0] === a && sel[1] === b
      const cross = sel && (sel[0] === a || sel[1] === b)
      const inPractice = hasSel && (rows.size === 0 || rows.has(a)) && (cols.size === 0 || cols.has(b))
      const match = q !== null && a * b === q
      const layers: string[] = []
      if (cross) layers.push('linear-gradient(rgba(245,165,36,.13),rgba(245,165,36,.13))')
      if (inPractice) layers.push('linear-gradient(rgba(90,169,245,.16),rgba(90,169,245,.16))')
      if (heat && stat) layers.push(`linear-gradient(${heatColor(stat.m)},${heatColor(stat.m)})`)
      cells.push(
        <div
          key={a * 101 + b}
          className={`num absolute grid place-items-center border-r border-b border-line/60 text-[11.5px] ${
            a === b ? 'font-semibold text-accent' : stat && heat ? 'text-ink' : 'text-ink2'
          }`}
          style={{
            left: c * CW,
            top: r * CH,
            width: CW,
            height: CH,
            backgroundImage: layers.length ? layers.join(',') : undefined,
            opacity: q !== null && !match ? 0.28 : 1,
            boxShadow: isSel
              ? 'inset 0 0 0 2px var(--color-accent)'
              : match
                ? 'inset 0 0 0 2px var(--color-info)'
                : a === b
                  ? 'inset 0 0 0 1px rgba(245,165,36,.45)'
                  : undefined,
            fontSize: n <= 20 ? 14 : undefined,
          }}
        >
          {a * b}
        </div>,
      )
    }
  }

  // Headers stay opaque so cells scrolling underneath never show through.
  const hdrCls = (on: boolean, hot: boolean) =>
    `num absolute grid cursor-pointer place-items-center border-r border-b border-line text-[11px] transition-colors ${
      on ? 'bg-[#1c3350] font-semibold text-info' : hot ? 'bg-[#3a2d14] font-semibold text-accent' : 'bg-panel2 text-mute hover:text-ink'
    }`

  const onKey = (e: React.KeyboardEvent) => {
    const d: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
    const m = d[e.key]
    if (!m) return
    e.preventDefault()
    const [a, b] = sel ?? [1, 1]
    const na = Math.min(n, Math.max(1, a + (sel ? m[0] : 0)))
    const nb = Math.min(n, Math.max(1, b + (sel ? m[1] : 0)))
    setSel([na, nb])
    const el = scroller.current
    if (!el) return
    const x = (nb - 1) * CW
    const y = (na - 1) * CH
    if (x < el.scrollLeft) el.scrollLeft = x
    else if (x + CW > el.scrollLeft + el.clientWidth - HW) el.scrollLeft = x + CW - el.clientWidth + HW
    if (y < el.scrollTop) el.scrollTop = y
    else if (y + CH > el.scrollTop + el.clientHeight - HH) el.scrollTop = y + CH - el.clientHeight + HH
  }

  const stat = sel ? data.facts[factKey(sel[0], sel[1])] : undefined
  const attempted = useMemo(() => Object.keys(data.facts).length, [data.facts])

  return (
    <>
      <PageHeader
        title="100 × 100 multiplication grid"
        sub="All 10,000 products. Click a cell for its equation and your record; click row or column headers (Shift-click for a range) to build a practice set."
      />
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Chips options={[10, 20, 50, 100].map((v) => ({ value: v, label: `1–${v}` }))} value={n} onChange={changeRange} />
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="Search a number…"
            inputMode="numeric"
            aria-label="Search for a product"
            className="field num w-40 py-1.5"
          />
          {query && (
            <button className="text-xs text-mute hover:text-ink" onClick={() => setQuery('')}>
              Clear
            </button>
          )}
        </div>
        <button className={`chip ${heat ? 'chip-on' : ''}`} aria-pressed={heat} onClick={() => setHeat(!heat)}>
          Mastery heatmap
        </button>
        {heat && (
          <div className="flex items-center gap-2 text-[11px] text-mute">
            Struggling
            <span className="h-2 w-24 rounded-full" style={{ background: 'linear-gradient(90deg,rgba(240,89,107,.75),rgba(240,89,107,.2) 49%,rgba(46,196,160,.15) 51%,rgba(46,196,160,.7))' }} />
            Fluent
            <span className="ml-2 h-2.5 w-2.5 rounded-sm border border-line2" /> Unseen
            <span className="ml-2 h-2.5 w-2.5 rounded-sm" style={{ boxShadow: 'inset 0 0 0 1px rgba(245,165,36,.7)' }} /> Square
          </div>
        )}
      </div>

      {q !== null && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-ink2">
            {matches.length ? `${fmt(q)} =` : `${fmt(q)} is not a product of two numbers in 1–${n}.`}
          </span>
          {matches.map(([a, b]) => (
            <button key={a} className="chip num" onClick={() => select(a, b, true)}>
              {a} × {b}
            </button>
          ))}
          {q >= 1 && q <= n && (
            <button className="chip" onClick={() => select(q, 1, true)}>
              Go to the {q} times table
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_300px]">
        <div
          ref={scroller}
          tabIndex={0}
          onKeyDown={onKey}
          aria-label={`Multiplication grid 1 to ${n}. Use arrow keys to move.`}
          className="panel h-[62vh] overflow-auto overscroll-contain outline-none focus-visible:border-accent xl:h-[calc(100vh-235px)]"
        >
          <div className="relative" style={{ width: HW + n * CW, height: HH + n * CH }}>
            <div className="sticky top-0 z-20" style={{ height: HH }}>
              <div className="num sticky left-0 z-30 grid place-items-center border-r border-b border-line bg-panel2 text-xs text-mute" style={{ width: HW, height: HH }}>
                ×
              </div>
              {Array.from({ length: c1 - c0 + 1 }, (_, i) => c0 + i + 1).map((b) => (
                <div
                  key={b}
                  role="button"
                  aria-pressed={cols.has(b)}
                  title={`Select column ${b}`}
                  onClick={(e) => toggleHdr('c', b, e.shiftKey)}
                  className={hdrCls(cols.has(b), sel?.[1] === b)}
                  style={{ left: HW + (b - 1) * CW, top: 0, width: CW, height: HH }}
                >
                  {b}
                </div>
              ))}
            </div>
            <div className="relative" style={{ height: n * CH }}>
              <div className="sticky left-0 z-10" style={{ width: HW, height: n * CH }}>
                {Array.from({ length: r1 - r0 + 1 }, (_, i) => r0 + i + 1).map((a) => (
                  <div
                    key={a}
                    role="button"
                    aria-pressed={rows.has(a)}
                    title={`Select row ${a}`}
                    onClick={(e) => toggleHdr('r', a, e.shiftKey)}
                    className={hdrCls(rows.has(a), sel?.[0] === a)}
                    style={{ left: 0, top: (a - 1) * CH, width: HW, height: CH }}
                  >
                    {a}
                  </div>
                ))}
              </div>
              <div
                data-cells
                className="absolute cursor-pointer"
                style={{ left: HW, top: 0, width: n * CW, height: n * CH }}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  const b = Math.floor((e.clientX - r.left) / CW) + 1
                  const a = Math.floor((e.clientY - r.top) / CH) + 1
                  if (a >= 1 && a <= n && b >= 1 && b <= n) setSel(sel && sel[0] === a && sel[1] === b ? null : [a, b])
                }}
              >
                {cells}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <Card title="Selected fact">
            {sel ? (
              <>
                <div className="num text-2xl font-semibold tracking-tight">
                  {sel[0]} × {sel[1]} = <span className="text-accent">{fmt(sel[0] * sel[1])}</span>
                </div>
                <div className="mt-1 text-xs text-mute">
                  {sel[0] === sel[1] ? `Square number: ${sel[0]}²` : `Same fact as ${sel[1]} × ${sel[0]}`}
                </div>
                {stat ? (
                  <dl className="mt-4 space-y-1.5 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-ink2">Mastery</dt>
                      <dd className="flex w-32 items-center gap-2">
                        <Meter value={stat.m / 100} color={masteryColor(stat.m)} />
                        <span className="num w-7 text-right">{Math.round(stat.m)}</span>
                      </dd>
                    </div>
                    {[
                      ['Attempts', stat.n],
                      ['Correct / mistakes', `${stat.c} / ${stat.n - stat.c}`],
                      ['Accuracy', fmtPct(stat.c / stat.n, 0)],
                      ['Avg response', fmtMs(stat.ms / stat.n)],
                      ['Last practised', new Date(stat.last).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })],
                      ['Next review', stat.due <= Date.now() ? 'due now' : new Date(stat.due).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })],
                    ].map(([l, v]) => (
                      <div key={l as string} className="flex justify-between gap-3">
                        <dt className="text-ink2">{l}</dt>
                        <dd className="num">{v}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-4 text-sm text-mute">Not practised yet.</p>
                )}
                <div className="mt-4 flex gap-2">
                  <button className="btn flex-1 px-2 text-xs" onClick={() => toggleHdr('r', sel[0], false)}>
                    {rows.has(sel[0]) ? 'Remove' : 'Add'} row {sel[0]}
                  </button>
                  <button className="btn flex-1 px-2 text-xs" onClick={() => toggleHdr('c', sel[1], false)}>
                    {cols.has(sel[1]) ? 'Remove' : 'Add'} column {sel[1]}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-mute">Click any cell to highlight its row and column and see the equation with your performance record.</p>
            )}
          </Card>

          <Card
            title="Practice set"
            right={
              hasSel && (
                <button
                  className="text-xs text-mute hover:text-ink"
                  onClick={() => {
                    setRows(new Set())
                    setCols(new Set())
                  }}
                >
                  Clear
                </button>
              )
            }
          >
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-ink2">Rows</dt>
                <dd className="num truncate text-right">{rows.size ? rangeLabel(rows) : `all 1–${n}`}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-ink2">Columns</dt>
                <dd className="num truncate text-right">{cols.size ? rangeLabel(cols) : `all 1–${n}`}</dd>
              </div>
            </dl>
            {(['r', 'c'] as const).map((ax) => (
              <div key={ax} className="mt-3 flex items-center gap-1.5 text-xs text-mute">
                <span className="w-12">{ax === 'r' ? 'Rows' : 'Cols'}</span>
                <input
                  aria-label={`${ax === 'r' ? 'Rows' : 'Columns'} from`}
                  inputMode="numeric"
                  placeholder="from"
                  value={ax === 'r' ? range.r1 : range.c1}
                  onChange={(e) => setRange({ ...range, [ax + '1']: e.target.value.replace(/\D/g, '') })}
                  className="field num w-16 px-2 py-1"
                />
                –
                <input
                  aria-label={`${ax === 'r' ? 'Rows' : 'Columns'} to`}
                  inputMode="numeric"
                  placeholder="to"
                  value={ax === 'r' ? range.r2 : range.c2}
                  onChange={(e) => setRange({ ...range, [ax + '2']: e.target.value.replace(/\D/g, '') })}
                  onKeyDown={(e) => e.key === 'Enter' && addRange(ax)}
                  className="field num w-16 px-2 py-1"
                />
                <button className="btn px-2.5 py-1 text-xs" onClick={() => addRange(ax)}>
                  Add
                </button>
              </div>
            ))}
            <div className="mt-4">
              <Chips
                options={[
                  { value: 'practice', label: 'Open' },
                  { value: 'sprint-60', label: '60 s' },
                  { value: 'fixed-20', label: '20 Q' },
                  { value: 'streak', label: 'Streak' },
                ]}
                value={fmtId}
                onChange={setFmtId}
              />
            </div>
            <button className="btn btn-primary mt-3 w-full" onClick={practise}>
              Practise {practiceCount.toLocaleString('en-US')} combinations
            </button>
          </Card>
          <p className="px-1 text-xs text-mute">
            <span className="num text-ink2">{attempted.toLocaleString('en-US')}</span> of 5,050 unique facts practised. Only visible cells are rendered, so scrolling stays smooth.
          </p>
        </div>
      </div>
    </>
  )
}
