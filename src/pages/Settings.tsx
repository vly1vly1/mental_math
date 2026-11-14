import { useRef, useState } from 'react'
import { Card, Chips, Modal, PageHeader, Toggle } from '../components/ui'
import { play } from '../lib/sound'
import { sanitize } from '../lib/storage'
import { dateKey } from '../lib/util'
import { useStore } from '../store'

export function SettingsPage() {
  const { data, setSettings, replace, reset } = useStore()
  const s = data.settings
  const file = useRef<HTMLInputElement>(null)
  const [confirm, setConfirm] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mental-maths-lab-${dateKey(Date.now())}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    setMsg({ ok: true, text: 'Export downloaded.' })
  }
  const importData = async (f: File) => {
    try {
      const d = sanitize(JSON.parse(await f.text()))
      replace(d)
      setMsg({ ok: true, text: `Imported ${d.totals.answered.toLocaleString('en-US')} answers, ${Object.keys(d.facts).length} fact records and ${d.sessions.length} sessions.` })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error && e.message.startsWith('Not a') ? e.message : 'That file could not be read as a Mental Maths Lab export.' })
    }
  }

  return (
    <>
      <PageHeader title="Settings" sub="Preferences and data. Everything is stored in this browser only — no account, no server." />
      <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
        <Card title="Training">
          <div className="divide-y divide-line">
            <Toggle
              on={s.sound}
              onChange={(v) => {
                setSettings({ sound: v })
                play('correct', v)
              }}
              label="Sound"
              desc="Short tones for correct and incorrect answers."
            />
            <Toggle
              on={s.holdOnMistake}
              onChange={(v) => setSettings({ holdOnMistake: v })}
              label="Hold on mistakes"
              desc="In untimed sessions, keep the explanation on screen until you press Enter."
            />
            <div className="py-3">
              <div className="text-sm font-medium">Default difficulty</div>
              <div className="mb-2 text-xs text-mute">Used when a mode is opened for the first time. Each mode remembers your last choice.</div>
              <Chips
                options={[{ value: 0, label: 'Auto' }, ...[1, 2, 3, 4, 5].map((n) => ({ value: n, label: `Level ${n}` }))]}
                value={s.defaultLevel}
                onChange={(v) => setSettings({ defaultLevel: v })}
              />
            </div>
            <div className="py-3">
              <div className="text-sm font-medium">Per-question time limit</div>
              <div className="mb-2 text-xs text-mute">When the limit runs out the question is marked wrong. Applies to every session.</div>
              <div className="flex flex-wrap items-center gap-2">
                <Chips
                  options={[0, 3, 5, 10, 20, 30].map((n) => ({ value: n, label: n ? `${n}s` : 'Off' }))}
                  value={[0, 3, 5, 10, 20, 30].includes(s.questionLimit) ? s.questionLimit : -1}
                  onChange={(v) => setSettings({ questionLimit: v })}
                />
                <input
                  type="number"
                  min={0}
                  max={600}
                  aria-label="Custom per-question limit in seconds"
                  value={s.questionLimit}
                  onChange={(e) => setSettings({ questionLimit: Math.max(0, Math.min(600, Math.round(Number(e.target.value)) || 0)) })}
                  className="field num w-20 py-1"
                />
                <span className="text-xs text-mute">seconds</span>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Data">
          <dl className="mb-4 grid grid-cols-3 gap-3 text-center">
            {[
              ['Answers', data.totals.answered],
              ['Fact records', Object.keys(data.facts).length],
              ['Sessions', data.sessions.length],
            ].map(([l, v]) => (
              <div key={l as string} className="rounded-lg border border-line bg-bg px-2 py-3">
                <dd className="num text-xl font-semibold">{(v as number).toLocaleString('en-US')}</dd>
                <dt className="mt-0.5 text-xs text-mute">{l}</dt>
              </div>
            ))}
          </dl>
          <div className="grid gap-2 sm:grid-cols-2">
            <button className="btn" onClick={exportData}>
              Export as JSON
            </button>
            <button className="btn" onClick={() => file.current?.click()}>
              Import from JSON
            </button>
            <input
              ref={file}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void importData(f)
                e.target.value = ''
              }}
            />
          </div>
          <p className="mt-2 text-xs text-mute">Importing replaces the data currently in this browser.</p>
          {msg && (
            <p role="status" className={`mt-3 text-sm ${msg.ok ? 'text-up' : 'text-down'}`}>
              {msg.text}
            </p>
          )}
          <div className="mt-5 border-t border-line pt-4">
            <button className="btn btn-danger w-full" onClick={() => setConfirm(true)}>
              Reset all progress…
            </button>
          </div>
        </Card>

        <Card title="Keyboard" className="lg:col-span-2">
          <div className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['1 – 9', 'Switch section'],
              ['Enter', 'Start session · submit · continue · run again'],
              ['Tab', 'Skip the current question'],
              ['Esc', 'Pause / resume, or leave the results screen'],
              ['← ↑ ↓ →', 'Move around the multiplication grid'],
              ['Shift + click', 'Select a range of grid rows or columns'],
            ].map(([k, d]) => (
              <div key={k} className="flex items-baseline gap-3">
                <span className="kbd shrink-0">{k}</span>
                <span className="text-ink2">{d}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-mute">
            Answers accept thousands separators (24,500), a decimal comma (12,5), signs, fractions (3/8), k and m suffixes (24.5k) and
            unit symbols (€, %, bps). Remainders are typed as “12 r 3”.
          </p>
        </Card>
      </div>

      {confirm && (
        <Modal title="Reset all progress?" onClose={() => setConfirm(false)}>
          <p>
            This permanently deletes {data.totals.answered.toLocaleString('en-US')} answers, every fact record and all{' '}
            {data.sessions.length} sessions from this browser. Your settings are kept. Export first if you might want it back.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn" onClick={() => setConfirm(false)} autoFocus>
              Cancel
            </button>
            <button
              className="btn btn-danger"
              onClick={() => {
                reset()
                setConfirm(false)
                setMsg({ ok: true, text: 'All progress has been reset.' })
              }}
            >
              Delete everything
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
