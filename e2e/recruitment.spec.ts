import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const ADMIN_EMAIL = 'e2e-admin@esme.test';
const ADMIN_PASSWORD = 'E2E-only-Passphrase-2026';

const APPLICANT = {
  fullName: 'Nour Hassan Applicant',
  email: 'nour.e2e@example.com',
  phone: '+201001234567',
};

const PDF_BYTES = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
);
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const REFERENCE_PATTERN = /ESME-\d{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}/;
const REFERENCE_EXACT = /^ESME-\d{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/;

const state: { reference?: string } = {};

test.describe.configure({ mode: 'serial' });

async function signIn(page: Page): Promise<void> {
  await page.goto('/admin/login');
  const emailInput = page.locator('#admin-email');
  if (await emailInput.isVisible().catch(() => false)) {
    await emailInput.fill(ADMIN_EMAIL);
    await page.locator('#admin-password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/admin$/);
  }
  await page.goto('/admin/applicants');
  await expect(page.getByRole('heading', { name: 'All applications' })).toBeVisible();
}

async function setCycleStatus(page: Page, status: 'open' | 'closed'): Promise<void> {
  await page.goto('/admin/cycles');
  await expect(page.getByRole('heading', { name: 'Recruitment cycles' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Edit recruitment cycle' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Status').selectOption(status);
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toBeHidden();
}

test('Journey A — public landing page and closed-cycle messaging', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Build the future with ESME');
  await expect(page.getByText('Recruitment is closed')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Applications closed' }).first()).toBeVisible();

  const departments = page.locator('#departments');
  await expect(
    page.getByRole('heading', { name: 'Find the team where you can make an impact' }),
  ).toBeVisible();
  await expect(departments.getByRole('heading', { name: 'Front-end Development' })).toBeVisible();
  await expect(
    departments.getByRole('heading', { name: 'Machine Learning & Data Analysis' }),
  ).toBeVisible();
  await expect(departments.getByText('Apply for this department').first()).toBeVisible();

  await page.getByRole('link', { name: 'Read the privacy notice' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy notice' })).toBeVisible();
  await expect(page.getByText(/Policy version/)).toBeVisible();
});

test('Journey B — administrator signs in and opens the recruitment cycle', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login/);

  await page.locator('#admin-email').fill(ADMIN_EMAIL);
  await page.locator('#admin-password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'System & backups' })).toBeVisible();

  await setCycleStatus(page, 'open');

  await page.goto('/');
  await expect(page.getByText('Recruitment is open')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Apply now' }).first()).toBeVisible();
});

test('Journey C — applicant completes the six-step form with private documents', async ({ page }) => {
  await page.goto('/apply');
  await expect(page.getByRole('heading', { level: 1, name: 'Recruitment application' })).toBeVisible();

  await page.locator('input[name="fullName"]').fill(APPLICANT.fullName);
  await page.locator('input[name="email"]').fill(APPLICANT.email);
  await page.locator('input[name="phone"]').fill(APPLICANT.phone);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Academic information' })).toBeVisible();
  await expect(page.locator('input[name="university"]')).toHaveValue('Cairo University');
  await page.locator('input[name="faculty"]').fill('Faculty of Engineering');
  await page.locator('input[name="academicDepartment"]').fill('Computer Engineering');
  await page.locator('select[name="academicYear"]').selectOption('Third year');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Department selection' })).toBeVisible();
  await page.locator('input[type="radio"][value="frontend-development"]').check();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Links and motivation' })).toBeVisible();
  await page.locator('input[name="githubUrl"]').fill('https://github.com/nour-e2e');
  await page
    .locator('textarea[name="motivationStatement"]')
    .fill('I want to join ESME to build accessible React interfaces with a team that ships real projects.');
  await page
    .locator('textarea[name="experience"]')
    .fill('Built a course project scheduler in React and TypeScript, and contributed to a student design system.');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Required documents' })).toBeVisible();
  await page.setInputFiles('#document-national_id', {
    name: 'national-id.pdf',
    mimeType: 'application/pdf',
    buffer: PDF_BYTES,
  });
  await page.setInputFiles('#document-university_id', {
    name: 'university-id.png',
    mimeType: 'image/png',
    buffer: PNG_BYTES,
  });
  await expect(page.getByText('national-id.pdf')).toBeVisible();
  await expect(page.getByText('university-id.png')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Review and submit' })).toBeVisible();
  await expect(page.getByText('National ID', { exact: true })).toBeVisible();
  await page.locator('input[name="consentAccepted"]').check();
  await page.getByRole('button', { name: 'Submit application' }).click();

  await page.waitForURL(/\/apply\/success$/, { timeout: 45_000 });
  await expect(page.getByRole('heading', { name: 'Application received' })).toBeVisible();

  const referenceLocator = page.getByText(REFERENCE_EXACT);
  await expect(referenceLocator).toBeVisible();
  const reference = (await referenceLocator.textContent())?.trim() ?? '';
  expect(reference).toMatch(REFERENCE_PATTERN);
  state.reference = reference;

  await expect(page.getByText('Submitted, not yet reviewed')).toBeVisible();
  await expect(page.getByText(/What happens next/)).toBeVisible();
});

test('Journey D — recruiter reviews the application, adds a note, downloads documents and exports CSV', async ({
  page,
}) => {
  expect(state.reference, 'Journey C must have produced a reference').toMatch(REFERENCE_PATTERN);

  await signIn(page);
  await page.locator('#applicant-search').fill(APPLICANT.email);

  const applicantLink = page.getByRole('link', { name: APPLICANT.fullName, exact: true });
  await expect(applicantLink).toBeVisible();
  await applicantLink.click();

  await expect(page.getByRole('heading', { level: 1, name: APPLICANT.fullName })).toBeVisible();
  await expect(page.getByText(state.reference!, { exact: true }).first()).toBeVisible();

  await page.getByLabel('Move to').selectOption('reviewing');
  await page.getByLabel(/Reason \(optional\)/).fill('E2E review pass');
  await page.getByRole('button', { name: 'Update status' }).click();
  await expect(page.getByText('Status updated')).toBeVisible();

  await page.locator('#note-body').fill('E2E note: national ID and university ID verified.');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.getByText('E2E note: national ID and university ID verified.')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: APPLICANT.fullName })).toBeVisible();
  await expect(page.getByText('Under review').first()).toBeVisible();
  await expect(page.getByText('E2E note: national ID and university ID verified.')).toBeVisible();

  const documentDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).first().click();
  const downloadedDocument = await documentDownload;
  expect(downloadedDocument.suggestedFilename()).toBe('national-id.pdf');

  await page.getByRole('link', { name: 'Applicants', exact: true }).click();
  await page.locator('#applicant-search').fill(APPLICANT.email);
  await expect(page.getByRole('link', { name: APPLICANT.fullName, exact: true })).toBeVisible();

  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const csv = await csvDownload;
  const csvPath = await csv.path();
  expect(csvPath).toBeTruthy();
  const csvText = fs.readFileSync(csvPath!, 'utf8');
  expect(csvText.charCodeAt(0)).toBe(0xfeff);
  expect(csvText).toContain(state.reference!);
  expect(csvText).toContain(APPLICANT.email);

  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  const totalCard = page.locator('.card', { hasText: 'Total applications' }).first();
  await expect(totalCard).toContainText('1');
});

test('Journey E — closing blocks submissions, then system backup, retention preview and sign-out', async ({
  page,
}) => {
  await signIn(page);

  await setCycleStatus(page, 'closed');
  await page.goto('/apply');
  await expect(page.getByRole('heading', { name: 'Applications are closed' })).toBeVisible();
  await page.goto('/');
  await expect(page.getByText('Recruitment is closed')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Applications closed' }).first()).toBeVisible();

  await setCycleStatus(page, 'open');
  await page.goto('/apply');
  await expect(page.getByRole('heading', { level: 1, name: 'Recruitment application' })).toBeVisible();

  await page.goto('/admin/system');
  await expect(page.getByRole('heading', { name: 'System & backups' })).toBeVisible();

  await page.getByRole('button', { name: 'Create backup' }).click();
  await expect(page.getByText('Backup completed')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/integrity\s+ok/)).toBeVisible();

  await page.getByRole('button', { name: 'Preview eligible data' }).click();
  const previewDialog = page.getByRole('dialog', { name: 'Retention preview' });
  await expect(previewDialog).toBeVisible();
  await expect(
    previewDialog.getByText('No applications are eligible under the current retention settings.'),
  ).toBeVisible();
  await previewDialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(previewDialog).toBeHidden();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  await page.goto('/admin/applicants');
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});
