import { closeDatabase } from '../db/connection.js';
import { getDiagnostics } from '../services/diagnostics.js';
import { FileStorage } from '../services/storage.js';
import { initCli } from './common.js';

const { config, db } = initCli({ migrate: false });
const storage = new FileStorage(config.uploadsDir);
storage.init();
const diagnostics = getDiagnostics(db, storage, config);

const problems: string[] = [];
if (!diagnostics.database.ok) problems.push('Database integrity check failed');
if (!diagnostics.storage.writable) problems.push('Private uploads directory is not writable');
if (diagnostics.reconciliation.missingFiles.length > 0) {
  problems.push(`${diagnostics.reconciliation.missingFiles.length} document files are missing from storage`);
}

console.log(
  JSON.stringify(
    {
      database: { ok: diagnostics.database.ok, sizeBytes: diagnostics.database.sizeBytes },
      storage: {
        writable: diagnostics.storage.writable,
        documents: diagnostics.storage.documentCount,
        bytes: diagnostics.storage.totalBytes,
      },
      reconciliation: diagnostics.reconciliation,
      migrations: diagnostics.migrations.map((migration) => migration.version),
      retention: diagnostics.retention,
      counts: diagnostics.counts,
      problems,
    },
    null,
    2,
  ),
);

closeDatabase(db);
if (problems.length > 0) {
  console.error(`\n✖ Storage verification found ${problems.length} problem(s).`);
  process.exit(1);
}
console.log('\n✔ Storage verification passed.');
