import { useEffect, useState, type RefObject } from 'react'
import { prefersReducedMotion } from '../lib/motion'

const DOTS = 24
const COLORS = ['var(--burst-1)', 'var(--burst-2)', 'var(--burst-3)', 'var(--burst-4)', 'var(--burst-5)']
const DURATION_MS = 900

interface Burst {
  key: number
  x: number
  y: number
  dots: { angle: number; distance: number; size: number; color: string; delay: number }[]
}

// A short burst of the five EMS dots from the anchor element. It draws in a
// fixed full-screen layer that cannot scroll the page or block clicks, and
// does nothing when the person has asked for reduced motion.
export default function Celebrate({ burstKey, anchor }: { burstKey: number; anchor: RefObject<HTMLElement | null> }) {
  const [burst, setBurst] = useState<Burst | null>(null)

  useEffect(() => {
    if (burstKey === 0 || prefersReducedMotion() || !anchor.current) return
    const rect = anchor.current.getBoundingClientRect()
    setBurst({
      key: burstKey,
      x: rect.left + rect.width / 2,
      y: rect.top + Math.min(rect.height / 2, 90),
      dots: Array.from({ length: DOTS }, (_, i) => ({
        angle: (360 / DOTS) * i + Math.random() * 12,
        distance: 60 + Math.random() * 70,
        size: 6 + Math.random() * 6,
        color: COLORS[i % COLORS.length],
        delay: Math.random() * 80,
      })),
    })
    const timer = window.setTimeout(() => setBurst(null), DURATION_MS + 300)
    return () => window.clearTimeout(timer)
  }, [burstKey, anchor])

  if (!burst) return null
  return (
    <div className="celebrate" aria-hidden="true" key={burst.key}>
      {burst.dots.map((d, i) => (
        <i
          key={i}
          style={{
            left: burst.x,
            top: burst.y,
            width: d.size,
            height: d.size,
            background: d.color,
            animationDelay: `${d.delay}ms`,
            ['--angle' as string]: `${d.angle}deg`,
            ['--distance' as string]: `${d.distance}px`,
          }}
        />
      ))}
    </div>
  )
}
