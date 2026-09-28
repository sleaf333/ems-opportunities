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

// First matching topic decides the icon; otherwise fall back to the type.
const BY_TAG: Record<string, LucideIcon> = {
  'peer support': HeartHandshake,
  wellness: Leaf,
  education: GraduationCap,
  research: FlaskConical,
  recruitment: UserPlus,
  'disaster preparedness': Siren,
  mentorship: Users,
  ultrasound: Activity,
  trauma: Ambulance,
  prehospital: Ambulance,
  quality: ClipboardCheck,
  operations: FileSearch,
  finance: Landmark,
  leadership: Compass,
  events: CalendarDays,
}

const BY_TYPE: Record<Opportunity['type'], LucideIcon> = {
  committee: Users,
  leadership: Compass,
  event: CalendarDays,
  project: Lightbulb,
  other: Sparkles,
}

export function iconFor(opp: Pick<Opportunity, 'tags' | 'type'>): LucideIcon {
  for (const tag of opp.tags) {
    const icon = BY_TAG[tag.toLowerCase()]
    if (icon) return icon
  }
  return BY_TYPE[opp.type]
}

export default function OppIcon({ opp, size = 22 }: { opp: Pick<Opportunity, 'tags' | 'type'>; size?: number }) {
  const Icon = iconFor(opp)
  return <Icon size={size} strokeWidth={1.75} aria-hidden="true" />
}
