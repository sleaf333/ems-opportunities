// A 12-month trend: 2px line, end dot with a surface ring, no axes.
// Each month has an invisible hover target with its value.
export default function Sparkline({ values, months, label }: { values: number[]; months: string[]; label: string }) {
  const W = 104
  const H = 30
  const pad = 5
  const max = Math.max(1, ...values)
  const step = (W - pad * 2) / Math.max(1, values.length - 1)
  const pts = values.map((v, i) => [pad + i * step, H - pad - (v / max) * (H - pad * 2)] as const)
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const [lx, ly] = pts[pts.length - 1] ?? [0, 0]
  return (
    <svg className="sparkline" width={W} height={H} role="img" aria-label={label}>
      <path d={d} fill="none" stroke="var(--brand)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={4} fill="var(--brand)" stroke="var(--surface)" strokeWidth={2} />
      {pts.map(([x], i) => (
        <rect key={months[i]} x={x - step / 2} y={0} width={step} height={H} fill="transparent">
          <title>{`${months[i]}: ${values[i]} points`}</title>
        </rect>
      ))}
    </svg>
  )
}
