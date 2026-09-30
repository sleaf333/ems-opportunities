import { useEffect, useRef, useState } from 'react'

// Small animations for moments of delight. CSS animations are switched off by
// the reduce-motion rule in styles.css; JavaScript effects check this instead.
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return 1 - (1 - x) ** 3
}

// The number to show part-way through counting up to `target`.
export function countAt(progress: number, target: number): number {
  if (progress >= 1) return target
  return Math.min(target, Math.round(easeOutCubic(progress) * target))
}

// Counts up from 0 the first time a non-zero target arrives; later changes
// (for example after signing up) show immediately.
export function useCountUp(target: number, ms = 700): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0))
  const played = useRef(false)

  useEffect(() => {
    if (played.current || target === 0 || prefersReducedMotion()) {
      setValue(target)
      return
    }
    // Marked as played only once it finishes, so React's development
    // double-run (mount, unmount, mount) still animates.
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const progress = (now - start) / ms
      setValue(countAt(progress, target))
      if (progress < 1) frame = requestAnimationFrame(tick)
      else played.current = true
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, ms])

  return value
}
