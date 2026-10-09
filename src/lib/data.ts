import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type {
  InterestCategory,
  Opportunity,
  OpportunityCategory,
  OpportunityOwner,
  Profile,
  Signup,
  SignupCounts,
} from './types'

// The group is small (~150 people), so pages load whole tables and filter in
// the browser. Row-level security still decides what each person receives.

type Result<T> = { data: T | null; error: { message: string } | null }

async function unwrap<T>(query: PromiseLike<Result<T>>): Promise<T> {
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data as T
}

// Supabase returns at most 1,000 rows per request (its "max rows" setting),
// silently cutting off the rest. For tables that grow, fetch page by page
// until a page comes back empty. The query must have a stable order (end
// with a unique column) so pages do not overlap or skip rows.
export const PAGE_SIZE = 1000

export async function pageThrough<T>(
  fetchPage: (from: number, to: number) => PromiseLike<Result<T[]>>,
  pageSize = PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = []
  for (;;) {
    const page = await unwrap(fetchPage(rows.length, rows.length + pageSize - 1))
    if (!page || page.length === 0) return rows
    rows.push(...page)
  }
}

export function fetchOpportunities(): Promise<Opportunity[]> {
  return pageThrough((from, to) => supabase.from('opportunities').select('*').order('title').order('id').range(from, to))
}

export function fetchOpportunity(id: string): Promise<Opportunity | null> {
  return unwrap(supabase.from('opportunities').select('*').eq('id', id).maybeSingle())
}

export function fetchSignups(): Promise<Signup[]> {
  return pageThrough((from, to) =>
    supabase.from('signups').select('*').order('status_changed_at').order('id').range(from, to),
  )
}

export function fetchSignupsFor(opportunityId: string): Promise<Signup[]> {
  return unwrap(
    supabase.from('signups').select('*').eq('opportunity_id', opportunityId).order('status_changed_at'),
  )
}

// All owners, or the owners of one post.
export function fetchOwners(opportunityId?: string): Promise<OpportunityOwner[]> {
  return pageThrough((from, to) => {
    const query = supabase.from('opportunity_owners').select('*')
    return (opportunityId ? query.eq('opportunity_id', opportunityId) : query)
      .order('added_at')
      .order('opportunity_id')
      .order('user_id')
      .range(from, to)
  })
}

export function fetchProfiles(): Promise<Profile[]> {
  return pageThrough((from, to) => supabase.from('profiles').select('*').order('full_name').order('id').range(from, to))
}

export function fetchCategories(): Promise<InterestCategory[]> {
  return unwrap(supabase.from('interest_categories').select('*').order('name'))
}

export function fetchOpportunityCategories(): Promise<OpportunityCategory[]> {
  return pageThrough((from, to) =>
    supabase.from('opportunity_categories').select('*').order('opportunity_id').order('category_id').range(from, to),
  )
}

// Counts without names, for everyone (names depend on who is looking).
export async function fetchCounts(): Promise<Map<string, SignupCounts>> {
  const rows = await unwrap<SignupCounts[]>(supabase.rpc('opportunity_counts'))
  return new Map(rows.map((r) => [r.opportunity_id, r]))
}

// Category names per opportunity, sorted.
export function categoriesByOpportunity(
  links: OpportunityCategory[],
  categories: InterestCategory[],
): Map<string, InterestCategory[]> {
  const cats = byId(categories)
  const map = new Map<string, InterestCategory[]>()
  for (const link of links) {
    const cat = cats.get(link.category_id)
    if (!cat) continue
    const list = map.get(link.opportunity_id) ?? []
    list.push(cat)
    map.set(link.opportunity_id, list)
  }
  for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name))
  return map
}

export function byId<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]))
}

interface AsyncState<T> {
  data: T | undefined
  error: string | null
  loading: boolean
  reload: () => Promise<void>
}

// Phones drop requests now and then (switching apps or pages, weak signal,
// waking up with an expired sign-in token). Try again a couple of times,
// refreshing the sign-in between tries, before showing an error.
export const RETRY_DELAYS_MS = [600, 1500]

export async function withRetry<T>(
  fn: () => Promise<T>,
  delays: number[] = RETRY_DELAYS_MS,
  beforeRetry: () => Promise<unknown> = refreshSession,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt >= delays.length) throw err
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]))
      await beforeRetry().catch(() => undefined)
    }
  }
}

// Getting the session refreshes an expired sign-in token if needed.
function refreshSession(): Promise<unknown> {
  return supabase.auth.getSession()
}

// Runs a loader on mount (and when deps change) and exposes reload().
// Loading is retried automatically (see withRetry).
export function useLoader<T>(loader: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const run = useCallback(loader, deps)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setData(await withRetry(run))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [run])

  useEffect(() => {
    void reload()
  }, [reload])

  return { data, error, loading, reload }
}
