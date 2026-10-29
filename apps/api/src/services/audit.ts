import type { Db } from '../db/connection.js';
import { nowIso } from '../lib/time.js';

export interface AuditEntryInput {
  actorAdminId: number | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  metadata?: Record<string, unknown> | null;
  requestId?: string | null;
}

/** Safe metadata only: never pass passwords, tokens, document contents or ID numbers. */
export function recordAudit(db: Db, input: AuditEntryInput): void {
  db.prepare(
    `INSERT INTO audit_logs
       (actor_admin_id, action, entity_type, entity_id, metadata_json, request_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.actorAdminId,
    input.action,
    input.entityType,
    input.entityId === null || input.entityId === undefined ? null : String(input.entityId),
    input.metadata ? JSON.stringify(input.metadata) : null,
    input.requestId ?? null,
    nowIso(),
  );
}
