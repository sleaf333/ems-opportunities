import type {
  CommitmentLevel,
  MemberPosition,
  Opportunity,
  OppAudience,
  OppStatus,
  OppType,
  Profile,
  SignupStatus,
  UserRole,
} from './types'

export const TYPE_LABELS: Record<OppType, string> = {
  committee: 'Committee',
  leadership: 'Leadership',
  event: 'Event',
  project: 'Project',
  other: 'Other',
}

export const COMMITMENT_LABELS: Record<CommitmentLevel, string> = {
  one_time: 'One-time',
  short_term: 'Short-term',
  ongoing: 'Ongoing',
}

export const AUDIENCE_LABELS: Record<OppAudience, string> = {
  all: 'All team members',
  physicians: 'Physicians',
  shareholders: 'Shareholders',
}

export const STATUS_LABELS: Record<OppStatus, string> = {
  draft: 'Draft',
  open: 'Open',
  closed: 'Closed',
  archived: 'Archived',
}

export const SIGNUP_LABELS: Record<SignupStatus, string> = {
  interested: 'Interested',
  committed: 'Committed',
  waitlisted: 'Waitlisted',
  withdrawn: 'Withdrawn',
  completed: 'Completed',
  no_show: 'Did not attend',
}

export const POSITION_LABELS: Record<MemberPosition, string> = {
  physician: 'Physician',
  apc: 'APC',
  staff: 'Staff',
}

export const ROLE_LABELS: Record<UserRole, string> = {
  member: 'Member',
  poster: 'Poster',
  admin: 'Admin',
}

// Dates are stored as YYYY-MM-DD. Format them without converting time zones,
// so a date never shifts by a day.
export function formatDate(value: string | null): string {
  if (!value) return ''
  if (value.length > 10) {
    // A full timestamp: show it in the viewer's local time zone.
    return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatDateTime(value: string | null): string {
  if (!value) return ''
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// Today's date in Wisconsin, matching the database's deadline rule.
export function localToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
}

export function deadlinePassed(opp: Opportunity): boolean {
  return Boolean(opp.signup_deadline && opp.signup_deadline < localToday())
}

export function canCommit(opp: Opportunity, profile: Profile): boolean {
  if (opp.audience === 'physicians') return profile.position === 'physician'
  if (opp.audience === 'shareholders') return profile.is_shareholder
  return true
}

export function displayName(profile: Pick<Profile, 'full_name' | 'email'> | undefined): string {
  if (!profile) return 'Unknown'
  return profile.full_name.trim() || profile.email
}

export function parseTags(value: string): string[] {
  const seen = new Set<string>()
  for (const raw of value.split(',')) {
    const tag = raw.trim().toLowerCase()
    if (tag) seen.add(tag)
  }
  return [...seen]
}
