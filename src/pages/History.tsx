import { useMemo, useState } from 'react'
import { Chart } from '../components/Chart'
import { Card, Empty, PageHeader } from '../components/ui'
import { pbKey, personalBests } from '../lib/progress'
import type { SessionRecord } from '../lib/types'
import { fmtDuration, fmtMs, fmtPct } from '../lib/util'
import { useStore } from '../store'

const METRICS: { id: string; label: string; get: (s: SessionRecord) => number; fmt: (v: number) => string; higher: boolean }[] = [
  { id: 'score', label: 'Score', get: (s) => s.score, fmt: (v) => String(Math.round(v * 10) / 10), higher: true },
  { id: 'accuracy', label: 'Accuracy', get: (s) => s.accuracy * 100, fmt: (v) => v.toFixed(0) + '%', higher: true },
  { id: 'avg', label: 'Avg response', get: (s) => s.avgMs / 1000, fmt: (v) => v.toFixed(2) + 's', higher: false },
  { id: 'qpm', label: 'Per minute', get: (s) => s.qpm, fmt: (v) => v.toFixed(1), higher: true },
]

export function HistoryPage() {
  const { data } = useStore()
  const [combo, setCombo] = useState('all')
  const [metric, setMetric] = useState('score')
  const [picked, setPicked] = useState<string[]>([])

  const combos = useMemo(() => {
    const m = new Map<string, { label: string; n: number }>()
    for (const s of data.sessions) {
      const k = pbKey(s)
      const cur = m.get(k)
      if (cur) cur.n++
      else m.set(k, { label: `${s.formatLabel} — ${s.modeLabel}`, n: 1 })
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n)
  }, [data.sessions])
  const pbIds = useMemo(() => new Set(personalBests(data.sessions).map((s) => s.id)), [data.sessions])

  const active = combo !== 'all' && combos.some(([k]) => k === combo) ? combo : 'all'
  const list = useMemo(
    () => (active === 'all' ? data.sessions : data.sessions.filter((s) => pbKey(s) === active)).slice().reverse(),
    [data.sessions, active],
  )
  const met = METRICS.find((m) => m.id === metric)!
  const chrono = list.slice(0, 60).reverse()
  const compare = picked.map((id) => data.sessions.find((s) => s.id === id)).filter((s): s is SessionRecord => !!s)
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-3)))
  const dt = (ts: number) =>
    new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  const rows: [string, (s: SessionRecord) => string, ((s: SessionRecord) => number) | null, boolean][] = [
    ['Score', (s) => String(s.score), (s) => s.score, true],
    ['Correct', (s) => String(s.correct), (s) => s.correct, true],
    ['Incorrect', (s) => String(s.incorrect), (s) => s.incorrect, false],
    ['Skipped', (s) => String(s.skipped), (s) => s.skipped, false],
    ['Accuracy', (s) => fmtPct(s.accuracy), (s) => s.accuracy, true],
    ['Avg response', (s) => fmtMs(s.avgMs), (s) => s.avgMs, false],
    ['Fastest', (s) => fmtMs(s.fastestMs), (s) => s.fastestMs, false],
    ['Per minute', (s) => s.qpm.toFixed(1), (s) => s.qpm, true],
    ['Best streak', (s) => String(s.bestStreak), (s) => s.bestStreak, true],
    ['Duration', (s) => fmtDuration(s.durationMs), null, false],
  ]

  return (
    <>
      <PageHeader title="History" sub="Every completed session. Filter to one format and mode to chart the trend, and tick up to three sessions to compare them side by side." />
      {data.sessions.length === 0 ? (
        <Empty>No sessions recorded yet.</Empty>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <select value={active} onChange={(e) => setCombo(e.target.value)} className="field max-w-full" aria-label="Filter sessions">
              <option value="all">All sessions ({data.sessions.length})</option>
              {combos.map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label} ({v.n})
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-1.5">
              {METRICS.map((m) => (
                <button key={m.id} className={`chip ${m.id === metric ? 'chip-on' : ''}`} aria-pressed={m.id === metric} onClick={() => setMetric(m.id)}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <Card title={`${met.label} — ${active === 'all' ? 'last sessions, all formats' : 'trend for this format and mode'}`}>
            <Chart
              kind="line"
              title={`${met.label} across sessions`}
              height={190}
              data={chrono.map((s) => ({ label: dt(s.ts), value: met.get(s) }))}
              format={met.fmt}
              yMax={met.id === 'accuracy' ? 100 : undefined}
            />
            {active === 'all' && <p className="mt-2 text-xs text-mute">Scores from different formats are not directly comparable — pick one above for a clean trend.</p>}
          </Card>

          {compare.length >= 2 && (
            <Card
              title="Comparison"
              right={
                <button className="text-xs text-mute hover:text-ink" onClick={() => setPicked([])}>
                  Clear
                </button>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-mute">
                      <th className="pb-2 font-medium" />
                      {compare.map((s) => (
                        <th key={s.id} className="pb-2 text-right font-medium">
                          <div className="text-ink2">{dt(s.ts)}</div>
                          <div className="ml-auto max-w-44 truncate font-normal">{s.formatLabel}</div>
                          <div className="ml-auto max-w-44 truncate font-normal">{s.modeLabel}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="num">
                    {rows.map(([label, show, val, higher]) => {
                      const vals = val ? compare.map(val) : []
                      const best = val ? (higher ? Math.max(...vals) : Math.min(...vals)) : null
                      const spread = val ? new Set(vals).size > 1 : false
                      return (
                        <tr key={label} className="border-t border-line">
                          <td className="py-1.5 font-sans text-ink2">{label}</td>
                          {compare.map((s, i) => (
                            <td key={s.id} className={`py-1.5 text-right ${spread && vals[i] === best ? 'font-semibold text-up' : ''}`}>
                              {show(s)}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card title={`Sessions (${list.length})`} right={<span className="text-xs text-mute">{picked.length}/3 selected to compare</span>}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-mute">
                    <th className="w-8 pb-2" />
                    <th className="pb-2 font-medium">When</th>
                    <th className="pb-2 font-medium">Format</th>
                    <th className="pb-2 font-medium">Mode</th>
                    <th className="pb-2 text-right font-medium">Score</th>
                    <th className="pb-2 text-right font-medium">✓</th>
                    <th className="pb-2 text-right font-medium">✗</th>
                    <th className="pb-2 text-right font-medium">Skip</th>
                    <th className="pb-2 text-right font-medium">Acc.</th>
                    <th className="pb-2 text-right font-medium">Avg</th>
                    <th className="pb-2 text-right font-medium">Fastest</th>
                    <th className="pb-2 text-right font-medium">/min</th>
                    <th className="pb-2 text-right font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {list.slice(0, 200).map((s) => (
                    <tr key={s.id} className={`cursor-pointer border-t border-line transition-colors hover:bg-panel2/60 ${picked.includes(s.id) ? 'bg-accent/[0.06]' : ''}`} onClick={() => toggle(s.id)}>
                      <td className="py-1.5">
                        <input type="checkbox" checked={picked.includes(s.id)} onChange={() => toggle(s.id)} onClick={(e) => e.stopPropagation()} aria-label="Select to compare" className="accent-[var(--color-accent)]" />
                      </td>
                      <td className="num py-1.5 text-xs whitespace-nowrap text-ink2">{dt(s.ts)}</td>
                      <td className="py-1.5 whitespace-nowrap">{s.formatLabel}</td>
                      <td className="max-w-56 truncate py-1.5 text-ink2">{s.modeLabel}</td>
                      <td className="num py-1.5 text-right font-semibold">
                        {pbIds.has(s.id) && <span className="mr-1 text-accent" title="Personal best">★</span>}
                        {s.score}
                      </td>
                      <td className="num py-1.5 text-right text-up">{s.correct}</td>
                      <td className="num py-1.5 text-right text-down">{s.incorrect || ''}</td>
                      <td className="num py-1.5 text-right text-mute">{s.skipped || ''}</td>
                      <td className="num py-1.5 text-right">{fmtPct(s.accuracy, 0)}</td>
                      <td className="num py-1.5 text-right">{fmtMs(s.avgMs)}</td>
                      <td className="num py-1.5 text-right">{fmtMs(s.fastestMs)}</td>
                      <td className="num py-1.5 text-right">{s.qpm.toFixed(1)}</td>
                      <td className="num py-1.5 text-right">{fmtDuration(s.durationMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </>
  )
}
