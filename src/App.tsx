import { useCallback, useEffect, useMemo, useState } from 'react'
import { Session } from './components/Session'
import { Dashboard } from './pages/Dashboard'
import { GridPage } from './pages/Grid'
import { HistoryPage } from './pages/History'
import { SettingsPage } from './pages/Settings'
import { TechniquesPage } from './pages/Techniques'
import { ChallengesPage, TradingPage, TrainPage } from './pages/Train'
import { WeakPage } from './pages/Weak'
import { NavCtx, type SessionFactory } from './session'

const ROUTES: { id: string; name: string; el: () => React.ReactNode }[] = [
  { id: 'dashboard', name: 'Dashboard', el: () => <Dashboard /> },
  { id: 'train', name: 'Train', el: () => <TrainPage /> },
  { id: 'challenges', name: 'Challenges', el: () => <ChallengesPage /> },
  { id: 'trading', name: 'Trading & quant', el: () => <TradingPage /> },
  { id: 'weak', name: 'Weak facts', el: () => <WeakPage /> },
  { id: 'grid', name: '100 × 100 grid', el: () => <GridPage /> },
  { id: 'techniques', name: 'Techniques', el: () => <TechniquesPage /> },
  { id: 'history', name: 'History', el: () => <HistoryPage /> },
  { id: 'settings', name: 'Settings', el: () => <SettingsPage /> },
]

const readRoute = () => {
  const r = window.location.hash.replace(/^#\/?/, '').split('/')[0]
  return ROUTES.some((x) => x.id === r) ? r : 'dashboard'
}

export default function App() {
  const [route, setRoute] = useState(readRoute)
  const [factory, setFactory] = useState<SessionFactory | null>(null)

  useEffect(() => {
    const h = () => setRoute(readRoute())
    window.addEventListener('hashchange', h)
    return () => window.removeEventListener('hashchange', h)
  }, [])

  const navigate = useCallback((r: string) => {
    window.location.hash = '/' + r
  }, [])
  const launch = useCallback((f: SessionFactory) => setFactory(() => f), [])
  const nav = useMemo(() => ({ route, navigate, launch }), [route, navigate, launch])

  // Number keys jump between sections when not typing.
  useEffect(() => {
    if (factory) return
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '')) return
      const i = Number(e.key) - 1
      if (Number.isInteger(i) && ROUTES[i]) navigate(ROUTES[i].id)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [factory, navigate])

  const page = ROUTES.find((r) => r.id === route) ?? ROUTES[0]

  return (
    <NavCtx.Provider value={nav}>
      {factory ? (
        <div className="h-full overflow-y-auto">
          <Session factory={factory} onExit={() => setFactory(null)} />
        </div>
      ) : (
        <div className="flex h-full flex-col lg:flex-row">
          <aside className="shrink-0 border-b border-line bg-panel lg:w-56 lg:border-r lg:border-b-0">
            <div className="flex items-center gap-2.5 px-4 pt-3 pb-2 lg:px-5 lg:pt-5 lg:pb-5">
              <div className="num grid h-7 w-7 place-items-center rounded-md bg-accent text-base font-bold text-black">×</div>
              <div className="leading-tight">
                <div className="text-sm font-semibold tracking-tight">Mental Maths Lab</div>
                <div className="hidden text-[10px] tracking-[0.14em] text-mute uppercase lg:block">Performance terminal</div>
              </div>
            </div>
            <nav aria-label="Sections" className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:gap-0.5 lg:px-3">
              {ROUTES.map((r, i) => {
                const on = r.id === route
                return (
                  <a
                    key={r.id}
                    href={`#/${r.id}`}
                    aria-current={on ? 'page' : undefined}
                    className={`flex shrink-0 items-center gap-3 rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors lg:py-2 ${
                      on ? 'bg-panel2 font-medium text-ink' : 'text-ink2 hover:bg-panel2/60 hover:text-ink'
                    }`}
                  >
                    <span className={`num hidden text-[10px] lg:inline ${on ? 'text-accent' : 'text-mute'}`}>{i + 1}</span>
                    {r.name}
                  </a>
                )
              })}
            </nav>
            <div className="mt-auto hidden px-5 py-4 text-[11px] leading-relaxed text-mute lg:block">
              Keys <span className="kbd">1</span>–<span className="kbd">9</span> switch section.
              <br />
              All data stays in this browser.
            </div>
          </aside>
          <main className="min-h-0 flex-1 overflow-y-auto">
            <div key={route} className="fade-up mx-auto max-w-[1400px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
              {page.el()}
            </div>
          </main>
        </div>
      )}
    </NavCtx.Provider>
  )
}
