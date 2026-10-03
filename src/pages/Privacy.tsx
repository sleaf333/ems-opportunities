import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export default function Privacy() {
  const { session } = useAuth()
  return (
    <div className={session ? 'stack-lg narrow' : 'login-page'}>
      <article className={`card stack ${session ? '' : 'login-card wide'}`}>
        <h1>What we track and who sees it</h1>
        <p>
          <strong>Why this exists:</strong> to share opportunities the moment they open, help everyone find where they
          fit, and show the group where interest is growing so it can offer more of what people want.
        </p>

        <h2>What is recorded</h2>
        <ul>
          <li>
            Your name, work email and position (employed physician, shareholder track, shareholder, APC or
            administrative staff).
          </li>
          <li>Each time you mark yourself interested, commit, join a waitlist or withdraw, and when.</li>
          <li>Attendance or completion, if the organizer records it.</li>
          <li>The interest topics you pick, anything else you write in, and leadership goals, if you add them.</li>
          <li>Changes to posts and to roles (poster, admin), and requests to post, with who made them, so mistakes can be undone.</li>
        </ul>

        <h2>What is not recorded</h2>
        <ul>
          <li>Which pages you view or what you click.</li>
          <li>Patient information of any kind. Never post it here.</li>
        </ul>

        <h2>Who sees what</h2>
        <ul>
          <li>
            <strong>Everyone signed in</strong> sees how many people have signed up for each opportunity. They see
            names only if the post's owners choose to show them.
          </li>
          <li>
            <strong>The owners of an opportunity</strong> (whoever posted it, plus co-owners they or an admin add) see who
            signed up for it, including anyone who withdrew, and can email them.
          </li>
          <li>
            <strong>Admins</strong> see everything, including the full history, interests and leadership goals, and can
            export it. A monthly backup copy is kept in the group's OneDrive or SharePoint; each download is recorded.
          </li>
        </ul>

        <h2>How it is used</h2>
        <p>
          To match people with opportunities, to understand engagement across the group, and to identify and support
          people interested in leadership. Admins may reach out to you about opportunities that match your interests.
        </p>

        <h2>How long it is kept</h2>
        <p>
          Opportunities and sign-up history are kept so the group can look back over time. Posts leave the site after
          their end date but are not deleted.
        </p>

        <p className="small muted">Questions? Contact an admin.</p>
        {!session && <Link to="/">Back to sign in</Link>}
      </article>
    </div>
  )
}
