// Everything the admin pages (Manage and Insights) load. Admins can read all
// of it through row-level security; nobody else gets these rows.
import { categoriesByOpportunity, fetchCategories, fetchOpportunities, fetchOpportunityCategories, fetchProfiles, fetchSignups } from './data'
import { supabase } from './supabase'
import type { MemberInterestCategory, MemberInterests, MemberPreset, SignupEvent } from './types'

export async function loadAdminData() {
  const [profiles, opportunities, signups, categories, links, events, interests, memberCats, presets] =
    await Promise.all([
      fetchProfiles(),
      fetchOpportunities(),
      fetchSignups(),
      fetchCategories(),
      fetchOpportunityCategories(),
      supabase.from('signup_events').select('*').order('changed_at'),
      supabase.from('member_interests').select('*'),
      supabase.from('member_interest_categories').select('*'),
      supabase.from('member_presets').select('*').order('email'),
    ])
  for (const r of [events, interests, memberCats, presets]) if (r.error) throw new Error(r.error.message)
  return {
    profiles,
    opportunities,
    signups,
    categories,
    topics: categoriesByOpportunity(links, categories),
    events: events.data as SignupEvent[],
    interests: interests.data as MemberInterests[],
    memberCats: memberCats.data as MemberInterestCategory[],
    presets: presets.data as MemberPreset[],
  }
}
export type AdminData = Awaited<ReturnType<typeof loadAdminData>>

export interface Engagement {
  interested: number
  committed: number
  completed: number
  withdrawn: number
  everCommitted: boolean
  lastActivity: string | null
}

export const BLANK_ENGAGEMENT: Engagement = {
  interested: 0,
  committed: 0,
  completed: 0,
  withdrawn: 0,
  everCommitted: false,
  lastActivity: null,
}

// Current sign-up counts per person, plus whether they ever committed and
// when they were last active.
export function engagementByPerson(data: Pick<AdminData, 'signups' | 'events'>): Map<string, Engagement> {
  const map = new Map<string, Engagement>()
  const get = (id: string) => {
    let e = map.get(id)
    if (!e) map.set(id, (e = { ...BLANK_ENGAGEMENT }))
    return e
  }
  for (const s of data.signups) {
    const e = get(s.user_id)
    if (s.status === 'interested') e.interested++
    else if (s.status === 'committed' || s.status === 'waitlisted') e.committed++
    else if (s.status === 'completed') e.completed++
    else e.withdrawn++
  }
  for (const ev of data.events) {
    const e = get(ev.user_id)
    if (['committed', 'waitlisted', 'completed'].includes(ev.to_status)) e.everCommitted = true
    if (!e.lastActivity || ev.changed_at > e.lastActivity) e.lastActivity = ev.changed_at
  }
  return map
}
