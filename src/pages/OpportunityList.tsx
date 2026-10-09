import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, MapPin, Search, Sprout } from 'lucide-react'
import { useProfile } from '../auth/AuthContext'
import { AvatarStack } from '../components/Avatars'
import CountUp from '../components/CountUp'
import LoadError from '../components/LoadError'
import OppIcon from '../components/OppIcon'
import {
  byId,
  categoriesByOpportunity,
  fetchCategories,
  fetchCounts,
  fetchOpportunities,
  fetchOpportunityCategories,
  fetchProfiles,
  fetchSignups,
  useLoader,
} from '../lib/data'
import {
  canSignUp,
  COMMITMENT_LABELS,
  eligibilityGroup,
  eligibilityLabel,
  ELIGIBILITY_GROUPS,
  FORMAT_LABELS,
  formatDate,
  isExpired,
  locationText,
  REGION_LABELS,
  TYPE_LABELS,
} from '../lib/format'
import type {
  CommitmentLevel,
  InterestCategory,
  Opportunity,
  OppRegion,
  OppType,
  Profile,
  Signup,
  SignupCounts,
} from '../lib/types'

// Sections follow who can sign up; posts with an unusual mix go under "Other".
const SECTIONS: { key: string; title: string }[] = [
  ...ELIGIBILITY_GROUPS.map((g) => ({ key: g.key, title: g.title })),
  { key: 'custom', title: 'Other' },
]

const TYPE_PLURALS: Record<OppType, string> = {
  committee: 'Committees',
  leadership: 'Leadership',
  event: 'Events',
  project: 'Projects',
  other: 'Other',
}

const NO_COUNTS: SignupCounts = { opportunity_id: '', committed: 0, interested: 0, waitlisted: 0 }

async function loadBoard() {
  const [opportunities, signups, profiles, counts, categories, links] = await Promise.all([
    fetchOpportunities(),
    fetchSignups(), // only rows this person may see (their own, their posts, or names shown)
    fetchProfiles(),
    fetchCounts(),
    fetchCategories(),
    fetchOpportunityCategories(),
  ])
  return { opportunities, signups, profiles, counts, categories, topics: categoriesByOpportunity(links, categories) }
}

