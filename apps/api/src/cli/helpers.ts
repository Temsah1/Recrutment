import type { Db } from '../db/connection.js';
import type { AdministratorRow } from '../db/rows.js';

export function findAdminByEmail(db: Db, email: string): AdministratorRow | null {
  return (
    (db.prepare('SELECT * FROM administrators WHERE email = ?').get(email.toLowerCase()) as
      | AdministratorRow
      | undefined) ?? null
  );
}
