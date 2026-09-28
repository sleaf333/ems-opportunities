import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useProfile } from '../auth/AuthContext'
import { fetchOpportunity } from '../lib/data'
import { AUDIENCE_LABELS, COMMITMENT_LABELS, parseTags, STATUS_LABELS, TYPE_LABELS } from '../lib/format'
import { friendlyError, supabase } from '../lib/supabase'
import type { CommitmentLevel, Opportunity, OppAudience, OppStatus, OppType } from '../lib/types'

interface FormState {
  title: string
  type: OppType
  description: string
  commitment: CommitmentLevel
  time_estimate: string
  audience: OppAudience
  capacity: string
  start_date: string
  end_date: string
  signup_deadline: string
  new_hire_friendly: boolean
  tags: string
  contact_name: string
  contact_email: string
  status: OppStatus
}

const EMPTY: FormState = {
  title: '',
  type: 'committee',
  description: '',
  commitment: 'ongoing',
  time_estimate: '',
  audience: 'all',
  capacity: '',
  start_date: '',
  end_date: '',
  signup_deadline: '',
  new_hire_friendly: false,
  tags: '',
  contact_name: '',
  contact_email: '',
  status: 'open',
}

function fromOpportunity(o: Opportunity): FormState {
  return {
    title: o.title,
    type: o.type,
    description: o.description,
    commitment: o.commitment,
    time_estimate: o.time_estimate,
    audience: o.audience,
    capacity: o.capacity ? String(o.capacity) : '',
    start_date: o.start_date ?? '',
    end_date: o.end_date ?? '',
    signup_deadline: o.signup_deadline ?? '',
    new_hire_friendly: o.new_hire_friendly,
    tags: o.tags.join(', '),
    contact_name: o.contact_name,
    contact_email: o.contact_email,
    status: o.status,
  }
}

