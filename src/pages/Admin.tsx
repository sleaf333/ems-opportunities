import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { Download, Mail } from 'lucide-react'
import { useAuth, useProfile } from '../auth/AuthContext'
import AdminTabs from '../components/AdminTabs'
import { type AdminData, BLANK_ENGAGEMENT, type Engagement, engagementByPerson, loadAdminData } from '../lib/adminData'
import { byId, useLoader } from '../lib/data'
import { downloadCsv, downloadJson, toCsv } from '../lib/csv'
import {
  COMMITMENT_LABELS,
  daysUntil,
  displayName,
  eligibilityLabel,
  FORMAT_LABELS,
  formatDate,
  formatDateTime,
  isExpired,
  localToday,
  POSITION_LABELS,
  REGION_LABELS,
  ROLE_LABELS,
  SIGNUP_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
} from '../lib/format'
import { EMAIL_DOMAIN, friendlyError, isAllowedEmail, supabase } from '../lib/supabase'
import type { InterestCategory, Opportunity, Profile, Signup, UserRole } from '../lib/types'

// Posts leaving the site within this many days are flagged for review.
const ENDING_SOON_DAYS = 14

interface RoleDraft {
  email: string
  role: UserRole
  partner: boolean
}

export default function Admin() {
  const profile = useProfile()
  const { data, error, loading, reload } = useLoader(loadAdminData, [])
  const [roleDraft, setRoleDraft] = useState<RoleDraft | null>(null)

  const engagement = useMemo(() => (data ? engagementByPerson(data) : new Map<string, Engagement>()), [data])

  if (profile.role !== 'admin') return <Navigate to="/" replace />
  if (error) return <p className="error">Could not load admin data: {error}</p>
  if (loading && !data) return <p className="muted">Loading…</p>
  if (!data) return null

  const live = data.opportunities.filter((o) => o.status === 'open' && !isExpired(o))

  return (
    <div className="stack-lg">
      <div className="stack-sm">
        <AdminTabs />
        <h1>Admin</h1>
      </div>

      <div className="stats">
        <div className="card stat"><strong>{data.profiles.length}</strong><span>members signed in</span></div>
        <div className="card stat">
          <strong>{data.profiles.filter((p) => engagement.get(p.id)?.lastActivity).length}</strong>
          <span>have signed up for something</span>
        </div>
        <div className="card stat"><strong>{live.length}</strong><span>open opportunities</span></div>
        <div className="card stat">
          <strong>{new Set(data.memberCats.map((m) => m.user_id)).size}</strong>
          <span>members shared interests</span>
        </div>
      </div>

      <FullBackup data={data} reload={reload} />
      <PostingWindows opportunities={data.opportunities} />
      <MemberRoles data={data} reload={reload} draft={roleDraft} />
      <Interests data={data} />
      <Topics data={data} reload={reload} />
      <Members
        data={data}
        engagement={engagement}
        onChangeRole={(p) => {
          setRoleDraft({ email: p.email, role: p.role, partner: p.position === 'partner' })
          document.getElementById('roles')?.scrollIntoView({ behavior: 'smooth' })
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------

// Remind admins to keep a monthly copy off Supabase (the free plan has no
// restorable backups). Every download is recorded in the database.
const BACKUP_REMINDER_DAYS = 30

function FullBackup({ data, reload }: { data: AdminData; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const last = data.lastBackup
  const days = last ? Math.floor((Date.now() - Date.parse(last.downloaded_at)) / 86_400_000) : null
  const overdue = days === null || days > BACKUP_REMINDER_DAYS
  const by = last?.downloaded_by ? displayName(data.profiles.find((p) => p.id === last.downloaded_by)) : 'a former admin'

  async function download() {
    setBusy(true)
    setError(null)
    const { data: dump, error: rpcError } = await supabase.rpc('admin_export_all')
    setBusy(false)
    if (rpcError) {
      setError(friendlyError(rpcError))
      return
    }
    downloadJson(`ems-opportunities-backup-${localToday()}.json`, dump)
    await reload()
  }

  return (
    <section id="backup" className="card stack">
      <div className="row between wrap gap-sm">
        <div className="backup-text">
          <h2>Full backup</h2>
          <p className="small muted">
            One file with everything on the site: members, interests and goals, posts, owners, sign-ups and all
            history. It contains private information, so save it to the group's OneDrive or SharePoint, never to
            personal email or a personal drive. Only admins can download it, and each download is recorded.
          </p>
        </div>
        <button className="btn btn-primary" disabled={busy} onClick={() => void download()}>
          <Download size={16} aria-hidden="true" /> {busy ? 'Preparing…' : 'Download full backup'}
        </button>
      </div>
      <p className={overdue ? 'warning' : 'small muted'}>
        {last
          ? `Last full backup: ${formatDateTime(last.downloaded_at)}, by ${by}.` +
            (overdue ? ` That was ${days} days ago; time for a new one.` : '')
          : 'No full backup has been downloaded yet. Download one now, then once a month.'}
      </p>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  )
}

// ---------------------------------------------------------------------------

function PostingWindows({ opportunities }: { opportunities: Opportunity[] }) {
  const [showAllExpired, setShowAllExpired] = useState(false)
  const endingSoon = opportunities
    .filter((o) => o.status !== 'archived' && o.visible_until && !isExpired(o) && daysUntil(o.visible_until) <= ENDING_SOON_DAYS)
    .sort((a, b) => a.visible_until!.localeCompare(b.visible_until!))
  const expired = opportunities
    .filter((o) => o.status !== 'archived' && isExpired(o))
    .sort((a, b) => b.visible_until!.localeCompare(a.visible_until!))
  const shownExpired = showAllExpired ? expired : expired.slice(0, 5)

  return (
    <section className="card stack">
      <div>
        <h2>Posting windows</h2>
        <p className="small muted">
          Posts leave the site after their "Show on site until" date but are never deleted. Open one and change the
          date to extend it.
        </p>
      </div>
      <div className="grid-2">
        <div>
          <h3>Leaving the site in the next {ENDING_SOON_DAYS} days</h3>
          {endingSoon.length === 0 ? (
            <p className="small muted">Nothing ending soon.</p>
          ) : (
            <ul className="list">
              {endingSoon.map((o) => (
                <li key={o.id} className="row between gap-sm">
                  <Link to={`/o/${o.id}/edit`}>{o.title}</Link>
                  <span className="small muted">{formatDate(o.visible_until)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3>Expired ({expired.length})</h3>
          {expired.length === 0 ? (
            <p className="small muted">No expired posts.</p>
          ) : (
            <>
              <ul className="list">
                {shownExpired.map((o) => (
                  <li key={o.id} className="row between gap-sm">
                    <Link to={`/o/${o.id}`}>{o.title}</Link>
                    <span className="small muted">ended {formatDate(o.visible_until)}</span>
                  </li>
                ))}
              </ul>
              {expired.length > 5 && (
                <button className="btn btn-link" onClick={() => setShowAllExpired(!showAllExpired)}>
                  {showAllExpired ? 'Show fewer' : `Show all ${expired.length}`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------

function MemberRoles({
  data,
  reload,
  draft,
}: {
  data: AdminData
  reload: () => Promise<void>
  draft: RoleDraft | null
}) {
  const profile = useProfile()
  const { refreshProfile } = useAuth()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('poster')
  const [partner, setPartner] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // "Change role" on a member row fills this form in.
  useEffect(() => {
    if (!draft) return
    setEmail(draft.email)
    setRole(draft.role)
    setPartner(draft.partner)
    setMessage(null)
    setError(null)
  }, [draft])

  async function save(event: FormEvent) {
    event.preventDefault()
    setMessage(null)
    setError(null)
    const address = email.trim().toLowerCase()
    if (!isAllowedEmail(address)) {
      setError(`Email must end in @${EMAIL_DOMAIN}.`)
      return
    }
    setBusy(true)
    const { data: result, error: rpcError } = await supabase.rpc('admin_set_member', {
      p_email: address,
      p_role: role,
      p_is_partner: partner,
    })
    setBusy(false)
    if (rpcError) {
      setError(friendlyError(rpcError))
      return
    }
    setMessage(
      result === 'updated'
        ? `Updated ${address}.`
        : `Saved. ${address} will get this the first time they sign in.`,
    )
    setEmail('')
    await reload()
    if (address === profile.email) await refreshProfile()
  }

  async function removePreset(presetEmail: string) {
    const { error: deleteError } = await supabase.from('member_presets').delete().eq('email', presetEmail)
    if (deleteError) setError(friendlyError(deleteError))
    await reload()
  }

  return (
    <form id="roles" className="card stack" onSubmit={save}>
      <div>
        <h2>Roles and shareholders</h2>
        <p className="small muted">
          Posters can post opportunities. Admins can do everything, including this page. Shareholders can commit to
          shareholders-only opportunities. Members choose their own position, and you can correct it here. If the person has not signed in
          yet, this is saved and applied the first time they do.
        </p>
      </div>
      <div className="grid-3">
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={`name@${EMAIL_DOMAIN}`}
            required
          />
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
          <input type="checkbox" checked={partner} onChange={(e) => setPartner(e.target.checked)} />
          Shareholder
        </label>
      </div>
      <div>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
      {message && <p className="notice">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {data.presets.length > 0 && (
        <div>
          <h3>Waiting for first sign-in</h3>
          <ul className="list">
            {data.presets.map((p) => (
              <li key={p.email} className="row between wrap gap-sm">
                <span>
                  {p.email} · {ROLE_LABELS[p.role]}
                  {p.is_partner ? ' · Shareholder' : ''}
                </span>
                <span className="row gap-sm">
                  <button
                    type="button"
                    className="btn btn-link"
                    onClick={() => {
                      setEmail(p.email)
                      setRole(p.role)
                      setPartner(p.is_partner)
                    }}
                  >
                    Change
                  </button>
                  <button type="button" className="btn btn-link danger" onClick={() => void removePreset(p.email)}>
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.recentRoleChanges.length > 0 && (
        <div>
          <h3>Recent role changes</h3>
          <ul className="list">
            {data.recentRoleChanges.map((c) => {
              const person = data.profiles.find((p) => p.id === c.user_id)
              const by = c.changed_by ? data.profiles.find((p) => p.id === c.changed_by) : undefined
              return (
                <li key={c.id} className="row between wrap gap-sm">
                  <span>
                    {displayName(person)}: {c.old_role ? `${ROLE_LABELS[c.old_role]} to ` : ''}
                    {ROLE_LABELS[c.new_role]}
                  </span>
                  <span className="small muted">
                    {c.changed_by
                      ? `by ${displayName(by)}`
                      : c.old_role
                        ? 'in the Supabase dashboard'
                        : 'set before first sign-in'}
                    {' · '}{formatDateTime(c.changed_at)}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </form>
  )
}

// ---------------------------------------------------------------------------

function Interests({ data }: { data: AdminData }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const people = byId(data.profiles)

  const rows = data.categories
    .filter((c) => c.active)
    .map((c) => {
      const members = data.memberCats
        .filter((m) => m.category_id === c.id)
        .map((m) => people.get(m.user_id))
        .filter((p): p is Profile => Boolean(p))
        .sort((a, b) => displayName(a).localeCompare(displayName(b)))
      const openPosts = data.opportunities.filter(
        (o) => o.status === 'open' && !isExpired(o) && (data.topics.get(o.id) ?? []).some((t) => t.id === c.id),
      ).length
      return { category: c, members, openPosts }
    })
    .sort((a, b) => b.members.length - a.members.length || a.category.name.localeCompare(b.category.name))

  const others = data.interests
    .filter((i) => i.other_interests.trim())
    .map((i) => ({ person: people.get(i.user_id), text: i.other_interests }))
    .filter((x): x is { person: Profile; text: string } => Boolean(x.person))

  return (
    <section className="card stack">
      <div>
        <h2>Interests</h2>
        <p className="small muted">
          What members said they want to be involved in. A topic with many interested members and few open posts may
          be worth building an opportunity around.
        </p>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Topic</th>
              <th className="num">Interested members</th>
              <th className="num">Open posts</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ category, members, openPosts }) => (
              <InterestRow
                key={category.id}
                name={category.name}
                members={members}
                openPosts={openPosts}
                open={openId === category.id}
                onToggle={() => setOpenId(openId === category.id ? null : category.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
      {others.length > 0 && (
        <div>
          <h3>Other interests members wrote in</h3>
          <ul className="list">
            {others.map(({ person, text }) => (
              <li key={person.id}>
                <strong>{displayName(person)}</strong>: {text}{' '}
                <a href={`mailto:${person.email}`} className="small">email</a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function InterestRow({
  name,
  members,
  openPosts,
  open,
  onToggle,
}: {
  name: string
  members: Profile[]
  openPosts: number
  open: boolean
  onToggle: () => void
}) {
  const mailto = `mailto:?bcc=${members.map((m) => m.email).join(',')}&subject=${encodeURIComponent(name)}`
  return (
    <>
      <tr>
        <td>{name}</td>
        <td className="num">{members.length}</td>
        <td className={`num ${members.length > 0 && openPosts === 0 ? 'attention' : ''}`}>{openPosts}</td>
        <td>
          {members.length > 0 && (
            <button className="btn btn-link" onClick={onToggle} aria-expanded={open}>
              {open ? 'Hide' : 'See who'}
            </button>
          )}
        </td>
      </tr>
      {open && (
        <tr className="expanded">
          <td colSpan={4}>
            <div className="row between wrap gap-sm">
              <span>
                {members.map((m, i) => (
                  <span key={m.id}>
                    {i > 0 && ', '}
                    <a href={`mailto:${m.email}`}>{displayName(m)}</a>
                  </span>
                ))}
              </span>
              <a className="btn btn-secondary" href={mailto}>
                <Mail size={15} aria-hidden="true" /> Email them
              </a>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------

function Topics({ data, reload }: { data: AdminData; reload: () => Promise<void> }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function add(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const trimmed = name.trim()
    if (!trimmed) return
    const { error: insertError } = await supabase.from('interest_categories').insert({ name: trimmed })
    if (insertError) {
      setError(/duplicate/i.test(insertError.message) ? `"${trimmed}" already exists.` : friendlyError(insertError))
      return
    }
    setName('')
    await reload()
  }

  async function rename(c: InterestCategory) {
    const next = window.prompt(`Rename "${c.name}" to:`, c.name)?.trim()
    if (!next || next === c.name) return
    const { error: updateError } = await supabase.from('interest_categories').update({ name: next }).eq('id', c.id)
    if (updateError) setError(friendlyError(updateError))
    await reload()
  }

  async function setActive(c: InterestCategory, active: boolean) {
    const { error: updateError } = await supabase.from('interest_categories').update({ active }).eq('id', c.id)
    if (updateError) setError(friendlyError(updateError))
    await reload()
  }

  return (
    <section className="card stack">
      <div>
        <h2>Manage topics</h2>
        <p className="small muted">
          Topics are what posters tag opportunities with and what members pick as interests. Retiring a topic hides it
          from new choices but keeps existing history. Renaming updates it everywhere.
        </p>
      </div>
      <form className="row wrap gap-sm" onSubmit={add}>
        <input
          className="grow"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New topic, e.g. Simulation"
          aria-label="New topic name"
          maxLength={60}
        />
        <button className="btn btn-primary">Add topic</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="chips">
        {data.categories.map((c) => (
          <span key={c.id} className={`topic-chip ${c.active ? '' : 'topic-retired'}`}>
            <span>{c.name}</span>
            <button type="button" className="btn btn-link" onClick={() => void rename(c)}>
              Rename
            </button>
            <button type="button" className="btn btn-link" onClick={() => void setActive(c, !c.active)}>
              {c.active ? 'Retire' : 'Restore'}
            </button>
          </span>
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------

function Members({
  data,
  engagement,
  onChangeRole,
}: {
  data: AdminData
  engagement: Map<string, Engagement>
  onChangeRole: (p: Profile) => void
}) {
  const [search, setSearch] = useState('')
  const [positionFilter, setPositionFilter] = useState('')
  const [interestFilter, setInterestFilter] = useState('')
  // Insights links here with ?untapped=1 to open this filter.
  const [searchParams] = useSearchParams()
  const [onlyUntapped, setOnlyUntapped] = useState(searchParams.get('untapped') === '1')
  useEffect(() => {
    if (searchParams.get('untapped') === '1') document.getElementById('members')?.scrollIntoView()
  }, [searchParams])

  const people = byId(data.profiles)
  const opps = byId(data.opportunities)
  const cats = byId(data.categories)
  const interestsByUser = new Map(data.interests.map((i) => [i.user_id, i]))
  const catsByUser = new Map<string, string[]>()
  for (const m of data.memberCats) {
    const name = cats.get(m.category_id)?.name
    if (name) catsByUser.set(m.user_id, [...(catsByUser.get(m.user_id) ?? []), name])
  }

  const rows = data.profiles.filter((p) => {
    if (positionFilter && p.position !== positionFilter) return false
    if (search && !`${p.full_name} ${p.email}`.toLowerCase().includes(search.toLowerCase())) return false
    if (interestFilter && !data.memberCats.some((m) => m.user_id === p.id && m.category_id === interestFilter)) {
      return false
    }
    if (onlyUntapped) {
      const e = engagement.get(p.id) ?? BLANK_ENGAGEMENT
      if (e.interested === 0 || e.everCommitted) return false
    }
    return true
  })

  const stamp = localToday()

  function exportMembers() {
    downloadCsv(
      `members-${stamp}.csv`,
      toCsv(
        ['Name', 'Email', 'Position', 'Role', 'Interested now', 'Committed now', 'Completed', 'Withdrawn', 'Ever committed', 'Last activity', 'Interest topics', 'Other interests', 'Leadership goals', 'Joined'],
        data.profiles.map((p) => {
          const e = engagement.get(p.id) ?? BLANK_ENGAGEMENT
          const i = interestsByUser.get(p.id)
          return [
            p.full_name, p.email, p.position ? POSITION_LABELS[p.position] : '', ROLE_LABELS[p.role],
            e.interested, e.committed, e.completed, e.withdrawn, e.everCommitted ? 'Yes' : 'No',
            e.lastActivity ?? '', (catsByUser.get(p.id) ?? []).sort().join('; '), i?.other_interests ?? '',
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
        ['Title', 'Type', 'Status', 'Location', 'Hospital or site', 'Format', 'Who can sign up', 'Commitment', 'Time needed', 'Spots', 'Committed', 'Interested', 'Waitlisted', 'Start', 'End', 'Deadline', 'Show on site until', 'Expired', 'Names shown to members', 'Good for new hires', 'Topics', 'Contact', 'Contact email', 'Posted by', 'Posted'],
        data.opportunities.map((o) => {
          const mine = data.signups.filter((s) => s.opportunity_id === o.id)
          const n = (st: Signup['status'][]) => mine.filter((s) => st.includes(s.status)).length
          return [
            o.title, TYPE_LABELS[o.type], STATUS_LABELS[o.status], REGION_LABELS[o.region], o.site,
            FORMAT_LABELS[o.format], eligibilityLabel(o.eligible_positions), COMMITMENT_LABELS[o.commitment], o.time_estimate,
            o.capacity ?? 'No limit', n(['committed', 'completed']), n(['interested']), n(['waitlisted']),
            o.start_date ?? '', o.end_date ?? '', o.signup_deadline ?? '', o.visible_until ?? 'Indefinitely',
            isExpired(o) ? 'Yes' : 'No', o.show_names ? 'Yes' : 'No', o.new_hire_friendly ? 'Yes' : 'No',
            (data.topics.get(o.id) ?? []).map((t) => t.name).join('; '), o.contact_name, o.contact_email,
            o.created_by ? displayName(people.get(o.created_by)) : '', o.created_at,
          ]
        }),
      ),
    )
  }

  function exportSignups() {
    downloadCsv(
      `signups-${stamp}.csv`,
      toCsv(
        ['Opportunity', 'Location', 'Name', 'Email', 'Position', 'Status', 'Status since', 'First signed up'],
        data.signups.map((s) => {
          const p = people.get(s.user_id)
          const o = opps.get(s.opportunity_id)
          return [
            o?.title ?? '', o ? REGION_LABELS[o.region] : '', p?.full_name ?? '', p?.email ?? '',
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
        data.events.map((ev) => {
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
    <section id="members" className="card stack">
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
        Exports open in Excel for reading and sorting. For a complete backup, use Full backup at the top of this page.
      </p>
      <div className="filters filters-4">
        <input
          type="search"
          placeholder="Search name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search members"
        />
        <select value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)} aria-label="Position">
          <option value="">All positions</option>
          {Object.entries(POSITION_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select value={interestFilter} onChange={(e) => setInterestFilter(e.target.value)} aria-label="Interest">
          <option value="">Any interest</option>
          {data.categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
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
              <th>Interests</th>
              <th className="num" title="Current interests">Interested</th>
              <th className="num" title="Committed or waitlisted now">Committed</th>
              <th className="num">Completed</th>
              <th className="num">Withdrawn</th>
              <th>Last activity</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const e = engagement.get(p.id) ?? BLANK_ENGAGEMENT
              return (
                <tr key={p.id}>
                  <td>
                    <div>{displayName(p)}</div>
                    <div className="small muted">{p.email}</div>
                  </td>
                  <td>{p.position ? POSITION_LABELS[p.position] : '—'}</td>
                  <td>{ROLE_LABELS[p.role]}</td>
                  <td className="small">{(catsByUser.get(p.id) ?? []).sort().join(', ') || '—'}</td>
                  <td className="num">{e.interested}</td>
                  <td className="num">{e.committed}</td>
                  <td className="num">{e.completed}</td>
                  <td className="num">{e.withdrawn}</td>
                  <td className="small">{e.lastActivity ? formatDate(e.lastActivity) : '—'}</td>
                  <td className="nowrap">
                    <button className="btn btn-link" onClick={() => onChangeRole(p)}>Change role</button>
                    <a className="btn btn-link" href={`mailto:${p.email}`}>Email</a>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="muted">No members match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
