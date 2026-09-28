// Leadership pipeline calculations for the admin Insights page.
// Pure functions: data in, numbers out. No React, no network.

import type { AdminData } from './adminData'
import type { MemberPosition, Opportunity, OppRegion, Profile, SignupEvent, SignupStatus } from './types'

// ---------------------------------------------------------------------------
// Tuning knobs
// ---------------------------------------------------------------------------

// Points for each sign-up change when scoring involvement.
export const WEIGHTS: Partial<Record<SignupStatus, number>> = {
  interested: 1,
  committed: 3,
  waitlisted: 3, // wanted to commit; the post was full
  completed: 5, // counts once attendance marking exists
}
// Extra points when the post is a leadership role or tagged Leadership.
export const LEADERSHIP_BONUS = 2
// Rising stars compare the last N days with the N days before.
export const RISING_WINDOW_DAYS = 90
// Minimum recent score to count as rising.
export const RISING_MIN_SCORE = 3
export const RISING_LIMIT = 10
// Open posts older than this with no commitments are "quiet".
export const QUIET_POST_DAYS = 30

const DAY = 86_400_000
const ACTIVE: SignupStatus[] = ['interested', 'committed', 'waitlisted', 'completed']
const COMMITTED: SignupStatus[] = ['committed', 'waitlisted', 'completed']

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export type Range = '90d' | '12m' | 'all'
export const RANGE_LABELS: Record<Range, string> = {
  '90d': 'Last 90 days',
  '12m': 'Last 12 months',
  all: 'All time',
}

export type PositionFilter = 'all' | 'physicians' | 'track' | 'apc' | 'admin_staff'
export const POSITION_FILTERS: { key: PositionFilter; label: string; positions: MemberPosition[] | null }[] = [
  { key: 'all', label: 'Everyone', positions: null },
  { key: 'physicians', label: 'Physicians', positions: ['employed_physician', 'partnership_track', 'partner'] },
  { key: 'track', label: 'Shareholder track + shareholders', positions: ['partnership_track', 'partner'] },
  { key: 'apc', label: 'APCs', positions: ['apc'] },
  { key: 'admin_staff', label: 'Administrative staff', positions: ['admin_staff'] },
]

export function rangeStart(range: Range, today: Date): number {
  if (range === '90d') return today.getTime() - 90 * DAY
  if (range === '12m') return today.getTime() - 365 * DAY
  return -Infinity
}

export function peopleIn(profiles: Profile[], filter: PositionFilter): Profile[] {
  const allowed = POSITION_FILTERS.find((f) => f.key === filter)?.positions
  return allowed ? profiles.filter((p) => p.position && allowed.includes(p.position)) : profiles
}

function time(iso: string): number {
  return new Date(iso).getTime()
}

// Month key (YYYY-MM) in Wisconsin time, so late-evening activity lands in the right month.
const monthFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit' })
export function monthKey(when: Date | string): string {
  return monthFormat.format(typeof when === 'string' ? new Date(when) : when).slice(0, 7)
}

// The last `count` month keys, oldest first, ending with the month containing `today`.
export function lastMonths(today: Date, count: number): string[] {
  const [y, m] = monthKey(today).split('-').map(Number)
  const keys: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 15))
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}

function isLive(o: Opportunity, todayIso: string): boolean {
  return o.status === 'open' && !(o.visible_until && o.visible_until < todayIso)
}

function chicagoDate(today: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(today)
}

// ---------------------------------------------------------------------------
// Funnel
// ---------------------------------------------------------------------------

export interface FunnelStage {
  key: 'members' | 'raised' | 'committed' | 'returned' | 'completed'
  label: string
  count: number
}

export interface FunnelResult {
  stages: FunnelStage[]
  // Raised a hand at some point but never committed (any time, not just the range).
  untapped: number
}

