import type {
  AcademicYear,
  ApplicationStatus,
  CycleStatus,
  DocumentType,
  Role,
} from './constants.js';

export interface DepartmentDTO {
  id: number;
  name: string;
  slug: string;
  description: string;
  displayOrder: number;
  isActive: boolean;
}

export interface PublicDocumentRequirement {
  required: boolean;
  allowedTypes: string[];
  label: string;
}

export interface PublicConfig {
  recruitment: {
    open: boolean;
    title: string;
    headline: string;
    description: string;
    deadline: string | null;
    opensAt: string | null;
    closesAt: string | null;
    timezone: string;
    cycleName: string;
    cycleId: number | null;
    confirmationTitle: string;
    confirmationMessage: string;
    closedReason: 'closed' | 'not_open_yet' | null;
  };
  departments: DepartmentDTO[];
  documents: {
    maxSizeBytes: number;
    nationalId: PublicDocumentRequirement;
    universityId: PublicDocumentRequirement;
  };
  privacy: { version: string; text: string };
  form: {
    allowSecondaryPreference: boolean;
    requireExperience: boolean;
    additionalInformationEnabled: boolean;
    allowOtherUniversities: boolean;
    academicYears: readonly string[];
  };
  serverTime: string;
}

export interface SubmittedApplicationDTO {
  reference: string;
  submittedAt: string;
}

export interface AdminUserDTO {
  id: number;
  email: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthMeDTO {
  administrator: AdminUserDTO;
  csrfToken: string;
  sessionExpiresAt: string;
}

export interface ReviewerRef {
  id: number;
  displayName: string;
}

export interface ApplicationSummaryDTO {
  id: number;
  reference: string;
  fullName: string;
  email: string;
  primaryDepartment: { name: string; slug: string } | null;
  secondaryDepartment: { name: string; slug: string } | null;
  academicYear: AcademicYear | string;
  status: ApplicationStatus;
  submittedAt: string;
  assignedReviewer: ReviewerRef | null;
  version: number;
}

export interface ApplicationListDTO {
  items: ApplicationSummaryDTO[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface DocumentMetaDTO {
  id: number;
  type: DocumentType;
  originalFilename: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}

export interface StatusEventDTO {
  id: number;
  previousStatus: ApplicationStatus | null;
  newStatus: ApplicationStatus;
  changedBy: ReviewerRef | null;
  reason: string | null;
  createdAt: string;
}

export interface NoteDTO {
  id: number;
  author: ReviewerRef | null;
  body: string;
  createdAt: string;
}

export interface ApplicationDetailDTO extends ApplicationSummaryDTO {
  preferredName: string | null;
  phone: string;
  university: string;
  faculty: string;
  academicDepartment: string;
  githubUrl: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
  motivationStatement: string;
  experience: string | null;
  additionalInformation: string | null;
  cycle: { id: number; name: string } | null;
  consent: { acceptedAt: string; policyVersion: string };
  documents: DocumentMetaDTO[];
  notes: NoteDTO[];
  history: StatusEventDTO[];
  createdAt: string;
  updatedAt: string;
}

export interface AuditEntryDTO {
  id: number;
  actor: ReviewerRef | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface DashboardDTO {
  counts: Record<ApplicationStatus, number> & { total: number; assignedToMe: number };
  byDepartment: { name: string; slug: string; count: number }[];
  byAcademicYear: { academicYear: string; count: number }[];
  overTime: { date: string; count: number }[];
  recent: ApplicationSummaryDTO[];
  recentActivity: AuditEntryDTO[];
  recruitment: { open: boolean; title: string; deadline: string | null; cycleName: string; cycleId: number | null };
  reviewers: ReviewerRef[];
  generatedAt: string;
}

export interface CycleDTO {
  id: number;
  name: string;
  status: CycleStatus;
  opensAt: string | null;
  closesAt: string | null;
  privacyPolicyVersion: string;
  applicationCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuditListDTO {
  items: AuditEntryDTO[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SystemDiagnosticsDTO {
  migrations: { version: string; appliedAt: string }[];
  database: { ready: boolean; ok: boolean; sizeBytes: number };
  storage: {
    ready: boolean;
    writable: boolean;
    documentCount: number;
    totalBytes: number;
  };
  reconciliation: {
    missingFiles: { documentId: number; type: string }[];
    orphanedFiles: number;
    orphanedTemporary: number;
  };
  retention: { enabled: boolean; days: number; eligibleApplications: number };
  counts: { applications: number; administrators: number; auditEntries: number };
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: { path: string; message: string }[];
  };
}
