import { z } from 'zod';
import {
  ACADEMIC_YEARS,
  APPLICATION_STATUSES,
  CYCLE_STATUSES,
  DOCUMENT_MIME_ALLOWLIST,
  ROLES,
  UPLOAD_LIMITS,
} from './constants.js';
import { isSafeHttpUrl, isValidPersonName, isValidPhone, isValidTimezone, slugify } from './validation.js';

const trimmed = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`);

const optionalTrimmed = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(max).optional(),
  );

const optionalUrlSchema = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z
    .string()
    .trim()
    .max(500, 'URL must be at most 500 characters')
    .refine(isSafeHttpUrl, 'Enter a valid http(s) URL, for example https://github.com/username')
    .optional(),
);

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(5, 'Email is required')
  .max(254, 'Email must be at most 254 characters')
  .email('Enter a valid email address');

const phoneSchema = z
  .string()
  .trim()
  .min(8, 'Enter a valid phone number')
  .max(24, 'Phone number is too long')
  .refine(isValidPhone, 'Enter a valid phone number, including country code if needed');

const nameSchema = z
  .string()
  .trim()
  .min(2, 'Name is required')
  .max(80, 'Name must be at most 80 characters')
  .refine(isValidPersonName, 'Enter your name using letters only');

export const applicationSubmissionSchema = z
  .object({
    fullName: nameSchema,
    preferredName: z
      .string()
      .trim()
      .max(60, 'Preferred name must be at most 60 characters')
      .optional(),
    email: emailSchema,
    phone: phoneSchema,
    university: trimmed(2, 120, 'University'),
    faculty: trimmed(2, 120, 'Faculty'),
    academicDepartment: trimmed(2, 120, 'Academic department'),
    academicYear: z.enum(ACADEMIC_YEARS),
    primaryDepartmentSlug: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9-]+$/, 'Invalid department'),
    secondaryDepartmentSlug: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z
        .string()
        .trim()
        .max(80)
        .regex(/^[a-z0-9-]+$/, 'Invalid department')
        .optional(),
    ),
    githubUrl: optionalUrlSchema,
    linkedinUrl: optionalUrlSchema,
    portfolioUrl: optionalUrlSchema,
    motivationStatement: trimmed(50, 4000, 'Motivation statement'),
    experience: optionalTrimmed(2000),
    additionalInformation: optionalTrimmed(2000),
    consentAccepted: z.literal(true, {
      errorMap: () => ({ message: 'You must accept the privacy notice to submit' }),
    }),
    idempotencyKey: z.string().uuid('Invalid idempotency key').optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.secondaryDepartmentSlug &&
      value.secondaryDepartmentSlug === value.primaryDepartmentSlug
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['secondaryDepartmentSlug'],
        message: 'Choose a different secondary department',
      });
    }
  });

export type ApplicationSubmission = z.infer<typeof applicationSubmissionSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(200),
  newPassword: z
    .string()
    .min(12, 'Use at least 12 characters')
    .max(200, 'Password must be at most 200 characters'),
});

export const noteSchema = z.object({
  body: trimmed(1, 4000, 'Note'),
});

export const statusUpdateSchema = z.object({
  status: z.enum(APPLICATION_STATUSES),
  reason: optionalTrimmed(1000),
  expectedVersion: z.coerce.number().int().positive().optional(),
});

export const assignmentSchema = z.object({
  reviewerId: z.coerce.number().int().positive().nullable(),
});

export const departmentSchema = z.object({
  name: trimmed(2, 80, 'Department name'),
  slug: z
    .string()
    .trim()
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Slug may contain lowercase letters, numbers and dashes')
    .optional(),
  description: z.string().trim().max(600, 'Description must be at most 600 characters').default(''),
  isActive: z.boolean().default(true),
  displayOrder: z.coerce.number().int().min(0).max(999).default(100),
});

export const departmentUpdateSchema = departmentSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  'No changes supplied',
);

export const administratorCreateSchema = z.object({
  email: emailSchema,
  displayName: trimmed(2, 80, 'Display name'),
  role: z.enum(ROLES),
  password: z
    .string()
    .min(12, 'Use at least 12 characters')
    .max(200, 'Password must be at most 200 characters'),
});

export const administratorUpdateSchema = z
  .object({
    displayName: trimmed(2, 80, 'Display name').optional(),
    role: z.enum(ROLES).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'No changes supplied');

export const passwordResetSchema = z.object({
  newPassword: z
    .string()
    .min(12, 'Use at least 12 characters')
    .max(200, 'Password must be at most 200 characters'),
});

export const cycleSchema = z
  .object({
    name: trimmed(2, 80, 'Cycle name'),
    status: z.enum(CYCLE_STATUSES),
    opensAt: z.string().datetime({ offset: true }).nullable().optional(),
    closesAt: z.string().datetime({ offset: true }).nullable().optional(),
    privacyPolicyVersion: z.string().trim().min(1).max(60).optional(),
  })
  .refine(
    (v) => !v.opensAt || !v.closesAt || new Date(v.opensAt) < new Date(v.closesAt),
    { message: 'Opening time must be before closing time', path: ['closesAt'] },
  );

const allowedTypesFor = (type: 'national_id' | 'university_id', types: string[]) => {
  const allowlist = DOCUMENT_MIME_ALLOWLIST[type];
  return types.length > 0 && types.every((t) => allowlist.includes(t));
};

export const settingsSchema = z.object({
  recruitment: z.object({
    title: trimmed(2, 120, 'Title'),
    headline: trimmed(2, 160, 'Headline'),
    description: trimmed(10, 1200, 'Description'),
    deadline: z
      .preprocess(
        (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
        z.string().datetime({ offset: true, message: 'Deadline must include a timezone offset' }).nullable(),
      )
      .nullable(),
    timezone: z
      .string()
      .trim()
      .min(3)
      .max(60)
      .refine(isValidTimezone, 'Use a valid IANA timezone, e.g. Africa/Cairo'),
    confirmationTitle: trimmed(2, 120, 'Confirmation title'),
    confirmationMessage: trimmed(10, 1200, 'Confirmation message'),
  }),
  documents: z.object({
    maxSizeBytes: z.coerce
      .number()
      .int()
      .min(UPLOAD_LIMITS.minBytes)
      .max(UPLOAD_LIMITS.hardMaxBytes),
    nationalIdRequired: z.boolean(),
    universityIdRequired: z.boolean(),
    nationalIdTypes: z
      .array(z.string())
      .min(1, 'Select at least one format')
      .refine((v) => allowedTypesFor('national_id', v), 'Only PDF is allowed for the national ID'),
    universityIdTypes: z
      .array(z.string())
      .min(1, 'Select at least one format')
      .refine(
        (v) => allowedTypesFor('university_id', v),
        'Only JPEG, PNG or WebP are allowed for the university ID',
      ),
  }),
  privacy: z.object({
    text: trimmed(50, 20000, 'Privacy notice'),
    version: z.string().trim().min(1, 'Version is required').max(60),
  }),
  form: z.object({
    allowSecondaryPreference: z.boolean(),
    requireExperience: z.boolean(),
    additionalInformationEnabled: z.boolean(),
    allowOtherUniversities: z.boolean(),
  }),
  retention: z.object({
    enabled: z.boolean(),
    days: z.coerce.number().int().min(30).max(3650),
  }),
});

export const settingsPatchSchema = settingsSchema.partial();

const pageSchema = z.coerce.number().int().min(1).max(100000).default(1);
const pageSizeSchema = z.coerce.number().int().min(1).max(100).default(20);

export const applicationListQuerySchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
  q: z.string().trim().max(120).optional(),
  status: z.enum(APPLICATION_STATUSES).optional(),
  departmentSlug: z.string().trim().max(80).optional(),
  academicYear: z.string().trim().max(60).optional(),
  cycleId: z.coerce.number().int().positive().optional(),
  reviewerId: z.coerce.number().int().positive().optional(),
  unassigned: z.enum(['true', 'false']).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  sort: z.enum(['submitted_at', 'full_name', 'status', 'academic_year']).default('submitted_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type ApplicationListQuery = z.infer<typeof applicationListQuerySchema>;

export const auditListQuerySchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
  action: z.string().trim().max(80).optional(),
  actorId: z.coerce.number().int().positive().optional(),
});

export const bulkStatusSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1).max(100),
  status: z.enum(APPLICATION_STATUSES),
  reason: optionalTrimmed(500),
});

export const bootstrapAdminSchema = z.object({
  email: emailSchema,
  displayName: trimmed(2, 80, 'Display name'),
  password: z.string().min(12, 'Use at least 12 characters').max(200),
});

export { slugify };
