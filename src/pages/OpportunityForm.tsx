import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useProfile } from '../auth/AuthContext'
import { categoriesByOpportunity, fetchCategories, fetchOpportunity, fetchOpportunityCategories } from '../lib/data'
import {
  addDays,
  ALL_POSITIONS,
  COMMITMENT_LABELS,
  eligibilityGroup,
  ELIGIBILITY_GROUPS,
  FORMAT_LABELS,
  formatDate,
  localToday,
  POSITION_LABELS,
  REGION_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
} from '../lib/format'
import { friendlyError, supabase } from '../lib/supabase'
import type {
  CommitmentLevel,
  InterestCategory,
  Opportunity,
  MemberPosition,
  OppFormat,
  OppRegion,
  OppStatus,
  OppType,
} from '../lib/types'

// New posts stay up this long unless the poster picks another date.
// Committees default to staying up indefinitely.
const DEFAULT_POSTING_DAYS = 180

interface FormState {
  title: string
  type: OppType
  description: string
  commitment: CommitmentLevel
  time_estimate: string
  eligible: MemberPosition[]
  region: OppRegion | ''
  site: string
  format: OppFormat
  capacity: string
  start_date: string
  end_date: string
  signup_deadline: string
  indefinite: boolean
  visible_until: string
  new_hire_friendly: boolean
  show_names: boolean
  contact_name: string
  contact_email: string
  status: OppStatus
}

function defaultWindow(type: OppType): Pick<FormState, 'indefinite' | 'visible_until'> {
  return { indefinite: type === 'committee', visible_until: addDays(localToday(), DEFAULT_POSTING_DAYS) }
}

