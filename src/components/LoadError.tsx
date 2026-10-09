import { useState } from 'react'
import { RefreshCw } from 'lucide-react'

// Shown when a page still can't load after the automatic retries: a plain
// message and a Try again button, instead of a dead end.
export default function LoadError({ what, error, onRetry }: { what: string; error: string; onRetry: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="card stack load-error" role="alert">
      <p>
        <strong>Couldn't load {what}.</strong> This is usually a brief connection hiccup.
      </p>
      <div>
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            await onRetry()
            setBusy(false)
          }}
        >
          <RefreshCw size={15} aria-hidden="true" /> {busy ? 'Trying…' : 'Try again'}
        </button>
      </div>
      <p className="small muted">Details: {error}</p>
    </div>
  )
}
