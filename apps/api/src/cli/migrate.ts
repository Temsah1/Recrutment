import { closeDatabase } from '../db/connection.js';
import { initCli } from './common.js';

const { db } = initCli();
const check = db.pragma('foreign_key_check') as unknown[];
const integrity = db.pragma('integrity_check') as { integrity_check: string }[];
console.log(
  JSON.stringify(
    {
      migrations: db.prepare('SELECT version, applied_at FROM schema_migrations ORDER BY version').all(),
      integrity: integrity[0]?.integrity_check,
      foreignKeyViolations: check.length,
    },
    null,
    2,
  ),
);
closeDatabase(db);
