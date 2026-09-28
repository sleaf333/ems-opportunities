import { Avatar } from '../Avatars'
import { downloadCsv, toCsv } from '../../lib/csv'
import { displayName, localToday, POSITION_LABELS } from '../../lib/format'
import { RISING_WINDOW_DAYS, type RisingStar } from '../../lib/insights'
import Sparkline from './Sparkline'

function monthName(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

export default function RisingStars({ stars, months }: { stars: RisingStar[]; months: string[] }) {
  function exportCsv() {
    downloadCsv(
      `rising-stars-${localToday()}.csv`,
      toCsv(
        ['Name', 'Email', 'Position', `Score last ${RISING_WINDOW_DAYS} days`, `Score ${RISING_WINDOW_DAYS} days before`, 'Growth', 'Top topics', 'Leadership goals'],
        stars.map((s) => [
          s.profile.full_name, s.profile.email, s.profile.position ? POSITION_LABELS[s.profile.position] : '',
          s.recent, s.prior, s.growth, s.topTopics.join('; '), s.goals,
        ]),
      ),
    )
  }

  if (stars.length === 0) {
    return (
      <p className="muted">
        No one's involvement has grown over the last {RISING_WINDOW_DAYS} days yet. This fills in as people sign up.
      </p>
    )
  }

  const labels = months.map(monthName)
  return (
    <div className="stack-sm">
      <div className="table-wrap">
        <table className="stars">
          <thead>
            <tr>
              <th>Person</th>
              <th>Last 12 months</th>
              <th className="num" title={`Score in the last ${RISING_WINDOW_DAYS} days, and the change from the ${RISING_WINDOW_DAYS} days before`}>
                Recent score
              </th>
              <th>Top topics</th>
              <th>Leadership goals</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {stars.map((s) => (
              <tr key={s.profile.id}>
                <td>
                  <div className="row gap-sm">
                    <Avatar person={s.profile} size={32} />
                    <div>
                      <div className="strong">{displayName(s.profile)}</div>
                      <div className="small muted">{s.profile.position ? POSITION_LABELS[s.profile.position] : ''}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <Sparkline values={s.series} months={labels} label={`${displayName(s.profile)}, involvement over the last 12 months`} />
                </td>
                <td className="num">
                  <strong>{s.recent}</strong>
                  <div className="small muted">+{s.growth} vs before</div>
                </td>
                <td>
                  <div className="chips">
                    {s.topTopics.map((t) => (
                      <span key={t} className="tag">{t}</span>
                    ))}
                  </div>
                </td>
                <td className="small goals">{s.goals ? (s.goals.length > 90 ? `${s.goals.slice(0, 90)}…` : s.goals) : '—'}</td>
                <td>
                  <a className="btn btn-link" href={`mailto:${s.profile.email}`}>Email</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <button className="btn btn-secondary" onClick={exportCsv}>Export rising stars</button>
      </div>
    </div>
  )
}
