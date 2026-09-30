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

async function unwrap<T>(query: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data as T
}

export function fetchOpportunities(): Promise<Opportunity[]> {
  return unwrap(supabase.from('opportunities').select('*').order('title'))
}

export function fetchOpportunity(id: string): Promise<Opportunity | null> {
  return unwrap(supabase.from('opportunities').select('*').eq('id', id).maybeSingle())
}

export function fetchSignups(): Promise<Signup[]> {
  return unwrap(supabase.from('signups').select('*').order('status_changed_at'))
}

export function fetchSignupsFor(opportunityId: string): Promise<Signup[]> {
  return unwrap(
    supabase.from('signups').select('*').eq('opportunity_id', opportunityId).order('status_changed_at'),
  )
}

// All owners, or the owners of one post.
export function fetchOwners(opportunityId?: string): Promise<OpportunityOwner[]> {
  const query = supabase.from('opportunity_owners').select('*').order('added_at')
  return unwrap(opportunityId ? query.eq('opportunity_id', opportunityId) : query)
}

export function fetchProfiles(): Promise<Profile[]> {
  return unwrap(supabase.from('profiles').select('*').order('full_name'))
}

export function fetchCategories(): Promise<InterestCategory[]> {
  return unwrap(supabase.from('interest_categories').select('*').order('name'))
}

export function fetchOpportunityCategories(): Promise<OpportunityCategory[]> {
  return unwrap(supabase.from('opportunity_categories').select('*'))
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

// Runs a loader on mount (and when deps change) and exposes reload().
export function useLoader<T>(loader: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const run = useCallback(loader, deps)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setData(await run())
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
