import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import BrandLogo from '../components/BrandLogo'
import { EMAIL_DOMAIN, friendlyError, isAllowedEmail, supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sendCode(event?: FormEvent) {
    event?.preventDefault()
    setError(null)
    const address = email.trim().toLowerCase()
    if (!isAllowedEmail(address)) {
      setError(`Please use your @${EMAIL_DOMAIN} email address.`)
      return
    }
    setBusy(true)
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (sendError) {
      setError(friendlyError(sendError))
      return
    }
    setEmail(address)
    setStep('code')
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'email',
    })
    setBusy(false)
    if (verifyError) setError(friendlyError(verifyError))
    // On success the auth listener picks up the new session.
  }

  return (
    <div className="login-page">
      <div className="card login-card stack">
        <BrandLogo large />
        <div className="login-intro">
          <h1>Get involved</h1>
          <span className="rule" aria-hidden="true" />
          <p className="tagline">Committees, leadership roles and events across the group, in one place.</p>
        </div>

        {step === 'email' ? (
          <form onSubmit={sendCode} className="stack">
            <label className="field">
              <span>Work email</span>
              <input
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder={`you@${EMAIL_DOMAIN}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </label>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Sending…' : 'Email me a sign-in code'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="stack">
            <p>
              We sent a sign-in code to <strong>{email}</strong>. It can take a minute to arrive,
              so check your junk folder too.
            </p>
            <label className="field">
              <span>Sign-in code</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={10}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                required
                autoFocus
              />
            </label>
            <button className="btn btn-primary" disabled={busy || code.length < 6}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>
            <div className="row gap-sm">
              <button type="button" className="btn btn-link" onClick={() => void sendCode()} disabled={busy}>
                Send a new code
              </button>
              <button
                type="button"
                className="btn btn-link"
                onClick={() => {
                  setStep('email')
                  setCode('')
                  setError(null)
                }}
              >
                Use a different email
              </button>
            </div>
          </form>
        )}

        {error && <p className="error" role="alert">{error}</p>}

        <p className="small muted">
          You stay signed in on this device until you sign out.{' '}
          <Link to="/privacy">What we track and who sees it</Link>
        </p>
      </div>
    </div>
  )
}
