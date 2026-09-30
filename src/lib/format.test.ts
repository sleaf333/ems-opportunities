import { describe, expect, it } from 'vitest'
import { canSignUp, eligibilityGroup, eligibilityLabel, eligibilityPhrase } from './format'
import type { MemberPosition, Opportunity, Profile } from './types'

const member = (position: MemberPosition): Profile => ({
  id: 'x',
  email: 'x@ems-wi.com',
  full_name: 'X',
  position,
  role: 'member',
  created_at: '2026-01-01T00:00:00Z',
})
const post = (eligible_positions: MemberPosition[]) => ({ eligible_positions }) as Opportunity

describe('who can sign up', () => {
  it('recognizes the APCs-only preset in any order', () => {
    expect(eligibilityGroup(['apc'])).toBe('apc')
    expect(eligibilityLabel(['apc'])).toBe('APCs')
    expect(eligibilityGroup(['apc', 'employed_physician', 'partnership_track', 'partner'])).toBe('clinical')
  })

  it('keeps APC capitalized mid-sentence', () => {
    expect(eligibilityPhrase(['apc'])).toBe('APCs')
    expect(eligibilityPhrase(['partner'])).toBe('shareholders')
    expect(eligibilityPhrase(['employed_physician', 'apc'])).toBe('employed physician, APC')
  })

  it('lets only APCs sign up for an APCs-only post', () => {
    const apcOnly = post(['apc'])
    expect(canSignUp(apcOnly, member('apc'))).toBe(true)
    for (const p of ['employed_physician', 'partnership_track', 'partner', 'admin_staff'] as MemberPosition[]) {
      expect(canSignUp(apcOnly, member(p))).toBe(false)
    }
  })
})
