import { useState, type FormEvent } from 'react'
import { useAuth, useProfile } from '../auth/AuthContext'
import { POSITION_LABELS, SELF_POSITIONS } from '../lib/format'
import { friendlyError, supabase } from '../lib/supabase'
import type { MemberPosition } from '../lib/types'

export default function CompleteProfile() {
  const profile = useProfile()
  const { refreshProfile, signOut } = useAuth()
  const [fullName, setFullName] = useState(profile.full_name)
  const isPartner = profile.position === 'partner'
  const [position, setPosition] = useState<MemberPosition | ''>(profile.position ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!fullName.trim() || !position) return
    setBusy(true)
    setError(null)
    const { error: saveError } = await supabase
      .from('profiles')
      .update(isPartner ? { full_name: fullName.trim() } : { full_name: fullName.trim(), position })
      .eq('id', profile.id)
    setBusy(false)
    if (saveError) {
      setError(friendlyError(saveError))
      return
    }
    await refreshProfile()
  }

  return (
    <div className="login-page">
      <form className="card login-card stack" onSubmit={save}>
        <h1>Welcome</h1>
        <p className="muted">
          Tell us who you are. Your name shows on the opportunities you sign up for.
        </p>
        <label className="field">
          <span>Full name</span>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Smith, MD"
            required
            autoFocus
          />
        </label>
        {isPartner ? (
          <div className="field">
            <span>Position</span>
            <p>
              Shareholder <span className="small muted">(set by an admin)</span>
            </p>
          </div>
        ) : (
          <label className="field">
            <span>Position</span>
            <select value={position} onChange={(e) => setPosition(e.target.value as MemberPosition)} required>
              <option value="" disabled>
                Choose one
              </option>
              {SELF_POSITIONS.map((value) => (
                <option key={value} value={value}>
                  {POSITION_LABELS[value]}
                </option>
              ))}
            </select>
            <small>Shareholders: choose your closest match for now. An admin marks shareholders.</small>
          </label>
        )}
        <button className="btn btn-primary" disabled={busy || !fullName.trim() || !position}>
          {busy ? 'Saving…' : 'Continue'}
        </button>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="button" className="btn btn-link" onClick={() => void signOut()}>
          Sign out
        </button>
      </form>
    </div>
  )
}