function fromOpportunity(o: Opportunity): FormState {
  return {
    title: o.title,
    type: o.type,
    description: o.description,
    commitment: o.commitment,
    time_estimate: o.time_estimate,
    eligible: o.eligible_positions,
    region: o.region,
    site: o.site,
    format: o.format,
    capacity: o.capacity ? String(o.capacity) : '',
    start_date: o.start_date ?? '',
    end_date: o.end_date ?? '',
    signup_deadline: o.signup_deadline ?? '',
    indefinite: o.visible_until === null,
    visible_until: o.visible_until ?? addDays(localToday(), DEFAULT_POSTING_DAYS),
    new_hire_friendly: o.new_hire_friendly,
    show_names: o.show_names,
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
  const [searchParams] = useSearchParams()
  const presetTopic = searchParams.get('topic')
  const [form, setForm] = useState<FormState>(() => ({
    title: '',
    type: 'committee',
    description: '',
    commitment: 'ongoing',
    time_estimate: '',
    eligible: ALL_POSITIONS,
    region: '',
    site: '',
    format: 'in_person',
    capacity: '',
    start_date: '',
    end_date: '',
    signup_deadline: '',
    ...defaultWindow('committee'),
    new_hire_friendly: false,
    show_names: false,
    contact_name: profile.full_name,
    contact_email: profile.email,
    status: 'open',
  }))
  const [windowTouched, setWindowTouched] = useState(false)
  const [commitmentTouched, setCommitmentTouched] = useState(false)
  const [categories, setCategories] = useState<InterestCategory[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [original, setOriginal] = useState<Opportunity | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) {
      fetchCategories()
        .then((cats) => {
          setCategories(cats)
          if (presetTopic && cats.some((c) => c.id === presetTopic && c.active)) setPicked([presetTopic])
        })
        .catch((err: Error) => setLoadError(err.message))
      return
    }
    Promise.all([fetchOpportunity(id), fetchCategories(), fetchOpportunityCategories()])
      .then(([opp, cats, links]) => {
        if (!opp) {
          setLoadError('This opportunity does not exist.')
          return
        }
        setOriginal(opp)
        setCategories(cats)
        setForm(fromOpportunity(opp))
        setPicked((categoriesByOpportunity(links, cats).get(id) ?? []).map((c) => c.id))
      })
      .catch((err: Error) => setLoadError(err.message))
  }, [id, presetTopic])

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

  function changeType(type: OppType) {
    // On a new post, keep sensible defaults matched to the type until the
    // poster changes them: committees are ongoing and stay up indefinitely;
    // events are one-time and stay up 180 days.
    setForm((prev) => ({
      ...prev,
      type,
      ...(!editing && !windowTouched ? defaultWindow(type) : {}),
      ...(!editing && !commitmentTouched
        ? { commitment: type === 'committee' ? 'ongoing' : type === 'event' ? 'one_time' : prev.commitment }
        : {}),
    }))
  }

  function togglePicked(categoryId: string) {
    setPicked((prev) => (prev.includes(categoryId) ? prev.filter((c) => c !== categoryId) : [...prev, categoryId]))
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!form.region) {
      setError('Please choose a location.')
      return
    }
    if (form.eligible.length === 0) {
      setError('Choose at least one position under "Who can sign up".')
      return
    }
    if (form.start_date && form.end_date && form.end_date < form.start_date) {
      setError('The end date is before the start date.')
      return
    }
    if (!form.indefinite && !form.visible_until) {
      setError('Pick a "Show on site until" date, or choose "Keep posted indefinitely".')
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
      eligible_positions: ALL_POSITIONS.filter((p) => form.eligible.includes(p)),
      region: form.region,
      site: form.site.trim(),
      format: form.format,
      capacity,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      signup_deadline: form.signup_deadline || null,
      visible_until: form.indefinite ? null : form.visible_until,
      new_hire_friendly: form.new_hire_friendly,
      show_names: form.show_names,
      contact_name: form.contact_name.trim(),
      contact_email: form.contact_email.trim(),
      status: form.status,
    }
    setBusy(true)
    const result = editing
      ? await supabase.from('opportunities').update(values).eq('id', id!).select('id').single()
      : await supabase.from('opportunities').insert(values).select('id').single()
    if (result.error) {
      setBusy(false)
      setError(friendlyError(result.error))
      return
    }
    const savedId = result.data.id as string
    const topics = await supabase.rpc('set_opportunity_categories', {
      p_opportunity_id: savedId,
      p_category_ids: picked,
    })
    setBusy(false)
    if (topics.error) {
      setError(`Saved, but the topics could not be updated: ${friendlyError(topics.error)}`)
      return
    }
    navigate(`/o/${savedId}`)
  }

  // Retired categories stay visible only if this post already uses them.
  const choosable = categories.filter((c) => c.active || picked.includes(c.id))

  return (
    <form className="stack-lg narrow" onSubmit={save}>
      <div className="stack-sm">
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
        <label className="field field-narrow">
          <span>Type</span>
          <select value={form.type} onChange={(e) => changeType(e.target.value as OppType)}>
            {Object.entries(TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
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
        <div>
          <h2>Who can sign up</h2>
          <p className="small muted">
            Everyone can see this post. Only the positions checked can mark Interested or Commit.
          </p>
        </div>
        <div className="chips" role="group" aria-label="Quick choices">
          {ELIGIBILITY_GROUPS.map((g) => (
            <button
              type="button"
              key={g.key}
              className={`chip ${eligibilityGroup(form.eligible) === g.key ? 'chip-on' : ''}`}
              aria-pressed={eligibilityGroup(form.eligible) === g.key}
              onClick={() => set('eligible', g.positions)}
            >
              {g.label}
            </button>
          ))}
        </div>
        <div className="checks">
          {ALL_POSITIONS.map((p) => (
            <label key={p} className="check">
              <input
                type="checkbox"
                checked={form.eligible.includes(p)}
                onChange={(e) =>
                  set('eligible', e.target.checked ? [...form.eligible, p] : form.eligible.filter((x) => x !== p))
                }
              />
              {POSITION_LABELS[p]}
            </label>
          ))}
        </div>
      </section>

      <section className="card stack">
        <h2>Where</h2>
        <div className="grid-2">
          <label className="field">
            <span>
              Location <span className="required">(required)</span>
            </span>
            <select value={form.region} onChange={(e) => set('region', e.target.value as OppRegion)} required>
              <option value="" disabled>
                Choose a location
              </option>
              {Object.entries(REGION_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <small>Pick the location that owns this, even if it meets virtually.</small>
          </label>
          <label className="field">
            <span>Format</span>
            <select value={form.format} onChange={(e) => set('format', e.target.value as OppFormat)}>
              {Object.entries(FORMAT_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>
            Specific hospital or site <span className="optional">(optional, you can leave this blank)</span>
          </span>
          <input
            value={form.site}
            onChange={(e) => set('site', e.target.value)}
            placeholder="e.g. Ascension St. Elizabeth"
            maxLength={120}
          />
        </label>
      </section>

      <section className="card stack">
        <h2>When</h2>
        <div className="grid-2">
          <label className="field">
            <span>Time commitment</span>
            <select
              value={form.commitment}
              onChange={(e) => {
                setCommitmentTouched(true)
                set('commitment', e.target.value as CommitmentLevel)
              }}
            >
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
      </section>

      <section className="card stack">
        <div>
          <h2>How long it stays on the site</h2>
          <p className="small muted">
            This is separate from the dates above. When this date passes, the post leaves the list, but it is never
            deleted. You can change the date later to put it back up.
          </p>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={form.indefinite}
            onChange={(e) => {
              setWindowTouched(true)
              set('indefinite', e.target.checked)
            }}
          />
          Keep posted indefinitely
        </label>
        {!form.indefinite && (
          <label className="field field-narrow">
            <span>Show on site until</span>
            <input
              type="date"
              value={form.visible_until}
              min={editing ? undefined : localToday()}
              onChange={(e) => {
                setWindowTouched(true)
                set('visible_until', e.target.value)
              }}
              required
            />
            <small>
              {form.visible_until ? `Stays up through ${formatDate(form.visible_until)}.` : ''} New posts default to{' '}
              {DEFAULT_POSTING_DAYS} days; committees default to indefinitely.
            </small>
          </label>
        )}
      </section>

      <section className="card stack">
        <h2>Topics and sign-ups</h2>
        <div className="field">
          <span>Topics</span>
          {choosable.length === 0 ? (
            <small>No topics yet. An admin can add them on the Admin page.</small>
          ) : (
            <div className="chips">
              {choosable.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  className={`chip ${picked.includes(c.id) ? 'chip-on' : ''}`}
                  aria-pressed={picked.includes(c.id)}
                  onClick={() => togglePicked(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
          <small>Members who picked these topics as interests are the people most likely to join.</small>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={form.new_hire_friendly}
            onChange={(e) => set('new_hire_friendly', e.target.checked)}
          />
          Good for new hires
        </label>
        <label className="check check-top">
          <input type="checkbox" checked={form.show_names} onChange={(e) => set('show_names', e.target.checked)} />
          <span>
            Show names of who signed up to all members
            <small className="block muted">
              Off by default: members see only how many have signed up. You and admins always see the names.
            </small>
          </span>
        </label>
      </section>

      <section className="card stack">
        <h2>Contact and status</h2>
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
          <span>Status</span>
          <select value={form.status} onChange={(e) => set('status', e.target.value as OppStatus)}>
            {Object.entries(STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <small>
            Draft: only you and admins see it. Closed: visible, no new sign-ups. Archived: hidden from the list.
            Posts are never deleted, so their history stays available.
          </small>
        </label>
      </section>

      {error && <p className="error" role="alert">{error}</p>}

      <div>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Post'}
        </button>
      </div>
    </form>
  )
}
