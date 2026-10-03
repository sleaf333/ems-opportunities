import type {
  CommitmentLevel,
  Contact,
  MemberPosition,
  Opportunity,
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
  partnership_track: 'Shareholder track',
  partner: 'Shareholder',
  apc: 'APC',
  admin_staff: 'Administrative staff',
}

// Positions in the order people choose from.
// (Internal names say "partner"; every label people see says "shareholder".)
export const SELF_POSITIONS: MemberPosition[] = ['employed_physician', 'partnership_track', 'partner', 'apc', 'admin_staff']


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

// Only the positions a post lists may sign up (interest or commit);
// everyone can still view it.
export function canSignUp(opp: Opportunity, profile: Profile): boolean {
  return profile.position !== null && opp.eligible_positions.includes(profile.position)
}

export const ALL_POSITIONS: MemberPosition[] = ['employed_physician', 'partnership_track', 'partner', 'apc', 'admin_staff']

// Common "who can sign up" choices, in the order they appear as sections on
// the main page. Anything else is shown as a custom list.
export const ELIGIBILITY_GROUPS: { key: string; title: string; label: string; positions: MemberPosition[] }[] = [
  { key: 'everyone', title: 'Open to everyone', label: 'Everyone', positions: ALL_POSITIONS },
  {
    key: 'clinical',
    title: 'Physicians and APCs',
    label: 'Physicians and APCs',
    positions: ['employed_physician', 'partnership_track', 'partner', 'apc'],
  },
  { key: 'apc', title: 'For APCs', label: 'APCs', positions: ['apc'] },
  {
    key: 'physicians',
    title: 'For physicians',
    label: 'Physicians',
    positions: ['employed_physician', 'partnership_track', 'partner'],
  },
  {
    key: 'track',
    title: 'Shareholder track and shareholders',
    label: 'Shareholder track and shareholders',
    positions: ['partnership_track', 'partner'],
  },
  { key: 'shareholders', title: 'For shareholders', label: 'Shareholders', positions: ['partner'] },
  { key: 'admin_staff', title: 'Administrative staff', label: 'Administrative staff', positions: ['admin_staff'] },
]

function samePositions(a: MemberPosition[], b: MemberPosition[]): boolean {
  return a.length === b.length && a.every((p) => b.includes(p))
}

export function eligibilityGroup(positions: MemberPosition[]): string {
  return ELIGIBILITY_GROUPS.find((g) => samePositions(g.positions, positions))?.key ?? 'custom'
}

// For use mid-sentence ("open to physicians only"); keeps "APC" capitalized.
export function eligibilityPhrase(positions: MemberPosition[]): string {
  return eligibilityLabel(positions)
    .split(' ')
    .map((w) => (/^APCs?,?$/.test(w) ? w : w.toLowerCase()))
    .join(' ')
}

export function eligibilityLabel(positions: MemberPosition[]): string {
  const group = ELIGIBILITY_GROUPS.find((g) => samePositions(g.positions, positions))
  if (group) return group.label
  return ALL_POSITIONS.filter((p) => positions.includes(p))
    .map((p) => POSITION_LABELS[p])
    .join(', ')
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

// Edit history: what each post field is called on the form, and how an old
// value reads (so "region: fox_valley" shows as "Location: Fox Valley").
export const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  type: 'Type',
  description: 'Description',
  commitment: 'Time commitment',
  time_estimate: 'Time needed',
  eligible_positions: 'Who can sign up',
  capacity: 'Spots',
  start_date: 'Start date',
  end_date: 'End date',
  signup_deadline: 'Sign up by',
  new_hire_friendly: 'Good for new hires',
  region: 'Location',
  site: 'Hospital or site',
  format: 'Format',
  visible_until: 'Show on site until',
  show_names: 'Names shown to members',
  contact_name: 'Contact name',
  contact_email: 'Contact email',
  contacts: 'Contacts',
  status: 'Status',
}

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field
}

export function describeOldValue(field: string, value: unknown): string {
  if (field === 'visible_until' && value === null) return 'Indefinitely'
  if (field === 'capacity' && value === null) return 'No limit'
  if (value === null || value === undefined || value === '') return '(empty)'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (field === 'eligible_positions' && Array.isArray(value)) return eligibilityLabel(value as MemberPosition[])
  if (field === 'contacts' && Array.isArray(value)) {
    return value.length === 0 ? '(empty)' : (value as Contact[]).map(contactText).join(', ')
  }
  const text = String(value)
  const labels: Record<string, Record<string, string>> = {
    type: TYPE_LABELS,
    commitment: COMMITMENT_LABELS,
    region: REGION_LABELS,
    format: FORMAT_LABELS,
    status: STATUS_LABELS,
  }
  if (labels[field]) return labels[field][text] ?? text
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return formatDate(text)
  return text
}

// ---------------------------------------------------------------------------
// Contacts: a post lists up to MAX_CONTACTS people to ask (name and email).
// ---------------------------------------------------------------------------

export const MAX_CONTACTS = 10

// The post's contacts; older posts saved before the list existed fall back to
// their single contact.
export function contactsOf(opp: Pick<Opportunity, 'contacts' | 'contact_name' | 'contact_email'>): Contact[] {
  if (opp.contacts && opp.contacts.length > 0) return opp.contacts
  if (opp.contact_name || opp.contact_email) return [{ name: opp.contact_name, email: opp.contact_email }]
  return []
}

export function contactText(c: Contact): string {
  if (c.name && c.email) return `${c.name} (${c.email})`
  return c.name || c.email
}

// Tidies the rows typed on the form: trims, drops blank rows and repeated
// emails. Returns an error message instead when something needs fixing.
export function cleanContacts(rows: Contact[]): { contacts: Contact[]; error: string | null } {
  const contacts: Contact[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const name = row.name.trim()
    const email = row.email.trim()
    if (!name && !email) continue
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { contacts: [], error: `"${email}" does not look like an email address.` }
    }
    const key = email.toLowerCase()
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    contacts.push({ name, email })
  }
  if (contacts.length > MAX_CONTACTS) {
    return { contacts: [], error: `A post can list up to ${MAX_CONTACTS} contacts.` }
  }
  return { contacts, error: null }
}

// Adds people (for example the post's owners) who are not already listed.
export function mergeContacts(current: Contact[], extra: Contact[]): Contact[] {
  const kept = current.filter((c) => c.name.trim() || c.email.trim())
  const emails = new Set(kept.map((c) => c.email.trim().toLowerCase()).filter(Boolean))
  return [...kept, ...extra.filter((c) => !emails.has(c.email.trim().toLowerCase()))]
}
