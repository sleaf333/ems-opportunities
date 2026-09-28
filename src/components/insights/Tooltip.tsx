import { useCallback, useRef, useState, type FocusEvent, type PointerEvent, type ReactNode } from 'react'

export interface TooltipRow {
  value: string
  label: string
  // CSS color for the short line key beside the row (series identity).
  color?: string
}

interface TipState {
  x: number
  y: number
  title: string
  rows: TooltipRow[]
}

// One tooltip per chart. Marks call show() on pointer move and on focus, so
// keyboard users get the same details. Values lead; labels follow.
export function useTooltip() {
  const frame = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<TipState | null>(null)

  const place = useCallback((clientX: number, clientY: number, title: string, rows: TooltipRow[]) => {
    const box = frame.current?.getBoundingClientRect()
    if (!box) return
    setTip({ x: clientX - box.left, y: clientY - box.top, title, rows })
  }, [])

  const bind = useCallback(
    (title: string, rows: TooltipRow[]) => ({
      tabIndex: 0,
      onPointerMove: (e: PointerEvent) => place(e.clientX, e.clientY, title, rows),
      onPointerLeave: () => setTip(null),
      onFocus: (e: FocusEvent<Element>) => {
        const r = e.currentTarget.getBoundingClientRect()
        place(r.left + r.width / 2, r.top, title, rows)
      },
      onBlur: () => setTip(null),
    }),
    [place],
  )

  const node: ReactNode = tip ? (
    <div
      className="chart-tip"
      role="status"
      style={{
        left: tip.x,
        top: tip.y,
        transform: `translate(${tip.x > (frame.current?.clientWidth ?? 0) / 2 ? 'calc(-100% - 12px)' : '12px'}, -50%)`,
      }}
    >
      <div className="chart-tip-title">{tip.title}</div>
      {tip.rows.map((r) => (
        <div key={r.label} className="chart-tip-row">
          {r.color && <span className="chart-tip-key" style={{ background: r.color }} aria-hidden="true" />}
          <strong>{r.value}</strong>
          <span>{r.label}</span>
        </div>
      ))}
    </div>
  ) : null

  return { frame, bind, node }
}

// Width of an element, kept up to date, for charts that size to their card.
export function useWidth<T extends HTMLElement>(fallback = 320) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(fallback)
  const observer = useRef<ResizeObserver | null>(null)
  const setRef = useCallback((el: T | null) => {
    observer.current?.disconnect()
    ;(ref as { current: T | null }).current = el
    if (!el) return
    setWidth(el.clientWidth || fallback)
    observer.current = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width || fallback))
    observer.current.observe(el)
  }, [fallback])
  return { setRef, width }
}