export default function OpportunityList() {
  const profile = useProfile()
  const { data, error, loading, reload } = useLoader(loadBoard, [])
  const [search, setSearch] = useState('')
  const [type, setType] = useState<OppType | ''>('')
  const [region, setRegion] = useState<OppRegion | ''>('')
  const [commitment, setCommitment] = useState<CommitmentLevel | ''>('')
  const [topic, setTopic] = useState('')
  const [newHireOnly, setNewHireOnly] = useState(false)
  const [showClosed, setShowClosed] = useState(false)
  const [onlyMine, setOnlyMine] = useState(false)

  const canSeeExpired = profile.role === 'admin' || profile.role === 'poster'
  const opportunities: Opportunity[] = data?.opportunities ?? []
  const signups: Signup[] = data?.signups ?? []
  const topics = data?.topics ?? new Map<string, InterestCategory[]>()

  // Faces on cards: only people this viewer is allowed to see.
  const faces = useMemo(() => {
    const people = byId<Profile>(data?.profiles ?? [])
    const map = new Map<string, Profile[]>()
    for (const s of signups) {
      if (s.status !== 'committed' && s.status !== 'completed') continue
      const p = people.get(s.user_id)
      if (!p) continue
      map.set(s.opportunity_id, [...(map.get(s.opportunity_id) ?? []), p])
    }
    return map
  }, [signups, data?.profiles])

  const mine = useMemo(() => {
    const map = new Map<string, Signup>()
    for (const s of signups) if (s.user_id === profile.id) map.set(s.opportunity_id, s)
    return map
  }, [signups, profile.id])

  const live = opportunities.filter((o) => o.status === 'open' && !isExpired(o))
  const totalSignups = live.reduce((sum, o) => {
    const c = data?.counts.get(o.id) ?? NO_COUNTS
    return sum + c.committed + c.interested + c.waitlisted
  }, 0)
  const presentTypes = (Object.keys(TYPE_LABELS) as OppType[]).filter((t) => opportunities.some((o) => o.type === t))
  const activeTopics = (data?.categories ?? []).filter((c) => c.active)

  const visible = opportunities.filter((o) => {
    if (o.status === 'archived') return false
    // "Show closed" also reveals expired posts to posters and admins.
    if (!showClosed && (o.status === 'closed' || isExpired(o))) return false
    if (isExpired(o) && !canSeeExpired) return false
    if (type && o.type !== type) return false
    if (region && o.region !== region) return false
    if (commitment && o.commitment !== commitment) return false
    if (topic && !(topics.get(o.id) ?? []).some((c) => c.id === topic)) return false
    if (newHireOnly && !o.new_hire_friendly) return false
    if (onlyMine && !canSignUp(o, profile)) return false
    if (search) {
      const names = (topics.get(o.id) ?? []).map((c) => c.name).join(' ')
      const haystack = `${o.title} ${o.description} ${names} ${o.site}`.toLowerCase()
      if (!haystack.includes(search.toLowerCase())) return false
    }
    return true
  })
  const rank = (o: Opportunity) => (o.status === 'open' && !isExpired(o) ? 0 : o.status === 'draft' ? 1 : 2)
  visible.sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title))

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
            placeholder="Search by name, topic or hospital"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search opportunities"
          />
        </label>
        {data && (
          <div className="hero-stats">
            <span>
              <strong><CountUp value={live.length} /></strong> open now
            </span>
            <span>
              <strong><CountUp value={totalSignups} /></strong> {totalSignups === 1 ? 'sign-up' : 'sign-ups'} so far
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
          <select
            className="pill-select"
            value={region}
            onChange={(e) => setRegion(e.target.value as OppRegion | '')}
            aria-label="Location"
          >
            <option value="">Any location</option>
            {Object.entries(REGION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select className="pill-select" value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Topic">
            <option value="">Any topic</option>
            {activeTopics.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
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
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
            <span className="switch-track" aria-hidden="true" />
            Only what I can join
          </label>
          <label className="switch">
            <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
            <span className="switch-track" aria-hidden="true" />
            {canSeeExpired ? 'Show closed and expired' : 'Show closed'}
          </label>
        </div>
      </div>

      {error && <LoadError what="opportunities" error={error} onRetry={reload} />}
      {loading && !data && <p className="muted">Loading…</p>}
      {data && visible.length === 0 && <p className="empty">Nothing matches those filters.</p>}

      {SECTIONS.map((section) => {
        const items = visible.filter((o) => eligibilityGroup(o.eligible_positions) === section.key)
        if (items.length === 0) return null
        const joinable = profile.position !== null && items.some((o) => canSignUp(o, profile))
        return (
          <section key={section.key} className="opp-section">
            <div className="section-label">
              <span className="section-title">{section.title}</span>
              <span className="section-count">{items.length}</span>
              {!joinable && <span className="section-blurb">View only for your position</span>}
            </div>
            <div className="opp-grid">
              {items.map((opp) => (
                <OpportunityCard
                  key={opp.id}
                  opp={opp}
                  counts={data?.counts.get(opp.id) ?? NO_COUNTS}
                  faces={faces.get(opp.id) ?? []}
                  topics={topics.get(opp.id) ?? []}
                  mine={mine.get(opp.id)}
                  viewOnly={!canSignUp(opp, profile)}
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

function OpportunityCard({
  opp,
  counts,
  faces,
  topics,
  mine,
  viewOnly,
}: {
  opp: Opportunity
  counts: SignupCounts
  faces: Profile[]
  topics: InterestCategory[]
  mine?: Signup
  viewOnly: boolean
}) {
  const summary = opp.description
    .split('\n')
    .map((l) => l.replace(/^[-*•]\s+/, '').trim())
    .filter(Boolean)[0]
  const taken = counts.committed
  const expired = isExpired(opp)
  const myLabel = mine ? MY_LABELS[mine.status] : undefined
  const meta = [TYPE_LABELS[opp.type], opp.time_estimate || COMMITMENT_LABELS[opp.commitment]]
  if (opp.start_date) meta.push(formatDate(opp.start_date))

  let footText: string
  if (taken === 0 && counts.interested === 0 && counts.waitlisted === 0) footText = 'Be the first to raise your hand'
  else {
    const parts = []
    if (taken) parts.push(`${taken} in`)
    if (counts.interested) parts.push(`${counts.interested} interested`)
    if (counts.waitlisted) parts.push(`${counts.waitlisted} waiting`)
    footText = parts.join(' · ')
  }

  return (
    <Link
      to={`/o/${opp.id}`}
      className={`opp opp-${eligibilityGroup(opp.eligible_positions)} ${opp.status !== 'open' || expired ? 'opp-muted' : ''}`}
    >
      <div className="opp-top">
        <span className="opp-icon">
          <OppIcon type={opp.type} topics={topics.map((t) => t.name)} />
        </span>
        <span className="opp-flags">
          {opp.status === 'draft' && <span className="flag">Draft</span>}
          {opp.status === 'closed' && <span className="flag">Closed</span>}
          {expired && <span className="flag">Expired</span>}
          {viewOnly && !mine && <span className="flag flag-view">View only</span>}
          {myLabel && <span className={`flag flag-mine flag-${mine!.status}`}>{myLabel}</span>}
        </span>
      </div>

      <h3 className="opp-title">{opp.title}</h3>
      {summary && <p className="opp-summary">{summary}</p>}

      <p className="opp-location">
        <MapPin size={14} aria-hidden="true" />
        {locationText(opp)}
        {opp.format !== 'in_person' && <span className="opp-format">{FORMAT_LABELS[opp.format]}</span>}
      </p>

      {eligibilityGroup(opp.eligible_positions) === 'custom' && (
        <p className="opp-deadline">Open to: {eligibilityLabel(opp.eligible_positions)}</p>
      )}
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

      {opp.signup_deadline && opp.status === 'open' && !expired && (
        <span className="opp-deadline">Sign up by {formatDate(opp.signup_deadline)}</span>
      )}
      <div className="opp-foot">
        <AvatarStack people={faces} size={28} />
        <span className="opp-foot-text">{footText}</span>
        <ArrowRight className="opp-arrow" size={18} aria-hidden="true" />
      </div>
    </Link>
  )
}
