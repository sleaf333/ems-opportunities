import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth, useProfile } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import BrandLogo from './BrandLogo'

export default function Layout() {
  const profile = useProfile()
  const { signOut } = useAuth()
  const location = useLocation()
  const canPost = profile.role === 'poster' || profile.role === 'admin'
  // Members can co-own posts without being posters; they need My posts too.
  const [ownsPosts, setOwnsPosts] = useState(false)
  useEffect(() => {
    if (canPost) return
    let current = true
    void supabase
      .from('opportunity_owners')
      .select('opportunity_id', { count: 'exact', head: true })
      .eq('user_id', profile.id)
      .then(({ count }) => {
        if (current) setOwnsPosts((count ?? 0) > 0)
      })
    return () => {
      current = false
    }
  }, [canPost, profile.id])

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand" aria-label="EMS Opportunities home">
            <BrandLogo />
          </Link>
          <nav className="nav">
            <NavLink to="/" end>Opportunities</NavLink>
            <NavLink to="/mine">My sign-ups</NavLink>
            {(canPost || ownsPosts) && <NavLink to="/my-posts">My posts</NavLink>}
            {canPost && <NavLink to="/new">Post</NavLink>}
            {profile.role === 'admin' && <NavLink to="/admin/insights" className={({ isActive }) => (isActive || location.pathname === '/admin' ? 'active' : '')}>Admin</NavLink>}
            <NavLink to="/profile">Profile</NavLink>
            <button className="btn btn-link nav-signout" onClick={() => void signOut()}>
              Sign out
            </button>
          </nav>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
      <footer className="footer container">
        <Link to="/privacy">What we track and who sees it</Link>
        <span>Never post patient information on this site.</span>
      </footer>
    </div>
  )
}
