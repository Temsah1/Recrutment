import type { ApplicationStatus, CycleStatus, DocumentType, Role } from '@esme/shared';

export interface AdministratorRow {
  id: number;
  email: string;
  password_hash: string;
  display_name: string;
  role: Role;
  is_active: number;
  failed_login_count: number;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  password_changed_at: string;
}

export interface SessionRow {
  id: string;
  admin_id: number;
  csrf_token: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  ip: string | null;
  user_agent: string | null;
}

export interface CycleRow {
  id: number;
  name: string;
  status: CycleStatus;
  opens_at: string | null;
  closes_at: string | null;
  privacy_policy_version: string;
  is_current: number;
  created_at: string;
  updated_at: string;
}

export interface DepartmentRow {
  id: number;
  name: string;
  slug: string;
  description: string;
  is_active: number;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface ApplicantRow {
  id: number;
  full_name: string;
  preferred_name: string | null;
  email: string;
  phone: string;
  university: string;
  faculty: string;
  academic_department: string;
  academic_year: string;
  github_url: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  motivation_statement: string;
  experience: string | null;
  additional_information: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApplicationRow {
  id: number;
  public_reference: string;
  applicant_id: number;
  recruitment_cycle_id: number;
  primary_department_id: number;
  secondary_department_id: number | null;
  contact_email: string;
  status: ApplicationStatus;
  consent_accepted_at: string;
  consent_policy_version: string;
  submitted_at: string;
  assigned_reviewer_id: number | null;
  idempotency_key: string | null;
  row_version: number;
  created_at: string;
  updated_at: string;
}

export interface ApplicationJoinedRow {
  id: number;
  public_reference: string;
  status: ApplicationStatus;
  submitted_at: string;
  row_version: number;
  assigned_reviewer_id: number | null;
  recruitment_cycle_id: number;
  primary_department_id: number;
  secondary_department_id: number | null;
  contact_email: string;
  consent_accepted_at: string;
  consent_policy_version: string;
  created_at: string;
  updated_at: string;
  full_name: string;
  preferred_name: string | null;
  email: string;
  phone: string;
  university: string;
  faculty: string;
  academic_department: string;
  academic_year: string;
  github_url: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  motivation_statement: string;
  experience: string | null;
  additional_information: string | null;
  applicant_created_at: string;
  primary_name: string;
  primary_slug: string;
  secondary_name: string | null;
  secondary_slug: string | null;
  reviewer_display_name: string | null;
  cycle_name: string | null;
}

export interface DocumentRow {
  id: number;
  application_id: number;
  document_type: DocumentType;
  storage_name: string;
  original_filename: string;
  detected_content_type: string;
  file_size: number;
  checksum: string;
  uploaded_at: string;
  deleted_at: string | null;
}

export interface NoteRow {
  id: number;
  application_id: number;
  author_admin_id: number | null;
  body: string;
  created_at: string;
  author_display_name: string | null;
}

export interface HistoryRow {
  id: number;
  application_id: number;
  previous_status: ApplicationStatus | null;
  new_status: ApplicationStatus;
  changed_by_admin_id: number | null;
  reason: string | null;
  created_at: string;
  actor_display_name: string | null;
}

export interface AuditRow {
  id: number;
  actor_admin_id: number | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata_json: string | null;
  request_id: string | null;
  created_at: string;
  actor_display_name: string | null;
}
