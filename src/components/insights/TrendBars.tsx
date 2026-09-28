import { useState } from 'react'
import type { MonthActivity } from '../../lib/insights'
import { useTooltip, useWidth } from './Tooltip'

const HEIGHT = 220
const PAD = { top: 22, right: 8, bottom: 28, left: 34 }
const SERIES = [
  { key: 'interest', label: 'New interest', color: 'var(--series-interest)' },
  { key: 'commitments', label: 'New commitments', color: 'var(--series-commit)' },
] as const

function monthLabel(key: string, long = false): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, long ? { month: 'long', year: 'numeric' } : { month: 'short' })
}

// Clean tick step: 1, 2, 5, 10, 20, 50...
function niceStep(max: number): number {
  const rough = Math.max(1, max) / 4
  const mag = 10 ** Math.floor(Math.log10(rough))
  const norm = rough / mag
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag
}

export default function TrendBars({ rows }: { rows: MonthActivity[] }) {
  const { setRef, width } = useWidth<HTMLDivElement>()
  const { frame, bind, node } = useTooltip()
  const [asTable, setAsTable] = useState(false)

  const max = Math.max(0, ...rows.flatMap((r) => [r.interest, r.commitments]))
  const step = niceStep(max)
  const top = Math.max(step, Math.ceil(max / step) * step)
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)

  const plotW = Math.max(120, width - PAD.left - PAD.right)
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const band = plotW / Math.max(1, rows.length)
  const barW = Math.min(24, Math.max(4, (band - 10) / 2 - 1))
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH
  const last = rows.length - 1
  const showEvery = band < 34 ? 2 : 1
  // Direct labels only when the two values have room side by side; otherwise
  // they live in the tooltip and the table view.
  const labelLast = barW >= 16

  return (
    <div className="stack-sm">
      <div className="row between wrap gap-sm">
        <div className="legend" aria-label="Legend">
          {SERIES.map((s) => (
            <span key={s.key} className="legend-item">
              <span className="legend-swatch" style={{ background: s.color }} aria-hidden="true" />
              {s.label}
            </span>
          ))}
        </div>
        <button type="button" className="btn btn-link" onClick={() => setAsTable(!asTable)}>
          {asTable ? 'Show chart' : 'Show as table'}
        </button>
      </div>

      {asTable ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th className="num">New interest</th>
                <th className="num">New commitments</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.month}>
                  <td>{monthLabel(r.month, true)}</td>
                  <td className="num">{r.interest}</td>
                  <td className="num">{r.commitments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart-frame" ref={(el) => { setRef(el); (frame as { current: HTMLDivElement | null }).current = el }}>
          <svg width={width} height={HEIGHT} role="img" aria-label="New interest and new commitments per month">
            {ticks.map((t) => (
              <g key={t}>
                <line className="grid" x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} />
                <text className="axis" x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                  {t.toLocaleString()}
                </text>
              </g>
            ))}
            {rows.map((r, i) => {
              const cx = PAD.left + band * i + band / 2
              return (
                <g key={r.month}>
                  {SERIES.map((s, k) => {
                    const v = r[s.key]
                    const h = (v / top) * plotH
                    const x = cx + (k === 0 ? -barW - 1 : 1)
                    const rr = Math.min(4, h / 2, barW / 2)
                    // Rounded data end, square at the baseline.
                    const base = PAD.top + plotH
                    const d =
                      h <= 0
                        ? ''
                        : `M${x},${base} V${base - h + rr} Q${x},${base - h} ${x + rr},${base - h} H${x + barW - rr} Q${x + barW},${base - h} ${x + barW},${base - h + rr} V${base} Z`
                    return (
                      <g key={s.key}>
                        {d && <path d={d} fill={s.color} />}
                        {i === last && labelLast && (
                          <text className="value-label" x={x + barW / 2} y={base - h - 6} textAnchor="middle">
                            {v}
                          </text>
                        )}
                      </g>
                    )
                  })}
                  {i % showEvery === 0 && (
                    <text className="axis" x={cx} y={HEIGHT - 8} textAnchor="middle">
                      {monthLabel(r.month)}
                    </text>
                  )}
                  {/* Hit area: the whole month column, bigger than the bars. */}
                  <rect
                    className="hit"
                    x={PAD.left + band * i}
                    y={PAD.top}
                    width={band}
                    height={plotH}
                    {...bind(monthLabel(r.month, true), [
                      { value: String(r.interest), label: 'new interest', color: SERIES[0].color },
                      { value: String(r.commitments), label: 'new commitments', color: SERIES[1].color },
                    ])}
                    aria-label={`${monthLabel(r.month, true)}: ${r.interest} new interest, ${r.commitments} new commitments`}
                  />
                </g>
              )
            })}
            <line className="baseline" x1={PAD.left} x2={PAD.left + plotW} y1={PAD.top + plotH} y2={PAD.top + plotH} />
          </svg>
          {node}
        </div>
      )}
    </div>
  )
}