export function funnel(
  data: Pick<AdminData, 'profiles' | 'events' | 'signups'>,
  range: Range,
  filter: PositionFilter,
  today: Date,
): FunnelResult {
  const people = new Set(peopleIn(data.profiles, filter).map((p) => p.id))
  const start = rangeStart(range, today)
  const inRange = data.events.filter((e) => people.has(e.user_id) && time(e.changed_at) >= start)

  const raised = new Set<string>()
  const committed = new Set<string>()
  const committedPosts = new Map<string, Set<string>>()
  const completed = new Set<string>()
  for (const e of inRange) {
    if (ACTIVE.includes(e.to_status)) raised.add(e.user_id)
    if (COMMITTED.includes(e.to_status)) {
      committed.add(e.user_id)
      const posts = committedPosts.get(e.user_id) ?? new Set<string>()
      posts.add(e.opportunity_id)
      committedPosts.set(e.user_id, posts)
    }
    if (e.to_status === 'completed') completed.add(e.user_id)
  }
  const returned = [...committedPosts.values()].filter((posts) => posts.size >= 2).length

  const stages: FunnelStage[] = [
    { key: 'members', label: 'Signed in', count: people.size },
    { key: 'raised', label: 'Raised a hand', count: raised.size },
    { key: 'committed', label: 'Committed', count: committed.size },
    { key: 'returned', label: 'Came back (2+ commitments)', count: returned },
  ]
  // Only once attendance is being recorded anywhere.
  if (data.signups.some((s) => s.status === 'completed')) {
    stages.push({ key: 'completed', label: 'Completed', count: completed.size })
  }

  // Everyone in the filter who ever raised a hand but never committed.
  const everRaised = new Set<string>()
  const everCommitted = new Set<string>()
  for (const e of data.events) {
    if (!people.has(e.user_id)) continue
    if (ACTIVE.includes(e.to_status)) everRaised.add(e.user_id)
    if (COMMITTED.includes(e.to_status)) everCommitted.add(e.user_id)
  }
  const untapped = [...everRaised].filter((id) => !everCommitted.has(id)).length

  return { stages, untapped }
}

// ---------------------------------------------------------------------------
// Monthly activity
// ---------------------------------------------------------------------------

export interface MonthActivity {
  month: string // YYYY-MM
  interest: number
  commitments: number
}

export function monthsForRange(range: Range, events: SignupEvent[], today: Date): number {
  if (range === '90d') return 3
  if (range === '12m') return 12
  if (events.length === 0) return 12
  const first = monthKey(events.reduce((min, e) => (e.changed_at < min ? e.changed_at : min), events[0].changed_at))
  const [fy, fm] = first.split('-').map(Number)
  const [ty, tm] = monthKey(today).split('-').map(Number)
  const span = (ty - fy) * 12 + (tm - fm) + 1
  return Math.min(24, Math.max(3, span))
}

export function monthlyActivity(
  data: Pick<AdminData, 'profiles' | 'events'>,
  filter: PositionFilter,
  months: number,
  today: Date,
): MonthActivity[] {
  const people = new Set(peopleIn(data.profiles, filter).map((p) => p.id))
  const rows = new Map(lastMonths(today, months).map((m) => [m, { month: m, interest: 0, commitments: 0 }]))
  for (const e of data.events) {
    if (!people.has(e.user_id)) continue
    const row = rows.get(monthKey(e.changed_at))
    if (!row) continue
    if (e.to_status === 'interested') row.interest++
    else if (e.to_status === 'committed' || e.to_status === 'waitlisted') row.commitments++
  }
  return [...rows.values()]
}

// ---------------------------------------------------------------------------
// Rising stars
// ---------------------------------------------------------------------------

export interface RisingStar {
  profile: Profile
  recent: number
  prior: number
  growth: number
  series: number[] // score per month, last 12 months, oldest first
  topTopics: string[]
  goals: string
}

function isLeadershipPost(o: Opportunity | undefined, topicNames: string[]): boolean {
  return Boolean(o && (o.type === 'leadership' || topicNames.some((t) => t.toLowerCase() === 'leadership')))
}

