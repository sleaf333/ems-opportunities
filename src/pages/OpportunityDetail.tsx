import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useProfile } from '../auth/AuthContext'
import { OpportunityBadges, SignupBadge } from '../components/Badges'
import Description from '../components/Description'
import { byId, fetchOpportunity, fetchProfiles, fetchSignupsFor, useLoader } from '../lib/data'
import {
  AUDIENCE_LABELS,
  canCommit,
  deadlinePassed,
  displayName,
  formatDate,
  POSITION_LABELS,
} from '../lib/format'
import { friendlyError, supabase } from '../lib/supabase'
import type { Profile, Signup, SignupStatus } from '../lib/types'

export default function OpportunityDetail() {
  const { id = '' } = useParams()
  const profile = useProfile()
  const { data, error, loading, reload } = useLoader(
    () => Promise.all([fetchOpportunity(id), fetchSignupsFor(id), fetchProfiles()]),
    [id],
  )
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (error) return <p className="error">Could not load this opportunity: {error}</p>
  if (loading && !data) return <p className="muted">Loading…</p>
  if (!data) return null

  const [opp, signups, profiles] = data
  if (!opp) {
    return (
      <div className="card">
        <h1>Not found</h1>
        <p>This opportunity does not exist or is not visible to you.</p>
        <Link to="/">Back to opportunities</Link>
      </div>
    )
  }

  const people = byId(profiles)
  const mine = signups.find((s) => s.user_id === profile.id)
  const current = mine?.status
  const isOpen = opp.status === 'open' && !deadlinePassed(opp)
  const eligible = canCommit(opp, profile)
  const canEdit = profile.role === 'admin' || (profile.role === 'poster' && opp.created_by === profile.id)
  const committedCount = signups.filter((s) => s.status === 'committed').length
  const full = opp.capacity !== null && committedCount >= opp.capacity

  async function change(status: SignupStatus) {
    if (status === 'withdrawn' && current === 'committed' && !window.confirm('Give up your spot?')) return
    setBusy(true)
    setActionError(null)
    setNotice(null)
    const { data: result, error: rpcError } = await supabase.rpc('set_my_signup', {
      p_opportunity_id: id,
      p_status: status,
    })
    setBusy(false)
    if (rpcError) {
      setActionError(friendlyError(rpcError))
      return
    }
    if (result === 'waitlisted') {
      setNotice('All spots are taken, so you are on the waitlist. You will move up automatically if a spot opens.')
    }
    await reload()
  }

  const group = (statuses: SignupStatus[]) => signups.filter((s) => statuses.includes(s.status))

  return (
    <div className="stack-lg">
      <Link to="/" className="small">← All opportunities</Link>

      <div className="detail">
        <article className="card stack">
          <div className="row between wrap gap-sm">
            <h1>{opp.title}</h1>
            {canEdit && (
              <Link to={`/o/${opp.id}/edit`} className="btn btn-secondary">
                Edit
              </Link>
            )}
          </div>
          <OpportunityBadges opp={opp} />
          <Description text={opp.description} />

          <dl className="facts">
            <dt>Who can join</dt>
            <dd>{AUDIENCE_LABELS[opp.audience]}</dd>
            {opp.time_estimate && (
              <>
                <dt>Time</dt>
                <dd>{opp.time_estimate}</dd>
              </>
            )}
            {(opp.start_date || opp.end_date) && (
              <>
                <dt>Dates</dt>
                <dd>
                  {formatDate(opp.start_date)}
                  {opp.end_date && opp.end_date !== opp.start_date ? ` – ${formatDate(opp.end_date)}` : ''}
                </dd>
              </>
            )}
            {opp.signup_deadline && (
              <>
                <dt>Sign up by</dt>
                <dd>{formatDate(opp.signup_deadline)}</dd>
              </>
            )}
            <dt>Spots</dt>
            <dd>{opp.capacity ? `${committedCount} of ${opp.capacity} taken` : 'No limit'}</dd>
            {(opp.contact_name || opp.contact_email) && (
              <>
                <dt>Contact</dt>
                <dd>
                  {opp.contact_name}
                  {opp.contact_email && (
                    <>
                      {opp.contact_name ? ', ' : ''}
                      <a href={`mailto:${opp.contact_email}`}>{opp.contact_email}</a>
                    </>
                  )}
                </dd>
              </>
            )}
            {opp.tags.length > 0 && (
              <>
                <dt>Topics</dt>
                <dd>{opp.tags.join(', ')}</dd>
              </>
            )}
          </dl>
        </article>

        <aside className="stack">
          <section className="card stack">
            <h2>Your status</h2>
            {current && current !== 'withdrawn' ? (
              <p>
                <SignupBadge status={current} />
              </p>
            ) : (
              <p className="muted">You have not signed up.</p>
            )}

            {current === 'completed' || current === 'no_show' ? (
              <p className="small muted">Attendance has been recorded.</p>
            ) : (
              <div className="stack-sm">
                {isOpen && current !== 'interested' && current !== 'committed' && current !== 'waitlisted' && (
                  <button className="btn btn-secondary" disabled={busy} onClick={() => void change('interested')}>
                    I'm interested
                  </button>
                )}
                {isOpen && current !== 'committed' && current !== 'waitlisted' && (
                  <button
                    className="btn btn-primary"
                    disabled={busy || !eligible}
                    onClick={() => void change('committed')}
                  >
                    {full ? 'Join the waitlist' : 'Commit'}
                  </button>
                )}
                {isOpen && (current === 'committed' || current === 'waitlisted') && (
                  <button className="btn btn-secondary" disabled={busy} onClick={() => void change('interested')}>
                    Change to just interested
                  </button>
                )}
                {current && current !== 'withdrawn' && (
                  <button className="btn btn-link danger" disabled={busy} onClick={() => void change('withdrawn')}>
                    {current === 'interested' ? 'Remove my interest' : current === 'waitlisted' ? 'Leave the waitlist' : 'Withdraw'}
                  </button>
                )}
                {isOpen && !eligible && current !== 'committed' && (
                  <p className="small muted">
                    Committing is open to {AUDIENCE_LABELS[opp.audience].toLowerCase()} only, but you can still
                    show interest.
                  </p>
                )}
                {!isOpen && (
                  <p className="small muted">
                    {opp.status === 'open' ? 'The sign-up deadline has passed.' : 'This opportunity is not taking sign-ups.'}
                  </p>
                )}
              </div>
            )}
            {notice && <p className="notice">{notice}</p>}
            {actionError && <p className="error" role="alert">{actionError}</p>}
          </section>

          <section className="card stack">
            <h2>Who's in</h2>
            <PeopleList title="Committed" rows={group(['committed', 'completed'])} people={people} />
            <PeopleList title="Waitlist" rows={group(['waitlisted'])} people={people} ordered />
            <PeopleList title="Interested" rows={group(['interested'])} people={people} />
            {canEdit && (
              <PeopleList title="Withdrawn (only posters and admins see this)" rows={group(['withdrawn', 'no_show'])} people={people} />
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}

function PeopleList({
  title,
  rows,
  people,
  ordered,
}: {
  title: string
  rows: Signup[]
  people: Map<string, Profile>
  ordered?: boolean
}) {
  if (rows.length === 0 && title !== 'Committed' && title !== 'Interested') return null
  const List = ordered ? 'ol' : 'ul'
  return (
    <div>
      <h3>
        {title} <span className="muted">({rows.length})</span>
      </h3>
      {rows.length === 0 ? (
        <p className="small muted">No one yet.</p>
      ) : (
        <List className="people">
          {rows.map((s) => {
            const person = people.get(s.user_id)
            return (
              <li key={s.id}>
                {displayName(person)}
                {person?.position && <span className="muted small"> · {POSITION_LABELS[person.position]}</span>}
              </li>
            )
          })}
        </List>
      )}
    </div>
  )
}
