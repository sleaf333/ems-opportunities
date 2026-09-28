import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Opportunity, Profile, Signup } from './types'

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

export function fetchProfiles(): Promise<Profile[]> {
  return unwrap(supabase.from('profiles').select('*').order('full_name'))
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
