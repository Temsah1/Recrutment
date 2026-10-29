import { describe, expect, it } from 'vitest';
import {
  APPLY_STEPS,
  applicationFormSchema,
  buildSubmissionPayload,
  emptyApplication,
  stepForField,
  type ApplicationFormValues,
} from './application-form.js';

const valid: ApplicationFormValues = {
  ...emptyApplication,
  fullName: 'Layla Hassan',
  preferredName: 'Layla',
  email: 'Layla@Example.com',
  phone: '+20 100 123 4567',
  faculty: 'Engineering',
  academicDepartment: 'Computer Engineering',
  academicYear: 'Third year',
  primaryDepartmentSlug: 'frontend-development',
  secondaryDepartmentSlug: 'backend-development',
  githubUrl: 'https://github.com/layla',
  motivationStatement: 'I want to build accessible products with the ESME team and grow every week.',
  consentAccepted: true,
};

describe('applicationFormSchema', () => {
  it('accepts a complete application', () => {
    expect(applicationFormSchema.safeParse(valid).success).toBe(true);
  });

  it('requires consent and a motivation statement of at least 50 characters', () => {
    const noConsent = applicationFormSchema.safeParse({ ...valid, consentAccepted: false });
    expect(noConsent.success).toBe(false);

    const short = applicationFormSchema.safeParse({ ...valid, motivationStatement: 'Too short' });
    expect(short.success).toBe(false);
  });

  it('rejects duplicate departments, unsafe links and invalid names', () => {
    expect(
      applicationFormSchema.safeParse({ ...valid, secondaryDepartmentSlug: 'frontend-development' })
        .success,
    ).toBe(false);
    expect(
      applicationFormSchema.safeParse({ ...valid, linkedinUrl: 'javascript:alert(1)' }).success,
    ).toBe(false);
    expect(applicationFormSchema.safeParse({ ...valid, fullName: 'L4yla' }).success).toBe(false);
  });

  it('allows blank optional links', () => {
    const parsed = applicationFormSchema.parse({ ...valid, githubUrl: '', portfolioUrl: '' });
    expect(parsed.githubUrl).toBe('');
  });
});

describe('buildSubmissionPayload', () => {
  it('trims values and lowercases the email', () => {
    const payload = buildSubmissionPayload(
      { ...valid, fullName: '  Layla Hassan  ', email: '  Layla@Example.com ' },
      { requireExperience: false, additionalInformationEnabled: true },
    );
    expect(payload.fullName).toBe('Layla Hassan');
    expect(payload.email).toBe('layla@example.com');
    expect(payload.preferredName).toBe('Layla');
  });

  it('omits blank optional fields and sends empty strings for the server schema', () => {
    const payload = buildSubmissionPayload(
      { ...valid, secondaryDepartmentSlug: '', githubUrl: '', experience: '' },
      { requireExperience: false, additionalInformationEnabled: true },
    );
    expect(payload.secondaryDepartmentSlug).toBe('');
    expect(payload.githubUrl).toBe('');
    expect(payload.experience).toBe('');
  });

  it('keeps trimmed experience when required and drops additional information when disabled', () => {
    const required = buildSubmissionPayload(
      { ...valid, experience: '  Built two React apps  ' },
      { requireExperience: true, additionalInformationEnabled: true },
    );
    expect(required.experience).toBe('Built two React apps');

    const disabled = buildSubmissionPayload(
      { ...valid, additionalInformation: 'Should be removed' },
      { requireExperience: false, additionalInformationEnabled: false },
    );
    expect(disabled.additionalInformation).toBe('');
  });
});

describe('multi-step form mapping', () => {
  it('maps every field to a step', () => {
    for (const step of APPLY_STEPS) {
      for (const field of step.fields) {
        expect(stepForField(field)).toBe(APPLY_STEPS.indexOf(step));
      }
    }
    expect(stepForField('national_id')).toBe(4);
    expect(stepForField('university_id')).toBe(4);
    expect(stepForField('unknown_field')).toBe(0);
  });
});
