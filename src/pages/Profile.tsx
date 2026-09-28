import { useEffect, useState, type FormEvent } from 'react'
import { useAuth, useProfile } from '../auth/AuthContext'
import { fetchCategories } from '../lib/data'
import { POSITION_LABELS, ROLE_LABELS, SELF_POSITIONS } from '../lib/format'
import { friendlyError, supabase } from '../lib/supabase'
import type { InterestCategory, MemberInterestCategory, MemberInterests, MemberPosition } from '../lib/types'

export default function Profile() {
  const profile = useProfile()
  const { refreshProfile } = useAuth()
  const isPartner = profile.position === 'partner'
  const [fullName, setFullName] = useState(profile.full_name)
  const [position, setPosition] = useState<MemberPosition>(profile.position ?? 'employed_physician')
  const [categories, setCategories] = useState<InterestCategory[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [other, setOther] = useState('')
  const [goals, setGoals] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetchCategories(),
      supabase.from('member_interests').select('*').eq('user_id', profile.id).maybeSingle(),
      supabase.from('member_interest_categories').select('*').eq('user_id', profile.id),
    ])
      .then(([cats, interests, links]) => {
        setCategories(cats)
        const row = interests.data as MemberInterests | null
        if (row) {
          setOther(row.other_interests)
          setGoals(row.leadership_goals)
        }
        setPicked(((links.data ?? []) as MemberInterestCategory[]).map((l) => l.category_id))
      })
      .catch((err: Error) => setError(err.message))
  }, [profile.id])

  function toggle(categoryId: string) {
    setPicked((prev) => (prev.includes(categoryId) ? prev.filter((c) => c !== categoryId) : [...prev, categoryId]))
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    setError(null)
    const profileUpdate = isPartner
      ? { full_name: fullName.trim() }
      : { full_name: fullName.trim(), position }
    const [a, b] = await Promise.all([
      supabase.from('profiles').update(profileUpdate).eq('id', profile.id),
      supabase.rpc('set_my_interests', { p_category_ids: picked, p_other: other, p_goals: goals }),
    ])
    setBusy(false)
    if (a.error || b.error) {
      setError(friendlyError(a.error ?? b.error))
      return
    }
    setMessage('Saved.')
    await refreshProfile()
  }

  // Retired categories stay visible only if already picked, so they can be removed.
  const choosable = categories.filter((c) => c.active || picked.includes(c.id))

  return (
    <form className="stack-lg narrow" onSubmit={save}>
      <h1>Your profile</h1>

      <section className="card stack">
        <label className="field">
          <span>Full name</span>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </label>
        {isPartner ? (
          <div className="field">
            <span>Position</span>
            <p>
              Shareholder <span className="small muted">(set by an admin; ask an admin to change it)</span>
            </p>
          </div>
        ) : (
          <label className="field">
            <span>Position</span>
            <select value={position} onChange={(e) => setPosition(e.target.value as MemberPosition)}>
              {SELF_POSITIONS.map((v) => (
                <option key={v} value={v}>{POSITION_LABELS[v]}</option>
              ))}
            </select>
            <small>Shareholder status is set by an admin.</small>
          </label>
        )}
        <p className="small muted">
          {profile.email} · {ROLE_LABELS[profile.role]}
        </p>
      </section>

      <section className="card stack">
        <div>
          <h2>Your interests</h2>
          <p className="small muted">
            Only you and admins can see this section. Admins use it to reach out when something fits, even before it
            is posted here.
          </p>
        </div>
        <div className="chips">
          {choosable.map((c) => (
            <button
              type="button"
              key={c.id}
              className={`chip ${picked.includes(c.id) ? 'chip-on' : ''} ${c.active ? '' : 'chip-retired'}`}
              aria-pressed={picked.includes(c.id)}
              onClick={() => toggle(c.id)}
              title={c.active ? undefined : 'No longer offered; click to remove'}
            >
              {c.name}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Anything else you would like to be involved in? (optional)</span>
          <input
            value={other}
            onChange={(e) => setOther(e.target.value)}
            placeholder="e.g. simulation training, global health, informatics"
          />
          <small>Ideas that are not on the list help admins spot new opportunities.</small>
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
