import { describe, expect, it, vi } from 'vitest'

// data.ts creates the Supabase client on import; a stub keeps this test offline.
vi.mock('./supabase', () => ({ supabase: {} }))
const { pageThrough } = await import('./data')

// A fake table that, like Supabase, returns at most `cap` rows per request.
function fakeTable(total: number, cap = 1000) {
  const calls: [number, number][] = []
  const fetchPage = async (from: number, to: number) => {
    calls.push([from, to])
    const end = Math.min(to + 1, from + cap, total)
    return { data: Array.from({ length: Math.max(0, end - from) }, (_, i) => from + i), error: null }
  }
  return { fetchPage, calls }
}

describe('pageThrough', () => {
  it('handles an empty table', async () => {
    const t = fakeTable(0)
    expect(await pageThrough(t.fetchPage)).toEqual([])
    expect(t.calls).toEqual([[0, 999]])
  })

  it('gets exactly one full page', async () => {
    const t = fakeTable(1000)
    expect((await pageThrough(t.fetchPage)).length).toBe(1000)
    expect(t.calls).toEqual([[0, 999], [1000, 1999]])
  })

  it('gets every row past the 1,000-row limit, in order, with no gaps', async () => {
    const t = fakeTable(2345)
    const rows = await pageThrough(t.fetchPage)
    expect(rows.length).toBe(2345)
    expect(rows.every((v, i) => v === i)).toBe(true)
  })

  it('still gets everything if the server limit is lower than the page size', async () => {
    const t = fakeTable(1234, 500)
    expect((await pageThrough(t.fetchPage)).length).toBe(1234)
  })

  it('reports errors instead of returning partial data', async () => {
    await expect(pageThrough(async () => ({ data: null, error: { message: 'boom' } }))).rejects.toThrow('boom')
  })
})
