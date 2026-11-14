import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { checkAnswer, formatAnswer } from '../lib/answer'
import { compareSessions, pbKey, personalBests, scoreFor, summarize, type Summary } from '../lib/progress'
import { play } from '../lib/sound'
import type { Question, SessionRecord } from '../lib/types'
import { fmtDuration, fmtMs, fmtPct } from '../lib/util'
import type { SessionConfig, SessionFactory } from '../session'
import { useStore } from '../store'

interface Entry {
  q: Question
  given: string
  correct: boolean
  skipped: boolean
  timedOut?: boolean
  ms: number
}

interface Result {
  summary: Summary
  duration: number
  saved: boolean
  pb: boolean
  prev?: SessionRecord
  score: number
}

export function Session({ factory, onExit }: { factory: SessionFactory; onExit: () => void }) {
  const [run, setRun] = useState(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cfg = useMemo(factory, [factory, run])
  return <SessionRun key={run} cfg={cfg} onExit={onExit} onAgain={() => setRun((r) => r + 1)} />
}

function SessionRun({ cfg, onExit, onAgain }: { cfg: SessionConfig; onExit: () => void; onAgain: () => void }) {
  const store = useStore()
  const storeRef = useRef(store)
  storeRef.current = store
  const [, bump] = useReducer((x: number) => x + 1, 0)
  const inputRef = useRef<HTMLInputElement>(null)
  const f = cfg.format.format
  const timed = f.kind === 'timed'
  const limitMs = timed ? f.seconds * 1000 : 0
  const total = f.kind === 'fixed' || f.kind === 'accuracy' ? f.count : 0
  const canSkip = f.kind !== 'accuracy' && f.kind !== 'streak'
  const canPause = !timed || f.seconds >= 300
  const settings = store.data.settings
  const qLimit = settings.questionLimit * 1000

  const S = useRef({
    phase: 'ready' as 'ready' | 'question' | 'feedback' | 'done',
    q: null as Question | null,
    input: '',
    log: [] as Entry[],
    last: null as Entry | null,
    level: cfg.level || 1,
    up: 0,
    down: 0,
    streak: 0,
    paused: false,
    running: false,
    accum: 0,
    resumedAt: 0,
    qStart: 0,
    seen: new Set<string>(),
    recent: [] as string[],
    timer: 0,
    empty: false,
    result: null as Result | null,
    levelNote: '',
  }).current

  const active = () => S.accum + (S.running ? performance.now() - S.resumedAt : 0)
  const setRunning = (on: boolean) => {
    if (on === S.running) return
    if (on) S.resumedAt = performance.now()
    else S.accum = active()
    S.running = on
  }
  const focus = () => requestAnimationFrame(() => inputRef.current?.focus())

  function finish(natural: boolean) {
    window.clearTimeout(S.timer)
    setRunning(false)
    const duration = timed && natural ? limitMs : S.accum
    const summary = summarize(S.log, duration)
    const score = scoreFor(cfg.format.id, summary)
    const save = (natural || f.kind === 'practice') && S.log.length > 0
    let pb = false
    let prev: SessionRecord | undefined
    if (save) {
      const rec: SessionRecord = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        ts: Date.now(),
        formatId: cfg.format.id,
        formatLabel: cfg.format.name,
        modeId: cfg.modeId,
        modeLabel: cfg.modeLabel,
        ...summary,
        durationMs: duration,
        score,
      }
      const sessions = storeRef.current.getData().sessions
      const k = pbKey(rec)
      prev = [...sessions].reverse().find((s) => pbKey(s) === k)
      const best = personalBests(sessions).find((s) => pbKey(s) === k)
      pb = !['practice', 'daily'].includes(rec.formatId) && summary.correct > 0 && (!best || compareSessions(rec, best) > 0)
      storeRef.current.addSession(rec)
      if (cfg.daily && natural) storeRef.current.markDailyDone()
    }
    S.result = { summary, duration, saved: save, pb, prev, score }
    S.phase = 'done'
    play('done', settings.sound && S.log.length > 0)
    bump()
  }

  function next() {
    window.clearTimeout(S.timer)
    if (total && S.log.length >= total) return finish(true)
    const dedupe = f.kind === 'fixed' || f.kind === 'accuracy'
    let q: Question | null = null
    for (let i = 0; i < 60; i++) {
      q = cfg.make(S.level, { facts: storeRef.current.getData().facts, now: Date.now(), recent: S.recent })
      if (!q || f.kind === 'queue') break
      if (!(dedupe && S.seen.has(q.key)) && q.key !== S.recent[S.recent.length - 1]) break
    }
    if (!q) {
      if (S.log.length === 0) {
        S.empty = true
        S.phase = 'done'
        bump()
      } else finish(true)
      return
    }
    S.seen.add(q.key)
    S.recent.push(q.key)
    if (S.recent.length > 8) S.recent.shift()
    S.q = q
    S.input = ''
    S.phase = 'question'
    S.qStart = active()
    bump()
    focus()
  }

  function record(given: string, correct: boolean, skipped: boolean, timedOut = false) {
    const q = S.q!
    const entry: Entry = { q, given, correct, skipped, timedOut, ms: Math.max(0, active() - S.qStart) }
    S.log.push(entry)
    S.last = entry
    storeRef.current.recordAnswer({ category: q.category, fact: q.fact, correct, skipped, ms: entry.ms, now: Date.now() })
    cfg.report?.(q, correct && !skipped)
    if (skipped) {
      S.streak = 0
      return next()
    }
    play(correct ? 'correct' : 'wrong', settings.sound)
    S.streak = correct ? S.streak + 1 : 0
    S.levelNote = ''
    if (cfg.levels > 1 && cfg.level === 0) {
      if (correct) {
        S.down = 0
        if (++S.up >= 4 && S.level < cfg.levels) {
          S.level++
          S.up = 0
          S.levelNote = `Level up → ${S.level}`
        }
      } else {
        S.up = 0
        if (++S.down >= 2 && S.level > 1) {
          S.level--
          S.down = 0
          S.levelNote = `Level down → ${S.level}`
        }
      }
    }
    S.phase = 'feedback'
    if (correct) S.timer = window.setTimeout(next, timed ? 160 : 420)
    else if (f.kind === 'streak') {
      /* wait for Enter, then show results */
    } else if (timed) S.timer = window.setTimeout(next, 1700)
    else if (!settings.holdOnMistake) S.timer = window.setTimeout(next, 2400)
    bump()
    focus()
  }

  const submit = () => {
    if (S.phase !== 'question' || S.paused || !S.q || !S.input.trim()) return
    record(S.input.trim(), checkAnswer(S.q, S.input), false)
  }
  const advance = () => {
    if (S.phase !== 'feedback' || S.paused) return
    if (f.kind === 'streak' && S.last && !S.last.correct) finish(true)
    else next()
  }
  const skip = () => {
    if (S.phase === 'question' && !S.paused && canSkip) record('', false, true)
  }
  const start = () => {
    S.accum = 0
    setRunning(true)
    next()
  }
  const togglePause = () => {
    if (!canPause || (S.phase !== 'question' && S.phase !== 'feedback')) return
    S.paused = !S.paused
    if (S.paused) window.clearTimeout(S.timer)
    setRunning(!S.paused)
    bump()
    if (!S.paused) focus()
  }

  // Clock: time limits and repaint.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!S.running) return
      if (timed && active() >= limitMs) return finish(true)
      if (qLimit && S.phase === 'question' && active() - S.qStart >= qLimit) return record('', false, false, true)
      bump()
    }, 100)
    return () => {
      window.clearInterval(id)
      window.clearTimeout(S.timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keyboard-first control.
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {})
  keyRef.current = (e) => {
    const onButton = (e.target as HTMLElement)?.tagName === 'BUTTON'
    if (e.key === 'Enter' && !onButton) {
      e.preventDefault()
      if (S.phase === 'ready') start()
      else if (S.paused) togglePause()
      else if (S.phase === 'question') submit()
      else if (S.phase === 'feedback') advance()
      else if (S.phase === 'done') S.empty ? onExit() : onAgain()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      if (S.phase === 'ready' || S.phase === 'done') onExit()
      else if (canPause) togglePause()
    } else if (e.key === 'Tab' && S.phase === 'question' && !S.paused && canSkip) {
      e.preventDefault()
      skip()
    }
  }
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const correct = S.log.filter((e) => e.correct).length
  const wrong = S.log.filter((e) => !e.correct && !e.skipped).length
  const skipped = S.log.filter((e) => e.skipped).length
  const elapsed = active()
  const levelLabel = cfg.levels > 1 ? `L${S.level}${cfg.level === 0 ? ' auto' : ''}` : ''

  const shell = (body: React.ReactNode) => (
    <div className="flex min-h-full flex-col bg-bg">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{cfg.modeLabel}</div>
          <div className="truncate text-xs text-mute">{cfg.format.name}</div>
        </div>
        <button className="btn btn-ghost text-xs" onClick={onExit}>
          Exit <span className="kbd">Esc</span>
        </button>
      </div>
      {body}
    </div>
  )

  /* ── Ready ── */
  if (S.phase === 'ready')
    return shell(
      <div className="grid flex-1 place-items-center p-6">
        <div className="fade-up w-full max-w-lg text-center">
          <div className="label">{cfg.format.name}</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{cfg.modeLabel}</h1>
          <p className="mt-3 text-sm text-ink2">{cfg.format.desc}</p>
          {cfg.levels > 1 && (
            <p className="mt-1 text-sm text-mute">
              {cfg.level === 0
                ? 'Difficulty adapts: four in a row moves you up, two misses move you down.'
                : `Level ${cfg.level}: ${cfg.levelLabels?.[cfg.level - 1] ?? ''}`}
            </p>
          )}
          {qLimit > 0 && <p className="mt-1 text-sm text-mute">Per-question limit: {settings.questionLimit}s.</p>}
          <button className="btn btn-primary mt-8 px-8 py-3 text-base" onClick={start} autoFocus>
            Start <span className="kbd border-black/30 bg-black/10 text-black">Enter</span>
          </button>
          <div className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-mute">
            <span>
              <span className="kbd">Enter</span> submit
            </span>
            {canSkip && (
              <span>
                <span className="kbd">Tab</span> skip
              </span>
            )}
            <span>
              <span className="kbd">Esc</span> {canPause ? 'pause' : 'exit before start'}
            </span>
          </div>
        </div>
      </div>,
    )

  /* ── Results ── */
  if (S.phase === 'done') {
    if (S.empty || !S.result)
      return shell(
        <div className="grid flex-1 place-items-center p-6 text-center">
          <div className="max-w-md">
            <h1 className="text-xl font-semibold">Nothing to practise here yet</h1>
            <p className="mt-2 text-sm text-ink2">
              Weak-facts training needs a few multiplication facts that you have missed or answered slowly. Train the
              tables first and this mode will fill up automatically.
            </p>
            <button className="btn btn-primary mt-6" onClick={onExit} autoFocus>
              Back
            </button>
          </div>
        </div>,
      )
    const r = S.result
    const s = r.summary
    const mistakes = S.log.filter((e) => !e.correct && !e.skipped)
    const headline =
      cfg.format.id === 'accuracy'
        ? { v: fmtPct(s.accuracy), l: 'accuracy' }
        : cfg.format.id === 'streak'
          ? { v: String(s.bestStreak), l: 'streak' }
          : total
            ? { v: `${s.correct}/${S.log.length}`, l: 'correct' }
            : { v: String(s.correct), l: 'correct' }
    const delta = r.prev ? r.score - r.prev.score : null
    return shell(
      <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-8">
        <div className="fade-up text-center">
          <div className="label">{r.saved ? 'Session complete' : 'Session ended early — not recorded as a result'}</div>
          <div className="num mt-3 text-6xl font-semibold tracking-tight text-accent sm:text-7xl">{headline.v}</div>
          <div className="mt-1 text-sm text-ink2">{headline.l}</div>
          <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs">
            {r.pb && <span className="rounded-md border border-accent/60 bg-accent/10 px-2.5 py-1 font-medium text-accent">★ New personal best</span>}
            {delta !== null && r.saved && (
              <span className="rounded-md border border-line2 px-2.5 py-1 text-ink2">
                vs previous:{' '}
                <span className={`num ${delta > 0 ? 'text-up' : delta < 0 ? 'text-down' : ''}`}>
                  {delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '= '}
                  {Math.round(delta * 10) / 10}
                </span>
              </span>
            )}
          </div>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Correct', s.correct, 'text-up'],
            ['Incorrect', s.incorrect, s.incorrect ? 'text-down' : ''],
            ['Skipped', s.skipped, ''],
            ['Accuracy', fmtPct(s.accuracy), ''],
            ['Avg response', fmtMs(s.avgMs), ''],
            ['Fastest', fmtMs(s.fastestMs), ''],
            ['Per minute', s.qpm.toFixed(1), ''],
            ['Time', fmtDuration(r.duration), ''],
          ].map(([l, v, c]) => (
            <div key={l as string} className="panel px-4 py-3">
              <div className="label">{l}</div>
              <div className={`num mt-1 text-xl font-semibold ${c}`}>{v}</div>
            </div>
          ))}
        </div>
        {mistakes.length > 0 && (
          <div className="panel mt-6 p-4 sm:p-5">
            <div className="label mb-3">Review — {mistakes.length} to fix</div>
            <ul className="divide-y divide-line">
              {mistakes.map((e, i) => (
                <li key={i} className="py-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className={e.q.long ? 'text-ink2' : 'num font-medium'}>{e.q.prompt}</span>
                    <span className="num shrink-0">
                      <span className="text-down line-through decoration-down/50">{e.timedOut ? 'timed out' : e.given}</span>
                      <span className="mx-2 text-mute">→</span>
                      <span className="font-semibold text-up">{formatAnswer(e.q)}</span>
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-mute">{e.q.explanation}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-8 flex justify-center gap-3">
          <button className="btn btn-primary px-6" onClick={onAgain} autoFocus>
            Again <span className="kbd border-black/30 bg-black/10 text-black">Enter</span>
          </button>
          <button className="btn px-6" onClick={onExit}>
            Done <span className="kbd">Esc</span>
          </button>
        </div>
      </div>,
    )
  }

  /* ── Question / feedback ── */
  const q = S.q!
  const fb = S.phase === 'feedback' ? S.last : null
  const progress = timed
    ? elapsed / limitMs
    : total
      ? S.log.length / total
      : cfg.remaining
        ? S.log.length / Math.max(1, S.log.length + cfg.remaining() + (S.phase === 'question' ? 1 : 0))
        : 0
  const remainingMs = Math.max(0, limitMs - elapsed)
  const urgent = timed && remainingMs < 10000
  const needsText = q.remainder !== undefined || /negative/.test(q.hint ?? '')

  return (
    <div className="flex min-h-full flex-col bg-bg">
      <div className="border-b border-line">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{cfg.modeLabel}</div>
            <div className="truncate text-xs text-mute">
              {cfg.format.name}
              {levelLabel && ` · ${levelLabel}`}
            </div>
          </div>
          <div className={`num text-2xl font-semibold ${urgent ? 'text-down' : 'text-ink'}`} aria-live="off">
            {timed
              ? fmtDuration(Math.ceil(remainingMs / 1000) * 1000)
              : total
                ? `${Math.min(total, S.log.length + (fb ? 0 : 1))} / ${total}`
                : cfg.remaining
                  ? `${S.log.length + (fb ? 0 : 1)} / ${S.log.length + cfg.remaining() + (fb ? 0 : 1)}`
                  : fmtDuration(elapsed)}
          </div>
          <div className="flex items-center gap-1.5">
            {canPause && (
              <button className="btn btn-ghost px-2.5 text-xs" onClick={togglePause}>
                Pause <span className="kbd hidden sm:inline">Esc</span>
              </button>
            )}
            <button className="btn btn-ghost px-2.5 text-xs" onClick={() => finish(false)}>
              {f.kind === 'practice' ? 'Finish' : 'Quit'}
            </button>
          </div>
        </div>
        <div className="h-0.5 bg-line">
          <div
            className="h-full transition-[width] duration-100 ease-linear"
            style={{ width: `${Math.min(1, progress) * 100}%`, background: urgent ? 'var(--color-down)' : 'var(--color-accent)' }}
          />
        </div>
      </div>

      <div className="flex items-center justify-center gap-6 border-b border-line/60 px-4 py-2 text-xs text-mute sm:gap-10">
        <span>
          Correct <span className="num ml-1 text-sm font-semibold text-up">{correct}</span>
        </span>
        <span>
          Wrong <span className="num ml-1 text-sm font-semibold text-down">{wrong}</span>
        </span>
        {canSkip && (
          <span>
            Skipped <span className="num ml-1 text-sm font-semibold text-ink2">{skipped}</span>
          </span>
        )}
        <span>
          Streak <span className="num ml-1 text-sm font-semibold text-accent">{S.streak}</span>
        </span>
      </div>

      <div className="relative grid flex-1 place-items-center px-4 py-8">
        {S.paused ? (
          <div className="fade-up text-center">
            <div className="label">Paused</div>
            <p className="mt-2 text-sm text-ink2">The question is hidden and the clock is stopped.</p>
            <div className="mt-6 flex justify-center gap-3">
              <button className="btn btn-primary px-6" onClick={togglePause} autoFocus>
                Resume <span className="kbd border-black/30 bg-black/10 text-black">Enter</span>
              </button>
              <button className="btn" onClick={() => finish(false)}>
                End session
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-3xl text-center">
            {q.topic && <div className="label mb-4">{q.topic}</div>}
            <div
              key={S.log.length + (fb ? 0.5 : 0)}
              className={
                q.long
                  ? 'pop mx-auto max-w-2xl text-xl leading-relaxed font-medium text-balance sm:text-2xl'
                  : 'num pop text-5xl font-semibold tracking-tight sm:text-7xl'
              }
            >
              {q.prompt}
            </div>

            <div className="mx-auto mt-8 max-w-md sm:mt-10">
              <div
                className={`flex items-center rounded-xl border-2 bg-panel px-4 transition-colors ${
                  fb ? (fb.correct ? 'border-up' : 'shake border-down') : 'border-line2 focus-within:border-accent'
                }`}
              >
                {q.prefix && <span className="num text-2xl text-mute">{q.prefix}</span>}
                <input
                  ref={inputRef}
                  value={S.input}
                  readOnly={!!fb}
                  onChange={(e) => {
                    S.input = e.target.value
                    bump()
                  }}
                  inputMode={needsText ? 'text' : 'decimal'}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-label="Your answer"
                  placeholder="answer"
                  className="num w-full min-w-0 bg-transparent py-4 text-center text-3xl font-semibold outline-none placeholder:text-line2 sm:text-4xl"
                />
                {q.suffix && <span className="num text-xl whitespace-nowrap text-mute">{q.suffix.trim()}</span>}
              </div>
              {qLimit > 0 && !fb && (
                <div className="mt-2 h-0.5 overflow-hidden rounded bg-line">
                  <div className="h-full bg-info" style={{ width: `${Math.max(0, 1 - (elapsed - S.qStart) / qLimit) * 100}%` }} />
                </div>
              )}
              <div className="mt-2 h-4 text-xs text-mute">{!fb && q.hint}</div>
            </div>

            <div className="mx-auto mt-3 min-h-28 max-w-2xl" aria-live="polite">
              {fb &&
                (fb.correct ? (
                  <div className="num text-sm text-up">
                    ✓ Correct · {fmtMs(fb.ms)}
                    {S.levelNote && <span className="ml-3 text-accent">{S.levelNote}</span>}
                  </div>
                ) : (
                  <div className="fade-up">
                    <div className="text-sm text-down">{fb.timedOut ? '✗ Out of time' : '✗ Not quite'}</div>
                    <div className="num mt-1 text-3xl font-semibold text-ink">{formatAnswer(q)}</div>
                    <p className="mx-auto mt-2 max-w-xl text-sm text-ink2">{q.explanation}</p>
                    {S.levelNote && <div className="mt-1 text-xs text-accent">{S.levelNote}</div>}
                    <div className="mt-3 text-xs text-mute">
                      <span className="kbd">Enter</span> {f.kind === 'streak' ? 'to see results' : 'to continue'}
                    </div>
                  </div>
                ))}
            </div>

            <div className="mt-2 flex justify-center gap-2">
              {fb ? (
                !fb.correct && (
                  <button className="btn sm:hidden" onClick={advance}>
                    Continue
                  </button>
                )
              ) : (
                <>
                  <button className="btn btn-primary px-6" onClick={submit} disabled={!S.input.trim()}>
                    Submit
                  </button>
                  {canSkip && (
                    <button className="btn" onClick={skip}>
                      Skip <span className="kbd hidden sm:inline">Tab</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
