import type { ReactNode } from 'react'
import { Printer } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useProfile } from '../auth/AuthContext'
import { SignupBadge } from '../components/Badges'
import LoadError from '../components/LoadError'
import { byId, fetchOpportunities, useLoader } from '../lib/data'
import { formatDate, locationText, TYPE_LABELS } from '../lib/format'
import { buildServiceRecord, type ServiceRow } from '../lib/serviceRecord'
import { supabase } from '../lib/supabase'
import type { Opportunity, OpportunityOwner, Signup, SignupEvent } from '../lib/types'

export default function MySignups() {
  const profile = useProfile()
  const { data, error, loading, reload } = useLoader(async () => {
    const [opps, mine, events, owned] = await Promise.all([
      fetchOpportunities(),
      supabase.from('signups').select('*').eq('user_id', profile.id).order('status_changed_at', { ascending: false }),
      supabase.from('signup_events').select('*').eq('user_id', profile.id).order('changed_at').order('id'),
      supabase.from('opportunity_owners').select('*').eq('user_id', profile.id).order('added_at'),
    ])
    if (mine.error) throw new Error(mine.error.message)
    if (events.error) throw new Error(events.error.message)
    if (owned.error) throw new Error(owned.error.message)
    return [opps, mine.data as Signup[], events.data as SignupEvent[], owned.data as OpportunityOwner[]] as const
  }, [profile.id])

  if (error) return <LoadError what="your sign-ups" error={error} onRetry={reload} />
  if (loading && !data) return <p className="muted">Loading…</p>
  if (!data) return null

  const [opps, mine, events, owned] = data
  const oppMap = byId(opps as Opportunity[])
  const record = buildServiceRecord(mine, events, owned, profile.id)
  const active = mine.filter((s) => ['committed', 'waitlisted', 'interested'].includes(s.status))
  const past = mine.filter((s) => !['committed', 'waitlisted', 'interested'].includes(s.status))

  return (
    <div className="stack-lg narrow">
      <h1>My sign-ups</h1>
      <ServiceRecordCard current={record.current} past={record.past} oppMap={oppMap} />
      <SignupTable title="Current" rows={active} oppMap={oppMap} empty={<>Nothing yet. <Link to="/">Browse opportunities</Link>.</>} />
      {past.length > 0 && <SignupTable title="Past, withdrawn and reviewed" rows={past} oppMap={oppMap} />}
    </div>
  )
}

const ROLE_LABELS: Record<ServiceRow['role'], string> = { lead: 'Lead', member: 'Member', took_part: 'Took part' }

// Committee service at a glance: what you lead or serve on now, and before.
function ServiceRecordCard({
  current,
  past,
  oppMap,
}: {
  current: ServiceRow[]
  past: ServiceRow[]
  oppMap: Map<string, Opportunity>
}) {
  const title = (r: ServiceRow) => {
    const opp = oppMap.get(r.opportunityId)
    return opp ? <Link to={`/o/${opp.id}`}>{opp.title}</Link> : 'Removed opportunity'
  }
  return (
    <section className="card stack service-record">
      <div className="row between wrap gap-sm">
        <h2>My service record</h2>
        <button type="button" className="btn btn-secondary btn-small no-print" onClick={() => window.print()}>
          <Printer size={14} aria-hidden="true" /> Print or save as PDF
        </button>
      </div>
      {current.length === 0 && past.length === 0 ? (
        <p className="muted">Nothing yet. When a lead adds you to a committee or confirms you for something, it shows here.</p>
      ) : (
        <>
          {current.length > 0 && (
            <ul className="list">
              {current.map((r) => (
                <li key={`${r.opportunityId}-${r.role}`} className="row between wrap gap-sm">
                  <span>
                    {title(r)}
                    {r.since && <span className="small muted"> · since {formatDate(r.since)}</span>}
                  </span>
                  <span className={`tag ${r.role === 'lead' ? 'tag-lead' : ''}`}>{ROLE_LABELS[r.role]}</span>
                </li>
              ))}
            </ul>
          )}
          {past.length > 0 && (
            <>
              <h3>Before</h3>
              <ul className="list">
                {past.map((r, i) => (
                  <li key={`${r.opportunityId}-${i}`} className="row between wrap gap-sm">
                    <span>
                      {title(r)}
                      <span className="small muted">
                        {' · '}
                        {r.role === 'took_part'
                          ? formatDate(r.until!)
                          : `${r.since ? formatDate(r.since) : '?'} to ${formatDate(r.until!)}`}
                      </span>
                    </span>
                    <span className="tag">{ROLE_LABELS[r.role]}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      <p className="small muted">Something missing or wrong? Ask the committee's lead; leads keep member lists up to date.</p>
    </section>
  )
}

function SignupTable({
  title,
  rows,
  oppMap,
  empty,
}: {
  title: string
  rows: Signup[]
  oppMap: Map<string, Opportunity>
  empty?: ReactNode
}) {
  return (
    <section className="card stack">
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <ul className="list">
          {rows.map((s) => {
            const opp = oppMap.get(s.opportunity_id)
            return (
              <li key={s.id} className="row between wrap gap-sm">
                <div>
                  {opp ? <Link to={`/o/${opp.id}`}>{opp.title}</Link> : 'Removed opportunity'}
                  {opp && (
                    <div className="small muted">
                      {TYPE_LABELS[opp.type]} · {locationText(opp)}
                      {opp.start_date ? ` · ${formatDate(opp.start_date)}` : ''}
                    </div>
                  )}
                </div>
                <SignupBadge status={s.status} />
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
