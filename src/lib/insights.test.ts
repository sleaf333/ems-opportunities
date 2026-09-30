import { describe, expect, it } from 'vitest'
import type { AdminData } from './adminData'
import {
  eventScore,
  funnel,
  gaps,
  heatmapByLocation,
  heatmapByPosition,
  lastMonths,
  monthlyActivity,
  risingStars,
} from './insights'
import type {
  InterestCategory,
  MemberPosition,
  Opportunity,
  Profile,
  Signup,
  SignupEvent,
  SignupStatus,
} from './types'

const TODAY = new Date('2026-09-28T17:00:00Z')
const DAY = 86_400_000
const daysAgo = (n: number) => new Date(TODAY.getTime() - n * DAY).toISOString()

function person(id: string, position: MemberPosition): Profile {
  return { id, email: `${id}@ems-wi.com`, full_name: id, position, role: 'member', created_at: daysAgo(400) }
}

function opp(id: string, extra: Partial<Opportunity> = {}): Opportunity {
  return {
    id,
    title: id,
    type: 'committee',
    description: '',
    commitment: 'ongoing',
    time_estimate: '',
    eligible_positions: ['employed_physician', 'partnership_track', 'partner', 'apc', 'admin_staff'],
    capacity: null,
    start_date: null,
    end_date: null,
    signup_deadline: null,
    new_hire_friendly: false,
    region: 'group_wide',
    site: '',
    format: 'in_person',
    visible_until: null,
    show_names: false,
    contact_name: '',
    contact_email: '',
    status: 'open',
    created_by: null,
    created_at: daysAgo(10),
    updated_at: daysAgo(10),
    ...extra,
  }
}

let eventId = 0
function ev(user: string, oppId: string, to: SignupStatus, ago: number): SignupEvent {
  return {
    id: ++eventId,
    signup_id: `${user}-${oppId}`,
    opportunity_id: oppId,
    user_id: user,
    from_status: null,
    to_status: to,
    changed_by: user,
    changed_at: daysAgo(ago),
  }
}

function signup(user: string, oppId: string, status: SignupStatus): Signup {
  return {
    id: `${user}-${oppId}`,
    opportunity_id: oppId,
    user_id: user,
    status,
    status_changed_at: daysAgo(1),
    created_at: daysAgo(1),
  }
}

const cat = (id: string, name: string, active = true): InterestCategory => ({ id, name, active, created_at: daysAgo(100) })

function makeData(parts: Partial<AdminData>): AdminData {
  return {
    profiles: [],
    opportunities: [],
    signups: [],
    categories: [],
    topics: new Map(),
    events: [],
    interests: [],
    memberCats: [],
    presets: [],
    recentRoleChanges: [],
    lastBackup: null,
    ...parts,
  }
}

describe('funnel', () => {
  const data = makeData({
    profiles: [person('a', 'employed_physician'), person('b', 'apc'), person('c', 'partner'), person('d', 'admin_staff')],
    events: [
      ev('a', 'p1', 'interested', 10),
      ev('a', 'p1', 'committed', 9),
      ev('a', 'p2', 'committed', 8),
      ev('b', 'p1', 'interested', 20),
      ev('c', 'p1', 'waitlisted', 200), // outside 90 days
    ],
  })

  it('counts each stage within the range', () => {
    const r = funnel(data, '90d', 'all', TODAY)
    expect(r.stages.map((s) => s.count)).toEqual([4, 2, 1, 1])
    expect(r.stages.some((s) => s.key === 'completed')).toBe(false)
  })

  it('widens with the range', () => {
    const r = funnel(data, '12m', 'all', TODAY)
    expect(r.stages.map((s) => s.count)).toEqual([4, 3, 2, 1])
  })

  it('filters by position', () => {
    const r = funnel(data, 'all', 'physicians', TODAY)
    expect(r.stages.map((s) => s.count)).toEqual([2, 2, 2, 1])
  })

  it('counts people who raised a hand but never committed', () => {
    expect(funnel(data, '90d', 'all', TODAY).untapped).toBe(1) // b
  })

  it('adds a Completed stage only once attendance exists', () => {
    const withAttendance = makeData({ ...data, signups: [signup('a', 'p1', 'completed')] })
    const r = funnel(withAttendance, 'all', 'all', TODAY)
    expect(r.stages.at(-1)?.key).toBe('completed')
  })
})

describe('monthly activity', () => {
  it('buckets events by Wisconsin month', () => {
    const months = lastMonths(TODAY, 3)
    expect(months).toEqual(['2026-07', '2026-08', '2026-09'])
    const data = makeData({
      profiles: [person('a', 'apc')],
      // 2026-09-01T03:00Z is still Aug 31 in Wisconsin.
      events: [
        { ...ev('a', 'p1', 'interested', 0), changed_at: '2026-09-01T03:00:00Z' },
        ev('a', 'p1', 'committed', 3),
      ],
    })
    const rows = monthlyActivity(data, 'all', 3, TODAY)
    expect(rows.find((r) => r.month === '2026-08')?.interest).toBe(1)
    expect(rows.find((r) => r.month === '2026-09')?.commitments).toBe(1)
  })
})

