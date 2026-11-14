import { useEffect, type ReactNode } from 'react'

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 max-w-2xl text-sm text-ink2">{sub}</p>}
      </div>
      {right}
    </header>
  )
}

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: 'up' | 'down' | 'accent'
}) {
  const color = tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : tone === 'accent' ? 'text-accent' : 'text-ink'
  return (
    <div className="panel px-4 py-3.5">
      <div className="label">{label}</div>
      <div className={`num mt-1.5 text-2xl font-semibold ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-mute">{sub}</div>}
    </div>
  )
}

export function Card({ title, right, children, className = '' }: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel p-4 sm:p-5 ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="label">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

/** Thin meter; `value` in 0–1. */
export function Meter({ value, color = 'var(--color-accent)' }: { value: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${Math.max(0, Math.min(1, value || 0)) * 100}%`, background: color }}
      />
    </div>
  )
}

export function Toggle({ on, onChange, label, desc }: { on: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {desc && <span className="block text-xs text-mute">{desc}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors ${
          on ? 'border-accent bg-accent/90' : 'border-line2 bg-panel2'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-[18px] w-[18px] rounded-full transition-transform ${
            on ? 'translate-x-5 bg-black' : 'bg-ink2'
          }`}
        />
      </button>
    </label>
  )
}

export function Chips<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; title?: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`chip ${o.value === value ? 'chip-on' : ''}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="panel fade-up w-full max-w-md p-6" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="mt-3 text-sm text-ink2">{children}</div>
      </div>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line2 px-4 py-8 text-center text-sm text-mute">{children}</div>
}

export const masteryColor = (m: number) => (m >= 80 ? 'var(--color-up)' : m >= 50 ? 'var(--color-accent)' : 'var(--color-down)')
