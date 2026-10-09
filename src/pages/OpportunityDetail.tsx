import { useRef, useState, type FormEvent, type ReactNode } from 'react'
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
  UserPlus,
  Users,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useProfile } from '../auth/AuthContext'
import { Avatar } from '../components/Avatars'
import { SignupBadge } from '../components/Badges'
import OppIcon from '../components/OppIcon'
import Celebrate from '../components/Celebrate'
import ConfirmAction from '../components/ConfirmAction'
import CountUp from '../components/CountUp'
import Description from '../components/Description'
import EmailPeople from '../components/EmailPeople'
import LoadError from '../components/LoadError'
import {
  byId,
  categoriesByOpportunity,
  fetchCategories,
  fetchCounts,
  fetchOpportunity,
  fetchOpportunityCategories,
  fetchOwners,
  fetchProfiles,
  fetchSignupsFor,
  useLoader,
} from '../lib/data'
import {
  canSignUp,
  COMMITMENT_LABELS,
  contactsOf,
  deadlinePassed,
  describeOldValue,
  displayName,
  eligibilityGroup,
  eligibilityLabel,
  eligibilityPhrase,
  fieldLabel,
  FORMAT_LABELS,
  formatDate,
  formatDateTime,
  isExpired,
  locationText,
  POSITION_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
} from '../lib/format'
import { friendlyError, supabase } from '../lib/supabase'
import type { OpportunityChange, OpportunityOwner, Profile, Signup, SignupStatus } from '../lib/types'

