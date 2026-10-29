import { closeDatabase } from '../db/connection.js';
import { createBackup } from '../services/backup.js';
import { fail, initCli } from './common.js';

async function main(): Promise<void> {
  const { config, db } = initCli({ migrate: false });
  try {
    const result = await createBackup(db, config);
    console.log('\n✔ Backup created');
    console.log(`  Directory:      ${result.directory}`);
    console.log(`  Created at:     ${result.createdAt}`);
    console.log(`  Database:       ${result.databaseBytes} bytes (integrity: ${result.integrity})`);
    console.log(`  Document rows:  ${result.documentRows}`);
    console.log(`  Upload files:   ${result.uploadFiles} (${result.uploadBytes} bytes)`);
    console.log('\n  Back up includes a manifest with checksums. Store backups encrypted and access-restricted.\n');
    closeDatabase(db);
  } catch (error) {
    closeDatabase(db);
    fail((error as Error).message);
  }
}

void main();
