import { Link } from 'react-router-dom'
import { displayName, formatDate } from '../../lib/format'
import {
  type CommitteeHealth as Row,
  type HealthFlag,
  LIST_CHECK_DUE_DAYS,
  SUGGESTION_WINDOW_DAYS,
  WAITING_TOO_LONG_DAYS,
} from '../../lib/insights'

const FLAG_LABELS: Record<HealthFlag, string> = {
  no_lead: 'No lead',
  no_members: 'No members yet',
  waiting_long: `Waiting over ${WAITING_TOO_LONG_DAYS} days`,
  list_due: 'List check due',
  full: 'Full',
}

// One row per committee: lead, members, who is waiting, suggestions, and
// the last "List is up to date". Rows needing attention come first.
export default function CommitteeHealth({ rows, memberWord }: { rows: Row[]; memberWord: string }) {
  if (rows.length === 0) return <p className="small muted">No committees yet.</p>
  const needs = rows.filter((r) => r.flags.some((f) => f !== 'full')).length
  return (
    <div className="stack-sm">
      <p className="small">
        {needs === 0 ? 'Every committee looks fine.' : `${needs} of ${rows.length} need attention.`}
      </p>
      <div className="table-wrap">
        <table className="committee-health">
          <thead>
            <tr>
              <th>Committee</th>
              <th>Lead</th>
              <th className="num">{memberWord}</th>
              <th className="num" title="Raised a hand, waiting for the lead's decision">Waiting</th>
              <th className="num" title={`Suggested by members in the last ${SUGGESTION_WINDOW_DAYS} days`}>
                Suggested
              </th>
              <th title={`Leads are asked to confirm their list once a year (due after ${LIST_CHECK_DUE_DAYS} days)`}>
                List confirmed
              </th>
              <th>Needs attention</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.opportunity.id}>
                <td>
                  <Link to={`/o/${r.opportunity.id}`}>{r.opportunity.title}</Link>
                  {r.opportunity.status === 'closed' && <div className="small muted">Closed to new sign-ups</div>}
                </td>
                <td>{r.leads.length ? r.leads.map((p) => displayName(p)).join(', ') : <span className="muted">None</span>}</td>
                <td className="num">
                  <strong>{r.members}</strong>
                  {r.waitingToSignIn > 0 && <div className="small muted">+{r.waitingToSignIn} not signed in</div>}
                  {r.capacity ? (
                    <div className="small muted">
                      {r.seatsTaken} of {r.capacity} seats
                    </div>
                  ) : null}
                </td>
                <td className="num">
                  {r.waitingForDecision}
                  {r.oldestWaitDays !== null && <div className="small muted">oldest {r.oldestWaitDays} days</div>}
                </td>
                <td className="num">{r.suggestions}</td>
                <td>{r.lastCheck ? formatDate(r.lastCheck) : <span className="muted">Never</span>}</td>
                <td>
                  <div className="health-flags">
                    {r.flags.map((f) => (
                      <span key={f} className={`tag ${f === 'full' ? '' : 'tag-warn'}`}>
                        {FLAG_LABELS[f]}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
