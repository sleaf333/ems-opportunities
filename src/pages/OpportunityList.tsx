import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useProfile } from '../auth/AuthContext'
import { OpportunityBadges, SignupBadge } from '../components/Badges'
import { fetchOpportunities, fetchSignups, useLoader } from '../lib/data'
import { COMMITMENT_LABELS, formatDate, TYPE_LABELS } from '../lib/format'
import type { CommitmentLevel, Opportunity, OppType, Signup } from '../lib/types'

interface Counts {
  committed: number
  interested: number
  waitlisted: number
}

export default function OpportunityList() {
  const profile = useProfile()
  const { data, error, loading } = useLoader(
    () => Promise.all([fetchOpportunities(), fetchSignups()]),
    [],
  )
  const [search, setSearch] = useState('')
  const [type, setType] = useState<OppType | ''>('')
  const [commitment, setCommitment] = useState<CommitmentLevel | ''>('')
  const [tag, setTag] = useState('')
  const [newHireOnly, setNewHireOnly] = useState(false)
  const [showClosed, setShowClosed] = useState(false)

  const [opportunities, signups] = data ?? [[], []]

  const counts = useMemo(() => {
    const map = new Map<string, Counts>()
    for (const s of signups as Signup[]) {
      const c = map.get(s.opportunity_id) ?? { committed: 0, interested: 0, waitlisted: 0 }
      if (s.status === 'committed' || s.status === 'completed') c.committed++
      else if (s.status === 'interested') c.interested++
      else if (s.status === 'waitlisted') c.waitlisted++
      map.set(s.opportunity_id, c)
    }
    return map
  }, [signups])

  const mine = useMemo(() => {
    const map = new Map<string, Signup>()
    for (const s of signups as Signup[]) if (s.user_id === profile.id) map.set(s.opportunity_id, s)
    return map
  }, [signups, profile.id])

  const allTags = useMemo(
    () => [...new Set((opportunities as Opportunity[]).flatMap((o) => o.tags))].sort(),
    [opportunities],
  )

  const visible = (opportunities as Opportunity[]).filter((o) => {
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

  // Open first, then drafts, then closed; alphabetical within each.
  const rank = { open: 0, draft: 1, closed: 2, archived: 3 }
  visible.sort((a, b) => rank[a.status] - rank[b.status] || a.title.localeCompare(b.title))

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Opportunities</h1>
          <p className="muted">Show interest with no commitment, or commit to take a spot.</p>
        </div>
      </div>

      <div className="filters card">
        <input
          type="search"
          placeholder="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search opportunities"
        />
        <select value={type} onChange={(e) => setType(e.target.value as OppType | '')} aria-label="Type">
          <option value="">All types</option>
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select
          value={commitment}
          onChange={(e) => setCommitment(e.target.value as CommitmentLevel | '')}
          aria-label="Time commitment"
        >
          <option value="">Any commitment</option>
          {Object.entries(COMMITMENT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Topic">
          <option value="">All topics</option>
          {allTags.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={newHireOnly} onChange={(e) => setNewHireOnly(e.target.checked)} />
          Good for new hires
        </label>
        <label className="check">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          Show closed
        </label>
      </div>

      {error && <p className="error">Could not load opportunities: {error}</p>}
      {loading && !data && <p className="muted">Loading…</p>}
      {data && visible.length === 0 && <p className="muted">Nothing matches those filters.</p>}

      <div className="grid">
        {visible.map((opp) => {
          const c = counts.get(opp.id) ?? { committed: 0, interested: 0, waitlisted: 0 }
          const my = mine.get(opp.id)
          const summary = opp.description.split('\n').map((l) => l.replace(/^[-*•]\s+/, '').trim()).filter(Boolean)[0]
          return (
            <Link key={opp.id} to={`/o/${opp.id}`} className="card opp-card">
              <div className="opp-card-head">
                <h2>{opp.title}</h2>
                {my && my.status !== 'withdrawn' && <SignupBadge status={my.status} />}
              </div>
              <OpportunityBadges opp={opp} />
              {summary && <p className="muted clamp">{summary}</p>}
              <div className="opp-card-foot small">
                <span>
                  <strong>{c.committed}</strong>
                  {opp.capacity ? ` / ${opp.capacity}` : ''} committed
                </span>
                <span>
                  <strong>{c.interested}</strong> interested
                </span>
                {c.waitlisted > 0 && (
                  <span>
                    <strong>{c.waitlisted}</strong> waitlisted
                  </span>
                )}
                {opp.signup_deadline && <span>Sign up by {formatDate(opp.signup_deadline)}</span>}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
