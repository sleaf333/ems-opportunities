import { useEffect, useRef, useState, type ReactNode } from 'react'

// A button that asks "are you sure?" on the page itself. The browser's own
// pop-up (window.confirm) is silently blocked by some in-app browsers, such as
// links opened from the Outlook app on iPhone, so it must never be used.
export default function ConfirmAction({
  label,
  question,
  detail,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  disabled,
  className = 'btn btn-link danger',
  ariaLabel,
}: {
  label: ReactNode
  question: string
  detail?: string
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void | Promise<void>
  disabled?: boolean
  className?: string
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) confirmRef.current?.focus()
  }, [open])

  if (!open) {
    return (
      <button type="button" className={className} disabled={disabled} aria-label={ariaLabel} onClick={() => setOpen(true)}>
        {label}
      </button>
    )
  }

  return (
    <div className="confirm-inline" role="group" aria-label={question}>
      <p className="small">
        <strong>{question}</strong>
        {detail ? ` ${detail}` : ''}
      </p>
      <div className="row wrap gap-sm">
        <button
          ref={confirmRef}
          type="button"
          className="btn btn-danger btn-small"
          disabled={disabled}
          onClick={async () => {
            setOpen(false)
            await onConfirm()
          }}
        >
          {confirmLabel}
        </button>
        <button type="button" className="btn btn-link small" onClick={() => setOpen(false)}>
          {cancelLabel}
        </button>
      </div>
    </div>
  )
}