export function eventScore(e: SignupEvent, opp: Opportunity | undefined, topicNames: string[]): number {
  const base = WEIGHTS[e.to_status] ?? 0
  if (base === 0) return 0
  return base + (isLeadershipPost(opp, topicNames) ? LEADERSHIP_BONUS : 0)
}

export function risingStars(data: AdminData, filter: PositionFilter, today: Date): RisingStar[] {
  const people = peopleIn(data.profiles, filter)
  const opps = new Map(data.opportunities.map((o) => [o.id, o]))
  const topicNames = (oppId: string) => (data.topics.get(oppId) ?? []).map((t) => t.name)
  const now = today.getTime()
  const recentStart = now - RISING_WINDOW_DAYS * DAY
  const priorStart = now - 2 * RISING_WINDOW_DAYS * DAY
  const months = lastMonths(today, 12)
  const catNames = new Map(data.categories.map((c) => [c.id, c.name]))
  const goals = new Map(data.interests.map((i) => [i.user_id, i.leadership_goals]))

  const stars: RisingStar[] = []
  for (const person of people) {
    let recent = 0
    let prior = 0
    const series = months.map(() => 0)
    const topicCounts = new Map<string, number>()
    for (const e of data.events) {
      if (e.user_id !== person.id) continue
      const names = topicNames(e.opportunity_id)
      const score = eventScore(e, opps.get(e.opportunity_id), names)
      if (score === 0) continue
      const t = time(e.changed_at)
      if (t > recentStart && t <= now) recent += score
      else if (t > priorStart && t <= recentStart) prior += score
      const idx = months.indexOf(monthKey(e.changed_at))
      if (idx >= 0) series[idx] += score
      for (const n of names) topicCounts.set(n, (topicCounts.get(n) ?? 0) + 1)
    }
    if (recent < RISING_MIN_SCORE || recent <= prior) continue
    for (const m of data.memberCats) {
      if (m.user_id !== person.id) continue
      const n = catNames.get(m.category_id)
      if (n) topicCounts.set(n, (topicCounts.get(n) ?? 0) + 1)
    }
    const topTopics = [...topicCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([n]) => n)
    stars.push({
      profile: person,
      recent,
      prior,
      growth: recent - prior,
      series,
      topTopics,
      goals: goals.get(person.id) ?? '',
    })
  }
  return stars
    .sort(
      (a, b) =>
        b.growth - a.growth ||
        b.recent - a.recent ||
        (a.profile.full_name || a.profile.email).localeCompare(b.profile.full_name || b.profile.email),
    )
    .slice(0, RISING_LIMIT)
}

// ---------------------------------------------------------------------------
// Heatmaps
// ---------------------------------------------------------------------------

export interface Heatmap {
  rows: { id: string; name: string; cells: number[]; stated: number }[]
  columns: string[] // keys (regions or positions)
  max: number
}

export const HEATMAP_REGIONS: OppRegion[] = ['door_county', 'fox_valley', 'milwaukee', 'watertown', 'group_wide']
export const HEATMAP_POSITIONS: MemberPosition[] = [
  'employed_physician',
  'partnership_track',
  'partner',
  'apc',
  'admin_staff',
]

