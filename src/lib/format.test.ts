import { describe, expect, it } from 'vitest'
import { canSignUp, describeOldValue, eligibilityGroup, eligibilityLabel, eligibilityPhrase, fieldLabel, formatDate } from './format'
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

describe('edit history wording', () => {
  it('names fields the way the form does', () => {
    expect(fieldLabel('region')).toBe('Location')
    expect(fieldLabel('eligible_positions')).toBe('Who can sign up')
    expect(fieldLabel('something_new')).toBe('something_new')
  })

  it('shows old values in plain words', () => {
    expect(describeOldValue('region', 'fox_valley')).toBe('Fox Valley')
    expect(describeOldValue('status', 'closed')).toBe('Closed')
    expect(describeOldValue('show_names', false)).toBe('No')
    expect(describeOldValue('visible_until', null)).toBe('Indefinitely')
    expect(describeOldValue('capacity', null)).toBe('No limit')
    expect(describeOldValue('site', '')).toBe('(empty)')
    expect(describeOldValue('eligible_positions', ['apc'])).toBe('APCs')
    expect(describeOldValue('title', 'Wellness Committee')).toBe('Wellness Committee')
    expect(describeOldValue('signup_deadline', '2026-10-05')).toBe(formatDate('2026-10-05'))
  })
})
