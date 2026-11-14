import { useEffect, useRef, useState } from 'react'
import { Card, PageHeader } from '../components/ui'
import { checkAnswer, formatAnswer } from '../lib/answer'
import { getFormat } from '../lib/modes'
import { play } from '../lib/sound'
import { makeTechnique, TECHNIQUES, type Technique } from '../lib/techniques'
import type { Question } from '../lib/types'
import { fmtMs } from '../lib/util'
import { useNav } from '../session'
import { useStore } from '../store'

const UP_AFTER = 3

function Drill({ t }: { t: Technique }) {
  const store = useStore()
  const [level, setLevel] = useState(1)
  const [auto, setAuto] = useState(true)
  const [run, setRun] = useState(0)
  const [q, setQ] = useState<Question>(() => makeTechnique(t, 1))
  const [input, setInput] = useState('')
  const [fb, setFb] = useState<{ correct: boolean; ms: number } | null>(null)
  const [tally, setTally] = useState({ n: 0, c: 0 })
  const startRef = useRef(performance.now())
  const inputRef = useRef<HTMLInputElement>(null)

  const next = (lv: number) => {
    let nq = makeTechnique(t, lv)
    for (let i = 0; i < 10 && nq.key === q.key; i++) nq = makeTechnique(t, lv)
    setQ(nq)
    setInput('')
    setFb(null)
    startRef.current = performance.now()
    inputRef.current?.focus()
  }
  const submit = () => {
    if (fb) return next(level)
    if (!input.trim()) return
    const correct = checkAnswer(q, input)
    const ms = performance.now() - startRef.current
    store.recordAnswer({ category: 'techniques', correct, ms, now: Date.now() })
    play(correct ? 'correct' : 'wrong', store.data.settings.sound)
    setTally((x) => ({ n: x.n + 1, c: x.c + (correct ? 1 : 0) }))
    setFb({ correct, ms })
    const r = correct ? run + 1 : 0
    if (auto && r >= UP_AFTER && level < 3) {
      setLevel(level + 1)
      setRun(0)
    } else setRun(r)
  }
  const pickLevel = (lv: number) => {
    setAuto(false)
    setLevel(lv)
    setRun(0)
    next(lv)
  }
  useEffect(() => {
    if (fb?.correct) {
      const id = window.setTimeout(() => next(level), 700)
      return () => window.clearTimeout(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fb])

  return (
    <Card
      title="Interactive exercises"
      right={
        <span className="num text-xs text-mute">
          {tally.c}/{tally.n} correct
        </span>
      }
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {t.levels.map((l, i) => (
          <button key={l} className={`chip ${level === i + 1 ? 'chip-on' : ''}`} aria-pressed={level === i + 1} onClick={() => pickLevel(i + 1)}>
            {i + 1} · {l}
          </button>
        ))}
        <button
          className={`chip ${auto ? 'chip-on' : ''}`}
          aria-pressed={auto}
          onClick={() => setAuto(!auto)}
          title={`Move up a level after ${UP_AFTER} correct answers in a row`}
        >
          Auto-advance
        </button>
      </div>
      {auto && level < 3 && (
        <div className="mt-3 flex items-center gap-2 text-xs text-mute">
          Next level in
          <span className="flex gap-1">
            {Array.from({ length: UP_AFTER }, (_, i) => (
              <span key={i} className={`h-1.5 w-5 rounded-full ${i < run ? 'bg-accent' : 'bg-line2'}`} />
            ))}
          </span>
        </div>
      )}
      <form
        className="mt-6 text-center"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div key={q.key} className="num pop text-4xl font-semibold tracking-tight sm:text-5xl">
          {q.prompt}
        </div>
        <div className="mx-auto mt-5 flex max-w-sm gap-2">
          <input
            ref={inputRef}
            value={input}
            readOnly={!!fb}
            onChange={(e) => setInput(e.target.value)}
            inputMode="decimal"
            autoComplete="off"
            aria-label="Your answer"
            placeholder="answer"
            className={`num w-full min-w-0 rounded-lg border-2 bg-bg px-3 py-2.5 text-center text-2xl font-semibold outline-none ${
              fb ? (fb.correct ? 'border-up' : 'border-down') : 'border-line2 focus:border-accent'
            }`}
          />
          <button className="btn btn-primary px-5" type="submit">
            {fb ? 'Next' : 'Check'}
          </button>
        </div>
        <div className="mt-2 min-h-16 text-sm" aria-live="polite">
          {!fb && <span className="text-xs text-mute">{q.hint ?? 'Enter to check'}</span>}
          {fb?.correct && <span className="num text-up">✓ Correct · {fmtMs(fb.ms)}</span>}
          {fb && !fb.correct && (
            <div className="fade-up">
              <span className="text-down">✗ Answer: </span>
              <span className="num font-semibold">{formatAnswer(q)}</span>
              <p className="mx-auto mt-1 max-w-md text-xs text-ink2">{q.explanation}</p>
              <p className="mt-1 text-xs text-mute">Enter for the next one</p>
            </div>
          )}
        </div>
      </form>
    </Card>
  )
}

export function TechniquesPage() {
  const nav = useNav()
  const [id, setId] = useState(() => {
    const h = window.location.hash.split('/')[2]
    return TECHNIQUES.some((t) => t.id === h) ? h : TECHNIQUES[0].id
  })
  const t = TECHNIQUES.find((x) => x.id === id)!
  const choose = (tid: string) => {
    setId(tid)
    history.replaceState(null, '', `#/techniques/${tid}`)
  }
  const timed = (level: number) =>
    nav.launch(() => ({
      modeId: `technique:${t.id}:L${level}`,
      modeLabel: `${t.title} · L${level}`,
      format: getFormat('sprint-60'),
      make: () => makeTechnique(t, level),
      levels: 3,
      level,
      levelLabels: t.levels,
    }))

  return (
    <>
      <PageHeader title="Techniques" sub="Ten practical shortcuts. Read the idea, follow the worked examples, then drill it until it is automatic." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[250px_1fr]">
        <nav aria-label="Techniques" className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible">
          {TECHNIQUES.map((x, i) => (
            <button
              key={x.id}
              onClick={() => choose(x.id)}
              aria-current={x.id === id}
              className={`flex shrink-0 cursor-pointer items-baseline gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors lg:shrink ${
                x.id === id ? 'border-accent/60 bg-accent/[0.07] text-ink' : 'border-transparent text-ink2 hover:bg-panel hover:text-ink'
              }`}
            >
              <span className={`num text-[10px] ${x.id === id ? 'text-accent' : 'text-mute'}`}>{String(i + 1).padStart(2, '0')}</span>
              <span className="whitespace-nowrap lg:whitespace-normal">{x.title}</span>
            </button>
          ))}
        </nav>

        <div key={t.id} className="fade-up space-y-4">
          <Card>
            <h2 className="text-xl font-semibold tracking-tight">{t.title}</h2>
            <p className="mt-1 text-sm text-accent">{t.summary}</p>
            <div className="mt-4 max-w-3xl space-y-3 text-sm leading-relaxed text-ink2">
              {t.explanation.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </Card>

          <Card title="Worked examples">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {t.examples.map((ex) => (
                <div key={ex.problem} className="rounded-lg border border-line bg-bg p-4">
                  <div className="num text-lg font-semibold">{ex.problem}</div>
                  <ol className="mt-3 space-y-1.5">
                    {ex.steps.map((s, i) => (
                      <li key={i} className="flex gap-2.5 text-sm">
                        <span className="num mt-0.5 text-[10px] text-mute">{i + 1}</span>
                        <span className={`num ${i === ex.steps.length - 1 ? 'font-semibold text-up' : 'text-ink2'}`}>{s}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </Card>

          <Drill t={t} />

          <Card title="Timed drill">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-2 text-sm text-ink2">60-second sprint on this technique:</span>
              {t.levels.map((l, i) => (
                <button key={l} className="btn text-xs" onClick={() => timed(i + 1)}>
                  Level {i + 1}
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
