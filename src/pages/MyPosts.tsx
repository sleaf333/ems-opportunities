import { useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useProfile } from '../auth/AuthContext'
import EmailPeople, { type EmailGroup } from '../components/EmailPeople'
import LeadPeople from '../components/LeadPeople'
import LoadError from '../components/LoadError'
import { byId, fetchMemberListExtras, fetchOpportunities, fetchOwners, fetchProfiles, fetchSignups, useLoader } from '../lib/data'
import {
  displayName,
  eligibilityGroup,
  formatDate,
  isExpired,
  locationText,
  STATUS_LABELS,
  TYPE_LABELS,
} from '../lib/format'
import type { Opportunity, OpportunityOwner, PendingMember, Profile, RosterCheck, Signup, Suggestion } from '../lib/types'

// Posts the signed-in person owns (created, or added as an owner by an admin),
// with who signed up and quick ways to email them. Row-level security already
// limits full sign-up lists to owners and admins.
export default function MyPosts() {
  const profile = useProfile()
  const { data, error, loading, reload } = useLoader(
    () => Promise.all([fetchOpportunities(), fetchOwners(), fetchSignups(), fetchProfiles(), fetchMemberListExtras()]),
    [],
  )

  if (error) return <LoadError what="your posts" error={error} onRetry={reload} />
  if (loading && !data) return <p className="muted">Loading…</p>
  if (!data) return null

  const [opps, owners, signups, profiles, extras] = data
  const people = byId(profiles)
  const mineIds = new Set(owners.filter((o) => o.user_id === profile.id).map((o) => o.opportunity_id))
  const mine = opps
    .filter((o) => mineIds.has(o.id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  const live = mine.filter((o) => o.status === 'open' && !isExpired(o))
  const rest = mine.filter((o) => !live.includes(o))
  const canPost = profile.role === 'poster' || profile.role === 'admin'

  const card = (opp: Opportunity) => (
    <MyPost
      key={opp.id}
      opp={opp}
      owners={owners.filter((o) => o.opportunity_id === opp.id)}
      signups={signups.filter((s) => s.opportunity_id === opp.id)}
      people={people}
      pending={extras.pending.filter((w) => w.opportunity_id === opp.id)}
      lastCheck={extras.lastCheck.get(opp.id) ?? null}
      suggestions={extras.suggestions.filter((x) => x.opportunity_id === opp.id)}
      me={profile.id}
      canEdit
      onChanged={reload}
    />
  )

  return (
    <div className="stack-lg narrow">
      <div className="row between wrap gap-sm">
        <div>
          <h1>My posts</h1>
          <p className="muted">Posts you created or were added to as an owner.</p>
        </div>
        {canPost && (
          <Link to="/new" className="btn btn-primary">
            <Plus size={16} aria-hidden="true" /> Post something
          </Link>
        )}
      </div>

      {mine.length === 0 ? (
        <section className="card stack-sm">
          <p>You do not own any posts yet.</p>
          <p className="small muted">
            Posts you create show up here. So do posts an admin makes you an owner of
            {profile.role === 'admin' ? ' (to add owners, open a post and use the Owners box)' : ''}.
          </p>
        </section>
      ) : (
        <>
          <section className="stack">
            <h2 className="panel-title">Open now ({live.length})</h2>
            {live.length === 0 ? <p className="muted">None of your posts are open right now.</p> : live.map(card)}
          </section>
          {rest.length > 0 && (
            <section className="stack">
              <h2 className="panel-title">Closed, expired and drafts ({rest.length})</h2>
              {rest.map(card)}
            </section>
          )}
        </>
      )}
    </div>
  )
}

function MyPost({
  opp,
  owners,
  signups,
  people,
  pending,
  lastCheck,
  suggestions,
  me,
  canEdit,
  onChanged,
}: {
  opp: Opportunity
  owners: OpportunityOwner[]
  signups: Signup[]
  people: Map<string, Profile>
  pending: PendingMember[]
  lastCheck: RosterCheck | null
  suggestions: Suggestion[]
  me: string
  canEdit: boolean
  onChanged: () => Promise<void>
}) {
  const who = (statuses: Signup['status'][]) =>
    signups
      .filter((s) => statuses.includes(s.status))
      .map((s) => people.get(s.user_id))
      .filter((p): p is Profile => Boolean(p))
  const groups: EmailGroup[] = [
    { label: 'Confirmed', people: who(['committed', 'completed']) },
    { label: 'Waiting', people: who(['interested', 'waitlisted']) },
  ]
  const [confirmed, waiting] = groups
  // Open straight away when someone is waiting for a decision.
  const [open, setOpen] = useState(waiting.people.length > 0)
  const expired = isExpired(opp)
  const coOwners = owners.filter((o) => o.user_id !== me).map((o) => displayName(people.get(o.user_id)))

  return (
    <article className={`card mypost opp-${eligibilityGroup(opp.eligible_positions)}`}>
      <div className="mypost-head">
        <div>
          <p className="eyebrow muted">
            {TYPE_LABELS[opp.type]} · {locationText(opp)}
            {opp.status !== 'open' ? ` · ${STATUS_LABELS[opp.status]}` : ''}
            {expired ? ' · Expired' : ''}
          </p>
          <h3>
            <Link to={`/o/${opp.id}`}>{opp.title}</Link>
          </h3>
        </div>
        {canEdit && (
          <Link to={`/o/${opp.id}/edit`} className="btn btn-secondary btn-small" aria-label={`Edit ${opp.title}`}>
            <Pencil size={14} aria-hidden="true" /> Edit
          </Link>
        )}
      </div>

      <div className="count-row">
        <span>
          <strong>{confirmed.people.length}</strong> {opp.capacity ? `of ${opp.capacity} ` : ''}confirmed
        </span>
        <span className={waiting.people.length > 0 ? 'waiting-count' : undefined}>
          <strong>{waiting.people.length}</strong> waiting for your decision
        </span>
      </div>

      <p className="small muted">
        {opp.visible_until ? `Posted until ${formatDate(opp.visible_until)}` : 'Posted indefinitely'}
        {opp.signup_deadline ? ` · Sign up by ${formatDate(opp.signup_deadline)}` : ''}
        {coOwners.length > 0 ? ` · Co-owners: ${coOwners.join(', ')}` : ''}
      </p>

      <div className="mypost-actions">
        <button type="button" className="btn btn-link" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Hide people' : 'Manage people'}
        </button>
        <EmailPeople subject={opp.title} groups={groups} />
      </div>

      {open && (
        <LeadPeople
          opp={opp}
          signups={signups}
          people={people}
          pending={pending}
          lastCheck={lastCheck}
          suggestions={suggestions}
          onChanged={onChanged}
        />
      )}
    </article>
  )
}