export default function OpportunityForm() {
  const { id } = useParams()
  const editing = Boolean(id)
  const profile = useProfile()
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>(() => ({
    ...EMPTY,
    contact_name: profile.full_name,
    contact_email: profile.email,
  }))
  const [original, setOriginal] = useState<Opportunity | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    fetchOpportunity(id)
      .then((opp) => {
        if (!opp) setLoadError('This opportunity does not exist.')
        else {
          setOriginal(opp)
          setForm(fromOpportunity(opp))
        }
      })
      .catch((err: Error) => setLoadError(err.message))
  }, [id])

  const canPost = profile.role === 'poster' || profile.role === 'admin'
  const canEdit =
    profile.role === 'admin' || (profile.role === 'poster' && (!original || original.created_by === profile.id))

  if (!canPost || (editing && original && !canEdit)) {
    return (
      <div className="card">
        <h1>Posting not available</h1>
        <p>An admin needs to approve you as a poster first.</p>
      </div>
    )
  }
  if (loadError) return <p className="error">{loadError}</p>
  if (editing && !original) return <p className="muted">Loading…</p>

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (form.start_date && form.end_date && form.end_date < form.start_date) {
      setError('The end date is before the start date.')
      return
    }
    const capacity = form.capacity.trim() ? Number(form.capacity) : null
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) {
      setError('Spots must be a whole number of 1 or more, or left blank for no limit.')
      return
    }
    const values = {
      title: form.title.trim(),
      type: form.type,
      description: form.description.trim(),
      commitment: form.commitment,
      time_estimate: form.time_estimate.trim(),
      audience: form.audience,
      capacity,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      signup_deadline: form.signup_deadline || null,
      new_hire_friendly: form.new_hire_friendly,
      tags: parseTags(form.tags),
      contact_name: form.contact_name.trim(),
      contact_email: form.contact_email.trim(),
      status: form.status,
    }
    setBusy(true)
    const result = editing
      ? await supabase.from('opportunities').update(values).eq('id', id!).select('id').single()
      : await supabase.from('opportunities').insert(values).select('id').single()
    setBusy(false)
    if (result.error) {
      setError(friendlyError(result.error))
      return
    }
    navigate(`/o/${result.data.id}`)
  }

  async function remove() {
    if (!id) return
    if (!window.confirm('Delete this opportunity and all of its sign-up history? This cannot be undone. Closing or archiving keeps the history.')) return
    setBusy(true)
    const { error: deleteError } = await supabase.from('opportunities').delete().eq('id', id)
    setBusy(false)
    if (deleteError) setError(friendlyError(deleteError))
    else navigate('/')
  }

  return (
    <form className="stack-lg narrow" onSubmit={save}>
      <div>
        <Link to={editing ? `/o/${id}` : '/'} className="small">← Back</Link>
        <h1>{editing ? 'Edit opportunity' : 'Post an opportunity'}</h1>
      </div>

      <div className="warning">
        Never include patient information. Everyone in the group can see what you post.
      </div>

      <section className="card stack">
        <label className="field">
          <span>Title</span>
          <input value={form.title} onChange={(e) => set('title', e.target.value)} required maxLength={150} />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Type</span>
            <select value={form.type} onChange={(e) => set('type', e.target.value as OppType)}>
              {Object.entries(TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Who can commit</span>
            <select value={form.audience} onChange={(e) => set('audience', e.target.value as OppAudience)}>
              {Object.entries(AUDIENCE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <small>Anyone can mark themselves as interested.</small>
          </label>
        </div>
        <label className="field">
          <span>Description</span>
          <textarea
            rows={7}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder={'Start lines with "- " to make bullet points.\n- Attend monthly meetings\n- Help plan the annual event'}
          />
        </label>
      </section>

      <section className="card stack">
        <h2>Time and spots</h2>
        <div className="grid-2">
          <label className="field">
            <span>Time commitment</span>
            <select value={form.commitment} onChange={(e) => set('commitment', e.target.value as CommitmentLevel)}>
              {Object.entries(COMMITMENT_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Time needed (optional)</span>
            <input
              value={form.time_estimate}
              onChange={(e) => set('time_estimate', e.target.value)}
              placeholder="e.g. 1-hour meeting each month"
            />
          </label>
          <label className="field">
            <span>Start date (optional)</span>
            <input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
          </label>
          <label className="field">
            <span>End date (optional)</span>
            <input type="date" value={form.end_date} onChange={(e) => set('end_date', e.target.value)} />
          </label>
          <label className="field">
            <span>Sign-up deadline (optional)</span>
            <input type="date" value={form.signup_deadline} onChange={(e) => set('signup_deadline', e.target.value)} />
            <small>Sign-ups stay open through the end of this day.</small>
          </label>
          <label className="field">
            <span>Number of spots (optional)</span>
            <input
              type="number"
              min={1}
              step={1}
              value={form.capacity}
              onChange={(e) => set('capacity', e.target.value)}
              placeholder="No limit"
            />
            <small>When full, new commitments go on a waitlist.</small>
          </label>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={form.new_hire_friendly}
            onChange={(e) => set('new_hire_friendly', e.target.checked)}
          />
          Good for new hires
        </label>
      </section>

      <section className="card stack">
        <h2>Contact and topics</h2>
        <div className="grid-2">
          <label className="field">
            <span>Contact name</span>
            <input value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} />
          </label>
          <label className="field">
            <span>Contact email</span>
            <input type="email" value={form.contact_email} onChange={(e) => set('contact_email', e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Topics (optional, separated by commas)</span>
          <input value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="education, wellness" />
        </label>
        <label className="field">
          <span>Status</span>
          <select value={form.status} onChange={(e) => set('status', e.target.value as OppStatus)}>
            {Object.entries(STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <small>Draft: only you and admins see it. Closed: visible, no new sign-ups. Archived: hidden from the list.</small>
        </label>
      </section>

      {error && <p className="error" role="alert">{error}</p>}

      <div className="row between wrap gap-sm">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Post'}
        </button>
        {editing && profile.role === 'admin' && (
          <button type="button" className="btn btn-link danger" onClick={() => void remove()} disabled={busy}>
            Delete
          </button>
        )}
      </div>
    </form>
  )
}
