import { Link } from 'react-router-dom'
import type { FunnelResult } from '../../lib/insights'
import { useTooltip } from './Tooltip'

// Ordered stages take one hue in steps (lighter early, stronger later), so the
// order reads in the color. Mixed with the surface, so it works in dark mode too.
function stageColor(i: number, n: number): string {
  const strength = n <= 1 ? 100 : Math.round(45 + (55 * i) / (n - 1))
  return `color-mix(in oklab, var(--brand) ${strength}%, var(--surface))`
}

export default function Funnel({ result }: { result: FunnelResult }) {
  const { frame, bind, node } = useTooltip()
  const top = Math.max(1, result.stages[0]?.count ?? 1)

  return (
    <div className="funnel" ref={frame}>
      {result.stages.map((stage, i) => {
        const prev = i > 0 ? result.stages[i - 1].count : null
        const ofPrev = prev ? Math.round((stage.count / prev) * 100) : null
        const ofAll = Math.round((stage.count / top) * 100)
        return (
          <div className="funnel-row" key={stage.key}>
            <span className="funnel-label">{stage.label}</span>
            <div
              className="funnel-track"
              {...bind(stage.label, [
                { value: String(stage.count), label: stage.count === 1 ? 'person' : 'people' },
                ...(ofPrev !== null ? [{ value: `${ofPrev}%`, label: 'of the stage before' }] : []),
                { value: `${ofAll}%`, label: 'of everyone signed in' },
              ])}
              aria-label={`${stage.label}: ${stage.count}${ofPrev !== null ? `, ${ofPrev}% of the stage before` : ''}`}
            >
              <span
                className="funnel-bar"
                style={{
                  width: `${Math.max(stage.count > 0 ? 1.5 : 0, (stage.count / top) * 100)}%`,
                  background: stageColor(i, result.stages.length),
                }}
              />
            </div>
            <span className="funnel-value">
              <strong>{stage.count}</strong>
              {ofPrev !== null && <span className="muted"> · {ofPrev}%</span>}
            </span>
          </div>
        )
      })}
      {node}
      {result.untapped > 0 && (
        <Link className="funnel-untapped" to="/admin?untapped=1#members">
          {result.untapped} raised a hand but never committed →
        </Link>
      )}
    </div>
  )
}
