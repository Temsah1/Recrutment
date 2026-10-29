import { restoreBackup, verifyBackupDirectory } from '../services/backup.js';
import { fail, loadCliConfig, parseArgs } from './common.js';

async function main(): Promise<void> {
  const args = parseArgs();
  const from = typeof args.from === 'string' ? args.from : null;
  if (!from) fail('Usage: npm run db:restore -- --from <backup-directory> --yes [--force]');
  if (args.yes !== true) {
    fail('Restore is destructive. Stop the API first, then re-run with --yes to confirm.');
  }

  // Config only: opening the database here would create the file and defeat the
  // "target must be empty" safety check.
  const config = loadCliConfig();
  try {
    const verified = await verifyBackupDirectory(from);
    console.log(`Backup verified: ${verified.documentRows} document rows, ${verified.uploadFiles} upload files.`);

    const result = await restoreBackup(from, config, { force: args.force === true });
    console.log('\n✔ Restore complete');
    console.log(`  Database: ${result.restoredDatabase}`);
    console.log(`  Uploads:  ${result.restoredUploads}`);
    console.log(`  Document rows: ${result.documentRows}, upload files: ${result.uploadFiles}`);
    console.log('\n  Start the API and verify the dashboard before allowing new submissions.\n');
  } catch (error) {
    fail((error as Error).message);
  }
}

void main();
