-- ESME Recruitment OS - initial schema
-- All timestamps are ISO-8601 UTC strings.

CREATE TABLE administrators (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  email                 TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash         TEXT NOT NULL,
  display_name          TEXT NOT NULL,
  role                  TEXT NOT NULL CHECK (role IN ('super_admin', 'recruitment_admin', 'reviewer')),
  is_active             INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  failed_login_count    INTEGER NOT NULL DEFAULT 0,
  locked_until          TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  last_login_at         TEXT,
  password_changed_at   TEXT NOT NULL
);

CREATE INDEX ix_administrators_role ON administrators (role, is_active);

CREATE TABLE admin_sessions (
  id            TEXT PRIMARY KEY,
  admin_id      INTEGER NOT NULL REFERENCES administrators (id) ON DELETE CASCADE,
  csrf_token    TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  ip            TEXT,
  user_agent    TEXT
);

CREATE INDEX ix_sessions_admin ON admin_sessions (admin_id);
CREATE INDEX ix_sessions_expires ON admin_sessions (expires_at);

CREATE TABLE recruitment_cycles (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  name                    TEXT NOT NULL,
  status                  TEXT NOT NULL CHECK (status IN ('draft', 'open', 'closed', 'archived')),
  opens_at                TEXT,
  closes_at               TEXT,
  privacy_policy_version  TEXT NOT NULL,
  is_current              INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1)),
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL
);

CREATE UNIQUE INDEX ux_cycles_current ON recruitment_cycles (is_current) WHERE is_current = 1;

CREATE TABLE departments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL UNIQUE,
  slug           TEXT NOT NULL UNIQUE,
  description    TEXT NOT NULL DEFAULT '',
  is_active      INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  display_order  INTEGER NOT NULL DEFAULT 100,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE INDEX ix_departments_active_order ON departments (is_active, display_order);

CREATE TABLE applicants (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name               TEXT NOT NULL,
  preferred_name          TEXT,
  email                   TEXT NOT NULL,
  phone                   TEXT NOT NULL,
  university              TEXT NOT NULL,
  faculty                 TEXT NOT NULL,
  academic_department     TEXT NOT NULL,
  academic_year           TEXT NOT NULL,
  github_url              TEXT,
  linkedin_url            TEXT,
  portfolio_url           TEXT,
  motivation_statement    TEXT NOT NULL,
  experience              TEXT,
  additional_information  TEXT,
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL
);

CREATE INDEX ix_applicants_email ON applicants (email);

CREATE TABLE applications (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  public_reference         TEXT NOT NULL UNIQUE,
  applicant_id             INTEGER NOT NULL REFERENCES applicants (id) ON DELETE RESTRICT,
  recruitment_cycle_id     INTEGER NOT NULL REFERENCES recruitment_cycles (id) ON DELETE RESTRICT,
  primary_department_id    INTEGER NOT NULL REFERENCES departments (id) ON DELETE RESTRICT,
  secondary_department_id  INTEGER REFERENCES departments (id) ON DELETE SET NULL,
  contact_email            TEXT NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'reviewing', 'shortlisted', 'accepted', 'rejected')),
  consent_accepted_at      TEXT NOT NULL,
  consent_policy_version   TEXT NOT NULL,
  submitted_at             TEXT NOT NULL,
  assigned_reviewer_id     INTEGER REFERENCES administrators (id) ON DELETE SET NULL,
  idempotency_key          TEXT UNIQUE,
  row_version              INTEGER NOT NULL DEFAULT 1,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);

CREATE UNIQUE INDEX ux_applications_applicant_cycle
  ON applications (applicant_id, recruitment_cycle_id);
CREATE UNIQUE INDEX ux_applications_email_cycle
  ON applications (recruitment_cycle_id, contact_email COLLATE NOCASE);
CREATE INDEX ix_applications_status ON applications (status, submitted_at);
CREATE INDEX ix_applications_department ON applications (primary_department_id);
CREATE INDEX ix_applications_cycle ON applications (recruitment_cycle_id);
CREATE INDEX ix_applications_reviewer ON applications (assigned_reviewer_id);
CREATE INDEX ix_applications_submitted ON applications (submitted_at);

CREATE TABLE application_documents (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id        INTEGER NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  document_type         TEXT NOT NULL CHECK (document_type IN ('national_id', 'university_id')),
  storage_name          TEXT NOT NULL UNIQUE,
  original_filename     TEXT NOT NULL,
  detected_content_type TEXT NOT NULL,
  file_size             INTEGER NOT NULL CHECK (file_size > 0),
  checksum              TEXT NOT NULL,
  uploaded_at           TEXT NOT NULL,
  deleted_at            TEXT
);

CREATE INDEX ix_documents_application ON application_documents (application_id);
CREATE UNIQUE INDEX ux_documents_active_type
  ON application_documents (application_id, document_type) WHERE deleted_at IS NULL;

CREATE TABLE application_status_history (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id        INTEGER NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  previous_status       TEXT,
  new_status            TEXT NOT NULL,
  changed_by_admin_id   INTEGER REFERENCES administrators (id) ON DELETE SET NULL,
  reason                TEXT,
  created_at            TEXT NOT NULL
);

CREATE INDEX ix_history_application ON application_status_history (application_id, created_at);

CREATE TABLE application_notes (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id     INTEGER NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  author_admin_id    INTEGER REFERENCES administrators (id) ON DELETE SET NULL,
  body               TEXT NOT NULL,
  created_at         TEXT NOT NULL
);

CREATE INDEX ix_notes_application ON application_notes (application_id, created_at);

CREATE TABLE audit_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_admin_id  INTEGER REFERENCES administrators (id) ON DELETE SET NULL,
  action          TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  entity_id       TEXT,
  metadata_json   TEXT,
  request_id      TEXT,
  created_at      TEXT NOT NULL
);

CREATE INDEX ix_audit_created ON audit_logs (created_at);
CREATE INDEX ix_audit_action ON audit_logs (action, created_at);
CREATE INDEX ix_audit_actor ON audit_logs (actor_admin_id);
CREATE INDEX ix_audit_entity ON audit_logs (entity_type, entity_id);

-- Audit records are append-only at the application level.
CREATE TRIGGER audit_logs_no_update
BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs are append-only');
END;

CREATE TRIGGER audit_logs_no_delete
BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs are append-only');
END;

CREATE TABLE app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
