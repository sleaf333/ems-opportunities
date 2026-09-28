export type UserRole = 'member' | 'poster' | 'admin'
export type MemberPosition = 'physician' | 'apc' | 'staff'
export type OppType = 'committee' | 'leadership' | 'event' | 'project' | 'other'
export type CommitmentLevel = 'one_time' | 'short_term' | 'ongoing'
export type OppAudience = 'all' | 'physicians' | 'shareholders'
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
  is_shareholder: boolean
  created_at: string
}

export interface MemberInterests {
  user_id: string
  interests: string[]
  leadership_goals: string
}

export interface MemberPreset {
  email: string
  role: UserRole
  is_shareholder: boolean
  created_at: string
}

export interface Opportunity {
  id: string
  title: string
  type: OppType
  description: string
  commitment: CommitmentLevel
  time_estimate: string
  audience: OppAudience
  capacity: number | null
  start_date: string | null
  end_date: string | null
  signup_deadline: string | null
  new_hire_friendly: boolean
  tags: string[]
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
