import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: { auth: { getSession: async () => ({}) } } }))
const { withRetry } = await import('./data')

describe('withRetry', () => {
  afterEach(() => vi.useRealTimers())

  it('returns at once when the first try works', async () => {
    const fn = vi.fn(async () => 'ok')
    expect(await withRetry(fn, [10, 20], async () => undefined)).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('recovers from a dropped request, refreshing the sign-in before each retry', async () => {
    vi.useFakeTimers()
    let calls = 0
    const fn = vi.fn(async () => {
      calls++
      if (calls < 3) throw new Error('Load failed')
      return 'ok'
    })
    const refresh = vi.fn(async () => undefined)
    const result = withRetry(fn, [600, 1500], refresh)
    await vi.advanceTimersByTimeAsync(600)
    await vi.advanceTimersByTimeAsync(1500)
    expect(await result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('gives up after the last delay with the last error', async () => {
    vi.useFakeTimers()
    let calls = 0
    const fn = async () => {
      calls++
      throw new Error(`fail ${calls}`)
    }
    const result = withRetry(fn, [600, 1500], async () => undefined)
    const caught = result.catch((e: Error) => e.message)
    await vi.advanceTimersByTimeAsync(2100)
    expect(await caught).toBe('fail 3')
  })

  it('still retries if refreshing the sign-in itself fails', async () => {
    vi.useFakeTimers()
    let calls = 0
    const fn = async () => {
      if (++calls === 1) throw new Error('Load failed')
      return 'ok'
    }
    const result = withRetry(fn, [600], async () => {
      throw new Error('offline')
    })
    await vi.advanceTimersByTimeAsync(600)
    expect(await result).toBe('ok')
  })
})
