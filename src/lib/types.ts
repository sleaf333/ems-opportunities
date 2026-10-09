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
  // Automatic emails (0011); people turn them off on their Profile.
  email_opt_in: boolean
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
  // Position applied at first sign-in (0009); older rows only have is_partner.
  position: MemberPosition | null
  created_at: string
}

// Who to ask about a post (anyone, not just site users).
export interface Contact {
  name: string
  email: string
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
  contacts: Contact[]
  status: OppStatus
  created_by: string | null
  created_at: string
  updated_at: string
}

// Owners can edit a post, see every name on it and email those people.
export interface OpportunityOwner {
  opportunity_id: string
  user_id: string
  added_by: string | null
  added_at: string
}

// Previous values of a post's changed fields (admins only).
export interface OpportunityChange {
  id: number
  opportunity_id: string
  changed_at: string
  changed_by: string | null
  changed_fields: string[]
  old_values: Record<string, unknown>
}

export interface RoleChange {
  id: number
  user_id: string
  old_role: UserRole | null
  new_role: UserRole
  changed_by: string | null
  changed_at: string
}

// A member asking to be allowed to post (0010).
export interface PostRequest {
  id: number
  user_id: string
  note: string
  status: 'pending' | 'approved' | 'declined'
  requested_at: string
  decided_by: string | null
  decided_at: string | null
}

export interface BackupRecord {
  id: number
  downloaded_by: string | null
  downloaded_at: string
}

export interface Signup {
  id: string
  opportunity_id: string
  user_id: string
  status: SignupStatus
  status_changed_at: string
  created_at: string
  // Owners tick "Contacted" once they reach out (0011); nudged_at is when the
  // member got their one follow-up email.
  contacted_at: string | null
  contacted_by: string | null
  nudged_at: string | null
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
