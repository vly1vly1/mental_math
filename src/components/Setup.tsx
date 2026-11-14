import { useEffect, useMemo, useRef, useState } from 'react'
import { weakestFacts } from '../lib/adaptive'
import { TRADING_TOPICS } from '../lib/generators/trading'
import { customTimed, FORMATS, getFormat, getMode, MIN_WEAK_FACTS, type ModeOpts } from '../lib/modes'
import { pbKey, personalBests } from '../lib/progress'
import { clamp, fmtDuration, fmtMs, fmtPct } from '../lib/util'
import { useNav, type SessionFactory } from '../session'
import { useStore } from '../store'
import { Card, Chips } from './ui'

interface SetupState {
  modeId: string
  level: number
  formatId: string
  customSec: number
  aMin: number
  aMax: number
  bMin: number
  bMax: number
  list: string
  adaptive: boolean
  topics: string[]
}

/** "7, 8, 12-15" → [7, 8, 12, 13, 14, 15] (1–100 only). */
export function parseList(s: string): number[] {
  const out = new Set<number>()
  for (const part of s.split(/[,;\s]+/)) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/)
    if (!m) continue
    const a = Number(m[1])
    const b = m[2] ? Number(m[2]) : a
    for (let i = Math.min(a, b); i <= Math.max(a, b) && i <= 100; i++) if (i >= 1) out.add(i)
  }
  return [...out].sort((x, y) => x - y)
}

/** Enter starts the session from anywhere on the page except the Start button itself (its own click handles it). */
const ownsEnter = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('[data-start],a,select')

