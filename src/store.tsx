import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { applyAnswer, emptyData, type AnswerEvent } from './lib/progress'
import { load, save } from './lib/storage'
import type { AppData, SessionRecord, Settings } from './lib/types'
import { dateKey } from './lib/util'

interface Store {
  data: AppData
  /** Latest data without waiting for a render (used inside the session loop). */
  getData: () => AppData
  recordAnswer: (e: AnswerEvent) => void
  addSession: (r: SessionRecord) => void
  markDailyDone: () => void
  setSettings: (p: Partial<Settings>) => void
  replace: (d: AppData) => void
  reset: () => void
}

const Ctx = createContext<Store | null>(null)
const MAX_SESSIONS = 1000

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(load)
  const ref = useRef(data)
  const dirty = useRef(false)

  const update = useCallback((f: (d: AppData) => AppData) => {
    ref.current = f(ref.current)
    dirty.current = true
    setData(ref.current)
  }, [])

  // Debounced persistence, flushed when the tab is hidden or closed.
  useEffect(() => {
    const flush = () => {
      if (dirty.current) {
        save(ref.current)
        dirty.current = false
      }
    }
    const id = window.setInterval(flush, 400)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', flush)
    return () => {
      flush()
      window.clearInterval(id)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', flush)
    }
  }, [])

  const store = useMemo<Store>(
    () => ({
      data,
      getData: () => ref.current,
      recordAnswer: (e) => update((d) => applyAnswer(d, e)),
      addSession: (r) => update((d) => ({ ...d, sessions: [...d.sessions, r].slice(-MAX_SESSIONS) })),
      markDailyDone: () =>
        update((d) => {
          const k = dateKey(Date.now())
          return d.dailyDone.includes(k) ? d : { ...d, dailyDone: [...d.dailyDone, k].slice(-400) }
        }),
      setSettings: (p) => update((d) => ({ ...d, settings: { ...d.settings, ...p } })),
      replace: (d) => update(() => d),
      reset: () => update((d) => ({ ...emptyData(), settings: d.settings })),
    }),
    [data, update],
  )
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider missing')
  return s
}
