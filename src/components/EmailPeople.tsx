import { useState } from 'react'
import { Copy, ExternalLink, Mail } from 'lucide-react'
import { bccMailto, outlookWebCompose, pasteList, uniqueEmails } from '../lib/email'
import type { Profile } from '../lib/types'

export interface EmailGroup {
  label: string
  people: Profile[]
}

// One row per group (Committed, Waitlist, Interested, and Everyone when there
// is more than one group): Copy puts the addresses on the clipboard for
// pasting into Bcc (works with Outlook on the web), Email opens the
// computer's default mail app. "Open Outlook on the web" starts a new message.
export default function EmailPeople({ subject, groups }: { subject: string; groups: EmailGroup[] }) {
  const [copied, setCopied] = useState<string | null>(null)
  const filled = groups.filter((g) => g.people.length > 0)
  if (filled.length === 0) return null

  const rows = filled.map((g) => ({ label: g.label, emails: uniqueEmails(g.people.map((p) => p.email)) }))
  if (rows.length > 1) rows.push({ label: 'Everyone', emails: uniqueEmails(rows.flatMap((r) => r.emails)) })

  async function copy(label: string, emails: string[]) {
    const text = pasteList(emails)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      window.setTimeout(() => setCopied((c) => (c === label ? null : c)), 2500)
    } catch {
      window.prompt('Copy these addresses, then paste them into Bcc:', text)
    }
  }

  return (
    <div className="email-people">
      <ul className="email-rows">
        {rows.map((r) => (
          <li key={r.label}>
            <span className="email-row-label">
              {r.label} <span className="count">{r.emails.length}</span>
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => void copy(r.label, r.emails)}
              aria-label={`Copy ${r.label.toLowerCase()} emails`}
            >
              <Copy size={14} aria-hidden="true" /> {copied === r.label ? 'Copied' : 'Copy'}
            </button>
            <a className="btn btn-link small" href={bccMailto(r.emails, subject)} aria-label={`Email ${r.label.toLowerCase()}`}>
              <Mail size={14} aria-hidden="true" /> Email
            </a>
          </li>
        ))}
      </ul>
      <div className="email-web">
        <a className="btn btn-link small" href={outlookWebCompose(subject)} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={14} aria-hidden="true" /> Open Outlook on the web
        </a>
        <span className="small muted">Copy a group, then paste into the Bcc line.</span>
      </div>
      <span className="visually-hidden" role="status">{copied ? `${copied} emails copied` : ''}</span>
    </div>
  )
}
