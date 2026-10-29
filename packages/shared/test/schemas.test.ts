import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  applicationListQuerySchema,
  applicationSubmissionSchema,
  cycleSchema,
  departmentSchema,
  loginSchema,
  settingsSchema,
  statusUpdateSchema,
} from '../src/index.js';

const validApplication = {
  fullName: 'Layla Hassan',
  preferredName: '',
  email: 'Layla@Example.com',
  phone: '+20 100 123 4567',
  university: 'Cairo University',
  faculty: 'Engineering',
  academicDepartment: 'Computer Engineering',
  academicYear: 'Third year',
  primaryDepartmentSlug: 'frontend-development',
  secondaryDepartmentSlug: 'backend-development',
  githubUrl: '',
  linkedinUrl: 'https://linkedin.com/in/layla',
  portfolioUrl: '',
  motivationStatement: 'I want to build accessible products with the ESME team. '.padEnd(80, 'x'),
  experience: '',
  additionalInformation: '',
  consentAccepted: true,
};

describe('applicationSubmissionSchema', () => {
  it('accepts a valid submission and normalises optional fields', () => {
    const parsed = applicationSubmissionSchema.parse(validApplication);
    expect(parsed.email).toBe('layla@example.com');
    expect(parsed.preferredName).toBe('');
    expect(parsed.githubUrl).toBeUndefined();
    expect(parsed.experience).toBeUndefined();
    expect(parsed.secondaryDepartmentSlug).toBe('backend-development');
  });

  it('requires explicit consent', () => {
    const result = applicationSubmissionSchema.safeParse({ ...validApplication, consentAccepted: false });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('consentAccepted'))).toBe(true);
    }
  });

  it('rejects the same primary and secondary department', () => {
    const result = applicationSubmissionSchema.safeParse({
      ...validApplication,
      secondaryDepartmentSlug: 'frontend-development',
    });
    expect(result.success).toBe(false);
  });

  it('rejects short motivation, unsafe URLs and invalid names', () => {
    expect(
      applicationSubmissionSchema.safeParse({ ...validApplication, motivationStatement: 'too short' })
        .success,
    ).toBe(false);
    expect(
      applicationSubmissionSchema.safeParse({
        ...validApplication,
        githubUrl: 'javascript:alert(1)',
      }).success,
    ).toBe(false);
    expect(
      applicationSubmissionSchema.safeParse({ ...validApplication, fullName: 'John123' }).success,
    ).toBe(false);
  });

  it('validates idempotency keys as UUIDs when supplied', () => {
    expect(
      applicationSubmissionSchema.safeParse({
        ...validApplication,
        idempotencyKey: '11111111-2222-4333-8444-555555555555',
      }).success,
    ).toBe(true);
    expect(
      applicationSubmissionSchema.safeParse({ ...validApplication, idempotencyKey: 'abc' }).success,
    ).toBe(false);
  });
});

describe('loginSchema', () => {
  it('normalises email and requires a password', () => {
    const parsed = loginSchema.parse({ email: ' Admin@ESME.Test ', password: 'secret-value' });
    expect(parsed.email).toBe('admin@esme.test');
    expect(loginSchema.safeParse({ email: 'admin@esme.test', password: '' }).success).toBe(false);
  });
});

describe('departmentSchema', () => {
  it('applies defaults and validates slugs', () => {
    const parsed = departmentSchema.parse({ name: 'Design' });
    expect(parsed).toMatchObject({ description: '', isActive: true, displayOrder: 100 });
    expect(departmentSchema.safeParse({ name: 'Design', slug: 'Bad Slug' }).success).toBe(false);
  });
});

describe('cycleSchema', () => {
  it('accepts ordered windows and rejects inverted ones', () => {
    const base = { name: 'Spring 2027', status: 'open' as const, opensAt: '2027-01-01T00:00:00Z', closesAt: '2027-02-01T00:00:00Z' };
    expect(cycleSchema.safeParse(base).success).toBe(true);
    expect(
      cycleSchema.safeParse({ ...base, opensAt: '2027-03-01T00:00:00Z' }).success,
    ).toBe(false);
    expect(
      cycleSchema.safeParse({ ...base, closesAt: '2027-02-01T00:00:00' }).success,
    ).toBe(false);
  });
});

describe('settingsSchema', () => {
  it('accepts the shipped defaults', () => {
    const defaults = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    expect(settingsSchema.safeParse(defaults).success).toBe(true);
  });

  it('rejects unsupported document formats', () => {
    const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    settings.documents.nationalIdTypes = ['image/png'];
    expect(settingsSchema.safeParse(settings).success).toBe(false);

    const university = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    university.documents.universityIdTypes = ['application/pdf'];
    expect(settingsSchema.safeParse(university).success).toBe(false);
  });

  it('bounds the retention window and upload size', () => {
    const tooShort = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    tooShort.retention.days = 5;
    expect(settingsSchema.safeParse(tooShort).success).toBe(false);

    const tooLarge = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    tooLarge.documents.maxSizeBytes = 50 * 1024 * 1024;
    expect(settingsSchema.safeParse(tooLarge).success).toBe(false);
  });
});

describe('query and status schemas', () => {
  it('applies list defaults and coerces pagination', () => {
    const defaults = applicationListQuerySchema.parse({});
    expect(defaults).toMatchObject({ page: 1, pageSize: 20, sort: 'submitted_at', order: 'desc' });
    expect(applicationListQuerySchema.parse({ page: '3', pageSize: '50' })).toMatchObject({
      page: 3,
      pageSize: 50,
    });
    expect(applicationListQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
  });

  it('coerces optimistic-concurrency versions', () => {
    const parsed = statusUpdateSchema.parse({ status: 'reviewing', expectedVersion: '4' });
    expect(parsed.expectedVersion).toBe(4);
    expect(statusUpdateSchema.safeParse({ status: 'hired' }).success).toBe(false);
  });
});
