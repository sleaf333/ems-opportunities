import type { Heatmap as HeatmapData } from '../../lib/insights'
import { useTooltip } from './Tooltip'

// Magnitude takes one hue, light to dark. Cells keep their number, so the
// table reads without color too.
function cellStyle(value: number, max: number) {
  if (value === 0 || max === 0) return undefined
  const strength = Math.round(18 + 72 * (value / max))
  return {
    background: `color-mix(in oklab, var(--brand) ${strength}%, var(--surface))`,
    color: strength > 55 ? 'var(--on-brand)' : 'var(--text)',
  }
}

export default function Heatmap({
  data,
  columnLabels,
  cellNoun,
}: {
  data: HeatmapData
  columnLabels: string[]
  cellNoun: string
}) {
  const { frame, bind, node } = useTooltip()
  return (
    <div className="table-wrap heatmap-wrap" ref={frame}>
      <table className="heatmap">
        <thead>
          <tr>
            <th>Topic</th>
            {columnLabels.map((c) => (
              <th key={c} className="num">{c}</th>
            ))}
            <th className="num heatmap-total" title="Members who picked this topic on their profile">
              Picked on profile
            </th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <tr key={row.id}>
              <th scope="row">{row.name}</th>
              {row.cells.map((v, i) => (
                <td
                  key={columnLabels[i]}
                  className="num heat-cell"
                  style={cellStyle(v, data.max)}
                  {...bind(`${row.name} · ${columnLabels[i]}`, [{ value: String(v), label: cellNoun }])}
                  aria-label={`${row.name}, ${columnLabels[i]}: ${v} ${cellNoun}`}
                >
                  {v || ''}
                </td>
              ))}
              <td className="num heatmap-total">{row.stated}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {node}
    </div>
  )
}
