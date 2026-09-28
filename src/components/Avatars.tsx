import type { Profile } from '../lib/types'

// Soft, distinct tints so neighbouring faces are easy to tell apart.
const TINTS = ['#dbeafe', '#dcfce7', '#fef3c7', '#fce7f3', '#e0e7ff', '#ccfbf1', '#ffedd5', '#ede9fe']
const INKS = ['#1e40af', '#166534', '#92400e', '#9d174d', '#3730a3', '#115e59', '#9a3412', '#5b21b6']

function hash(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function initials(name: string): string {
  const words = name
    .replace(/,.*$/, '') // drop credentials after a comma ("Jane Smith, MD")
    .replace(/^(dr\.?)\s+/i, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return '?'
  const first = words[0][0]
  const last = words.length > 1 ? words[words.length - 1][0] : ''
  return (first + last).toUpperCase()
}

type Person = Pick<Profile, 'id' | 'full_name' | 'email'>

export function Avatar({ person, size = 32 }: { person: Person; size?: number }) {
  const name = person.full_name.trim() || person.email
  const i = hash(person.id) % TINTS.length
  return (
    <span
      className="avatar"
      title={name}
      style={{ width: size, height: size, fontSize: size * 0.38, background: TINTS[i], color: INKS[i] }}
    >
      {initials(name)}
    </span>
  )
}

export function AvatarStack({ people, max = 5, size = 30 }: { people: Person[]; max?: number; size?: number }) {
  if (people.length === 0) return null
  const shown = people.slice(0, max)
  const extra = people.length - shown.length
  return (
    <span className="avatar-stack" aria-label={`${people.length} people`}>
      {shown.map((p) => (
        <Avatar key={p.id} person={p} size={size} />
      ))}
      {extra > 0 && (
        <span className="avatar avatar-more" style={{ width: size, height: size, fontSize: size * 0.36 }}>
          +{extra}
        </span>
      )}
    </span>
  )
}
