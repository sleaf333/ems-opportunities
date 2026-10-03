import { describe, expect, it } from 'vitest'
import { canSignUp, cleanContacts, contactsOf, describeOldValue, mergeContacts, ELIGIBILITY_GROUPS, eligibilityGroup, eligibilityLabel, eligibilityPhrase, fieldLabel, formatDate } from './format'
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

describe('main page sections', () => {
  it('puts APC-only posts before the physician groups, which stay together', () => {
    expect(ELIGIBILITY_GROUPS.map((g) => g.key)).toEqual([
      'everyone', 'clinical', 'apc', 'physicians', 'track', 'shareholders', 'admin_staff',
    ])
  })
})

describe('contacts', () => {
  const opp = (contacts: { name: string; email: string }[], name = '', email = '') =>
    ({ contacts, contact_name: name, contact_email: email }) as Parameters<typeof contactsOf>[0]

  it('uses the list, or falls back to the single old contact', () => {
    expect(contactsOf(opp([{ name: 'A', email: 'a@ems-wi.com' }], 'Old', 'old@ems-wi.com'))).toEqual([
      { name: 'A', email: 'a@ems-wi.com' },
    ])
    expect(contactsOf(opp([], 'Old', 'old@ems-wi.com'))).toEqual([{ name: 'Old', email: 'old@ems-wi.com' }])
    expect(contactsOf(opp([]))).toEqual([])
  })

  it('tidies typed rows: trims, drops blanks and repeated emails', () => {
    const { contacts, error } = cleanContacts([
      { name: ' Ann ', email: ' Ann@ems-wi.com ' },
      { name: '', email: '' },
      { name: 'Ann again', email: 'ann@EMS-WI.com' },
      { name: 'Office', email: '' },
    ])
    expect(error).toBeNull()
    expect(contacts).toEqual([
      { name: 'Ann', email: 'Ann@ems-wi.com' },
      { name: 'Office', email: '' },
    ])
  })

  it('explains bad emails and too many contacts', () => {
    expect(cleanContacts([{ name: 'X', email: 'not-an-email' }]).error).toContain('does not look like an email')
    const many = Array.from({ length: 11 }, (_, i) => ({ name: `P${i}`, email: `p${i}@ems-wi.com` }))
    expect(cleanContacts(many).error).toContain('up to 10')
  })

  it('adds owners only once', () => {
    const current = [{ name: 'Ann', email: 'ann@ems-wi.com' }, { name: '', email: '' }]
    const owners = [{ name: 'Ann', email: 'ANN@ems-wi.com' }, { name: 'Bo', email: 'bo@ems-wi.com' }]
    expect(mergeContacts(current, owners)).toEqual([
      { name: 'Ann', email: 'ann@ems-wi.com' },
      { name: 'Bo', email: 'bo@ems-wi.com' },
    ])
  })

  it('reads well in the edit history', () => {
    expect(describeOldValue('contacts', [{ name: 'Ann', email: 'ann@ems-wi.com' }, { name: 'Office', email: '' }])).toBe(
      'Ann (ann@ems-wi.com), Office',
    )
    expect(describeOldValue('contacts', [])).toBe('(empty)')
    expect(fieldLabel('contacts')).toBe('Contacts')
  })
})
