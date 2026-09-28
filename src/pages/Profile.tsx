import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth, useProfile } from '../auth/AuthContext'
import { fetchOpportunities, useLoader } from '../lib/data'
import { parseTags, POSITION_LABELS, ROLE_LABELS } from '../lib/format'
import { friendlyError, supabase } from '../lib/supabase'
import type { MemberInterests, MemberPosition } from '../lib/types'

export default function Profile() {
  const profile = useProfile()
  const { refreshProfile } = useAuth()
  const [fullName, setFullName] = useState(profile.full_name)
  const [position, setPosition] = useState<MemberPosition>(profile.position ?? 'physician')
  const [interests, setInterests] = useState<string[]>([])
  const [custom, setCustom] = useState('')
  const [goals, setGoals] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: opps } = useLoader(fetchOpportunities, [])
  const suggestions = useMemo(
    () => [...new Set([...(opps ?? []).flatMap((o) => o.tags), ...interests])].sort(),
    [opps, interests],
  )

  useEffect(() => {
    supabase
      .from('member_interests')
      .select('*')
      .eq('user_id', profile.id)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as MemberInterests | null
        if (row) {
          setInterests(row.interests)
          setGoals(row.leadership_goals)
        }
      })
  }, [profile.id])

  function toggle(tag: string) {
    setInterests((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    setError(null)
    const allInterests = [...new Set([...interests, ...parseTags(custom)])]
    const [a, b] = await Promise.all([
      supabase.from('profiles').update({ full_name: fullName.trim(), position }).eq('id', profile.id),
      supabase
        .from('member_interests')
        .update({ interests: allInterests, leadership_goals: goals.trim() })
        .eq('user_id', profile.id),
    ])
    setBusy(false)
    if (a.error || b.error) {
      setError(friendlyError(a.error ?? b.error))
      return
    }
    setInterests(allInterests)
    setCustom('')
    setMessage('Saved.')
    await refreshProfile()
  }

  return (
    <form className="stack-lg narrow" onSubmit={save}>
      <h1>Your profile</h1>

      <section className="card stack">
        <label className="field">
          <span>Full name</span>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </label>
        <label className="field">
          <span>Position</span>
          <select value={position} onChange={(e) => setPosition(e.target.value as MemberPosition)}>
            {Object.entries(POSITION_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
        <p className="small muted">
          {profile.email} · {ROLE_LABELS[profile.role]}
          {profile.is_shareholder ? ' · Shareholder' : ''}
        </p>
      </section>

      <section className="card stack">
        <div>
          <h2>Interests</h2>
          <p className="small muted">Only you and admins can see this section. It helps leadership match people to roles.</p>
        </div>
        <div className="chips">
          {suggestions.map((tag) => (
            <button
              type="button"
              key={tag}
              className={`chip ${interests.includes(tag) ? 'chip-on' : ''}`}
              aria-pressed={interests.includes(tag)}
              onClick={() => toggle(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Other interests (separated by commas)</span>
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="simulation, global health" />
        </label>
        <label className="field">
          <span>Leadership goals (optional)</span>
          <textarea
            rows={4}
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
            placeholder="Roles you would like to grow into, or skills you want to build."
          />
        </label>
      </section>

      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="notice">{message}</p>}
      <div>
        <button className="btn btn-primary" disabled={busy || !fullName.trim()}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}
