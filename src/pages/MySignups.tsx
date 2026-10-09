import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useProfile } from '../auth/AuthContext'
import { SignupBadge } from '../components/Badges'
import LoadError from '../components/LoadError'
import { byId, fetchOpportunities, useLoader } from '../lib/data'
import { formatDate, locationText, TYPE_LABELS } from '../lib/format'
import { supabase } from '../lib/supabase'
import type { Opportunity, Signup } from '../lib/types'

export default function MySignups() {
  const profile = useProfile()
  const { data, error, loading, reload } = useLoader(async () => {
    const [opps, mine] = await Promise.all([
      fetchOpportunities(),
      supabase.from('signups').select('*').eq('user_id', profile.id).order('status_changed_at', { ascending: false }),
    ])
    if (mine.error) throw new Error(mine.error.message)
    return [opps, mine.data as Signup[]] as const
  }, [profile.id])

  if (error) return <LoadError what="your sign-ups" error={error} onRetry={reload} />
  if (loading && !data) return <p className="muted">Loading…</p>
  if (!data) return null

  const [opps, mine] = data
  const oppMap = byId(opps as Opportunity[])
  const active = mine.filter((s) => ['committed', 'waitlisted', 'interested'].includes(s.status))
  const past = mine.filter((s) => !['committed', 'waitlisted', 'interested'].includes(s.status))

  return (
    <div className="stack-lg narrow">
      <h1>My sign-ups</h1>
      <SignupTable title="Current" rows={active} oppMap={oppMap} empty={<>Nothing yet. <Link to="/">Browse opportunities</Link>.</>} />
      {past.length > 0 && <SignupTable title="Past and withdrawn" rows={past} oppMap={oppMap} />}
    </div>
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
