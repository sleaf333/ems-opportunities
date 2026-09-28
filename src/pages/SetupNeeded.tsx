export default function SetupNeeded() {
  return (
    <div className="login-page">
      <div className="card login-card stack">
        <h1>Almost there</h1>
        <p>
          This site is not connected to its database yet. Set <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> (see <code>docs/SETUP.md</code>) and rebuild.
        </p>
      </div>
    </div>
  )
}
