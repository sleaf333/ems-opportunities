import {
  Activity,
  Ambulance,
  CalendarDays,
  ClipboardCheck,
  Compass,
  FileSearch,
  FlaskConical,
  GraduationCap,
  HeartHandshake,
  Landmark,
  Leaf,
  Lightbulb,
  Siren,
  Sparkles,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { Opportunity } from '../lib/types'

// Topic icons, most specific first: the first topic on this list that the
// opportunity has decides its icon. Otherwise the type decides.
const BY_TOPIC: [string, LucideIcon][] = [
  ['peer support', HeartHandshake],
  ['wellness', Leaf],
  ['trauma', Ambulance],
  ['ultrasound', Activity],
  ['prehospital', Ambulance],
  ['disaster preparedness', Siren],
  ['research', FlaskConical],
  ['recruitment', UserPlus],
  ['mentorship', Users],
  ['finance', Landmark],
  ['education', GraduationCap],
  ['operations', FileSearch],
  ['leadership', Compass],
  ['quality', ClipboardCheck],
  ['events', CalendarDays],
]

const BY_TYPE: Record<Opportunity['type'], LucideIcon> = {
  committee: Users,
  leadership: Compass,
  event: CalendarDays,
  project: Lightbulb,
  other: Sparkles,
}

export function iconFor(type: Opportunity['type'], topics: string[]): LucideIcon {
  const have = new Set(topics.map((t) => t.toLowerCase()))
  for (const [topic, icon] of BY_TOPIC) if (have.has(topic)) return icon
  return BY_TYPE[type]
}

export default function OppIcon({
  type,
  topics,
  size = 22,
}: {
  type: Opportunity['type']
  topics: string[]
  size?: number
}) {
  const Icon = iconFor(type, topics)
  return <Icon size={size} strokeWidth={1.75} aria-hidden="true" />
}
