import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export default function Privacy() {
  const { session } = useAuth()
  return (
    <div className={session ? 'stack-lg narrow' : 'login-page'}>
      <article className={`card stack ${session ? '' : 'login-card wide'}`}>
        <h1>What we track and who sees it</h1>
        <p>
          This site helps the group share committee, leadership and event opportunities, and helps leadership understand
          who is interested in what, so we can support people who want to get more involved.
        </p>

        <h2>What is recorded</h2>
        <ul>
          <li>Your name, work email and position (Physician, APC or Staff).</li>
          <li>Each time you mark yourself interested, commit, join a waitlist or withdraw, and when.</li>
          <li>Attendance or completion, if the organizer records it.</li>
          <li>Interests and leadership goals, if you add them to your profile.</li>
        </ul>

        <h2>What is not recorded</h2>
        <ul>
          <li>Which pages you view or what you click.</li>
          <li>Patient information of any kind. Never post it here.</li>
        </ul>

        <h2>Who sees what</h2>
        <ul>
          <li>
            <strong>Everyone signed in</strong> sees who is interested in, committed to, waitlisted for or completed
            each opportunity.
          </li>
          <li>
            <strong>The person who posted an opportunity</strong> also sees who withdrew from it.
          </li>
          <li>
            <strong>Admins</strong> see everything, including the full history, interests and leadership goals, and can
            export it.
          </li>
        </ul>

        <h2>How it is used</h2>
        <p>
          To match people with opportunities, to understand engagement across the group, and to identify and support
          people interested in leadership.
        </p>

        <p className="small muted">Questions? Contact an admin.</p>
        {!session && <Link to="/">Back to sign in</Link>}
      </article>
    </div>
  )
}
