import { SIGNUP_LABELS } from '../lib/format'
import type { SignupStatus } from '../lib/types'

export function SignupBadge({ status }: { status: SignupStatus }) {
  return <span className={`badge badge-signup-${status}`}>{SIGNUP_LABELS[status]}</span>
}
