export const ROLES = ['super_admin', 'recruitment_admin', 'reviewer'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Admin',
  recruitment_admin: 'Recruitment Admin',
  reviewer: 'Reviewer',
};

export const APPLICATION_STATUSES = [
  'pending',
  'reviewing',
  'shortlisted',
  'accepted',
  'rejected',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: 'Pending',
  reviewing: 'Under review',
  shortlisted: 'Shortlisted',
  accepted: 'Accepted',
  rejected: 'Rejected',
};

export const DOCUMENT_TYPES = ['national_id', 'university_id'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  national_id: 'National ID',
  university_id: 'University ID card',
};

export const CYCLE_STATUSES = ['draft', 'open', 'closed', 'archived'] as const;
export type CycleStatus = (typeof CYCLE_STATUSES)[number];

export const ACADEMIC_YEARS = [
  'Preparatory year',
  'First year',
  'Second year',
  'Third year',
  'Fourth year',
  'Fifth year',
  'Graduate student',
] as const;
export type AcademicYear = (typeof ACADEMIC_YEARS)[number];

export const DEFAULT_DEPARTMENTS = [
  {
    name: 'Front-end Development',
    slug: 'frontend-development',
    description:
      'Build the interfaces members see and use: React applications, design systems, accessibility and performance.',
    displayOrder: 10,
  },
  {
    name: 'Back-end Development',
    slug: 'backend-development',
    description:
      'Design APIs, data models and reliable server-side systems that power every ESME product.',
    displayOrder: 20,
  },
  {
    name: 'IT Helpdesk',
    slug: 'it-helpdesk',
    description:
      'Keep the chapter running: support members, maintain tooling and handle day-to-day technical operations.',
    displayOrder: 30,
  },
  {
    name: 'AI Automation',
    slug: 'ai-automation',
    description:
      'Automate repetitive work with modern AI tooling, workflow pipelines and integrations.',
    displayOrder: 40,
  },
  {
    name: 'Machine Learning & Data Analysis',
    slug: 'ml-data-analysis',
    description:
      'Turn data into insight: exploratory analysis, models, evaluation and clear reporting.',
    displayOrder: 50,
  },
] as const;

export const UPLOAD_LIMITS = {
  minBytes: 10 * 1024,
  maxBytes: 5 * 1024 * 1024,
  hardMaxBytes: 20 * 1024 * 1024,
} as const;

export const DOCUMENT_MIME_ALLOWLIST: Record<DocumentType, readonly string[]> = {
  national_id: ['application/pdf'],
  university_id: ['image/jpeg', 'image/png', 'image/webp'],
};

export const DOCUMENT_MIME_LABELS: Record<DocumentType, string> = {
  national_id: 'PDF only',
  university_id: 'JPEG, PNG or WebP',
};

export const DEFAULT_PRIVACY_NOTICE = `ESME Cairo University Student Chapter ("ESME") collects the information and documents you submit through this recruitment form solely to assess your application and administer the recruitment process.

What we collect: your name, contact details, academic information, links you choose to share, your motivation statement, and the identity documents required by the recruitment policy.

How it is used: applications are reviewed by authorized ESME recruitment administrators. National ID and university ID documents are stored in private storage and are only accessible to authorized administrators for identity verification.

Storage and retention: data is stored on ESME-controlled infrastructure. Applications are retained for the duration of the recruitment cycle and afterwards only for as long as the organization's approved retention policy requires.

Your choices: you may contact the ESME recruitment team to request information about your application. Submitting this form confirms that the information provided is accurate and that you consent to this processing.

This notice is maintained by ESME and is reviewed before each recruitment cycle. The version shown on the application form is the version that applies to your submission.`;

export const DEFAULT_SETTINGS = {
  recruitment: {
    title: 'Fall 2026 Recruitment',
    headline: 'Build the Future With ESME',
    description:
      'Join a community of engineers, innovators, and problem-solvers. Tell us about yourself, explore your interests, and apply to the team where you can make an impact.',
    deadline: null as string | null,
    timezone: 'Africa/Cairo',
    confirmationTitle: 'Application received',
    confirmationMessage:
      'Your application has been received by the ESME recruitment team. Keep your reference number for your records. Shortlisted applicants will be contacted through the email address provided.',
  },
  documents: {
    maxSizeBytes: UPLOAD_LIMITS.maxBytes,
    nationalIdRequired: true,
    universityIdRequired: true,
    nationalIdTypes: ['application/pdf'] as string[],
    universityIdTypes: ['image/jpeg', 'image/png', 'image/webp'] as string[],
  },
  privacy: {
    text: DEFAULT_PRIVACY_NOTICE,
    version: '2026-01-draft',
  },
  form: {
    allowSecondaryPreference: true,
    requireExperience: false,
    additionalInformationEnabled: true,
    allowOtherUniversities: true,
  },
  retention: {
    enabled: false,
    days: 365,
  },
} as const;

export type AppSettings = {
  recruitment: {
    title: string;
    headline: string;
    description: string;
    deadline: string | null;
    timezone: string;
    confirmationTitle: string;
    confirmationMessage: string;
  };
  documents: {
    maxSizeBytes: number;
    nationalIdRequired: boolean;
    universityIdRequired: boolean;
    nationalIdTypes: string[];
    universityIdTypes: string[];
  };
  privacy: { text: string; version: string };
  form: {
    allowSecondaryPreference: boolean;
    requireExperience: boolean;
    additionalInformationEnabled: boolean;
    allowOtherUniversities: boolean;
  };
  retention: { enabled: boolean; days: number };
};