describe('rising stars', () => {
  it('scores with weights and the leadership bonus', () => {
    const lead = opp('lead', { type: 'leadership' })
    expect(eventScore(ev('a', 'lead', 'interested', 1), lead, [])).toBe(3)
    expect(eventScore(ev('a', 'x', 'committed', 1), opp('x'), ['Leadership'])).toBe(5)
    expect(eventScore(ev('a', 'x', 'withdrawn', 1), opp('x'), [])).toBe(0)
  })

  it('compares the last 90 days with the 90 before, at the boundaries', () => {
    const data = makeData({
      profiles: [person('riser', 'employed_physician'), person('steady', 'apc'), person('edge', 'apc')],
      opportunities: [opp('p1'), opp('p2')],
      events: [
        // riser: 3 recent points (day 89), 1 prior point (day 91)
        ev('riser', 'p1', 'committed', 89),
        ev('riser', 'p2', 'interested', 91),
        // steady: 3 recent, 3 prior -> not rising
        ev('steady', 'p1', 'committed', 30),
        ev('steady', 'p2', 'committed', 120),
        // edge: day 90 exactly counts as prior, so recent = 0
        ev('edge', 'p1', 'committed', 90),
      ],
    })
    const stars = risingStars(data, 'all', TODAY)
    expect(stars.map((s) => s.profile.id)).toEqual(['riser'])
    expect(stars[0]).toMatchObject({ recent: 3, prior: 1, growth: 2 })
    expect(stars[0].series.reduce((a, b) => a + b, 0)).toBe(4)
  })

  it('needs a minimum recent score', () => {
    const data = makeData({
      profiles: [person('a', 'apc')],
      opportunities: [opp('p1')],
      events: [ev('a', 'p1', 'interested', 5)],
    })
    expect(risingStars(data, 'all', TODAY)).toEqual([])
  })
})

describe('heatmaps', () => {
  const wellness = cat('w', 'Wellness')
  const data = makeData({
    profiles: [person('a', 'employed_physician'), person('b', 'apc')],
    opportunities: [opp('p1', { region: 'milwaukee' }), opp('p2', { region: 'fox_valley' })],
    categories: [wellness, cat('old', 'Retired', false)],
    topics: new Map([
      ['p1', [wellness]],
      ['p2', [wellness]],
    ]),
    events: [
      ev('a', 'p1', 'interested', 5),
      ev('a', 'p1', 'committed', 4), // same person, same cell: counted once
      ev('b', 'p2', 'interested', 5),
    ],
    memberCats: [{ user_id: 'a', category_id: 'w', created_at: daysAgo(1) }],
  })

  it('by location counts distinct people per topic and region', () => {
    const h = heatmapByLocation(data, 'all', 'all', TODAY)
    expect(h.rows.map((r) => r.name)).toEqual(['Wellness']) // retired topics hidden
    expect(h.rows[0].cells).toEqual([0, 1, 1, 0, 0]) // door, fox, mke, watertown, group-wide
    expect(h.rows[0].stated).toBe(1)
    expect(h.max).toBe(1)
  })

  it('by position counts stated interests', () => {
    const h = heatmapByPosition(data, 'all')
    expect(h.rows[0].cells).toEqual([1, 0, 0, 0, 0])
  })
})

describe('gaps', () => {
  const research = cat('r', 'Research')
  const wellness = cat('w', 'Wellness')
  const data = makeData({
    profiles: [person('a', 'apc'), person('b', 'apc')],
    categories: [research, wellness],
    opportunities: [
      opp('quiet', { created_at: daysAgo(45), region: 'milwaukee' }),
      opp('busy', { created_at: daysAgo(45), region: 'milwaukee' }),
      opp('young', { created_at: daysAgo(5), region: 'milwaukee' }),
      opp('expired', { created_at: daysAgo(60), region: 'watertown', visible_until: '2026-01-01' }),
      opp('archived', { created_at: daysAgo(60), region: 'door_county', status: 'archived' }),
    ],
    topics: new Map([['expired', [research]], ['busy', [wellness]]]),
    signups: [signup('a', 'busy', 'committed'), signup('b', 'quiet', 'interested')],
    memberCats: [
      { user_id: 'a', category_id: 'r', created_at: daysAgo(1) },
      { user_id: 'b', category_id: 'r', created_at: daysAgo(1) },
      { user_id: 'a', category_id: 'w', created_at: daysAgo(1) },
    ],
  })

  it('finds wanted topics with no live posts (expired ones do not count)', () => {
    expect(gaps(data, TODAY).wanted).toEqual([{ id: 'r', name: 'Research', interested: 2 }])
  })

  it('finds quiet posts: live, older than 30 days, no commitments', () => {
    const q = gaps(data, TODAY).quiet
    expect(q.map((x) => x.opportunity.id)).toEqual(['quiet'])
    expect(q[0]).toMatchObject({ ageDays: 45, interested: 1 })
  })

  it('finds locations with nothing live', () => {
    expect(gaps(data, TODAY).emptyRegions).toEqual(['door_county', 'fox_valley', 'watertown'])
  })
})
