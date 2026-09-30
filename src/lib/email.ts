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
