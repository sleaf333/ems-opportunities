import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'

interface Suggestion {
  email: string
  full_name: string
  signed_in: boolean
}

// A box where a lead (or admin) types part of a name or email and picks the
// person from suggestions (find_people, 0014). Signed-in people match on
// name; people loaded in advance match on email. A full email can always be
// typed instead. The value is the email the parent submits.
export default function PersonPicker({
  label,
  value,
  onChange,
  help,
  disabled,
}: {
  label: string
  value: string
  onChange: (email: string) => void
  help?: ReactNode
  disabled?: boolean
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const picked = useRef(false)
  const listRef = useRef<HTMLUListElement>(null)
  const id = useId()
  const listId = `${id}-list`

  // Look people up as they type (after a short pause), unless a suggestion
  // was just picked.
  useEffect(() => {
    if (picked.current) {
      picked.current = false
      return
    }
    const query = value.trim()
    if (query.length < 2) {
      setSuggestions([])
      return
    }
    let stale = false
    const timer = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc('find_people', { p_query: query })
      if (stale) return
      setSuggestions(error ? [] : ((data ?? []) as Suggestion[]))
      setOpen(true)
    }, 250)
    return () => {
      stale = true
      window.clearTimeout(timer)
    }
  }, [value])

  function pick(s: Suggestion) {
    picked.current = true
    onChange(s.email)
    setSuggestions([])
    setOpen(false)
  }

  function onInputKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && suggestions.length > 0) {
      event.preventDefault()
      listRef.current?.querySelector('button')?.focus()
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  function onListKey(event: KeyboardEvent<HTMLUListElement>) {
    const buttons = Array.from(listRef.current?.querySelectorAll('button') ?? [])
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'ArrowDown' && at < buttons.length - 1) {
      event.preventDefault()
      buttons[at + 1].focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (at > 0) buttons[at - 1].focus()
      else document.getElementById(id)?.focus()
    } else if (event.key === 'Escape') {
      setOpen(false)
      document.getElementById(id)?.focus()
    }
  }

  const showList = open && value.trim().length >= 2

  return (
    <div className="field person-picker">
      <label htmlFor={id} className="person-picker-label">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onInputKey}
        placeholder="Type a name or email"
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
      />
      {showList && (
        <ul id={listId} ref={listRef} className="person-suggestions" role="listbox" onKeyDown={onListKey}>
          {suggestions.length === 0 ? (
            <li className="small muted">No match. You can type their full work email instead.</li>
          ) : (
            suggestions.map((s) => (
              <li key={s.email} role="option" aria-selected={false}>
                <button type="button" onClick={() => pick(s)}>
                  <span>{s.full_name || s.email}</span>
                  <span className="small muted">
                    {s.full_name ? s.email : ''}
                    {!s.signed_in ? `${s.full_name ? ' · ' : ''}not signed in yet` : ''}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      {help && <small>{help}</small>}
    </div>
  )
}
