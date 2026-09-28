import { useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  CalendarClock,
  CalendarDays,
  Clock,
  EyeOff,
  Hourglass,
  Mail,
  MapPin,
  Monitor,
  Pencil,
  Sprout,
  Ticket,
  Users,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useProfile } from '../auth/AuthContext'
import { Avatar } from '../components/Avatars'
import { SignupBadge } from '../components/Badges'
import OppIcon from '../components/OppIcon'
import Description from '../components/Description'
import {
  byId,
  categoriesByOpportunity,
  fetchCategories,
  fetchCounts,
  fetchOpportunity,
  fetchOpportunityCategories,
  fetchProfiles,
  fetchSignupsFor,
  useLoader,
} from '../lib/data'
import {
  AUDIENCE_LABELS,
  canCommit,
  COMMITMENT_LABELS,
  deadlinePassed,
  displayName,
  FORMAT_LABELS,
  formatDate,
  isExpired,
  locationText,
  POSITION_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
} from '../lib/format'
import { friendlyError, supabase } from '../lib/supabase'
import type { Profile, Signup, SignupStatus } from '../lib/types'

export default function OpportunityDetail() {
  const { id = '' } = useParams()
  const profile = useProfile()
  const { data, error, loading, reload } = useLoader(async () => {
    const [opp, signups, profiles, counts, categories, links] = await Promise.all([
      fetchOpportunity(id),
      fetchSignupsFor(id), // only rows this person may see
      fetchProfiles(),
      fetchCounts(),
      fetchCategories(),
      fetchOpportunityCategories(),
    ])
    const topics = categoriesByOpportunity(links, categories).get(id) ?? []
    return [opp, signups, profiles, counts.get(id), topics] as const
  }, [id])
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (error) return <p className="error">Could not load this opportunity: {error}</p>
  if (loading && !data) return <p className="muted">Loading…</p>
  if (!data) return null

  const [opp, signups, profiles, counts, topics] = data
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
  const expired = isExpired(opp)
  const isOpen = opp.status === 'open' && !deadlinePassed(opp) && !expired
  const eligible = canCommit(opp, profile)
  const isOwner = opp.created_by === profile.id
  const canEdit = profile.role === 'admin' || (profile.role === 'poster' && isOwner)
  // Names: admins and the poster always; everyone else only if the poster allows it.
  const namesVisible = profile.role === 'admin' || isOwner || opp.show_names
  const committedCount = counts?.committed ?? 0
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

  const facts: { icon: typeof Clock; label: string; value: ReactNode }[] = []
  facts.push({ icon: MapPin, label: 'Location', value: locationText(opp) })
  facts.push({ icon: Monitor, label: 'Format', value: FORMAT_LABELS[opp.format] })
  facts.push({ icon: Users, label: 'Who can commit', value: AUDIENCE_LABELS[opp.audience] })
  facts.push({ icon: Clock, label: 'Time', value: opp.time_estimate || COMMITMENT_LABELS[opp.commitment] })
  if (opp.start_date || opp.end_date) {
    facts.push({
      icon: CalendarDays,
      label: 'Dates',
      value:
        formatDate(opp.start_date) +
        (opp.end_date && opp.end_date !== opp.start_date ? ` – ${formatDate(opp.end_date)}` : ''),
    })
  }
  if (opp.signup_deadline) facts.push({ icon: CalendarClock, label: 'Sign up by', value: formatDate(opp.signup_deadline) })
  facts.push({
    icon: Hourglass,
    label: 'Posted until',
    value: opp.visible_until ? formatDate(opp.visible_until) : 'Indefinitely',
  })
  facts.push({
    icon: Ticket,
    label: 'Spots',
    value: opp.capacity ? `${committedCount} of ${opp.capacity} taken` : 'No limit',
  })
  if (opp.contact_name || opp.contact_email) {
    facts.push({
      icon: Mail,
      label: 'Contact',
      value: (
        <>
          {opp.contact_name}
          {opp.contact_email && (
            <>
              {opp.contact_name ? ' · ' : ''}
              <a href={`mailto:${opp.contact_email}`}>{opp.contact_email}</a>
            </>
          )}
        </>
      ),
    })
  }

  return (
    <div className="stack-lg">
      <Link to="/" className="back-link">
        <ArrowLeft size={16} aria-hidden="true" /> All opportunities
      </Link>

      <header className={`detail-hero opp-${opp.audience}`}>
        <span className="detail-icon">
          <OppIcon type={opp.type} topics={topics.map((t) => t.name)} size={30} />
        </span>
        <div className="detail-heading">
          <p className="eyebrow">
            {TYPE_LABELS[opp.type]}
            {opp.audience !== 'all' ? ` · ${AUDIENCE_LABELS[opp.audience]} only` : ''}
            {opp.status !== 'open' ? ` · ${STATUS_LABELS[opp.status]}` : ''}
            {expired ? ' · Expired' : ''}
          </p>
          <h1>{opp.title}</h1>
          {opp.new_hire_friendly && (
            <p className="opp-newhire">
              <Sprout size={14} aria-hidden="true" /> Good for new hires
            </p>
          )}
        </div>
        {canEdit && (
          <Link to={`/o/${opp.id}/edit`} className="btn btn-ghost detail-edit">
            <Pencil size={15} aria-hidden="true" /> Edit
          </Link>
        )}
      </header>

      {expired && (
        <p className="warning">
          This post is no longer shown on the site (it was posted until {formatDate(opp.visible_until)}).
          {canEdit ? ' Change the "Show on site until" date to put it back up.' : ''}
        </p>
      )}

      <div className="detail">
        <article className="panel stack">
          <h2 className="panel-title">About</h2>
          {opp.description ? <Description text={opp.description} /> : <p className="muted">No description yet.</p>}
          <ul className="facts">
            {facts.map(({ icon: Icon, label, value }) => (
              <li key={label}>
                <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                <span className="fact-label">{label}</span>
                <span className="fact-value">{value}</span>
              </li>
            ))}
          </ul>
          {topics.length > 0 && (
            <div className="tags">
              {topics.map((t) => (
                <span key={t.id} className="tag">{t.name}</span>
              ))}
            </div>
          )}
        </article>

        <aside className="stack">
          <section className="panel panel-action stack">
            <h2 className="panel-title">Your status</h2>
            {current && current !== 'withdrawn' ? (
              <p>
                <SignupBadge status={current} />
              </p>
            ) : (
              <p className="muted">You have not signed up yet.</p>
            )}

            {current === 'completed' || current === 'no_show' ? (
              <p className="small muted">Attendance has been recorded.</p>
            ) : (
              <div className="stack-sm">
                {isOpen && current !== 'committed' && current !== 'waitlisted' && (
                  <button
                    className="btn btn-primary"
                    disabled={busy || !eligible}
                    onClick={() => void change('committed')}
                  >
                    {full ? 'Join the waitlist' : 'Commit'}
                  </button>
                )}
                {isOpen && current !== 'interested' && current !== 'committed' && current !== 'waitlisted' && (
                  <button className="btn btn-secondary" disabled={busy} onClick={() => void change('interested')}>
                    I'm interested
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
                    {opp.status !== 'open'
                      ? 'This opportunity is not taking sign-ups.'
                      : expired
                        ? 'This post has expired.'
                        : 'The sign-up deadline has passed.'}
                  </p>
                )}
              </div>
            )}
            {notice && <p className="notice">{notice}</p>}
            {actionError && <p className="error" role="alert">{actionError}</p>}
          </section>

          <section className="panel stack">
            <h2 className="panel-title">Who's in</h2>
            {namesVisible ? (
              <>
                <PeopleList title="Committed" rows={group(['committed', 'completed'])} people={people} />
                <PeopleList title="Waitlist" rows={group(['waitlisted'])} people={people} ordered />
                <PeopleList title="Interested" rows={group(['interested'])} people={people} />
                {(canEdit || isOwner) && (
                  <PeopleList title="Withdrawn" rows={group(['withdrawn', 'no_show'])} people={people} />
                )}
                {(profile.role === 'admin' || isOwner) && (
                  <p className="small muted">
                    {opp.show_names
                      ? 'Everyone signed in can see these names.'
                      : 'Only you, the poster and admins can see these names.'}
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="count-row">
                  <span>
                    <strong>{counts?.committed ?? 0}</strong> committed
                  </span>
                  <span>
                    <strong>{counts?.interested ?? 0}</strong> interested
                  </span>
                  {(counts?.waitlisted ?? 0) > 0 && (
                    <span>
                      <strong>{counts?.waitlisted}</strong> waitlisted
                    </span>
                  )}
                </div>
                <p className="small muted names-hidden">
                  <EyeOff size={14} aria-hidden="true" /> Names are visible to the organizer and admins.
                </p>
              </>
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
  return (
    <div className="people-group">
      <h3>
        {title} <span className="count">{rows.length}</span>
      </h3>
      {rows.length === 0 ? (
        <p className="small muted">No one yet.</p>
      ) : (
        <ul className="people">
          {rows.map((s, i) => {
            const person = people.get(s.user_id)
            return (
              <li key={s.id}>
                {person && <Avatar person={person} size={30} />}
                <span>
                  {ordered && <span className="muted">{i + 1}. </span>}
                  {displayName(person)}
                  {person?.position && <span className="muted small"> · {POSITION_LABELS[person.position]}</span>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
