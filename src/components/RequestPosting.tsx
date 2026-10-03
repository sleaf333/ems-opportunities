import { useState, type FormEvent } from 'react'
import { Send } from 'lucide-react'
import { useAuth, useProfile } from '../auth/AuthContext'
import { useLoader } from '../lib/data'
import { formatDate } from '../lib/format'
import { friendlyError, supabase } from '../lib/supabase'
import type { PostRequest } from '../lib/types'

// What members see under "Post": ask for posting access instead of a dead end.
export default function RequestPosting() {
  const profile = useProfile()
  const { refreshProfile } = useAuth()
  const { data: latest, error: loadError, reload } = useLoader(async () => {
    const { data, error } = await supabase
      .from('post_requests')
      .select('*')
      .eq('user_id', profile.id)
      .order('id', { ascending: false })
      .limit(1)
    if (error) throw new Error(error.message)
    return ((data as PostRequest[])[0] ?? null) as PostRequest | null
  }, [profile.id])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('request_posting', { p_note: note })
    setBusy(false)
    if (rpcError) {
      setError(friendlyError(rpcError))
      return
    }
    setNote('')
    await reload()
  }

  if (loadError) return <p className="error">Could not load your request: {loadError}</p>
  if (latest === undefined) return <p className="muted">Loading…</p>

  if (latest?.status === 'pending') {
    return (
      <div className="card stack narrow">
        <h1>Request sent</h1>
        <p>
          Your request to post was sent on {formatDate(latest.requested_at.slice(0, 10))}. An admin will look at it
          soon. Check back here: once it's approved, this page becomes the posting form.
        </p>
        {latest.note && <p className="small muted">You wrote: "{latest.note}"</p>}
      </div>
    )
  }

  if (latest?.status === 'approved') {
    // Approved since this page was opened; load the new role.
    return (
      <div className="card stack narrow">
        <h1>You can post now</h1>
        <p>Your request was approved.</p>
        <div>
          <button className="btn btn-primary" onClick={() => void refreshProfile()}>
            Start a post
          </button>
        </div>
      </div>
    )
  }

  return (
    <form className="card stack narrow" onSubmit={(e) => void send(e)}>
      <h1>Want to post something?</h1>
      <p>
        Posting is open to anyone in the group: committee needs, events, projects or leadership roles. Ask for
        posting access and an admin will turn it on for you.
      </p>
      {latest?.status === 'declined' && (
        <p className="small muted">
          Your last request ({formatDate(latest.requested_at.slice(0, 10))}) wasn't approved. You're welcome to ask
          again, and a note about what you'd like to post helps.
        </p>
      )}
      <label className="field">
        <span>What would you like to post? (optional)</span>
        <textarea
          rows={3}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="For example: a recurring ultrasound teaching session in Fox Valley"
        />
      </label>
      <div>
        <button className="btn btn-primary" disabled={busy}>
          <Send size={15} aria-hidden="true" /> {busy ? 'Sending…' : 'Request posting access'}
        </button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  )
}
