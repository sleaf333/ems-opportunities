// Everything the admin pages (Manage and Insights) load. Admins can read all
// of it through row-level security; nobody else gets these rows.
import {
  categoriesByOpportunity,
  fetchCategories,
  fetchOpportunities,
  fetchOpportunityCategories,
  fetchProfiles,
  fetchSignups,
  pageThrough,
} from './data'
import { supabase } from './supabase'
import type { BackupRecord, MemberInterestCategory, MemberInterests, MemberPreset, RoleChange, SignupEvent } from './types'

export async function loadAdminData() {
  const [profiles, opportunities, signups, categories, links, events, interests, memberCats, presets, roleChanges, backups] =
    await Promise.all([
      fetchProfiles(),
      fetchOpportunities(),
      fetchSignups(),
      fetchCategories(),
      fetchOpportunityCategories(),
      pageThrough<SignupEvent>((from, to) =>
        supabase.from('signup_events').select('*').order('changed_at').order('id').range(from, to),
      ),
      pageThrough<MemberInterests>((from, to) =>
        supabase.from('member_interests').select('*').order('user_id').range(from, to),
      ),
      pageThrough<MemberInterestCategory>((from, to) =>
        supabase.from('member_interest_categories').select('*').order('user_id').order('category_id').range(from, to),
      ),
      pageThrough<MemberPreset>((from, to) => supabase.from('member_presets').select('*').order('email').range(from, to)),
      supabase.from('role_changes').select('*').order('id', { ascending: false }).limit(10),
      supabase.from('backup_log').select('*').order('id', { ascending: false }).limit(1),
    ])
  for (const r of [roleChanges, backups]) if (r.error) throw new Error(r.error.message)
  return {
    profiles,
    opportunities,
    signups,
    categories,
    topics: categoriesByOpportunity(links, categories),
    events,
    interests,
    memberCats,
    presets,
    recentRoleChanges: roleChanges.data as RoleChange[],
    lastBackup: ((backups.data as BackupRecord[])[0] ?? null) as BackupRecord | null,
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