export default function OpportunityDetail() {
  const { id = '' } = useParams()
  const profile = useProfile()
  const { data, error, loading, reload } = useLoader(async () => {
    const [opp, signups, profiles, counts, categories, links, owners] = await Promise.all([
      fetchOpportunity(id),
      fetchSignupsFor(id), // only rows this person may see
      fetchProfiles(),
      fetchCounts(),
      fetchCategories(),
      fetchOpportunityCategories(),
      fetchOwners(id),
    ])
    const topics = categoriesByOpportunity(links, categories).get(id) ?? []
    // Edit history is admin-only (the database returns nothing to anyone else).
    let history: OpportunityChange[] = []
    if (profile.role === 'admin') {
      const result = await supabase
        .from('opportunity_history')
        .select('*')
        .eq('opportunity_id', id)
        .order('id', { ascending: false })
      if (result.error) throw new Error(result.error.message)
      history = result.data as OpportunityChange[]
    }
    return [opp, signups, profiles, counts.get(id), topics, owners, history] as const
  }, [id, profile.role])
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [ownerNotice, setOwnerNotice] = useState<string | null>(null)
  // Moments of delight: a burst on Commit, a ripple on Interested.
  const [celebrateKey, setCelebrateKey] = useState(0)
  const [justJoined, setJustJoined] = useState(false)
  const [rippleKey, setRippleKey] = useState(0)
  const statusRef = useRef<HTMLElement>(null)

  if (error) return <LoadError what="this opportunity" error={error} onRetry={reload} />
  if (loading && !data) return <p className="muted">Loading…</p>
  if (!data) return null

  const [opp, signups, profiles, counts, topics, owners, history] = data
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
  const eligible = canSignUp(opp, profile)
  // Buttons only for eligible positions; anyone can still withdraw below.
  const isOpen = opp.status === 'open' && !deadlinePassed(opp) && !expired && eligible
  const eligibilityKey = eligibilityGroup(opp.eligible_positions)
  const whoLabel = eligibilityLabel(opp.eligible_positions)
  const isAdmin = profile.role === 'admin'
  const isOwner = owners.some((o) => o.user_id === profile.id)
  // Owners edit without the poster role (0007); posting new ones still needs it.
  const canEdit = isAdmin || isOwner
  // Names: admins and owners always; everyone else only if the owners allow it.
  const namesVisible = isAdmin || isOwner || opp.show_names
  const manages = isAdmin || isOwner
  const committedCount = counts?.committed ?? 0
  const full = opp.capacity !== null && committedCount >= opp.capacity

  async function change(status: SignupStatus) {
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
    setJustJoined(result === 'committed')
    if (result === 'committed') setCelebrateKey((k) => k + 1)
    if (result === 'interested') setRippleKey((k) => k + 1)
    await reload()
  }

  const group = (statuses: SignupStatus[]) => signups.filter((s) => statuses.includes(s.status))

  const facts: { icon: typeof Clock; label: string; value: ReactNode }[] = []
  facts.push({ icon: MapPin, label: 'Location', value: locationText(opp) })
  facts.push({ icon: Monitor, label: 'Format', value: FORMAT_LABELS[opp.format] })
  facts.push({ icon: Users, label: 'Who can sign up', value: whoLabel })
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
  const contacts = contactsOf(opp)
  if (contacts.length > 0) {
    facts.push({
      icon: Mail,
      label: contacts.length === 1 ? 'Contact' : 'Contacts',
      value: (
        <span className="contact-list">
          {contacts.map((c, i) => (
            <span key={i}>
              {c.name}
              {c.email && (
                <>
                  {c.name ? ' · ' : ''}
                  <a href={`mailto:${c.email}`}>{c.email}</a>
                </>
              )}
            </span>
          ))}
        </span>
      ),
    })
  }

  return (
    <div className="stack-lg">
      <Link to="/" className="back-link">
        <ArrowLeft size={16} aria-hidden="true" /> All opportunities
      </Link>

      <header className={`detail-hero opp-${eligibilityKey}`}>
        <span className="detail-icon">
          <OppIcon type={opp.type} topics={topics.map((t) => t.name)} size={30} />
        </span>
        <div className="detail-heading">
          <p className="eyebrow">
            {TYPE_LABELS[opp.type]}
            {eligibilityKey !== 'everyone' ? ` · ${whoLabel} only` : ''}
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

      {ownerNotice && <p className="notice">{ownerNotice}</p>}

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
          <section ref={statusRef} className="panel panel-action stack">
            <h2 className="panel-title">Your status</h2>
            {justJoined && current === 'committed' && (
              <p className="joined">
                <svg className="joined-check" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="10.5" />
                  <path d="M7.5 12.5l3 3 6-6.5" />
                </svg>
                You're in!
              </p>
            )}
            {current && current !== 'withdrawn' ? (
              <p>
                <span key={rippleKey} className={rippleKey ? 'ripple' : undefined}>
                  <SignupBadge status={current} />
                </span>
              </p>
            ) : (
              <p className="muted">{eligible ? 'You have not signed up yet.' : 'View only for your position.'}</p>
            )}

            {current === 'completed' || current === 'no_show' ? (
              <p className="small muted">Attendance has been recorded.</p>
            ) : (
              <div className="stack-sm">
                {isOpen && current !== 'committed' && current !== 'waitlisted' && (
                  <button
                    className="btn btn-primary"
                    disabled={busy}
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
                {current === 'committed' && (
                  <ConfirmAction
                    label="Withdraw"
                    question="Give up your spot?"
                    detail={opp.capacity ? 'If anyone is on the waitlist, the next person gets it.' : undefined}
                    confirmLabel="Yes, give up my spot"
                    cancelLabel="Keep it"
                    disabled={busy}
                    onConfirm={() => change('withdrawn')}
                  />
                )}
                {(current === 'interested' || current === 'waitlisted') && (
                  <button className="btn btn-link danger" disabled={busy} onClick={() => void change('withdrawn')}>
                    {current === 'interested' ? 'Remove my interest' : 'Leave the waitlist'}
                  </button>
                )}
                {!eligible && (
                  <p className="small muted">
                    This is open to {eligibilityPhrase(opp.eligible_positions)} only. You can view it for future reference.
                  </p>
                )}
                {eligible && !isOpen && (
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
                <PeopleList title="Committed" rows={group(['committed', 'completed'])} people={people} linked={manages} />
                <PeopleList title="Waitlist" rows={group(['waitlisted'])} people={people} linked={manages} ordered />
                <PeopleList title="Interested" rows={group(['interested'])} people={people} linked={manages} />
                {manages && (
                  <PeopleList title="Withdrawn" rows={group(['withdrawn', 'no_show'])} people={people} linked />
                )}
                {manages && (
                  <EmailPeople
                    subject={opp.title}
                    groups={[
                      { label: 'Committed', people: profilesOf(group(['committed', 'completed']), people) },
                      { label: 'Waitlist', people: profilesOf(group(['waitlisted']), people) },
                      { label: 'Interested', people: profilesOf(group(['interested']), people) },
                    ]}
                  />
                )}
                {manages && (
                  <p className="small muted">
                    {opp.show_names
                      ? 'Everyone signed in can see these names.'
                      : "Only this post's owners and admins can see these names."}
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="count-row">
                  <span>
                    <strong><CountUp value={counts?.committed ?? 0} /></strong> committed
                  </span>
                  <span>
                    <strong><CountUp value={counts?.interested ?? 0} /></strong> interested
                  </span>
                  {(counts?.waitlisted ?? 0) > 0 && (
                    <span>
                      <strong><CountUp value={counts?.waitlisted ?? 0} /></strong> waitlisted
                    </span>
                  )}
                </div>
                <p className="small muted names-hidden">
                  <EyeOff size={14} aria-hidden="true" /> Names are visible to the post's owners and admins.
                </p>
              </>
            )}
          </section>

          {manages && (
            <OwnersPanel
              opportunityId={opp.id}
              owners={owners}
              people={people}
              me={profile.id}
              isAdmin={isAdmin}
              onChange={reload}
              onSteppedDown={() => setOwnerNotice('You are no longer an owner of this post.')}
            />
          )}
        </aside>
      </div>

      {isAdmin && <EditHistory changes={history} people={people} />}
      <Celebrate burstKey={celebrateKey} anchor={statusRef} />
    </div>
  )
}

// Admin-only list of past edits, newest first, with the old values so a
// wiped or mistaken change can be copied back through Edit.
function EditHistory({ changes, people }: { changes: OpportunityChange[]; people: Map<string, Profile> }) {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <section className="panel stack edit-history">
      <h2 className="panel-title">Edit history</h2>
      {changes.length === 0 ? (
        <p className="small muted">No edits since this was posted (or since edit history started).</p>
      ) : (
        <ul className="list">
          {changes.map((c) => (
            <li key={c.id} className="stack-sm">
              <div className="row between wrap gap-sm">
                <span>
                  <strong>{c.changed_fields.map(fieldLabel).join(', ')}</strong>
                  <span className="small muted">
                    {' '}
                    · {formatDateTime(c.changed_at)} ·{' '}
                    {c.changed_by ? displayName(people.get(c.changed_by)) : 'Supabase dashboard'}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn btn-link small"
                  aria-expanded={open === c.id}
                  onClick={() => setOpen(open === c.id ? null : c.id)}
                >
                  {open === c.id ? 'Hide old values' : 'Show old values'}
                </button>
              </div>
              {open === c.id && (
                <dl className="history-old">
                  {c.changed_fields.map((f) => (
                    <div key={f}>
                      <dt>{fieldLabel(f)} was</dt>
                      <dd>{describeOldValue(f, c.old_values[f])}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="small muted">Only admins see this. To undo a change, copy the old value back in with Edit.</p>
    </section>
  )
}

function profilesOf(rows: Signup[], people: Map<string, Profile>): Profile[] {
  return rows.map((s) => people.get(s.user_id)).filter((p): p is Profile => Boolean(p))
}

// Who owns this post. Admins add owners by email (the person must have signed
// in once) and remove them; the database enforces both.
function OwnersPanel({
  opportunityId,
  owners,
  people,
  me,
  isAdmin,
  onChange,
  onSteppedDown,
}: {
  opportunityId: string
  owners: OpportunityOwner[]
  people: Map<string, Profile>
  me: string
  isAdmin: boolean
  onChange: () => Promise<void>
  onSteppedDown: () => void
}) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const canStepDown = !isAdmin && owners.length > 1

  async function add(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    const typed = email.trim()
    const { data: result, error: rpcError } = await supabase.rpc('add_opportunity_owner', {
      p_opportunity_id: opportunityId,
      p_email: typed,
    })
    setBusy(false)
    if (rpcError) {
      setError(friendlyError(rpcError))
      return
    }
    setEmail('')
    setNotice(
      result === 'already'
        ? `${typed} is already an owner.`
        : result === 'added_poster'
          ? `${typed} is now a co-owner. They were also made a poster.`
          : `${typed} is now a co-owner. They can edit this post and see every name on it.`,
    )
    await onChange()
  }

  // Admins only: the database refuses this for anyone else.
  async function remove(owner: OpportunityOwner) {
    setError(null)
    setNotice(null)
    setBusy(true)
    const { error: rpcError } = await supabase.rpc('admin_remove_opportunity_owner', {
      p_opportunity_id: opportunityId,
      p_user_id: owner.user_id,
    })
    setBusy(false)
    if (rpcError) {
      setError(friendlyError(rpcError))
      return
    }
    await onChange()
  }

  async function stepDown() {
    setError(null)
    setNotice(null)
    setBusy(true)
    const { error: rpcError } = await supabase.rpc('step_down_as_owner', { p_opportunity_id: opportunityId })
    setBusy(false)
    if (rpcError) {
      setError(friendlyError(rpcError))
      return
    }
    onSteppedDown()
    await onChange()
  }

  return (
    <section className="panel stack owners-panel">
      <h2 className="panel-title">Owners</h2>
      {owners.length === 0 ? (
        <p className="small muted">No owners yet. Only admins can edit this post.</p>
      ) : (
        <ul className="people">
          {owners.map((o) => {
            const person = people.get(o.user_id)
            return (
              <li key={o.user_id}>
                {person && <Avatar person={person} size={30} />}
                <span className="owner-name">
                  {displayName(person)}
                  {o.user_id === me && <span className="muted small"> (you)</span>}
                </span>
                {isAdmin && (
                  <ConfirmAction
                    label="Remove"
                    ariaLabel={`Remove ${displayName(person)} as an owner`}
                    className="btn btn-link danger small"
                    question={`Remove ${o.user_id === me ? 'yourself' : displayName(person)} as an owner?`}
                    detail="They will no longer be able to edit this post or see its names."
                    confirmLabel="Yes, remove"
                    disabled={busy}
                    onConfirm={() => remove(o)}
                  />
                )}
                {o.user_id === me && canStepDown && (
                  <ConfirmAction
                    label="Step down"
                    className="btn btn-link danger small"
                    question="Step down as an owner?"
                    detail="You will no longer be able to edit this post or see its names."
                    confirmLabel="Yes, step down"
                    disabled={busy}
                    onConfirm={stepDown}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
      <form className="stack-sm" onSubmit={(e) => void add(e)}>
        <label className="field">
          <span>Add a co-owner by work email</span>
          <input
            type="email"
            required
            placeholder="name@ems-wi.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button className="btn btn-secondary" disabled={busy}>
          <UserPlus size={15} aria-hidden="true" /> Add co-owner
        </button>
      </form>
      <p className="small muted">
        Owners can edit this post, see every name on it and email those people. A new co-owner must have signed in to
        the site at least once.{' '}
        {isAdmin
          ? 'Only admins can remove someone else.'
          : owners.length > 1
            ? 'You can step down yourself; only admins can remove someone else.'
            : 'You are the only owner, so add a co-owner before you can step down. Only admins can remove someone else.'}
      </p>
      {notice && <p className="notice">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  )
}

function PeopleList({
  title,
  rows,
  people,
  ordered,
  linked,
}: {
  title: string
  rows: Signup[]
  people: Map<string, Profile>
  ordered?: boolean
  linked?: boolean
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
                  {linked && person ? <a href={`mailto:${person.email}`}>{displayName(person)}</a> : displayName(person)}
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
