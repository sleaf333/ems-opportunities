import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useProfile } from '../auth/AuthContext'
import AdminTabs from '../components/AdminTabs'
import LoadError from '../components/LoadError'
import Funnel from '../components/insights/Funnel'
import Gaps from '../components/insights/Gaps'
import Heatmap from '../components/insights/Heatmap'
import RisingStars from '../components/insights/RisingStars'
import TrendBars from '../components/insights/TrendBars'
import { loadAdminData } from '../lib/adminData'
import { useLoader } from '../lib/data'
import { POSITION_LABELS, REGION_LABELS } from '../lib/format'
import {
  funnel,
  gaps,
  HEATMAP_POSITIONS,
  HEATMAP_REGIONS,
  heatmapByLocation,
  heatmapByPosition,
  lastMonths,
  monthlyActivity,
  monthsForRange,
  POSITION_FILTERS,
  type PositionFilter,
  type Range,
  RANGE_LABELS,
  RISING_WINDOW_DAYS,
  risingStars,
} from '../lib/insights'

export default function Insights() {
  const profile = useProfile()
  const { data, error, loading, reload } = useLoader(loadAdminData, [])
  const [range, setRange] = useState<Range>('12m')
  const [filter, setFilter] = useState<PositionFilter>('all')
  const [heatView, setHeatView] = useState<'location' | 'position'>('location')
  const today = useMemo(() => new Date(), [])

  const computed = useMemo(() => {
    if (!data) return null
    const months = monthsForRange(range, data.events, today)
    const trend = monthlyActivity(data, filter, months, today)
    return {
      funnel: funnel(data, range, filter, today),
      trend,
      newInterest: trend.reduce((s, r) => s + r.interest, 0),
      newCommitments: trend.reduce((s, r) => s + r.commitments, 0),
      stars: risingStars(data, filter, today),
      byLocation: heatmapByLocation(data, range, filter, today),
      byPosition: heatmapByPosition(data, filter),
      gaps: gaps(data, today),
    }
  }, [data, range, filter, today])

  if (profile.role !== 'admin') return <Navigate to="/" replace />
  if (error) return <LoadError what="insights" error={error} onRetry={reload} />

  const members = computed?.funnel.stages[0]?.count ?? 0
  const raised = computed?.funnel.stages[1]?.count ?? 0
  const rangeWord = range === 'all' ? 'all time' : range === '90d' ? 'the last 90 days' : 'the last 12 months'

  return (
    <div className="stack-lg">
      <div className="stack-sm">
        <AdminTabs />
        <h1>Leadership pipeline</h1>
        <p className="muted">How the group is engaging, who is rising, and where interest is going unmet.</p>
      </div>

      {/* Filters scope everything below them. */}
      <div className="insights-filters">
        <div className="pills" role="group" aria-label="Time range">
          {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
            <button key={r} className={`pill ${range === r ? 'pill-on' : ''}`} onClick={() => setRange(r)} aria-pressed={range === r}>
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
        <select
          className="pill-select"
          value={filter}
          onChange={(e) => setFilter(e.target.value as PositionFilter)}
          aria-label="Positions"
        >
          {POSITION_FILTERS.map((f) => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>
      </div>

      {loading && !computed && <p className="muted">Loading…</p>}
      {computed && (
        <div className={`stack-lg ${loading ? 'refetching' : ''}`}>
          <div className="stats">
            <div className="card stat">
              <strong>{members ? Math.round((raised / members) * 100) : 0}%</strong>
              <span>raised a hand in {rangeWord}</span>
            </div>
            <div className="card stat">
              <strong>{computed.newInterest}</strong>
              <span>new interest</span>
            </div>
            <div className="card stat">
              <strong>{computed.newCommitments}</strong>
              <span>new commitments</span>
            </div>
            <div className="card stat">
              <strong>{computed.stars.length}</strong>
              <span>rising stars</span>
            </div>
          </div>

          <div className="insights-grid">
            <section className="card stack">
              <div>
                <h2>Engagement funnel</h2>
                <p className="small muted">People at each step in {rangeWord}; % is of the step before.</p>
              </div>
              <Funnel result={computed.funnel} />
            </section>
            <section className="card stack">
              <div>
                <h2>Activity by month</h2>
                <p className="small muted">New interest and new commitments each month.</p>
              </div>
              <TrendBars rows={computed.trend} />
            </section>
          </div>

          <section className="card stack">
            <div>
              <h2>Rising stars</h2>
              <p className="small muted">
                People whose involvement grew in the last {RISING_WINDOW_DAYS} days compared with the{' '}
                {RISING_WINDOW_DAYS} days before. Committing counts more than interest, and leadership roles count
                extra.
              </p>
            </div>
            <RisingStars stars={computed.stars} months={lastMonths(today, 12)} />
          </section>

          <section className="card stack">
            <div className="row between wrap gap-sm">
              <div>
                <h2>Where interest is</h2>
                <p className="small muted">
                  {heatView === 'location'
                    ? `People who showed interest or committed, by topic and location, in ${rangeWord}.`
                    : 'Members who picked each topic on their profile, by position.'}
                </p>
              </div>
              <div className="pills" role="group" aria-label="Heatmap view">
                <button className={`pill ${heatView === 'location' ? 'pill-on' : ''}`} onClick={() => setHeatView('location')} aria-pressed={heatView === 'location'}>
                  By location
                </button>
                <button className={`pill ${heatView === 'position' ? 'pill-on' : ''}`} onClick={() => setHeatView('position')} aria-pressed={heatView === 'position'}>
                  By position
                </button>
              </div>
            </div>
            {heatView === 'location' ? (
              <Heatmap
                data={computed.byLocation}
                columnLabels={HEATMAP_REGIONS.map((r) => REGION_LABELS[r])}
                cellNoun="people signed up"
              />
            ) : (
              <Heatmap
                data={computed.byPosition}
                columnLabels={HEATMAP_POSITIONS.map((p) => POSITION_LABELS[p])}
                cellNoun="members interested"
              />
            )}
          </section>

          <section className="card stack">
            <div>
              <h2>What to do next</h2>
              <p className="small muted">Where interest is going unmet right now.</p>
            </div>
            <Gaps gaps={computed.gaps} />
          </section>
        </div>
      )}
    </div>
  )
}
