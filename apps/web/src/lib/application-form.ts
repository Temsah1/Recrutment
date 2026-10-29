import { z } from 'zod';
import {
  ACADEMIC_YEARS,
  isValidEmail,
  isValidPersonName,
  isValidPhone,
  isSafeHttpUrl,
  type AcademicYear,
} from '@esme/shared';

/** Client-side mirror of the server schema. The server remains authoritative. */
export const applicationFormSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, 'Enter your full legal name')
      .max(80, 'Name must be at most 80 characters')
      .refine(isValidPersonName, 'Enter your name using letters only'),
    preferredName: z.string().trim().max(60, 'Preferred name must be at most 60 characters'),
    email: z
      .string()
      .trim()
      .min(1, 'Email is required')
      .max(254, 'Email must be at most 254 characters')
      .refine(isValidEmail, 'Enter a valid email address'),
    phone: z
      .string()
      .trim()
      .min(8, 'Enter a valid phone number')
      .max(24, 'Phone number is too long')
      .refine(isValidPhone, 'Enter a valid phone number, including country code if needed'),
    university: z.string().trim().min(2, 'University is required').max(120, 'University is too long'),
    faculty: z.string().trim().min(2, 'Faculty is required').max(120, 'Faculty is too long'),
    academicDepartment: z
      .string()
      .trim()
      .min(2, 'Academic department or major is required')
      .max(120, 'Academic department is too long'),
    academicYear: z
      .string()
      .min(1, 'Select your academic year')
      .refine(
        (value): value is AcademicYear => (ACADEMIC_YEARS as readonly string[]).includes(value),
        'Select your academic year',
      ),
    primaryDepartmentSlug: z.string().min(1, 'Choose a primary department'),
    secondaryDepartmentSlug: z.string(),
    githubUrl: z
      .string()
      .trim()
      .max(500, 'URL must be at most 500 characters')
      .refine((value) => !value || isSafeHttpUrl(value), 'Enter a valid https URL'),
    linkedinUrl: z
      .string()
      .trim()
      .max(500, 'URL must be at most 500 characters')
      .refine((value) => !value || isSafeHttpUrl(value), 'Enter a valid https URL'),
    portfolioUrl: z
      .string()
      .trim()
      .max(500, 'URL must be at most 500 characters')
      .refine((value) => !value || isSafeHttpUrl(value), 'Enter a valid https URL'),
    motivationStatement: z
      .string()
      .trim()
      .min(50, 'Write at least 50 characters so the team can understand your motivation')
      .max(4000, 'Motivation statement must be at most 4000 characters'),
    experience: z.string().trim().max(2000, 'Experience must be at most 2000 characters'),
    additionalInformation: z
      .string()
      .trim()
      .max(2000, 'Additional information must be at most 2000 characters'),
    consentAccepted: z.boolean().refine((value) => value, 'You must accept the privacy notice to submit'),
  })
  .superRefine((values, ctx) => {
    if (values.secondaryDepartmentSlug && values.secondaryDepartmentSlug === values.primaryDepartmentSlug) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['secondaryDepartmentSlug'],
        message: 'Choose a different secondary department',
      });
    }
  });

export type ApplicationFormValues = z.infer<typeof applicationFormSchema>;

export const emptyApplication: ApplicationFormValues = {
  fullName: '',
  preferredName: '',
  email: '',
  phone: '',
  university: 'Cairo University',
  faculty: '',
  academicDepartment: '',
  academicYear: '' as ApplicationFormValues['academicYear'],
  primaryDepartmentSlug: '',
  secondaryDepartmentSlug: '',
  githubUrl: '',
  linkedinUrl: '',
  portfolioUrl: '',
  motivationStatement: '',
  experience: '',
  additionalInformation: '',
  consentAccepted: false,
};

export const APPLY_STEPS = [
  {
    id: 'personal',
    fields: ['fullName', 'preferredName', 'email', 'phone'] as const,
  },
  {
    id: 'academic',
    fields: ['university', 'faculty', 'academicDepartment', 'academicYear'] as const,
  },
  {
    id: 'department',
    fields: ['primaryDepartmentSlug', 'secondaryDepartmentSlug'] as const,
  },
  {
    id: 'links',
    fields: [
      'githubUrl',
      'linkedinUrl',
      'portfolioUrl',
      'motivationStatement',
      'experience',
      'additionalInformation',
    ] as const,
  },
  {
    id: 'documents',
    fields: [] as const,
  },
  {
    id: 'review',
    fields: ['consentAccepted'] as const,
  },
] as const;

export type ApplyStepId = (typeof APPLY_STEPS)[number]['id'];

export function stepForField(field: string): number {
  const index = APPLY_STEPS.findIndex((step) =>
    (step.fields as readonly string[]).includes(field),
  );
  if (index >= 0) return index;
  if (field === 'national_id' || field === 'university_id') return 4;
  return 0;
}

export function buildSubmissionPayload(
  values: ApplicationFormValues,
  options: { requireExperience: boolean; additionalInformationEnabled: boolean },
): Record<string, unknown> {
  const optional = (value: string) => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };

  return {
    fullName: values.fullName.trim(),
    preferredName: optional(values.preferredName) ?? '',
    email: values.email.trim().toLowerCase(),
    phone: values.phone.trim(),
    university: values.university.trim(),
    faculty: values.faculty.trim(),
    academicDepartment: values.academicDepartment.trim(),
    academicYear: values.academicYear,
    primaryDepartmentSlug: values.primaryDepartmentSlug,
    secondaryDepartmentSlug: optional(values.secondaryDepartmentSlug) ?? '',
    githubUrl: optional(values.githubUrl) ?? '',
    linkedinUrl: optional(values.linkedinUrl) ?? '',
    portfolioUrl: optional(values.portfolioUrl) ?? '',
    motivationStatement: values.motivationStatement.trim(),
    experience: options.requireExperience ? values.experience.trim() : optional(values.experience) ?? '',
    additionalInformation: options.additionalInformationEnabled
      ? optional(values.additionalInformation) ?? ''
      : '',
    consentAccepted: values.consentAccepted,
  };
}
