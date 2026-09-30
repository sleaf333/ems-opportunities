import { describe, expect, it } from 'vitest'
import { bccMailto, pasteList, uniqueEmails } from './email'

describe('group email helpers', () => {
  it('drops blanks and duplicates, ignoring case', () => {
    expect(uniqueEmails(['a@ems-wi.com', ' A@ems-wi.com', '', 'b@ems-wi.com'])).toEqual(['a@ems-wi.com', 'b@ems-wi.com'])
  })

  it('puts everyone in Bcc and encodes the subject', () => {
    expect(bccMailto(['a@ems-wi.com', 'b@ems-wi.com'], 'Wellness & Peer Support')).toBe(
      'mailto:?bcc=a@ems-wi.com,b@ems-wi.com&subject=Wellness%20%26%20Peer%20Support',
    )
  })

  it('makes a list Outlook accepts when pasted', () => {
    expect(pasteList(['a@ems-wi.com', 'b@ems-wi.com'])).toBe('a@ems-wi.com; b@ems-wi.com')
  })
})
