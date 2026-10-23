import type { OpportunityOwner, Signup, SignupEvent } from './types'

// A person's record of service, built from their own sign-up history
// (signup_events) and the posts they lead (opportunity_owners). No new data
// is stored: confirmed means on the member list, and leaving it (Remove,
// Step off, back to waiting) ends that stint.

export type ServiceRole = 'lead' | 'member' | 'took_part'

export interface ServiceRow {
  opportunityId: string
  role: ServiceRole
  since: string | null
  // Null while still serving.
  until: string | null
}

export interface ServiceRecord {
  current: ServiceRow[]
  past: ServiceRow[]
}

function byTime(a: SignupEvent, b: SignupEvent) {
  return a.changed_at < b.changed_at ? -1 : a.changed_at > b.changed_at ? 1 : a.id - b.id
}

export function buildServiceRecord(
  signups: Signup[],
  events: SignupEvent[],
  owners: OpportunityOwner[],
  me: string,
): ServiceRecord {
  const rows: ServiceRow[] = []

  for (const signup of signups.filter((s) => s.user_id === me)) {
    const history = events.filter((e) => e.signup_id === signup.id).sort(byTime)
    let start: string | null = null
    for (const e of history) {
      if (e.to_status === 'committed') {
        if (start === null) start = e.changed_at
      } else if (e.to_status === 'no_show') {
        // Marked as not attending: not part of the record.
        start = null
      } else if (e.to_status === 'completed') {
        rows.push({ opportunityId: signup.opportunity_id, role: 'took_part', since: start ?? e.changed_at, until: e.changed_at })
        start = null
      } else if (start !== null) {
        rows.push({ opportunityId: signup.opportunity_id, role: 'member', since: start, until: e.changed_at })
        start = null
      }
    }
    // Still confirmed. (Falls back to the sign-up's own date if the history
    // is missing.)
    if (signup.status === 'committed') {
      rows.push({ opportunityId: signup.opportunity_id, role: 'member', since: start ?? signup.status_changed_at, until: null })
    } else if (signup.status === 'completed' && !rows.some((r) => r.opportunityId === signup.opportunity_id && r.role === 'took_part')) {
      rows.push({ opportunityId: signup.opportunity_id, role: 'took_part', since: signup.status_changed_at, until: signup.status_changed_at })
    }
  }

  // Leading a post: one current row per post, merged with membership.
  for (const own of owners.filter((o) => o.user_id === me)) {
    const member = rows.find((r) => r.opportunityId === own.opportunity_id && r.role === 'member' && r.until === null)
    if (member) {
      member.role = 'lead'
      if (!member.since || own.added_at < member.since) member.since = own.added_at
    } else {
      rows.push({ opportunityId: own.opportunity_id, role: 'lead', since: own.added_at, until: null })
    }
  }

  const current = rows
    .filter((r) => r.until === null)
    .sort((a, b) => (a.role === b.role ? (a.since ?? '').localeCompare(b.since ?? '') : a.role === 'lead' ? -1 : 1))
  const past = rows.filter((r) => r.until !== null).sort((a, b) => (b.until ?? '').localeCompare(a.until ?? ''))
  return { current, past }
}
