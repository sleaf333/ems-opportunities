import { describe, expect, it } from 'vitest'
import type { AdminData } from './adminData'
import {
  committeeHealth,
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
  return { id, email: `${id}@ems-wi.com`, full_name: id, position, role: 'member', email_opt_in: true, created_at: daysAgo(400) }
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
    contacts: [],
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
    contacted_at: null,
    contacted_by: null,
    nudged_at: null,
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
    postRequests: [],
    memberLists: { pending: [], lastCheck: new Map(), suggestions: [] },
    owners: [],
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

describe('committeeHealth', () => {
  const lead = person('lead', 'partner')
  const data = makeData({
    profiles: [lead, person('a', 'employed_physician'), person('b', 'apc'), person('w', 'partner')],
    opportunities: [
      opp('full', { title: 'Full committee', capacity: 2 }),
      opp('empty', { title: 'Empty committee' }),
      opp('evt', { title: 'An event', type: 'event' }),
      opp('arch', { title: 'Archived', status: 'archived' }),
    ],
    signups: [
      signup('a', 'full', 'committed'),
      signup('b', 'full', 'committed'),
      { ...signup('w', 'full', 'interested'), status_changed_at: daysAgo(20) },
    ],
    owners: [{ opportunity_id: 'full', user_id: 'lead', added_by: null, added_at: daysAgo(100) }],
    memberLists: {
      pending: [],
      lastCheck: new Map([['full', { id: 1, opportunity_id: 'full', checked_by: 'lead', checked_at: daysAgo(10) }]]),
      suggestions: [
        { id: 1, opportunity_id: 'full', suggested_email: 'x@ems-wi.com', suggested_by: 'a', note: '', created_at: daysAgo(5) },
        { id: 2, opportunity_id: 'full', suggested_email: 'y@ems-wi.com', suggested_by: 'a', note: '', created_at: daysAgo(200) },
      ],
    },
  })

  it('covers committees only (not events or archived posts), problems first', () => {
    const rows = committeeHealth(data, 'all', TODAY)
    expect(rows.map((r) => r.opportunity.id)).toEqual(['empty', 'full'])
    expect(rows[0].flags).toEqual(['no_lead', 'no_members'])
  })

  it('a list check is due a year after the last one, or a year after a lead was added', () => {
    const at = (checkAgo: number | null, leadAgo: number) =>
      committeeHealth(
        makeData({
          ...data,
          owners: [{ opportunity_id: 'full', user_id: 'lead', added_by: null, added_at: daysAgo(leadAgo) }],
          memberLists: {
            ...data.memberLists,
            lastCheck: checkAgo === null ? new Map() : new Map([['full', { id: 1, opportunity_id: 'full', checked_by: 'lead', checked_at: daysAgo(checkAgo) }]]),
          },
        }),
        'all',
        TODAY,
      ).find((r) => r.opportunity.id === 'full')!.flags.includes('list_due')
    expect([at(10, 900), at(400, 900), at(null, 30), at(null, 400)]).toEqual([false, true, false, true])
  })

  it('counts members, seats, waiting, recent suggestions and the last check', () => {
    const full = committeeHealth(data, 'all', TODAY).find((r) => r.opportunity.id === 'full')!
    expect(full.leads.map((p) => p.id)).toEqual(['lead'])
    expect([full.members, full.seatsTaken, full.capacity, full.waitingForDecision, full.oldestWaitDays, full.suggestions]).toEqual([2, 2, 2, 1, 20, 1])
    expect(full.flags).toEqual(['waiting_long', 'full'])
  })

  it('member counts follow the position filter; seats do not', () => {
    const full = committeeHealth(data, 'apc', TODAY).find((r) => r.opportunity.id === 'full')!
    expect([full.members, full.seatsTaken]).toEqual([1, 2])
  })

  it('people added before signing in count toward seats and members-to-be', () => {
    const withPending = makeData({
      ...data,
      memberLists: { ...data.memberLists, pending: [{ email: 'p@ems-wi.com', opportunity_id: 'empty', added_by: 'lead', created_at: daysAgo(1) }] },
    })
    const empty = committeeHealth(withPending, 'all', TODAY).find((r) => r.opportunity.id === 'empty')!
    expect([empty.waitingToSignIn, empty.seatsTaken]).toEqual([1, 1])
    expect(empty.flags).not.toContain('no_members')
  })
})

