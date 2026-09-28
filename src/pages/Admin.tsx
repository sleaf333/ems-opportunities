import { useMemo, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth, useProfile } from '../auth/AuthContext'
import { byId, fetchOpportunities, fetchProfiles, fetchSignups, useLoader } from '../lib/data'
import { downloadCsv, toCsv } from '../lib/csv'
import {
  AUDIENCE_LABELS,
  COMMITMENT_LABELS,
  displayName,
  formatDate,
  localToday,
  POSITION_LABELS,
  ROLE_LABELS,
  SIGNUP_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
} from '../lib/format'
import { EMAIL_DOMAIN, friendlyError, isAllowedEmail, supabase } from '../lib/supabase'
import type { MemberInterests, MemberPreset, Profile, Signup, SignupEvent, UserRole } from '../lib/types'

async function loadAdminData() {
  const [profiles, opportunities, signups, events, interests, presets] = await Promise.all([
    fetchProfiles(),
    fetchOpportunities(),
    fetchSignups(),
    supabase.from('signup_events').select('*').order('changed_at'),
    supabase.from('member_interests').select('*'),
    supabase.from('member_presets').select('*').order('email'),
  ])
  for (const r of [events, interests, presets]) if (r.error) throw new Error(r.error.message)
  return {
    profiles,
    opportunities,
    signups,
    events: events.data as SignupEvent[],
    interests: interests.data as MemberInterests[],
    presets: presets.data as MemberPreset[],
  }
}

interface Engagement {
  interested: number
  committed: number
  completed: number
  withdrawn: number
  everCommitted: boolean
  lastActivity: string | null
}

