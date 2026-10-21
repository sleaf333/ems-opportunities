import { useEffect, useState, type FormEvent } from 'react'
import { Check, UserPlus } from 'lucide-react'
import ConfirmAction from './ConfirmAction'
import PersonPicker from './PersonPicker'
import { displayName, formatDate, POSITION_LABELS } from '../lib/format'
import { friendlyError, supabase } from '../lib/supabase'
import type { Opportunity, PendingMember, Profile, RosterCheck, Signup, SignupStatus } from '../lib/types'

type Decision = 'confirm' | 'not_selected' | 'undo' | 'remove'

const AFTER: Record<Decision, SignupStatus> = {
  confirm: 'committed',
  not_selected: 'not_selected',
  undo: 'interested',
  remove: 'withdrawn',
}

// Leads are asked to confirm their member list once a year.
const CHECK_DUE_DAYS = 335

// What a post's lead (its owners, or a site admin) uses to decide who joins:
// Confirm or Not this time for each raised hand, a Contacted tick, Undo, and
// adding people already on the committee (even before they sign in), Remove,
// and the once-a-year "List is up to date". The database (owner_decide_signup,
// owner_add_member, set_contacted, confirm_roster) enforces who may do this;
// this only shows the buttons.
export default function LeadPeople({
  opp,
  signups,
  people,
  pending = [],
  lastCheck = null,
  onChanged,
}: {
  opp: Opportunity
  signups: Signup[]
  people: Map<string, Profile>
  pending?: PendingMember[]
  lastCheck?: RosterCheck | null
  onChanged: () => Promise<void>
}) {
  // Changes made here, shown straight away while the page reloads.
  const [status, setStatus] = useState<Record<string, SignupStatus>>({})
  const [contacted, setContacted] = useState<Record<string, string | null>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  // Fresh data from the database replaces what was shown in the meantime.
  // Keyed on the content, not the array: My posts hands over a new array on
  // every render (including the one when a reload starts), which made a
  // just-clicked decision flash back to its old state.
  const fresh = signups.map((s) => `${s.id}:${s.status}:${s.contacted_at ?? ''}`).join('|')
  useEffect(() => {
    setStatus({})
    setContacted({})
  }, [fresh])

  const statusOf = (s: Signup) => status[s.id] ?? s.status
  const contactedOf = (s: Signup) => (s.id in contacted ? contacted[s.id] : s.contacted_at)
  const rows = (statuses: SignupStatus[]) =>
    signups
      .filter((s) => statuses.includes(statusOf(s)))
      .map((s) => ({ signup: s, person: people.get(s.user_id) }))
      .filter((r): r is { signup: Signup; person: Profile } => Boolean(r.person))
  const waiting = rows(['interested', 'waitlisted'])
  const confirmed = rows(['committed', 'completed'])
  const notNow = rows(['not_selected'])

  async function decide(signup: Signup, decision: Decision) {
    const before = statusOf(signup)
    setStatus((prev) => ({ ...prev, [signup.id]: AFTER[decision] }))
    setSaving(signup.id)
    setError(null)
    const { error: rpcError } = await supabase.rpc('owner_decide_signup', { p_signup_id: signup.id, p_decision: decision })
    setSaving(null)
    if (rpcError) {
      setStatus((prev) => ({ ...prev, [signup.id]: before }))
      setError(friendlyError(rpcError))
      return
    }
    await onChanged()
  }

  async function tick(signup: Signup, value: boolean) {
    const before = contactedOf(signup)
    setContacted((prev) => ({ ...prev, [signup.id]: value ? (before ?? new Date().toISOString()) : null }))
    setSaving(signup.id)
    setError(null)
    const { data, error: rpcError } = await supabase.rpc('set_contacted', { p_signup_id: signup.id, p_contacted: value })
    setSaving(null)
    if (rpcError) {
      setContacted((prev) => ({ ...prev, [signup.id]: before }))
      setError(friendlyError(rpcError))
      return
    }
    setContacted((prev) => ({ ...prev, [signup.id]: (data as string | null) ?? null }))
  }

  async function addMember(event: FormEvent) {
    event.preventDefault()
    setAdding(true)
    setError(null)
    setAdded(null)
    const typed = email.trim().toLowerCase()
    const { data, error: rpcError } = await supabase.rpc('owner_add_member', { p_opportunity_id: opp.id, p_email: typed })
    setAdding(false)
    if (rpcError) {
      setError(friendlyError(rpcError))
      return
    }
    setAdded(
      data === 'already'
        ? `${typed} is already on the list.`
        : data === 'pending'
          ? `${typed} has not signed in yet. They will be added automatically the first time they sign in.`
          : data === 'already_pending'
            ? `${typed} is already waiting to sign in.`
            : `Added ${typed} to the member list.`,
    )
    setEmail('')
    await onChanged()
  }

  async function cancelWaiting(waitingEmail: string) {
    setError(null)
    const { error: rpcError } = await supabase.rpc('remove_pending_member', {
      p_opportunity_id: opp.id,
      p_email: waitingEmail,
    })
    if (rpcError) {
      setError(friendlyError(rpcError))
      return
    }
    await onChanged()
  }

  async function confirmList() {
    setChecking(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('confirm_roster', { p_opportunity_id: opp.id })
    setChecking(false)
    if (rpcError) {
      setError(friendlyError(rpcError))
      return
    }
    await onChanged()
  }

  const checkDue =
    !lastCheck || Date.now() - Date.parse(lastCheck.checked_at) > CHECK_DUE_DAYS * 86_400_000
  const checkedBy = lastCheck?.checked_by ? people.get(lastCheck.checked_by) : undefined

  const name = (p: Profile) => (
    <span className="lead-name">
      <a href={`mailto:${p.email}`}>{displayName(p)}</a>
      {p.position && <span className="muted"> · {POSITION_LABELS[p.position]}</span>}
    </span>
  )

  return (
    <div className="lead-people stack-sm">
      <p className="small muted">
        Confirm the people who are the right fit, or choose <strong>Not this time</strong> (they see "Reviewed by the
        lead", so let them know personally). Tick <strong>Contacted</strong> once you have reached out.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="people-group">
        <h4>
          Waiting for your decision <span className="count">{waiting.length}</span>
        </h4>
        {waiting.length === 0 ? (
          <p className="small muted">Nobody is waiting.</p>
        ) : (
          <ul className="lead-rows">
            {waiting.map(({ signup, person }) => {
              const at = contactedOf(signup)
              const busy = saving === signup.id
              return (
                <li key={signup.id}>
                  {name(person)}
                  <span className="lead-actions">
                    <label className="check contacted-check small">
                      <input
                        type="checkbox"
                        checked={Boolean(at)}
                        disabled={busy}
                        onChange={(e) => void tick(signup, e.target.checked)}
                        aria-label={`Contacted ${displayName(person)}`}
                      />
                      {at ? `Contacted ${formatDate(at)}` : 'Contacted'}
                    </label>
                    <button
                      type="button"
                      className="btn btn-primary btn-small"
                      disabled={busy}
                      onClick={() => void decide(signup, 'confirm')}
                      aria-label={`Confirm ${displayName(person)}`}
                    >
                      <Check size={14} aria-hidden="true" /> Confirm
                    </button>
                    <ConfirmAction
                      label="Not this time"
                      className="btn btn-link small"
                      ariaLabel={`Not this time for ${displayName(person)}`}
                      question={`Not this time for ${displayName(person)}?`}
                      detail="They will see 'Reviewed by the lead'. Please let them know personally."
                      confirmLabel="Yes, not this time"
                      disabled={busy}
                      onConfirm={() => decide(signup, 'not_selected')}
                    />
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="people-group">
        <h4>
          Member list <span className="count">{confirmed.length + pending.length}</span>
          {opp.capacity ? (
            <span className="small muted">
              {' '}
              {confirmed.length + pending.length} of {opp.capacity} seats
            </span>
          ) : null}
        </h4>
        {confirmed.length === 0 && pending.length === 0 ? (
          <p className="small muted">No one yet.</p>
        ) : (
          <ul className="lead-rows">
            {confirmed.map(({ signup, person }) => (
              <li key={signup.id}>
                {name(person)}
                {statusOf(signup) === 'committed' && (
                  <span className="lead-actions">
                    <ConfirmAction
                      label="Remove"
                      className="btn btn-link danger small"
                      ariaLabel={`Remove ${displayName(person)} from the member list`}
                      question={`Take ${displayName(person)} off the member list?`}
                      detail="They are recorded as having left today. You can add them back any time."
                      confirmLabel="Yes, remove"
                      disabled={saving === signup.id}
                      onConfirm={() => decide(signup, 'remove')}
                    />
                  </span>
                )}
              </li>
            ))}
            {pending.map((w) => (
              <li key={w.email}>
                <span className="lead-name muted">
                  {w.email} <span className="small">· waiting to sign in</span>
                </span>
                <span className="lead-actions">
                  <ConfirmAction
                    label="Cancel"
                    className="btn btn-link danger small"
                    ariaLabel={`Cancel adding ${w.email}`}
                    question={`Cancel adding ${w.email}?`}
                    detail="They will not be added when they sign in."
                    confirmLabel="Yes, cancel"
                    cancelLabel="Keep"
                    onConfirm={() => cancelWaiting(w.email)}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className={`list-check ${checkDue ? 'list-check-due' : ''}`}>
          <p className="small">
            {checkDue
              ? 'Once a year, please check this list: remove anyone no longer active, add anyone missing, then click List is up to date.'
              : `Member list last confirmed ${formatDate(lastCheck!.checked_at)}${checkedBy ? ` by ${displayName(checkedBy)}` : ''}.`}
          </p>
          <button type="button" className="btn btn-secondary btn-small" disabled={checking} onClick={() => void confirmList()}>
            <Check size={14} aria-hidden="true" /> {checking ? 'Saving…' : 'List is up to date'}
          </button>
        </div>
      </div>

      {notNow.length > 0 && (
        <details className="people-group">
          <summary>
            Not this time <span className="count">{notNow.length}</span>
          </summary>
          <ul className="lead-rows">
            {notNow.map(({ signup, person }) => (
              <li key={signup.id}>
                {name(person)}
                <span className="lead-actions">
                  <button
                    type="button"
                    className="btn btn-link small"
                    disabled={saving === signup.id}
                    onClick={() => void decide(signup, 'undo')}
                    aria-label={`Reconsider ${displayName(person)}`}
                  >
                    Reconsider
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <form className="lead-add" onSubmit={addMember}>
        <PersonPicker
          label="Already on this? Add them to the member list"
          value={email}
          onChange={setEmail}
          help="Type part of a name or email and pick the person, or type their full work email. If they have not signed in yet, they are added automatically the first time they sign in."
        />
        <div>
          <button className="btn btn-secondary btn-small" disabled={adding || !email.includes('@')}>
            <UserPlus size={14} aria-hidden="true" /> {adding ? 'Adding…' : 'Add'}
          </button>
        </div>
      </form>
      {added && <p className="notice">{added}</p>}
    </div>
  )
}