export function Setup({
  modeIds,
  defaultFormat,
  storageKey,
  formatFirst,
}: {
  modeIds: string[]
  defaultFormat: string
  storageKey: string
  formatFirst?: boolean
}) {
  const { data } = useStore()
  const nav = useNav()
  const [s, setS] = useState<SetupState>(() => {
    const base: SetupState = {
      modeId: modeIds[0],
      level: data.settings.defaultLevel,
      formatId: defaultFormat,
      customSec: 90,
      aMin: 1,
      aMax: 100,
      bMin: 1,
      bMax: 100,
      list: '',
      adaptive: true,
      topics: [],
    }
    try {
      const saved = JSON.parse(localStorage.getItem('mml:setup:' + storageKey) ?? 'null')
      if (saved && typeof saved === 'object') Object.assign(base, saved)
    } catch {
      /* ignore */
    }
    if (!modeIds.includes(base.modeId)) base.modeId = modeIds[0]
    return base
  })
  const set = (p: Partial<SetupState>) => setS((x) => ({ ...x, ...p }))
  useEffect(() => {
    try {
      localStorage.setItem('mml:setup:' + storageKey, JSON.stringify(s))
    } catch {
      /* ignore */
    }
  }, [s, storageKey])

  const mode = getMode(s.modeId)
  const level = mode.levels.length ? clamp(s.level, 0, mode.levels.length) : 0
  const format = s.formatId === 'custom' ? customTimed(clamp(Math.round(s.customSec) || 60, 5, 3600)) : getFormat(s.formatId)
  const aSet = parseList(s.list)
  const r = (v: number) => clamp(Math.round(v) || 1, 1, 100)
  const [aMin, aMax] = [Math.min(r(s.aMin), r(s.aMax)), Math.max(r(s.aMin), r(s.aMax))]
  const [bMin, bMax] = [Math.min(r(s.bMin), r(s.bMax)), Math.max(r(s.bMin), r(s.bMax))]

  const { modeKey, modeLabel } = useMemo(() => {
    if (mode.id === 'tables') {
      const a = aSet.length ? aSet.join(',') : `${aMin}-${aMax}`
      return {
        modeKey: `tables:${a}x${bMin}-${bMax}`,
        modeLabel: `Tables ${aSet.length ? aSet.join(', ') : `${aMin}–${aMax}`} × ${bMin}–${bMax}`,
      }
    }
    const lv = mode.levels.length ? (level ? `L${level}` : 'Auto') : ''
    if (mode.id === 'trading' && s.topics.length) {
      const names = TRADING_TOPICS.filter((t) => s.topics.includes(t.id)).map((t) => t.name)
      return {
        modeKey: `trading:${[...s.topics].sort().join('+')}:${lv}`,
        modeLabel: `${names.length <= 2 ? names.join(' + ') : `Trading (${names.length} topics)`} · ${lv}`,
      }
    }
    return { modeKey: `${mode.id}${lv ? ':' + lv : ''}`, modeLabel: `${mode.name}${lv ? ' · ' + lv : ''}` }
  }, [mode, aSet, aMin, aMax, bMin, bMax, level, s.topics])

  const weakCount = useMemo(() => weakestFacts(data.facts).length, [data.facts])
  const blocked = mode.id === 'weak' && weakCount < MIN_WEAK_FACTS

  const start = () => {
    if (blocked) return
    const opts: ModeOpts = {
      tables: { aMin, aMax, bMin, bMax, aSet: aSet.length ? aSet : undefined, adaptive: s.adaptive },
      topics: s.topics,
    }
    const factory: SessionFactory = () => ({
      modeId: modeKey,
      modeLabel,
      format,
      make: mode.build(opts),
      levels: mode.levels.length,
      level,
      levelLabels: mode.levels,
    })
    nav.launch(factory)
  }
  const startRef = useRef(start)
  startRef.current = start
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !ownsEnter(e.target)) startRef.current()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const combo = `${format.id}|${modeKey}`
  const history = data.sessions.filter((x) => pbKey(x) === combo)
  const best = personalBests(history)[0]
  const numField = (key: 'aMin' | 'aMax' | 'bMin' | 'bMax', label: string) => (
    <label className="block">
      <span className="mb-1 block text-xs text-mute">{label}</span>
      <input
        type="number"
        min={1}
        max={100}
        value={s[key]}
        onChange={(e) => set({ [key]: Number(e.target.value) } as Partial<SetupState>)}
        className="field num w-full"
      />
    </label>
  )

  const modeCard = (
    <Card title="Mode">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {modeIds.map((id) => {
          const m = getMode(id)
          const on = id === s.modeId
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => set({ modeId: id })}
              className={`cursor-pointer rounded-lg border px-3.5 py-3 text-left transition-colors ${
                on ? 'border-accent/70 bg-accent/[0.07]' : 'border-line2 hover:border-mute'
              }`}
            >
              <div className={`text-sm font-semibold ${on ? 'text-accent' : ''}`}>{m.name}</div>
              <div className="mt-0.5 text-xs text-mute">{m.desc}</div>
            </button>
          )
        })}
      </div>
    </Card>
  )

  const formatCard = (
    <Card title={formatFirst ? 'Challenge format' : 'Format'}>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {FORMATS.filter((x) => !formatFirst || x.id !== 'practice').map((x) => {
          const on = x.id === s.formatId
          return (
            <button
              key={x.id}
              type="button"
              aria-pressed={on}
              onClick={() => set({ formatId: x.id })}
              className={`cursor-pointer rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
                on ? 'border-accent/70 bg-accent/[0.07]' : 'border-line2 hover:border-mute'
              }`}
            >
              <div className={`text-sm font-semibold ${on ? 'text-accent' : ''}`}>{x.name}</div>
              <div className="mt-0.5 text-xs text-mute">{x.desc}</div>
            </button>
          )
        })}
        <div
          className={`rounded-lg border px-3.5 py-2.5 transition-colors ${
            s.formatId === 'custom' ? 'border-accent/70 bg-accent/[0.07]' : 'border-line2'
          }`}
        >
          <button type="button" className={`cursor-pointer text-sm font-semibold ${s.formatId === 'custom' ? 'text-accent' : ''}`} onClick={() => set({ formatId: 'custom' })}>
            Custom time limit
          </button>
          <div className="mt-1 flex items-center gap-2 text-xs text-mute">
            <input
              type="number"
              min={5}
              max={3600}
              aria-label="Custom time limit in seconds"
              value={s.customSec}
              onFocus={() => set({ formatId: 'custom' })}
              onChange={(e) => set({ customSec: Number(e.target.value), formatId: 'custom' })}
              className="field num w-20 py-1"
            />
            seconds
          </div>
        </div>
      </div>
    </Card>
  )

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        {formatFirst ? formatCard : modeCard}
        {formatFirst && modeCard}

        {mode.id === 'tables' && (
          <Card title="Table range">
            <div className="mb-3">
              <Chips
                options={[10, 12, 20, 50, 100].map((n) => ({ value: n, label: `1–${n}` }))}
                value={aMin === 1 && bMin === 1 && aMax === bMax && !aSet.length ? aMax : -1}
                onChange={(n) => set({ aMin: 1, aMax: n, bMin: 1, bMax: n, list: '' })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {numField('aMin', 'First factor min')}
              {numField('aMax', 'First factor max')}
              {numField('bMin', 'Second factor min')}
              {numField('bMax', 'Second factor max')}
            </div>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs text-mute">Practise selected tables only (optional) — e.g. 7, 8, 12-15</span>
              <input value={s.list} onChange={(e) => set({ list: e.target.value })} placeholder="all tables in range" className="field num w-full" />
            </label>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <Chips
                options={[
                  { value: 1, label: 'Adaptive', title: 'Weak and due facts appear more often' },
                  { value: 0, label: 'Uniform random' },
                ]}
                value={s.adaptive ? 1 : 0}
                onChange={(v) => set({ adaptive: v === 1 })}
              />
              <span className="num text-xs text-mute">
                {((aSet.length || aMax - aMin + 1) * (bMax - bMin + 1)).toLocaleString('en-US')} combinations
              </span>
            </div>
          </Card>
        )}

        {mode.id === 'trading' && (
          <Card
            title="Topics"
            right={
              <button className="text-xs text-mute hover:text-ink" onClick={() => set({ topics: [] })}>
                {s.topics.length ? 'Select all' : 'All topics'}
              </button>
            }
          >
            <div className="flex flex-wrap gap-1.5">
              {TRADING_TOPICS.map((t) => {
                const on = s.topics.includes(t.id)
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={on}
                    className={`chip ${on ? 'chip-on' : ''}`}
                    onClick={() => set({ topics: on ? s.topics.filter((x) => x !== t.id) : [...s.topics, t.id] })}
                  >
                    {t.name}
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-xs text-mute">{s.topics.length ? `${s.topics.length} selected` : 'Nothing selected = all 13 topics mixed.'}</p>
          </Card>
        )}

        {mode.levels.length > 0 && (
          <Card title="Difficulty">
            <div className="grid gap-1.5 sm:grid-cols-2">
              {[{ n: 0, label: 'Auto — progressive', sub: 'Starts easy and climbs as you answer correctly' }, ...mode.levels.map((l, i) => ({ n: i + 1, label: `Level ${i + 1}`, sub: l }))].map(
                (o) => (
                  <button
                    key={o.n}
                    type="button"
                    aria-pressed={level === o.n}
                    onClick={() => set({ level: o.n })}
                    className={`flex cursor-pointer items-baseline gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                      level === o.n ? 'border-accent/70 bg-accent/[0.07]' : 'border-line2 hover:border-mute'
                    }`}
                  >
                    <span className={`shrink-0 text-sm font-semibold ${level === o.n ? 'text-accent' : ''}`}>{o.label}</span>
                    <span className="truncate text-xs text-mute">{o.sub}</span>
                  </button>
                ),
              )}
            </div>
          </Card>
        )}

        {!formatFirst && formatCard}
      </div>

      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Card>
          <div className="label">Ready</div>
          <div className="mt-2 text-lg leading-snug font-semibold">{modeLabel}</div>
          <div className="mt-0.5 text-sm text-ink2">{format.name}</div>
          {blocked && (
            <p className="mt-3 text-xs text-down">
              Needs at least {MIN_WEAK_FACTS} weak facts (you have {weakCount}). Practise the tables first.
            </p>
          )}
          <button data-start className="btn btn-primary mt-4 w-full py-2.5" onClick={start} disabled={blocked}>
            Start session <span className="kbd border-black/30 bg-black/10 text-black">Enter</span>
          </button>
        </Card>
        <Card title="This combination">
          {history.length === 0 ? (
            <p className="text-sm text-mute">No results yet. Your scores for this exact setup will be compared here.</p>
          ) : (
            <>
              {best && format.id !== 'practice' && (
                <div className="mb-3 flex items-baseline justify-between">
                  <span className="text-sm text-ink2">Personal best</span>
                  <span className="num text-2xl font-semibold text-accent">{best.score}</span>
                </div>
              )}
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-mute">
                    <th className="pb-1 font-medium">Date</th>
                    <th className="pb-1 text-right font-medium">Score</th>
                    <th className="pb-1 text-right font-medium">Acc.</th>
                    <th className="pb-1 text-right font-medium">Avg</th>
                    <th className="pb-1 text-right font-medium">Time</th>
                  </tr>
                </thead>
                <tbody className="num">
                  {history
                    .slice(-6)
                    .reverse()
                    .map((x) => (
                      <tr key={x.id} className="border-t border-line">
                        <td className="py-1.5 text-ink2">{new Date(x.ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</td>
                        <td className={`py-1.5 text-right font-semibold ${x.id === best?.id ? 'text-accent' : ''}`}>{x.score}</td>
                        <td className="py-1.5 text-right">{fmtPct(x.accuracy, 0)}</td>
                        <td className="py-1.5 text-right">{fmtMs(x.avgMs)}</td>
                        <td className="py-1.5 text-right">{fmtDuration(x.durationMs)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