export default function Admin() {
  const profile = useProfile()
  const { refreshProfile } = useAuth()
  const { data, error, loading, reload } = useLoader(loadAdminData, [])

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('poster')
  const [shareholder, setShareholder] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formMessage, setFormMessage] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [positionFilter, setPositionFilter] = useState('')
  const [onlyUntapped, setOnlyUntapped] = useState(false)

  const engagement = useMemo(() => {
    const map = new Map<string, Engagement>()
    if (!data) return map
    const get = (id: string) => {
      let e = map.get(id)
      if (!e) {
        e = { interested: 0, committed: 0, completed: 0, withdrawn: 0, everCommitted: false, lastActivity: null }
        map.set(id, e)
      }
      return e
    }
    for (const s of data.signups) {
      const e = get(s.user_id)
      if (s.status === 'interested') e.interested++
      else if (s.status === 'committed' || s.status === 'waitlisted') e.committed++
      else if (s.status === 'completed') e.completed++
      else if (s.status === 'withdrawn' || s.status === 'no_show') e.withdrawn++
    }
    for (const ev of data.events) {
      const e = get(ev.user_id)
      if (['committed', 'waitlisted', 'completed'].includes(ev.to_status)) e.everCommitted = true
      if (!e.lastActivity || ev.changed_at > e.lastActivity) e.lastActivity = ev.changed_at
    }
    return map
  }, [data])

  if (profile.role !== 'admin') return <Navigate to="/" replace />
  if (error) return <p className="error">Could not load admin data: {error}</p>
  if (loading && !data) return <p className="muted">Loading…</p>
  if (!data) return null

  const people = byId(data.profiles)
  const opps = byId(data.opportunities)
  const interestsByUser = new Map(data.interests.map((i) => [i.user_id, i]))
  const blank: Engagement = { interested: 0, committed: 0, completed: 0, withdrawn: 0, everCommitted: false, lastActivity: null }

  const rows = data.profiles.filter((p) => {
    if (positionFilter && p.position !== positionFilter) return false
    if (search && !`${p.full_name} ${p.email}`.toLowerCase().includes(search.toLowerCase())) return false
    if (onlyUntapped) {
      const e = engagement.get(p.id) ?? blank
      if (e.interested === 0 || e.everCommitted) return false
    }
    return true
  })

  const active = data.profiles.filter((p) => engagement.get(p.id)?.lastActivity).length

  async function saveMember(event: FormEvent) {
    event.preventDefault()
    setFormMessage(null)
    setFormError(null)
    if (!isAllowedEmail(email)) {
      setFormError(`Email must end in @${EMAIL_DOMAIN}.`)
      return
    }
    setBusy(true)
    const { data: result, error: rpcError } = await supabase.rpc('admin_set_member', {
      p_email: email.trim(),
      p_role: role,
      p_is_shareholder: shareholder,
    })
    setBusy(false)
    if (rpcError) {
      setFormError(friendlyError(rpcError))
      return
    }
    setFormMessage(
      result === 'updated'
        ? `Updated ${email.trim().toLowerCase()}.`
        : `Saved. ${email.trim().toLowerCase()} will get this role the first time they sign in.`,
    )
    setEmail('')
    await reload()
    if (email.trim().toLowerCase() === profile.email) await refreshProfile()
  }

  function editMember(p: Pick<Profile, 'email' | 'role' | 'is_shareholder'>) {
    setEmail(p.email)
    setRole(p.role)
    setShareholder(p.is_shareholder)
    setFormMessage(null)
    setFormError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function removePreset(presetEmail: string) {
    const { error: deleteError } = await supabase.from('member_presets').delete().eq('email', presetEmail)
    if (deleteError) setFormError(friendlyError(deleteError))
    await reload()
  }

  const stamp = localToday()

  function exportMembers() {
    downloadCsv(
      `members-${stamp}.csv`,
      toCsv(
        ['Name', 'Email', 'Position', 'Role', 'Shareholder', 'Interested now', 'Committed now', 'Completed', 'Withdrawn', 'Ever committed', 'Last activity', 'Interests', 'Leadership goals', 'Joined'],
        data!.profiles.map((p) => {
          const e = engagement.get(p.id) ?? blank
          const i = interestsByUser.get(p.id)
          return [
            p.full_name, p.email, p.position ? POSITION_LABELS[p.position] : '', ROLE_LABELS[p.role],
            p.is_shareholder ? 'Yes' : 'No', e.interested, e.committed, e.completed, e.withdrawn,
            e.everCommitted ? 'Yes' : 'No', e.lastActivity ?? '', i?.interests.join('; ') ?? '',
            i?.leadership_goals ?? '', p.created_at,
          ]
        }),
      ),
    )
  }

  function exportOpportunities() {
    downloadCsv(
      `opportunities-${stamp}.csv`,
      toCsv(
        ['Title', 'Type', 'Status', 'Who can commit', 'Commitment', 'Time needed', 'Spots', 'Committed', 'Interested', 'Waitlisted', 'Start', 'End', 'Deadline', 'Good for new hires', 'Topics', 'Contact', 'Contact email', 'Posted by', 'Posted'],
        data!.opportunities.map((o) => {
          const mine = data!.signups.filter((s) => s.opportunity_id === o.id)
          const n = (st: Signup['status'][]) => mine.filter((s) => st.includes(s.status)).length
          return [
            o.title, TYPE_LABELS[o.type], STATUS_LABELS[o.status], AUDIENCE_LABELS[o.audience],
            COMMITMENT_LABELS[o.commitment], o.time_estimate, o.capacity ?? 'No limit',
            n(['committed', 'completed']), n(['interested']), n(['waitlisted']), o.start_date ?? '',
            o.end_date ?? '', o.signup_deadline ?? '', o.new_hire_friendly ? 'Yes' : 'No', o.tags.join('; '),
            o.contact_name, o.contact_email, o.created_by ? displayName(people.get(o.created_by)) : '', o.created_at,
          ]
        }),
      ),
    )
  }

  function exportSignups() {
    downloadCsv(
      `signups-${stamp}.csv`,
      toCsv(
        ['Opportunity', 'Name', 'Email', 'Position', 'Status', 'Status since', 'First signed up'],
        data!.signups.map((s) => {
          const p = people.get(s.user_id)
          return [
            opps.get(s.opportunity_id)?.title ?? '', p?.full_name ?? '', p?.email ?? '',
            p?.position ? POSITION_LABELS[p.position] : '', SIGNUP_LABELS[s.status], s.status_changed_at, s.created_at,
          ]
        }),
      ),
    )
  }

  function exportHistory() {
    downloadCsv(
      `signup-history-${stamp}.csv`,
      toCsv(
        ['When', 'Opportunity', 'Name', 'Email', 'From', 'To', 'Changed by'],
        data!.events.map((ev) => {
          const p = people.get(ev.user_id)
          return [
            ev.changed_at, opps.get(ev.opportunity_id)?.title ?? '', p?.full_name ?? '', p?.email ?? '',
            ev.from_status ? SIGNUP_LABELS[ev.from_status] : '', SIGNUP_LABELS[ev.to_status],
            ev.changed_by ? displayName(people.get(ev.changed_by)) : '',
          ]
        }),
      ),
    )
  }

  return (
    <div className="stack-lg">
      <h1>Admin</h1>

      <div className="stats">
        <div className="card stat"><strong>{data.profiles.length}</strong><span>members signed in</span></div>
        <div className="card stat"><strong>{active}</strong><span>have signed up for something</span></div>
        <div className="card stat"><strong>{data.opportunities.filter((o) => o.status === 'open').length}</strong><span>open opportunities</span></div>
        <div className="card stat"><strong>{data.signups.filter((s) => s.status === 'committed').length}</strong><span>active commitments</span></div>
      </div>

      <form className="card stack" onSubmit={saveMember}>
        <div>
          <h2>Add or change a member's role</h2>
          <p className="small muted">
            Posters can post opportunities. Admins can do everything, including this page. If the person has not signed
            in yet, the role is saved and applied the first time they do.
          </p>
        </div>
        <div className="grid-3">
          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={`name@${EMAIL_DOMAIN}`} required />
          </label>
          <label className="field">
            <span>Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              {Object.entries(ROLE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <label className="check align-end">
            <input type="checkbox" checked={shareholder} onChange={(e) => setShareholder(e.target.checked)} />
            Shareholder
          </label>
        </div>
        <div>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
        {formMessage && <p className="notice">{formMessage}</p>}
        {formError && <p className="error" role="alert">{formError}</p>}

        {data.presets.length > 0 && (
          <div>
            <h3>Waiting for first sign-in</h3>
            <ul className="list">
              {data.presets.map((p) => (
                <li key={p.email} className="row between wrap gap-sm">
                  <span>
                    {p.email} · {ROLE_LABELS[p.role]}
                    {p.is_shareholder ? ' · Shareholder' : ''}
                  </span>
                  <span className="row gap-sm">
                    <button type="button" className="btn btn-link" onClick={() => editMember(p)}>Change</button>
                    <button type="button" className="btn btn-link danger" onClick={() => void removePreset(p.email)}>Remove</button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>

      <section className="card stack">
        <div className="row between wrap gap-sm">
          <h2>Members and engagement</h2>
          <div className="row wrap gap-sm">
            <button className="btn btn-secondary" onClick={exportMembers}>Export members</button>
            <button className="btn btn-secondary" onClick={exportOpportunities}>Export opportunities</button>
            <button className="btn btn-secondary" onClick={exportSignups}>Export sign-ups</button>
            <button className="btn btn-secondary" onClick={exportHistory}>Export history</button>
          </div>
        </div>
        <p className="small muted">
          Exports open in Excel. Download all four once a month and save them to the group's OneDrive as a backup.
        </p>
        <div className="filters">
          <input type="search" placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search members" />
          <select value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)} aria-label="Position">
            <option value="">All positions</option>
            {Object.entries(POSITION_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <label className="check">
            <input type="checkbox" checked={onlyUntapped} onChange={(e) => setOnlyUntapped(e.target.checked)} />
            Interested but never committed
          </label>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Position</th>
                <th>Role</th>
                <th title="Current interests">Interested</th>
                <th title="Committed or waitlisted now">Committed</th>
                <th>Completed</th>
                <th>Withdrawn</th>
                <th>Last activity</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const e = engagement.get(p.id) ?? blank
                return (
                  <tr key={p.id}>
                    <td>
                      <div>{displayName(p)}</div>
                      <div className="small muted">{p.email}</div>
                    </td>
                    <td>{p.position ? POSITION_LABELS[p.position] : '—'}</td>
                    <td>
                      {ROLE_LABELS[p.role]}
                      {p.is_shareholder && <div className="small muted">Shareholder</div>}
                    </td>
                    <td className="num">{e.interested}</td>
                    <td className="num">{e.committed}</td>
                    <td className="num">{e.completed}</td>
                    <td className="num">{e.withdrawn}</td>
                    <td className="small">{e.lastActivity ? formatDate(e.lastActivity) : '—'}</td>
                    <td>
                      <button className="btn btn-link" onClick={() => editMember(p)}>Change role</button>
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="muted">No members match.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
