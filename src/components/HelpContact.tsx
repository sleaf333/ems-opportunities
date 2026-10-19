import { HELP_CONTACT } from '../lib/format'

// Who to ask when something doesn't work or there's a question about the
// site. Shown in the footer, on the sign-in page, in load errors and on the
// What we track page. Change the name or address in HELP_CONTACT.
export default function HelpContact({ lead = 'Questions or something not working?' }: { lead?: string }) {
  const href = `mailto:${HELP_CONTACT.email}?subject=${encodeURIComponent('EMS Opportunities site')}`
  return (
    <span className="help-contact">
      {lead} Email {HELP_CONTACT.name} at <a href={href}>{HELP_CONTACT.email}</a>.
    </span>
  )
}
