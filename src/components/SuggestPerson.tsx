import { useState, type FormEvent } from 'react'
import { Send } from 'lucide-react'
import PersonPicker from './PersonPicker'
import { friendlyError, supabase } from '../lib/supabase'

const NOTE_MAX = 300

// "Suggest someone" (0015): any signed-in member names a colleague for this
// post, and the colleague gets one email saying who suggested them. The
// database (suggest_person) checks eligibility, limits and the admin switch;
// this only collects the name and note.
export default function SuggestPerson({ opportunityId, onSent }: { opportunityId: string; onSent?: () => void }) {
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function send(event: FormEvent) {
    event.preventDefault()
    setSending(true)
    setError(null)
    setResult(null)
    const { data, error: rpcError } = await supabase.rpc('suggest_person', {
      p_opportunity_id: opportunityId,
      p_email: email.trim().toLowerCase(),
      p_note: note.trim(),
    })
    setSending(false)
    if (rpcError) {
      setError(friendlyError(rpcError))
      return
    }
    setResult(
      data === 'already_in'
        ? "They're already on this or have raised a hand."
        : data === 'already_suggested'
          ? 'Someone already suggested them for this recently.'
          : 'Sent. Thanks for thinking of them.',
    )
    if (data === 'sent') {
      setEmail('')
      setNote('')
      onSent?.()
    }
  }

  return (
    <details className="suggest">
      <summary>Know someone who'd be a good fit? Suggest them</summary>
      <form className="stack-sm" onSubmit={send}>
        <PersonPicker label="Colleague" value={email} onChange={setEmail} />
        <label className="field">
          <span>Note (optional)</span>
          <textarea
            rows={3}
            value={note}
            maxLength={NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why you thought of them"
          />
          <small>
            {note.length}/{NOTE_MAX}
          </small>
        </label>
        <p className="small muted">
          They'll get one email from the site saying you suggested them, with a link to this post.
        </p>
        <div>
          <button className="btn btn-secondary btn-small" disabled={sending || !email.includes('@')}>
            <Send size={14} aria-hidden="true" /> {sending ? 'Sending…' : 'Send suggestion'}
          </button>
        </div>
        {result && <p className="notice">{result}</p>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
    </details>
  )
}
