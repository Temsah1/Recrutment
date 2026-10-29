import crypto from 'node:crypto';
import {
  ACADEMIC_YEARS,
  applicationSubmissionSchema,
  type ApplicationStatus,
  type ApplicationSubmission,
} from '@esme/shared';
import type { AdministratorRow } from '../db/rows.js';
import { closeDatabase } from '../db/connection.js';
import { fail, initCli } from './common.js';
import { recordAudit } from '../services/audit.js';
import { addApplicationNote, assignReviewer, updateApplicationStatus } from '../services/applications.js';
import { hashPassword } from '../services/auth.js';
import { validateUploadedDocument, type ValidatedUpload } from '../services/documents.js';
import { createApplication } from '../services/applications.js';
import { FileStorage } from '../services/storage.js';
import { getCurrentCycle, getSettings, updateSettings } from '../services/settings.js';
import { writeSettingsRow } from '../db/seed.js';
import { nowIso } from '../lib/time.js';
import { randomToken } from '../lib/crypto.js';

function makePdf(title: string): Buffer {
  const content = `BT /F1 18 Tf 72 720 Td (${title}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const DEMO_PEOPLE: {
  name: string;
  email: string;
  dept: string;
  secondary?: string;
  year: (typeof ACADEMIC_YEARS)[number];
  path: ApplicationStatus[];
  note?: string;
}[] = [
  {
    name: 'Nour Adel',
    email: 'nour.demo@example.test',
    dept: 'frontend-development',
    secondary: 'ai-automation',
    year: 'Second year',
    path: ['reviewing', 'shortlisted'],
    note: 'Strong portfolio. Schedule a short technical conversation.',
  },
  {
    name: 'Youssef Hassan',
    email: 'youssef.demo@example.test',
    dept: 'backend-development',
    year: 'Third year',
    path: ['reviewing', 'shortlisted', 'accepted'],
    note: 'Accepted for the back-end team. Confirmation pending.',
  },
  {
    name: 'Mariam Khaled',
    email: 'mariam.demo@example.test',
    dept: 'ml-data-analysis',
    year: 'Fourth year',
    path: ['reviewing'],
  },
  {
    name: 'Omar Tarek',
    email: 'omar.demo@example.test',
    dept: 'it-helpdesk',
    year: 'First year',
    path: ['reviewing', 'rejected'],
    note: 'Did not meet the availability requirement this cycle.',
  },
  {
    name: 'Salma Mostafa',
    email: 'salma.demo@example.test',
    dept: 'ai-automation',
    secondary: 'frontend-development',
    year: 'Third year',
    path: [],
  },
  {
    name: 'Ahmed Fathy',
    email: 'ahmed.demo@example.test',
    dept: 'frontend-development',
    year: 'Preparatory year',
    path: [],
  },
];

function rememberPassword(label: string, email: string, password: string): void {
  console.log(`  ${label}: ${email}`);
  console.log(`    password: ${password}   (shown once — development only)`);
}

async function main(): Promise<void> {
  const { config, db } = initCli();
  if (config.isProduction) {
    closeDatabase(db);
    fail('seed:demo refuses to run with NODE_ENV=production. Synthetic data must never reach production.');
  }

  const storage = new FileStorage(config.uploadsDir);
  storage.init();

  const cycle = getCurrentCycle(db);
  if (!cycle) {
    closeDatabase(db);
    fail('No current recruitment cycle exists. Run migrations first.');
  }

  console.log('\nESME Recruitment OS — development demo seed');
  console.log('Creating clearly labelled synthetic records (example.test emails).\n');

  // Make the cycle usable for demo submissions.
  const now = nowIso();
  db.prepare(
    "UPDATE recruitment_cycles SET status = 'open', opens_at = NULL, closes_at = NULL, updated_at = ? WHERE id = ?",
  ).run(now, cycle.id);
  const settings = getSettings(db);
  updateSettings(db, {
    recruitment: { ...settings.recruitment, deadline: null },
  });
  writeSettingsRow(db, 'seed_marker', JSON.stringify({ type: 'demo', createdAt: now }));

  let actor = db
    .prepare("SELECT * FROM administrators WHERE role = 'super_admin' AND is_active = 1 LIMIT 1")
    .get() as AdministratorRow | undefined;

  if (!actor) {
    const email = 'demo.superadmin@example.test';
    const password = `Dev-${randomToken(9)}`;
    const hash = await hashPassword(password);
    db.prepare(
      `INSERT INTO administrators
         (email, password_hash, display_name, role, is_active, created_at, updated_at, password_changed_at)
       VALUES (?, ?, 'Demo Super Admin', 'super_admin', 1, ?, ?, ?)`,
    ).run(email, hash, now, now, now);
    actor = db
      .prepare('SELECT * FROM administrators WHERE email = ?')
      .get(email) as AdministratorRow;
    console.log('Created demo administrator:');
    rememberPassword('Super Admin', email, password);
    console.log('');
  }

  let reviewer = db
    .prepare("SELECT * FROM administrators WHERE email = 'demo.reviewer@example.test'")
    .get() as AdministratorRow | undefined;
  if (!reviewer) {
    const password = `Dev-${randomToken(9)}`;
    const hash = await hashPassword(password);
    db.prepare(
      `INSERT INTO administrators
         (email, password_hash, display_name, role, is_active, created_at, updated_at, password_changed_at)
       VALUES ('demo.reviewer@example.test', ?, 'Demo Reviewer', 'reviewer', 1, ?, ?, ?)`,
    ).run(hash, now, now, now);
    reviewer = db
      .prepare('SELECT * FROM administrators WHERE email = ?')
      .get('demo.reviewer@example.test') as AdministratorRow;
    rememberPassword('Reviewer', 'demo.reviewer@example.test', password);
    console.log('');
  }

  const pdfUpload = await validateUploadedDocument(
    { data: makePdf('DEMO NATIONAL ID - SYNTHETIC RECORD - NOT VALID'), filename: 'demo-national-id.pdf', mimetype: 'application/pdf' },
    'national_id',
    settings,
    config.maxUploadBytes,
  );
  const pngUpload = await validateUploadedDocument(
    { data: PNG_1X1, filename: 'demo-university-id.png', mimetype: 'image/png' },
    'university_id',
    settings,
    config.maxUploadBytes,
  );

  let created = 0;
  for (const person of DEMO_PEOPLE) {
    const existing = db
      .prepare('SELECT id FROM applications WHERE contact_email = ? AND recruitment_cycle_id = ?')
      .get(person.email, cycle.id) as { id: number } | undefined;
    if (existing) continue;

    const payload: ApplicationSubmission = applicationSubmissionSchema.parse({
      fullName: person.name,
      email: person.email,
      phone: '+20 100 000 0000',
      university: 'Cairo University',
      faculty: 'Faculty of Engineering',
      academicDepartment: 'Computer Engineering',
      academicYear: person.year,
      primaryDepartmentSlug: person.dept,
      secondaryDepartmentSlug: person.secondary,
      motivationStatement:
        'Synthetic demonstration record created by seed:demo for interface testing only. ' +
        'This statement exists to satisfy the minimum length requirement and is not a real application.',
      experience: 'Synthetic demo experience: coursework projects and student activities.',
      additionalInformation: 'SYNTHETIC DEMO DATA — not a real applicant.',
      consentAccepted: true,
      idempotencyKey: crypto.randomUUID(),
    });

    const uploads: Partial<Record<'national_id' | 'university_id', ValidatedUpload>> = {
      national_id: pdfUpload,
      university_id: pngUpload,
    };

    const result = createApplication(db, storage, { payload, uploads, ip: '127.0.0.1', requestId: 'seed-demo' });
    created += 1;

    let version = 1;
    for (const status of person.path) {
      updateApplicationStatus(db, {
        applicationId: result.id,
        admin: actor,
        scope: { kind: 'all' },
        status,
        reason: 'Seeded demo transition',
        expectedVersion: version,
        requestId: 'seed-demo',
      });
      version += 1;
    }
    if (person.note) {
      addApplicationNote(db, {
        applicationId: result.id,
        admin: reviewer,
        scope: { kind: 'assigned', adminId: reviewer.id },
        body: person.note,
        requestId: 'seed-demo',
      });
    }
    if (person.dept === 'frontend-development' || person.dept === 'ml-data-analysis') {
      assignReviewer(db, {
        applicationId: result.id,
        reviewerId: reviewer.id,
        admin: actor,
        requestId: 'seed-demo',
      });
    }
  }

  recordAudit(db, {
    actorAdminId: actor.id,
    action: 'system.demo_seeded',
    entityType: 'system',
    entityId: null,
    metadata: { applicationsCreated: created, cycleId: cycle.id },
    requestId: 'seed-demo',
  });

  const totals = db.prepare('SELECT status, COUNT(*) AS count FROM applications GROUP BY status').all();
  console.log(`✔ Demo seed complete: ${created} synthetic application(s) created.`);
  console.log(`  Current status counts: ${JSON.stringify(totals)}`);
  console.log('  Recruitment has been left OPEN for the demo. Close it in Recruitment settings before going live.');
  console.log('  Remove synthetic data by deleting the database before production use.\n');

  closeDatabase(db);
}

void main().catch((error) => {
  fail((error as Error).message);
});
