import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Search, Sprout } from 'lucide-react'
import { useProfile } from '../auth/AuthContext'
import { AvatarStack } from '../components/Avatars'
import OppIcon from '../components/OppIcon'
import { byId, fetchOpportunities, fetchProfiles, fetchSignups, useLoader } from '../lib/data'
import { COMMITMENT_LABELS, formatDate, TYPE_LABELS } from '../lib/format'
import type { CommitmentLevel, Opportunity, OppAudience, OppType, Profile, Signup } from '../lib/types'

const SECTIONS: { audience: OppAudience; title: string; blurb: string }[] = [
  { audience: 'all', title: 'Open to everyone', blurb: 'Physicians, APCs and staff' },
  { audience: 'physicians', title: 'For physicians', blurb: 'Anyone can show interest' },
  { audience: 'shareholders', title: 'For shareholders', blurb: 'Anyone can show interest' },
]

const TYPE_PLURALS: Record<OppType, string> = {
  committee: 'Committees',
  leadership: 'Leadership',
  event: 'Events',
  project: 'Projects',
  other: 'Other',
}

interface Tally {
  committed: Profile[]
  interested: number
  waitlisted: number
}

export default function OpportunityList() {
  const profile = useProfile()
  const { data, error, loading } = useLoader(
    () => Promise.all([fetchOpportunities(), fetchSignups(), fetchProfiles()]),
    [],
  )
  const [search, setSearch] = useState('')
  const [type, setType] = useState<OppType | ''>('')
  const [commitment, setCommitment] = useState<CommitmentLevel | ''>('')
  const [tag, setTag] = useState('')
  const [newHireOnly, setNewHireOnly] = useState(false)
  const [showClosed, setShowClosed] = useState(false)

  const opportunities: Opportunity[] = data?.[0] ?? []
  const signups: Signup[] = data?.[1] ?? []
  const profiles: Profile[] = data?.[2] ?? []

  const tallies = useMemo(() => {
    const people = byId(profiles)
    const map = new Map<string, Tally>()
    for (const s of signups) {
      const t = map.get(s.opportunity_id) ?? { committed: [], interested: 0, waitlisted: 0 }
      if (s.status === 'committed' || s.status === 'completed') {
        const p = people.get(s.user_id)
        if (p) t.committed.push(p)
      } else if (s.status === 'interested') t.interested++
      else if (s.status === 'waitlisted') t.waitlisted++
      map.set(s.opportunity_id, t)
    }
    return map
  }, [signups, profiles])

  const mine = useMemo(() => {
    const map = new Map<string, Signup>()
    for (const s of signups) if (s.user_id === profile.id) map.set(s.opportunity_id, s)
    return map
  }, [signups, profile.id])

  const openCount = opportunities.filter((o) => o.status === 'open').length
  const involved = new Set(
    signups.filter((s) => ['interested', 'committed', 'waitlisted', 'completed'].includes(s.status)).map((s) => s.user_id),
  ).size
  const presentTypes = (Object.keys(TYPE_LABELS) as OppType[]).filter((t) => opportunities.some((o) => o.type === t))
  const allTags = [...new Set(opportunities.flatMap((o) => o.tags))].sort()

  const visible = opportunities.filter((o) => {
    if (o.status === 'archived') return false
    if (!showClosed && o.status === 'closed') return false
    if (type && o.type !== type) return false
    if (commitment && o.commitment !== commitment) return false
    if (tag && !o.tags.includes(tag)) return false
    if (newHireOnly && !o.new_hire_friendly) return false
    if (search) {
      const haystack = `${o.title} ${o.description} ${o.tags.join(' ')}`.toLowerCase()
      if (!haystack.includes(search.toLowerCase())) return false
    }
    return true
  })
  const rank = { open: 0, draft: 1, closed: 2, archived: 3 }
  visible.sort((a, b) => rank[a.status] - rank[b.status] || a.title.localeCompare(b.title))

  return (
    <div className="stack-lg">
      <section className="hero">
        <div className="hero-copy">
          <p className="tagline">Get involved</p>
          <h1>Find where you fit</h1>
          <span className="rule rule-bleed" aria-hidden="true" />
          <p className="hero-lede">
            Committees, leadership roles and events across the group. Raise your hand with no strings attached, or
            commit to take a spot.
          </p>
        </div>
        <label className="hero-search">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search by name or topic"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search opportunities"
          />
        </label>
        {data && (
          <div className="hero-stats">
            <span>
              <strong>{openCount}</strong> open now
            </span>
            <span>
              <strong>{involved}</strong> {involved === 1 ? 'colleague' : 'colleagues'} involved
            </span>
          </div>
        )}
        <span className="hero-dots" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
      </section>

      <div className="toolbar">
        <div className="pills" role="group" aria-label="Type">
          <button className={`pill ${type === '' ? 'pill-on' : ''}`} onClick={() => setType('')}>
            All
          </button>
          {presentTypes.map((t) => (
            <button key={t} className={`pill ${type === t ? 'pill-on' : ''}`} onClick={() => setType(type === t ? '' : t)}>
              {TYPE_PLURALS[t]}
            </button>
          ))}
          <span className="pills-divider" aria-hidden="true" />
          <button
            className={`pill pill-soft ${newHireOnly ? 'pill-on' : ''}`}
            aria-pressed={newHireOnly}
            onClick={() => setNewHireOnly(!newHireOnly)}
          >
            <Sprout size={15} aria-hidden="true" /> Good for new hires
          </button>
        </div>
        <div className="toolbar-selects">
          <select className="pill-select" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Topic">
            <option value="">Any topic</option>
            {allTags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            className="pill-select"
            value={commitment}
            onChange={(e) => setCommitment(e.target.value as CommitmentLevel | '')}
            aria-label="Time commitment"
          >
            <option value="">Any commitment</option>
            {Object.entries(COMMITMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <label className="switch">
            <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
            <span className="switch-track" aria-hidden="true" />
            Show closed
          </label>
        </div>
      </div>

      {error && <p className="error">Could not load opportunities: {error}</p>}
      {loading && !data && <p className="muted">Loading…</p>}
      {data && visible.length === 0 && <p className="empty">Nothing matches those filters.</p>}

      {SECTIONS.map((section) => {
        const items = visible.filter((o) => o.audience === section.audience)
        if (items.length === 0) return null
        return (
          <section key={section.audience} className="opp-section">
            <div className="section-label">
              <span className="section-title">{section.title}</span>
              <span className="section-count">{items.length}</span>
              <span className="section-blurb">{section.blurb}</span>
            </div>
            <div className="opp-grid">
              {items.map((opp) => (
                <OpportunityCard
                  key={opp.id}
                  opp={opp}
                  tally={tallies.get(opp.id) ?? { committed: [], interested: 0, waitlisted: 0 }}
                  mine={mine.get(opp.id)}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

const MY_LABELS: Partial<Record<Signup['status'], string>> = {
  committed: "You're in",
  completed: 'Completed',
  interested: 'Interested',
  waitlisted: 'Waitlisted',
}

function OpportunityCard({ opp, tally, mine }: { opp: Opportunity; tally: Tally; mine?: Signup }) {
  const summary = opp.description
    .split('\n')
    .map((l) => l.replace(/^[-*•]\s+/, '').trim())
    .filter(Boolean)[0]
  const taken = tally.committed.length
  const myLabel = mine ? MY_LABELS[mine.status] : undefined
  const meta = [TYPE_LABELS[opp.type], opp.time_estimate || COMMITMENT_LABELS[opp.commitment]]
  if (opp.start_date) meta.push(formatDate(opp.start_date))

  let footText: string
  if (taken === 0 && tally.interested === 0) footText = 'Be the first to raise your hand'
  else {
    const parts = []
    if (taken) parts.push(`${taken} in`)
    if (tally.interested) parts.push(`${tally.interested} interested`)
    if (tally.waitlisted) parts.push(`${tally.waitlisted} waiting`)
    footText = parts.join(' · ')
  }

  return (
    <Link
      to={`/o/${opp.id}`}
      className={`opp opp-${opp.audience} ${opp.status !== 'open' ? 'opp-muted' : ''}`}
    >
      <div className="opp-top">
        <span className="opp-icon">
          <OppIcon opp={opp} />
        </span>
        <span className="opp-flags">
          {opp.status === 'draft' && <span className="flag">Draft</span>}
          {opp.status === 'closed' && <span className="flag">Closed</span>}
          {myLabel && <span className={`flag flag-mine flag-${mine!.status}`}>{myLabel}</span>}
        </span>
      </div>

      <h3 className="opp-title">{opp.title}</h3>
      {summary && <p className="opp-summary">{summary}</p>}

      <p className="opp-meta">
        {meta.join(' · ')}
        {opp.new_hire_friendly && (
          <span className="opp-newhire">
            <Sprout size={13} aria-hidden="true" /> New-hire friendly
          </span>
        )}
      </p>

      {opp.capacity !== null && (
        <div className="spots">
          <div className="spots-bar">
            <span style={{ width: `${Math.min(100, (taken / opp.capacity) * 100)}%` }} />
          </div>
          <span className="spots-text">
            {taken >= opp.capacity ? 'Full' : `${opp.capacity - taken} of ${opp.capacity} spots left`}
          </span>
        </div>
      )}

      {opp.signup_deadline && opp.status === 'open' && (
        <span className="opp-deadline">Sign up by {formatDate(opp.signup_deadline)}</span>
      )}
      <div className="opp-foot">
        <AvatarStack people={tally.committed} size={28} />
        <span className="opp-foot-text">{footText}</span>
        <ArrowRight className="opp-arrow" size={18} aria-hidden="true" />
      </div>
    </Link>
  )
}
