import { useMemo } from 'react'
import { Card, Empty, masteryColor, Meter, PageHeader, Stat } from '../components/ui'
import { buildDailyPlan, MASTERED, weakestFacts } from '../lib/adaptive'
import { getFormat, getMode, MIN_WEAK_FACTS } from '../lib/modes'
import { dateKey, fmtMs, fmtPct } from '../lib/util'
import { dailyFactory, useNav } from '../session'
import { useStore } from '../store'

export function WeakPage() {
  const { data, getData } = useStore()
  const nav = useNav()
  const now = Date.now()
  const weak = useMemo(() => weakestFacts(data.facts, 30), [data.facts])
  const plan = useMemo(() => buildDailyPlan(data.facts, now), [data.facts]) // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => {
    let due = 0
    let mastered = 0
    let seen = 0
    for (const k in data.facts) {
      seen++
      if (data.facts[k].m >= MASTERED) mastered++
      else if (data.facts[k].due <= now) due++
    }
    return { due, mastered, seen }
  }, [data.facts]) // eslint-disable-line react-hooks/exhaustive-deps
  const ready = weak.length >= MIN_WEAK_FACTS
  const launchWeak = (formatId: string) =>
    nav.launch(() => ({
      modeId: 'weak',
      modeLabel: 'Weak facts',
      format: getFormat(formatId),
      make: getMode('weak').build({}),
      levels: 0,
      level: 0,
    }))
  const done = data.dailyDone.includes(dateKey(now))

  return (
    <>
      <PageHeader
        title="Weak facts & adaptive practice"
        sub="Every multiplication fact has its own record. Mistakes and slow answers lower its mastery and bring it back sooner; fast correct answers push the next review further out."
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Facts practised" value={counts.seen.toLocaleString('en-US')} sub="of 5,050 unique" />
        <Stat label="Due for review" value={counts.due} tone={counts.due ? 'accent' : undefined} sub="below mastery, interval elapsed" />
        <Stat label="Weak facts" value={weak.length} tone={weak.length ? 'down' : undefined} sub="top 30 shown" />
        <Stat label="Mastered" value={counts.mastered} tone={counts.mastered ? 'up' : undefined} sub={`mastery ≥ ${MASTERED}`} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <Card title="Your weakest facts">
          {weak.length === 0 ? (
            <Empty>
              Nothing here yet. Facts appear once you have missed them or answered them slowly in any multiplication mode.
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-mute">
                    <th className="pb-2 font-medium">Fact</th>
                    <th className="pb-2 text-right font-medium">Answer</th>
                    <th className="pb-2 text-right font-medium">Attempts</th>
                    <th className="pb-2 text-right font-medium">Mistakes</th>
                    <th className="pb-2 text-right font-medium">Accuracy</th>
                    <th className="pb-2 text-right font-medium">Avg time</th>
                    <th className="w-32 pb-2 pl-5 font-medium">Mastery</th>
                    <th className="pb-2 text-right font-medium">Last</th>
                  </tr>
                </thead>
                <tbody className="num">
                  {weak.map((w) => (
                    <tr key={`${w.a}x${w.b}`} className="border-t border-line">
                      <td className="py-1.5 font-medium">
                        {w.a} × {w.b}
                      </td>
                      <td className="py-1.5 text-right text-ink2">{w.a * w.b}</td>
                      <td className="py-1.5 text-right">{w.stat.n}</td>
                      <td className="py-1.5 text-right text-down">{w.stat.n - w.stat.c || ''}</td>
                      <td className="py-1.5 text-right">{fmtPct(w.stat.c / w.stat.n, 0)}</td>
                      <td className="py-1.5 text-right">{fmtMs(w.stat.ms / w.stat.n)}</td>
                      <td className="py-1.5 pl-5">
                        <div className="flex items-center gap-2">
                          <Meter value={w.stat.m / 100} color={masteryColor(w.stat.m)} />
                          <span className="w-6 text-right text-xs text-mute">{Math.round(w.stat.m)}</span>
                        </div>
                      </td>
                      <td className="py-1.5 text-right text-xs text-mute">
                        {new Date(w.stat.last).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Weak Facts mode">
            <p className="text-sm text-ink2">Drills only the facts in this list, weighted towards the worst.</p>
            {!ready && (
              <p className="mt-2 text-xs text-mute">
                Needs at least {MIN_WEAK_FACTS} weak facts — you have {weak.length}.
              </p>
            )}
            <div className="mt-4 grid gap-2">
              <button className="btn btn-primary" disabled={!ready} onClick={() => launchWeak('practice')}>
                Open practice
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn" disabled={!ready} onClick={() => launchWeak('sprint-60')}>
                  60-second sprint
                </button>
                <button className="btn" disabled={!ready} onClick={() => launchWeak('streak')}>
                  Streak run
                </button>
              </div>
            </div>
          </Card>
          <Card title="Daily recommended session">
            <p className="text-sm text-ink2">
              {plan.facts.length} questions: {plan.due} due, {plan.fresh} new, {plan.review} mastered for review. Missed facts
              return once more a few questions later.
            </p>
            <button className="btn mt-4 w-full" onClick={() => nav.launch(dailyFactory(getData))}>
              {done ? '✓ Done today — run again' : 'Start daily session'}
            </button>
          </Card>
        </div>
      </div>
    </>
  )
}
