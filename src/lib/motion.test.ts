import { describe, expect, it } from 'vitest'
import { countAt, easeOutCubic, prefersReducedMotion } from './motion'

describe('count-up easing', () => {
  it('starts at 0, ends at 1, and is past halfway at the midpoint', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875)
    expect(easeOutCubic(-1)).toBe(0)
    expect(easeOutCubic(2)).toBe(1)
  })

  it('never overshoots and lands exactly on the target', () => {
    for (const target of [0, 1, 17, 1234]) {
      let last = 0
      for (let p = 0; p <= 1.2; p += 0.05) {
        const v = countAt(p, target)
        expect(v).toBeLessThanOrEqual(target)
        expect(v).toBeGreaterThanOrEqual(last)
        last = v
      }
      expect(countAt(1, target)).toBe(target)
    }
  })

  it('treats a missing browser as full motion', () => {
    expect(prefersReducedMotion()).toBe(false)
  })
})
