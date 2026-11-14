import { useMemo, useState } from 'react'
import { Chart, type Point } from '../components/Chart'
import { Card, Chips, Empty, masteryColor, Meter, PageHeader, Stat } from '../components/ui'
import { buildDailyPlan, MASTERED, weakestFacts } from '../lib/adaptive'
import { accuracyOf, avgMsOf, dailyStreak, personalBests } from '../lib/progress'
import { CATEGORY_LABEL, type Category } from '../lib/types'
import { dateKey, fmtMs, fmtPct } from '../lib/util'
import { dailyFactory, useNav } from '../session'
import { useStore } from '../store'

const TOTAL_FACTS = 5050

export function Dashboard() {
  const { data, getData } = useStore()
  const nav = useNav()
  const [days, setDays] = useState(30)
  const now = Date.now()
  const t = data.totals
  const today = dateKey(now)

  const series = useMemo(() => {
    const acc: Point[] = []
    const vol: Point[] = []
    const spd: Point[] = []
    const d = new Date()
    d.setDate(d.getDate() - (days - 1))
    for (let i = 0; i < days; i++) {
      const k = dateKey(d.getTime())
      const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      const v = data.daily[k]
      acc.push({ label, value: v?.n ? (v.c / v.n) * 100 : null })
      vol.push({ label, value: v?.n ?? 0 })
      spd.push({ label, value: v?.n ? v.ms / v.n / 1000 : null })
      d.setDate(d.getDate() + 1)
    }
    return { acc, vol, spd }
  }, [data.daily, days])

  const mastery = useMemo(() => {
    let learning = 0
    let developing = 0
    let mastered = 0
    for (const k in data.facts) {
      const m = data.facts[k].m
      if (m >= MASTERED) mastered++
      else if (m >= 50) developing++
      else learning++
    }
    return { learning, developing, mastered, unseen: TOTAL_FACTS - learning - developing - mastered }
  }, [data.facts])

  const weak = useMemo(() => weakestFacts(data.facts, 8), [data.facts])
  const pbs = useMemo(() => personalBests(data.sessions).slice(0, 6), [data.sessions])
  const plan = useMemo(() => buildDailyPlan(data.facts, now), [data.facts]) // eslint-disable-line react-hooks/exhaustive-deps
  const dailyDone = data.dailyDone.includes(today)
  const streak = dailyStreak(data.daily, now)
  const cats = (Object.keys(CATEGORY_LABEL) as Category[]).filter((c) => data.categories[c]?.n)
  const todayN = data.daily[today]?.n ?? 0

  return (
    <>
      <PageHeader
        title="Dashboard"
        sub={t.answered ? `${todayN} answered today.` : 'No data yet — run your first session and the analytics will fill in.'}
        right={
          <button className="btn btn-primary" onClick={() => nav.navigate('train')}>
            Start training
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Questions answered" value={t.answered.toLocaleString('en-US')} sub={`${t.skipped} skipped`} />
        <Stat label="Accuracy" value={t.answered ? fmtPct(t.correct / t.answered) : '—'} sub={`${t.correct.toLocaleString('en-US')} correct`} />
        <Stat label="Avg response" value={t.answered ? fmtMs(t.ms / t.answered) : '—'} sub="all categories" />
        <Stat label="Daily streak" value={streak} sub={streak === 1 ? 'day' : 'days'} tone={streak ? 'accent' : undefined} />
        <Stat label="Best correct streak" value={t.bestStreak} sub={`current ${t.currentStreak}`} />
        <Stat label="Facts mastered" value={mastery.mastered.toLocaleString('en-US')} sub={`of ${TOTAL_FACTS.toLocaleString('en-US')} unique`} tone={mastery.mastered ? 'up' : undefined} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card title="Daily recommended session" className="xl:col-span-1">
          <div className="flex items-baseline justify-between">
            <span className="num text-3xl font-semibold">{plan.facts.length}</span>
            <span className={`rounded-md border px-2 py-0.5 text-xs ${dailyDone ? 'border-up/50 text-up' : 'border-line2 text-ink2'}`}>
              {dailyDone ? '✓ Done today' : 'Not done today'}
            </span>
          </div>
          <div className="mt-1 text-sm text-ink2">questions selected by spaced repetition</div>
          <dl className="mt-4 space-y-1.5 text-sm">
            {[
              ['Weak facts due for review', plan.due],
              ['New facts to learn', plan.fresh],
              ['Mastered facts to keep fresh', plan.review],
            ].map(([l, v]) => (
              <div key={l as string} className="flex justify-between">
                <dt className="text-ink2">{l}</dt>
                <dd className="num font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <button className="btn mt-4 w-full" onClick={() => nav.launch(dailyFactory(getData))}>
            {dailyDone ? 'Run another daily session' : 'Start daily session'}
          </button>
        </Card>

        <Card
          title="Progress over time"
          className="xl:col-span-2"
          right={<Chips options={[14, 30, 90].map((d) => ({ value: d, label: `${d}d` }))} value={days} onChange={setDays} />}
        >
          <div className="grid gap-5 md:grid-cols-3">
            <div>
              <div className="mb-1 text-xs text-ink2">Accuracy</div>
              <Chart kind="line" title="Accuracy per day" data={series.acc} format={(v) => v.toFixed(0) + '%'} yMax={100} color="var(--color-up)" />
            </div>
            <div>
              <div className="mb-1 text-xs text-ink2">Avg response time</div>
              <Chart kind="line" title="Average response time per day" data={series.spd} format={(v) => v.toFixed(1) + 's'} color="var(--color-info)" />
            </div>
            <div>
              <div className="mb-1 text-xs text-ink2">Questions per day</div>
              <Chart kind="bar" title="Questions answered per day" data={series.vol} format={(v) => String(Math.round(v))} />
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card
          title="Weakest facts"
          right={
            <button className="text-xs text-accent hover:underline" onClick={() => nav.navigate('weak')}>
              Train weak facts →
            </button>
          }
        >
          {weak.length === 0 ? (
            <Empty>Multiplication facts you miss or answer slowly will be listed here.</Empty>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-mute">
                  <th className="pb-2 font-medium">Fact</th>
                  <th className="pb-2 text-right font-medium">Acc.</th>
                  <th className="pb-2 text-right font-medium">Avg</th>
                  <th className="w-24 pb-2 pl-4 font-medium">Mastery</th>
                </tr>
              </thead>
              <tbody className="num">
                {weak.map((w) => (
                  <tr key={`${w.a}x${w.b}`} className="border-t border-line">
                    <td className="py-1.5 font-medium">
                      {w.a} × {w.b}
                    </td>
                    <td className="py-1.5 text-right text-ink2">
                      {w.stat.c}/{w.stat.n}
                    </td>
                    <td className="py-1.5 text-right text-ink2">{fmtMs(w.stat.ms / w.stat.n)}</td>
                    <td className="py-1.5 pl-4">
                      <div className="flex items-center gap-2">
                        <Meter value={w.stat.m / 100} color={masteryColor(w.stat.m)} />
                        <span className="w-6 text-right text-xs text-mute">{Math.round(w.stat.m)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="By category">
          {cats.length === 0 ? (
            <Empty>Per-category accuracy and speed appear after your first answers.</Empty>
          ) : (
            <div className="space-y-3">
              {cats.map((c) => {
                const v = data.categories[c]!
                const a = accuracyOf(v)
                return (
                  <div key={c}>
                    <div className="mb-1 flex items-baseline justify-between text-sm">
                      <span>{CATEGORY_LABEL[c]}</span>
                      <span className="num text-xs text-mute">
                        {v.n} · {fmtMs(avgMsOf(v))} · <span className="font-medium text-ink">{fmtPct(a, 0)}</span>
                      </span>
                    </div>
                    <Meter value={a} color="var(--color-up)" />
                  </div>
                )
              })}
            </div>
          )}
          <div className="mt-5 border-t border-line pt-4">
            <div className="label mb-2">Fact mastery — 5,050 unique facts</div>
            <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
              {(
                [
                  ['mastered', 'var(--color-up)'],
                  ['developing', 'var(--color-accent)'],
                  ['learning', 'var(--color-down)'],
                  ['unseen', 'var(--color-line2)'],
                ] as const
              ).map(([k, c]) => (mastery[k] ? <div key={k} style={{ flex: mastery[k], background: c }} title={`${k}: ${mastery[k]}`} /> : null))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink2">
              {(
                [
                  ['Mastered', mastery.mastered, 'var(--color-up)'],
                  ['Developing', mastery.developing, 'var(--color-accent)'],
                  ['Learning', mastery.learning, 'var(--color-down)'],
                  ['Unseen', mastery.unseen, 'var(--color-line2)'],
                ] as const
              ).map(([l, v, c]) => (
                <div key={l} className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-sm" style={{ background: c }} />
                  {l}
                  <span className="num ml-auto text-ink">{v.toLocaleString('en-US')}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card
          title="Personal bests"
          right={
            <button className="text-xs text-accent hover:underline" onClick={() => nav.navigate('history')}>
              All sessions →
            </button>
          }
        >
          {pbs.length === 0 ? (
            <Empty>Complete a timed challenge to set your first personal best.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {pbs.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{p.formatLabel}</div>
                    <div className="truncate text-xs text-mute">
                      {p.modeLabel} · {new Date(p.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="num text-lg font-semibold text-accent">
                      {p.score}
                      {p.formatId === 'accuracy' ? '%' : ''}
                    </div>
                    <div className="num text-[11px] text-mute">
                      {fmtPct(p.accuracy, 0)} · {fmtMs(p.avgMs)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
