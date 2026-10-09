import { useState } from 'react'
import { Check, Mail, RefreshCw, X } from 'lucide-react'
import ConfirmAction from './ConfirmAction'
import { useLoader } from '../lib/data'
import { formatDateTime } from '../lib/format'
import { friendlyError, supabase } from '../lib/supabase'

// What admin_notification_status() returns (0011).
interface LogRow {
  id: number
  kind: 'owner_digest' | 'member_nudge' | 'test' | 'setting'
  status: 'queued' | 'sent' | 'failed' | 'unknown' | 'done'
  status_code: number | null
  error: string | null
  created_at: string
  details: Record<string, unknown>
  person: string | null
  title: string | null
}

interface EmailStatus {
  enabled: boolean
  ready: boolean
  has_key: boolean
  sender_email: string
  scheduled: boolean
  daily_cap: number
  digest_every_days: number
  nudge_after_days: number
  sent_today: number
  sent_14d: number
  failed_14d: number
  opted_out: number
  last_run: { created_at: string; status: string; details: Record<string, number>; error: string | null } | null
  recent: LogRow[]
}

const KIND_LABELS: Record<LogRow['kind'], string> = {
  owner_digest: 'Owner summary',
  member_nudge: 'Follow-up',
  test: 'Test email',
  setting: 'Switched',
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const STATUS_TEXT: Record<LogRow['status'], string> = {
  queued: 'Waiting for Brevo',
  sent: 'Accepted by Brevo',
  failed: 'Failed',
  unknown: 'No answer',
  done: '',
}

async function loadStatus(): Promise<EmailStatus> {
  const { data, error } = await supabase.rpc('admin_notification_status')
  if (error) throw error
  return data as EmailStatus
}

// Admin page card: is emailing set up, the on/off switch, a test email, and
// what was sent lately. Setup itself (Brevo key, sender) is done in Supabase;
// see docs/SETUP.md, "Automatic emails".
export default function EmailReminders() {
  const { data, error, loading, reload } = useLoader(loadStatus, [])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function run(action: () => PromiseLike<{ error: unknown }>, done: string) {
    setBusy(true)
    setMessage(null)
    setActionError(null)
    const { error: rpcError } = await action()
    if (rpcError) setActionError(friendlyError(rpcError))
    else setMessage(done)
    await reload()
    setBusy(false)
  }

  if (error) {
    const missing = /admin_notification_status|schema cache|does not exist/i.test(error)
    return (
      <section id="emails" className="card stack-sm">
        <h2>Email reminders</h2>
        <p className={missing ? 'small muted' : 'error'}>
          {missing ? 'Not set up yet: run migration 0011 in Supabase first (see the setup guide).' : error}
        </p>
        {!missing && (
          <div>
            <button className="btn btn-secondary btn-small" onClick={() => void reload()}>
              <RefreshCw size={14} aria-hidden="true" /> Try again
            </button>
          </div>
        )}
      </section>
    )
  }
  if (loading && !data) {
    return (
      <section id="emails" className="card">
        <h2>Email reminders</h2>
        <p className="muted">Loading…</p>
      </section>
    )
  }
  if (!data) return null

  const checks = [
    { ok: data.has_key, label: 'Brevo API key saved in the Supabase Vault (named brevo_api_key)' },
    { ok: Boolean(data.sender_email), label: data.sender_email ? `Sender: ${data.sender_email}` : 'Sender email set' },
    { ok: data.scheduled, label: 'Daily check scheduled (each morning, about 7 or 8am)' },
  ]
  const lastRun = data.last_run

  return (
    <section id="emails" className="card stack">
      <div className="row between wrap gap-sm">
        <div className="backup-text">
          <h2>
            Email reminders{' '}
            <span className={`badge ${data.enabled ? 'badge-on' : 'badge-off'}`}>{data.enabled ? 'On' : 'Off'}</span>
          </h2>
          <p className="small muted">
            Owners get a summary about every {data.digest_every_days} days listing people not yet ticked Contacted
            (spread across the days, only when someone is waiting). Members get one follow-up{' '}
            {data.nudge_after_days} days after signing up if nobody ticked them Contacted. At most {data.daily_cap}{' '}
            a day, so sign-in codes always fit within Brevo's free 300. Anyone can turn these off on their Profile.
          </p>
        </div>
        <div className="row wrap gap-sm">
          {data.enabled ? (
            <ConfirmAction
              label="Turn off"
              className="btn btn-secondary"
              question="Stop all reminder emails?"
              confirmLabel="Yes, turn off"
              disabled={busy}
              onConfirm={() => run(() => supabase.rpc('admin_set_notifications', { p_enabled: false }), 'Emails are off.')}
            />
          ) : (
            <ConfirmAction
              label="Turn on"
              className="btn btn-primary"
              question="Start sending reminder emails?"
              detail="The first ones go out at the next morning check."
              confirmLabel="Yes, turn on"
              cancelLabel="Not yet"
              disabled={busy || !data.ready}
              onConfirm={() => run(() => supabase.rpc('admin_set_notifications', { p_enabled: true }), 'Emails are on.')}
            />
          )}
        </div>
      </div>

      <ul className="setup-checks">
        {checks.map((c) => (
          <li key={c.label} className={c.ok ? 'ok' : 'todo'}>
            {c.ok ? <Check size={15} aria-hidden="true" /> : <X size={15} aria-hidden="true" />}
            <span>
              <span className="visually-hidden">{c.ok ? 'Done: ' : 'To do: '}</span>
              {c.label}
            </span>
          </li>
        ))}
      </ul>

      <div className="row wrap gap-sm">
        <button
          className="btn btn-secondary btn-small"
          disabled={busy || !data.ready}
          onClick={() =>
            void run(
              () => supabase.rpc('admin_send_test_email'),
              "Test email handed to Brevo. Check your inbox (and junk folder), then press Refresh to see Brevo's answer.",
            )
          }
        >
          <Mail size={14} aria-hidden="true" /> Send me a test email
        </button>
        <button className="btn btn-link" disabled={busy} onClick={() => void reload()}>
          <RefreshCw size={14} aria-hidden="true" /> Refresh
        </button>
      </div>
      {message && <p className="notice">{message}</p>}
      {actionError && <p className="error" role="alert">{actionError}</p>}

      <p className="small muted">
        Today: {data.sent_today} of {data.daily_cap}. Last 14 days: {data.sent_14d} accepted
        {data.failed_14d > 0 ? `, ${data.failed_14d} failed` : ''}. {count(data.opted_out, 'person has', 'people have')} turned emails off.
        {lastRun &&
          ` Last check: ${formatDateTime(lastRun.created_at)}` +
            (lastRun.status === 'failed'
              ? ` (failed: ${lastRun.error ?? 'unknown error'})`
              : ` (${count(lastRun.details.digests ?? 0, 'summary', 'summaries')}, ${count(lastRun.details.nudges ?? 0, 'follow-up', 'follow-ups')}` +
                (lastRun.details.skipped_for_limit ? `, ${lastRun.details.skipped_for_limit} waiting for tomorrow` : '') +
                ')') +
            '.'}
      </p>
      {data.failed_14d > 0 && (
        <p className="warning">
          Some emails failed. The reason is listed below; a 401 usually means the API key is wrong or Brevo is blocking
          the server's address (Brevo, Security, Authorised IPs).
        </p>
      )}

      {data.recent.length > 0 && (
        <details>
          <summary>Recent emails ({data.recent.length})</summary>
          <ul className="email-log">
            {data.recent.map((r) => (
              <li key={r.id}>
                <span className="muted small">{formatDateTime(r.created_at)}</span>{' '}
                <strong>{KIND_LABELS[r.kind]}</strong>
                {r.kind === 'setting'
                  ? ` ${r.details.enabled ? 'on' : 'off'} by ${r.person ?? 'an admin'}`
                  : ` to ${r.person ?? 'a former member'}`}
                {r.title ? ` about "${r.title}"` : ''}
                {r.kind === 'owner_digest' && typeof r.details.people === 'number' ? ` (${r.details.people} people)` : ''}
                {STATUS_TEXT[r.status] && (
                  <span className={r.status === 'failed' || r.status === 'unknown' ? 'error' : 'muted'}>
                    {' '}
                    · {STATUS_TEXT[r.status]}
                    {r.status === 'failed' && r.status_code ? ` (${r.status_code})` : ''}
                  </span>
                )}
                {r.error && <div className="small muted email-log-error">{r.error}</div>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
