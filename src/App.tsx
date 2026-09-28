import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import Layout from './components/Layout'
import { isConfigured } from './lib/supabase'
import Admin from './pages/Admin'
import CompleteProfile from './pages/CompleteProfile'
import Login from './pages/Login'
import MySignups from './pages/MySignups'
import NotFound from './pages/NotFound'
import OpportunityDetail from './pages/OpportunityDetail'
import OpportunityForm from './pages/OpportunityForm'
import OpportunityList from './pages/OpportunityList'
import Privacy from './pages/Privacy'
import Profile from './pages/Profile'
import SetupNeeded from './pages/SetupNeeded'

function Gate() {
  const { session, profile, loading, profileError, signOut } = useAuth()

  if (loading) return <div className="login-page muted">Loading…</div>

  if (!session) {
    return (
      <Routes>
        <Route path="/privacy" element={<Privacy />} />
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  if (!profile) {
    return (
      <div className="login-page">
        <div className="card login-card stack">
          <h1>Something went wrong</h1>
          <p>{profileError ?? 'Your profile could not be loaded.'}</p>
          <button className="btn btn-secondary" onClick={() => void signOut()}>Sign out</button>
        </div>
      </div>
    )
  }

  if (!profile.full_name.trim() || !profile.position) return <CompleteProfile />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<OpportunityList />} />
        <Route path="o/:id" element={<OpportunityDetail />} />
        <Route path="o/:id/edit" element={<OpportunityForm key="edit" />} />
        <Route path="new" element={<OpportunityForm key="new" />} />
        <Route path="mine" element={<MySignups />} />
        <Route path="profile" element={<Profile />} />
        <Route path="admin" element={<Admin />} />
        <Route path="privacy" element={<Privacy />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  if (!isConfigured) return <SetupNeeded />
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  )
}
