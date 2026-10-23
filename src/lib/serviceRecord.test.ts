import { describe, expect, it } from 'vitest'
import { buildServiceRecord } from './serviceRecord'
import type { OpportunityOwner, Signup, SignupEvent, SignupStatus } from './types'

const ME = 'me'

function signup(id: string, opp: string, status: SignupStatus, at = '2026-01-01T00:00:00Z'): Signup {
  return {
    id,
    opportunity_id: opp,
    user_id: ME,
    status,
    status_changed_at: at,
    created_at: at,
    contacted_at: null,
    contacted_by: null,
    nudged_at: null,
  }
}

let nextId = 1
function event(signupId: string, opp: string, to: SignupStatus, at: string): SignupEvent {
  return {
    id: nextId++,
    signup_id: signupId,
    opportunity_id: opp,
    user_id: ME,
    from_status: null,
    to_status: to,
    changed_by: null,
    changed_at: at,
  }
}

function owner(opp: string, at: string): OpportunityOwner {
  return { opportunity_id: opp, user_id: ME, added_by: null, added_at: at }
}

describe('buildServiceRecord', () => {
  it('a current member, since the day they were confirmed', () => {
    const r = buildServiceRecord(
      [signup('s1', 'a', 'committed')],
      [event('s1', 'a', 'interested', '2026-02-01T00:00:00Z'), event('s1', 'a', 'committed', '2026-03-01T00:00:00Z')],
      [],
      ME,
    )
    expect(r.current).toEqual([{ opportunityId: 'a', role: 'member', since: '2026-03-01T00:00:00Z', until: null }])
    expect(r.past).toEqual([])
  })

  it('removed, then added back: one past stint and one current', () => {
    const r = buildServiceRecord(
      [signup('s1', 'a', 'committed')],
      [
        event('s1', 'a', 'committed', '2025-03-01T00:00:00Z'),
        event('s1', 'a', 'withdrawn', '2025-10-01T00:00:00Z'),
        event('s1', 'a', 'committed', '2026-04-01T00:00:00Z'),
      ],
      [],
      ME,
    )
    expect(r.past).toEqual([{ opportunityId: 'a', role: 'member', since: '2025-03-01T00:00:00Z', until: '2025-10-01T00:00:00Z' }])
    expect(r.current).toEqual([{ opportunityId: 'a', role: 'member', since: '2026-04-01T00:00:00Z', until: null }])
  })

  it('leading a post they are also on shows once, as Lead, from the earlier date', () => {
    const r = buildServiceRecord(
      [signup('s1', 'a', 'committed')],
      [event('s1', 'a', 'committed', '2026-05-01T00:00:00Z')],
      [owner('a', '2026-01-15T00:00:00Z'), owner('b', '2026-06-01T00:00:00Z')],
      ME,
    )
    expect(r.current).toEqual([
      { opportunityId: 'a', role: 'lead', since: '2026-01-15T00:00:00Z', until: null },
      { opportunityId: 'b', role: 'lead', since: '2026-06-01T00:00:00Z', until: null },
    ])
  })

  it('attended events count as took part', () => {
    const r = buildServiceRecord(
      [signup('s1', 'e', 'completed')],
      [event('s1', 'e', 'committed', '2026-05-01T00:00:00Z'), event('s1', 'e', 'completed', '2026-05-20T00:00:00Z')],
      [],
      ME,
    )
    expect(r.past).toEqual([{ opportunityId: 'e', role: 'took_part', since: '2026-05-01T00:00:00Z', until: '2026-05-20T00:00:00Z' }])
    expect(r.current).toEqual([])
  })

  it('raised a hand but never confirmed: not part of the record', () => {
    const r = buildServiceRecord(
      [signup('s1', 'a', 'interested'), signup('s2', 'b', 'not_selected')],
      [event('s1', 'a', 'interested', '2026-05-01T00:00:00Z'), event('s2', 'b', 'not_selected', '2026-05-02T00:00:00Z')],
      [],
      ME,
    )
    expect(r).toEqual({ current: [], past: [] })
  })

  it('a confirmed sign-up with no history falls back to its own date', () => {
    const r = buildServiceRecord([signup('s1', 'a', 'committed', '2026-07-07T00:00:00Z')], [], [], ME)
    expect(r.current[0].since).toBe('2026-07-07T00:00:00Z')
  })
})
