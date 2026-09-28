import type {
  CommitmentLevel,
  MemberPosition,
  Opportunity,
  OppAudience,
  OppFormat,
  OppRegion,
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
  partners: 'Partners',
}

export const REGION_LABELS: Record<OppRegion, string> = {
  group_wide: 'Group-wide',
  door_county: 'Door County',
  fox_valley: 'Fox Valley',
  milwaukee: 'Milwaukee',
  watertown: 'Watertown',
}

export const FORMAT_LABELS: Record<OppFormat, string> = {
  in_person: 'In person',
  virtual: 'Virtual',
  hybrid: 'Hybrid',
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
  employed_physician: 'Employed physician',
  partnership_track: 'Partnership track',
  partner: 'Partner',
  apc: 'APC',
  admin_staff: 'Administrative staff',
}

// Positions members can choose for themselves. Partner is set by an admin.
export const SELF_POSITIONS: MemberPosition[] = ['employed_physician', 'partnership_track', 'apc', 'admin_staff']

export function isPhysician(position: MemberPosition | null): boolean {
  return position === 'employed_physician' || position === 'partnership_track' || position === 'partner'
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
  if (opp.audience === 'physicians') return isPhysician(profile.position)
  if (opp.audience === 'partners') return profile.position === 'partner'
  return true
}

// Past its "show on site until" date. Kept in the database, hidden from the list.
export function isExpired(opp: Opportunity): boolean {
  return Boolean(opp.visible_until && opp.visible_until < localToday())
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return date.toISOString().slice(0, 10)
}

export function daysUntil(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number)
  const [ty, tm, td] = localToday().split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000)
}

export function locationText(opp: Pick<Opportunity, 'region' | 'site'>): string {
  return REGION_LABELS[opp.region] + (opp.site.trim() ? ` · ${opp.site.trim()}` : '')
}

export function displayName(profile: Pick<Profile, 'full_name' | 'email'> | undefined): string {
  if (!profile) return 'Unknown'
  return profile.full_name.trim() || profile.email
}
