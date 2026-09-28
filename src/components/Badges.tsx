import { AUDIENCE_LABELS, COMMITMENT_LABELS, SIGNUP_LABELS, STATUS_LABELS, TYPE_LABELS } from '../lib/format'
import type { Opportunity, SignupStatus } from '../lib/types'

export function OpportunityBadges({ opp }: { opp: Opportunity }) {
  return (
    <div className="badges">
      <span className={`badge badge-type-${opp.type}`}>{TYPE_LABELS[opp.type]}</span>
      {opp.audience !== 'all' && (
        <span className="badge badge-audience">{AUDIENCE_LABELS[opp.audience]} only</span>
      )}
      <span className="badge">{COMMITMENT_LABELS[opp.commitment]}</span>
      {opp.new_hire_friendly && <span className="badge badge-newhire">Good for new hires</span>}
      {opp.status !== 'open' && (
        <span className={`badge badge-status-${opp.status}`}>{STATUS_LABELS[opp.status]}</span>
      )}
    </div>
  )
}

export function SignupBadge({ status }: { status: SignupStatus }) {
  return <span className={`badge badge-signup-${status}`}>{SIGNUP_LABELS[status]}</span>
}
