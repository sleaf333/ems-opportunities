export type UserRole = 'member' | 'poster' | 'admin'
export type MemberPosition = 'employed_physician' | 'partnership_track' | 'partner' | 'apc' | 'admin_staff'
export type OppType = 'committee' | 'leadership' | 'event' | 'project' | 'other'
export type CommitmentLevel = 'one_time' | 'short_term' | 'ongoing'
export type OppRegion = 'group_wide' | 'door_county' | 'fox_valley' | 'milwaukee' | 'watertown'
export type OppFormat = 'in_person' | 'virtual' | 'hybrid'
export type OppStatus = 'draft' | 'open' | 'closed' | 'archived'
export type SignupStatus =
  | 'interested'
  | 'committed'
  | 'waitlisted'
  | 'withdrawn'
  | 'completed'
  | 'no_show'

export interface Profile {
  id: string
  email: string
  full_name: string
  position: MemberPosition | null
  role: UserRole
  created_at: string
}

export interface MemberInterests {
  user_id: string
  other_interests: string
  leadership_goals: string
}

export interface InterestCategory {
  id: string
  name: string
  active: boolean
  created_at: string
}

export interface OpportunityCategory {
  opportunity_id: string
  category_id: string
}

export interface MemberInterestCategory {
  user_id: string
  category_id: string
  created_at: string
}

export interface SignupCounts {
  opportunity_id: string
  committed: number
  interested: number
  waitlisted: number
}

export interface MemberPreset {
  email: string
  role: UserRole
  is_partner: boolean
  created_at: string
}

export interface Opportunity {
  id: string
  title: string
  type: OppType
  description: string
  commitment: CommitmentLevel
  time_estimate: string
  eligible_positions: MemberPosition[]
  capacity: number | null
  start_date: string | null
  end_date: string | null
  signup_deadline: string | null
  new_hire_friendly: boolean
  region: OppRegion
  site: string
  format: OppFormat
  visible_until: string | null
  show_names: boolean
  contact_name: string
  contact_email: string
  status: OppStatus
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Signup {
  id: string
  opportunity_id: string
  user_id: string
  status: SignupStatus
  status_changed_at: string
  created_at: string
}

export interface SignupEvent {
  id: number
  signup_id: string
  opportunity_id: string
  user_id: string
  from_status: SignupStatus | null
  to_status: SignupStatus
  changed_by: string | null
  changed_at: string
}
