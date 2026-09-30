// Group emails open in the person's own mail app (Outlook), with everyone in
// Bcc so recipients do not see each other's addresses.

export function uniqueEmails(emails: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of emails) {
    const email = raw.trim()
    const key = email.toLowerCase()
    if (email && !seen.has(key)) {
      seen.add(key)
      out.push(email)
    }
  }
  return out
}

export function bccMailto(emails: string[], subject: string): string {
  return `mailto:?bcc=${uniqueEmails(emails).join(',')}&subject=${encodeURIComponent(subject)}`
}

// For pasting into Outlook's Bcc line, which separates addresses with ";".
export function pasteList(emails: string[]): string {
  return uniqueEmails(emails).join('; ')
}

// A new, blank message in Outlook on the web (work accounts), with the
// subject filled in. Addresses are pasted into Bcc from a Copy button, since
// the web version's support for a Bcc list in a link is not documented.
export function outlookWebCompose(subject: string): string {
  return `https://outlook.office.com/mail/deeplink/compose?subject=${encodeURIComponent(subject)}`
}
