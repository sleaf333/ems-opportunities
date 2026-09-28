import { Link } from 'react-router-dom'
import { REGION_LABELS } from '../../lib/format'
import type { Gaps as GapsData } from '../../lib/insights'
import { QUIET_POST_DAYS } from '../../lib/insights'

export default function Gaps({ gaps }: { gaps: GapsData }) {
  return (
    <div className="gaps">
      <div className="gap-col">
        <h3>Wanted but not offered</h3>
        <p className="small muted">Topics members picked, with no open post.</p>
        {gaps.wanted.length === 0 ? (
          <p className="small muted">Every topic people want has an open post.</p>
        ) : (
          <ul className="list">
            {gaps.wanted.map((w) => (
              <li key={w.id} className="row between gap-sm">
                <span>
                  <strong>{w.name}</strong>
                  <span className="small muted"> · {w.interested} interested</span>
                </span>
                <Link className="btn btn-secondary btn-small" to={`/new?topic=${w.id}`}>
                  Create a post
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="gap-col">
        <h3>Quiet posts</h3>
        <p className="small muted">Open more than {QUIET_POST_DAYS} days with no commitments.</p>
        {gaps.quiet.length === 0 ? (
          <p className="small muted">No quiet posts.</p>
        ) : (
          <ul className="list">
            {gaps.quiet.map((q) => (
              <li key={q.opportunity.id} className="row between gap-sm">
                <span>
                  <Link to={`/o/${q.opportunity.id}`}>{q.opportunity.title}</Link>
                  <span className="small muted">
                    {' '}· {q.ageDays} days · {q.interested} interested
                  </span>
                </span>
                <Link className="btn btn-link" to={`/o/${q.opportunity.id}/edit`}>Edit</Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="gap-col">
        <h3>Locations with nothing open</h3>
        <p className="small muted">No location-specific posts are open here.</p>
        {gaps.emptyRegions.length === 0 ? (
          <p className="small muted">Every location has something open.</p>
        ) : (
          <div className="chips">
            {gaps.emptyRegions.map((r) => (
              <span key={r} className="tag">{REGION_LABELS[r]}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
