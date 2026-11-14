import { useEffect, useRef, useState } from 'react'

export interface Point {
  label: string
  value: number | null
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(300)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

const niceMax = (v: number) => {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p
  return 10 * p
}

/** Single-series line or bar chart with a hover crosshair and tooltip. */
export function Chart({
  kind,
  data,
  format,
  height = 150,
  color = 'var(--color-accent)',
  yMin = 0,
  yMax,
  title,
}: {
  kind: 'line' | 'bar'
  data: Point[]
  format: (v: number) => string
  height?: number
  color?: string
  yMin?: number
  yMax?: number
  title: string
}) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const vals = data.map((d) => d.value).filter((v): v is number => v !== null)
  const pad = { l: 44, r: 10, t: 10, b: 22 }
  const iw = Math.max(10, w - pad.l - pad.r)
  const ih = height - pad.t - pad.b
  const max = yMax ?? niceMax(Math.max(...vals, 0))
  const min = yMin
  const n = data.length
  const band = iw / Math.max(1, n)
  const x = (i: number) => pad.l + band * (i + 0.5)
  const y = (v: number) => pad.t + ih - ((Math.min(max, Math.max(min, v)) - min) / (max - min || 1)) * ih
  const ticks = [min, (min + max) / 2, max]

  let path = ''
  let pen = false
  data.forEach((d, i) => {
    if (d.value === null) return
    path += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`
    pen = true
  })
  const labelIdx = n <= 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1]
  const h = hover !== null && data[hover] ? data[hover] : null

  return (
    <div ref={ref} className="relative select-none" role="img" aria-label={title}>
      {vals.length === 0 ? (
        <div className="grid place-items-center text-xs text-mute" style={{ height }}>
          No data yet
        </div>
      ) : (
        <svg
          width={w}
          height={height}
          className="block touch-none"
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            setHover(Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left - pad.l) / band))))
          }}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeDasharray={i ? '2 4' : undefined} />
              <text x={pad.l - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="var(--color-mute)" className="num">
                {format(t)}
              </text>
            </g>
          ))}
          {labelIdx.map((i) => (
            <text
              key={i}
              x={x(i)}
              y={height - 6}
              textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
              fontSize="10"
              fill="var(--color-mute)"
              className="num"
            >
              {data[i]?.label}
            </text>
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--color-line2)" />}
          {kind === 'bar'
            ? data.map((d, i) => {
                if (!d.value) return null
                const bw = Math.max(2, Math.min(22, band - 2))
                const top = y(d.value)
                return (
                  <rect
                    key={i}
                    x={x(i) - bw / 2}
                    y={top}
                    width={bw}
                    height={Math.max(1, pad.t + ih - top)}
                    rx={Math.min(3, bw / 2)}
                    fill={color}
                    opacity={hover === null || hover === i ? 1 : 0.45}
                  />
                )
              })
            : (
                <>
                  <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                  {data.map((d, i) =>
                    d.value !== null && (vals.length <= 45 || hover === i) ? (
                      <circle key={i} cx={x(i)} cy={y(d.value)} r={hover === i ? 4.5 : 2.5} fill={color} stroke="var(--color-panel)" strokeWidth="2" />
                    ) : null,
                  )}
                </>
              )}
        </svg>
      )}
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-md border border-line2 bg-panel2 px-2 py-1 text-xs whitespace-nowrap shadow-lg"
          style={{ left: Math.min(Math.max(x(hover), 50), w - 50), transform: 'translateX(-50%)' }}
        >
          <span className="text-mute">{h.label}</span>
          <span className="num ml-2 font-semibold text-ink">{h.value === null ? '—' : format(h.value)}</span>
        </div>
      )}
    </div>
  )
}
