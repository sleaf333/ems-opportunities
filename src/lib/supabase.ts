import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && anonKey)

// "implicit" flow lets a login link opened on a different device (for example,
// requested on a work PC, opened on a phone) still work.
export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'missing', {
  auth: { flowType: 'implicit', persistSession: true, detectSessionInUrl: true },
})

export const EMAIL_DOMAIN = 'ems-wi.com'

export function isAllowedEmail(email: string): boolean {
  return /^[^\s@]+@ems-wi\.com$/i.test(email.trim())
}

// Turn database errors into something a person can act on.
export function friendlyError(error: unknown): string {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)
  if (/Database error saving new user|Only @/i.test(message)) {
    return `Only @${EMAIL_DOMAIN} email addresses can use this site.`
  }
  if (/rate limit|too many/i.test(message)) {
    return 'Too many attempts. Please wait a few minutes and try again.'
  }
  if (/expired|invalid/i.test(message) && /token|otp|code/i.test(message)) {
    return 'That code is wrong or has expired. Request a new one.'
  }
  if (/row-level security|permission denied/i.test(message)) {
    return 'You do not have permission to do that.'
  }
  return message
}
