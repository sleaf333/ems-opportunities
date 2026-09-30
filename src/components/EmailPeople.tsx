import { useState } from 'react'
import { Copy, Mail } from 'lucide-react'
import { bccMailto, pasteList } from '../lib/email'
import type { Profile } from '../lib/types'

export interface EmailGroup {
  label: string
  people: Profile[]
}

// "Email everyone", one link per group, and a copy button for when a mail
// app will not open (or the list is too long for a link).
export default function EmailPeople({ subject, groups }: { subject: string; groups: EmailGroup[] }) {
  const [copied, setCopied] = useState(false)
  const filled = groups.filter((g) => g.people.length > 0)
  const everyone = filled.flatMap((g) => g.people.map((p) => p.email))
  if (everyone.length === 0) return null

  async function copy() {
    const text = pasteList(everyone)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      window.prompt('Copy these addresses, then paste them into Bcc:', text)
    }
  }

  return (
    <div className="email-people">
      <a className="btn btn-secondary btn-small" href={bccMailto(everyone, subject)}>
        <Mail size={15} aria-hidden="true" /> Email everyone ({new Set(everyone.map((e) => e.toLowerCase())).size})
      </a>
      {filled.length > 1 &&
        filled.map((g) => (
          <a key={g.label} className="btn btn-link" href={bccMailto(g.people.map((p) => p.email), subject)}>
            Email {g.label.toLowerCase()} ({g.people.length})
          </a>
        ))}
      <button type="button" className="btn btn-link" onClick={() => void copy()}>
        <Copy size={14} aria-hidden="true" /> {copied ? 'Copied' : 'Copy emails'}
      </button>
      <span className="visually-hidden" role="status">{copied ? 'Email addresses copied' : ''}</span>
    </div>
  )
}