// People who showed interest in or committed to posts with this topic in each location.
export function heatmapByLocation(data: AdminData, range: Range, filter: PositionFilter, today: Date): Heatmap {
  const people = peopleIn(data.profiles, filter)
  const ids = new Set(people.map((p) => p.id))
  const start = rangeStart(range, today)
  const opps = new Map(data.opportunities.map((o) => [o.id, o]))
  const active = data.categories.filter((c) => c.active)
  const cellPeople = new Map<string, Set<string>>() // `${cat}|${region}` -> people
  for (const e of data.events) {
    if (!ids.has(e.user_id) || !ACTIVE.includes(e.to_status) || time(e.changed_at) < start) continue
    const o = opps.get(e.opportunity_id)
    if (!o) continue
    for (const t of data.topics.get(o.id) ?? []) {
      const key = `${t.id}|${o.region}`
      const set = cellPeople.get(key) ?? new Set<string>()
      set.add(e.user_id)
      cellPeople.set(key, set)
    }
  }
  const stated = statedInterest(data, ids)
  let max = 0
  const rows = active.map((c) => {
    const cells = HEATMAP_REGIONS.map((r) => cellPeople.get(`${c.id}|${r}`)?.size ?? 0)
    max = Math.max(max, ...cells)
    return { id: c.id, name: c.name, cells, stated: stated.get(c.id) ?? 0 }
  })
  return { rows, columns: HEATMAP_REGIONS, max }
}

// Members who picked each topic as an interest, by position.
export function heatmapByPosition(data: AdminData, filter: PositionFilter): Heatmap {
  const people = peopleIn(data.profiles, filter)
  const positionOf = new Map(people.map((p) => [p.id, p.position]))
  const active = data.categories.filter((c) => c.active)
  const counts = new Map<string, number>() // `${cat}|${position}`
  for (const m of data.memberCats) {
    const pos = positionOf.get(m.user_id)
    if (!pos) continue
    const key = `${m.category_id}|${pos}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const stated = statedInterest(data, new Set(positionOf.keys()))
  let max = 0
  const rows = active.map((c) => {
    const cells = HEATMAP_POSITIONS.map((p) => counts.get(`${c.id}|${p}`) ?? 0)
    max = Math.max(max, ...cells)
    return { id: c.id, name: c.name, cells, stated: stated.get(c.id) ?? 0 }
  })
  return { rows, columns: HEATMAP_POSITIONS, max }
}

function statedInterest(data: Pick<AdminData, 'memberCats'>, ids: Set<string>): Map<string, number> {
  const map = new Map<string, number>()
  for (const m of data.memberCats) if (ids.has(m.user_id)) map.set(m.category_id, (map.get(m.category_id) ?? 0) + 1)
  return map
}

// ---------------------------------------------------------------------------
// Gaps
// ---------------------------------------------------------------------------

export interface Gaps {
  wanted: { id: string; name: string; interested: number }[]
  quiet: { opportunity: Opportunity; ageDays: number; interested: number }[]
  emptyRegions: OppRegion[]
}

export function gaps(data: AdminData, today: Date): Gaps {
  const todayIso = chicagoDate(today)
  const live = data.opportunities.filter((o) => isLive(o, todayIso))
  const liveTopicIds = new Set(live.flatMap((o) => (data.topics.get(o.id) ?? []).map((t) => t.id)))
  const stated = statedInterest(data, new Set(data.profiles.map((p) => p.id)))

  const wanted = data.categories
    .filter((c) => c.active && (stated.get(c.id) ?? 0) > 0 && !liveTopicIds.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, interested: stated.get(c.id) ?? 0 }))
    .sort((a, b) => b.interested - a.interested || a.name.localeCompare(b.name))

  const quiet = live
    .map((o) => {
      const rows = data.signups.filter((s) => s.opportunity_id === o.id)
      return {
        opportunity: o,
        ageDays: Math.floor((today.getTime() - time(o.created_at)) / DAY),
        committed: rows.filter((s) => s.status === 'committed' || s.status === 'completed').length,
        interested: rows.filter((s) => s.status === 'interested').length,
      }
    })
    .filter((q) => q.ageDays > QUIET_POST_DAYS && q.committed === 0)
    .sort((a, b) => b.ageDays - a.ageDays)
    .map(({ opportunity, ageDays, interested }) => ({ opportunity, ageDays, interested }))

  const emptyRegions = HEATMAP_REGIONS.filter((r) => r !== 'group_wide' && !live.some((o) => o.region === r))

  return { wanted, quiet, emptyRegions }
}
