import { slugify, type DepartmentDTO } from '@esme/shared';
import type { Db } from '../db/connection.js';
import type { DepartmentRow } from '../db/rows.js';
import { AppError } from '../lib/errors.js';
import { nowIso } from '../lib/time.js';

export function mapDepartment(row: DepartmentRow): DepartmentDTO {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    displayOrder: row.display_order,
    isActive: row.is_active === 1,
  };
}

export function listDepartments(db: Db, includeInactive = false): DepartmentDTO[] {
  const rows = db
    .prepare(
      `SELECT * FROM departments
        ${includeInactive ? '' : 'WHERE is_active = 1'}
        ORDER BY display_order ASC, name ASC`,
    )
    .all() as DepartmentRow[];
  return rows.map(mapDepartment);
}

export function findDepartmentBySlug(db: Db, slug: string): DepartmentRow | null {
  return (db.prepare('SELECT * FROM departments WHERE slug = ?').get(slug) as DepartmentRow) ?? null;
}

export function findDepartmentById(db: Db, id: number): DepartmentRow | null {
  return (db.prepare('SELECT * FROM departments WHERE id = ?').get(id) as DepartmentRow) ?? null;
}

function uniqueSlug(db: Db, desired: string, excludeId?: number): string {
  const base = slugify(desired) || 'department';
  let candidate = base;
  let counter = 2;
  for (;;) {
    const row = db
      .prepare('SELECT id FROM departments WHERE slug = ? AND id IS NOT ?')
      .get(candidate, excludeId ?? null) as { id: number } | undefined;
    if (!row) return candidate;
    candidate = `${base}-${counter}`;
    counter += 1;
  }
}

export function createDepartment(
  db: Db,
  input: { name: string; slug?: string; description: string; isActive: boolean; displayOrder: number },
): DepartmentDTO {
  const now = nowIso();
  const slug = uniqueSlug(db, input.slug ?? input.name);
  const result = db
    .prepare(
      `INSERT INTO departments (name, slug, description, is_active, display_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(input.name, slug, input.description, input.isActive ? 1 : 0, input.displayOrder, now, now);
  const row = findDepartmentById(db, Number(result.lastInsertRowid));
  if (!row) throw new AppError(500, 'internal_error', 'Failed to create department');
  return mapDepartment(row);
}

export function updateDepartment(
  db: Db,
  id: number,
  patch: {
    name?: string;
    slug?: string;
    description?: string;
    isActive?: boolean;
    displayOrder?: number;
  },
): DepartmentDTO {
  const existing = findDepartmentById(db, id);
  if (!existing) throw AppError.notFound('Department not found');

  const name = patch.name ?? existing.name;
  const description = patch.description ?? existing.description;
  const isActive = patch.isActive === undefined ? existing.is_active === 1 : patch.isActive;
  const displayOrder = patch.displayOrder ?? existing.display_order;
  const slug =
    patch.slug !== undefined && patch.slug !== existing.slug
      ? uniqueSlug(db, patch.slug, id)
      : existing.slug;

  if (!isActive) {
    const activeCount = db
      .prepare('SELECT COUNT(*) AS count FROM departments WHERE is_active = 1 AND id != ?')
      .get(id) as { count: number };
    if (activeCount.count === 0) {
      throw AppError.badRequest('At least one department must remain active');
    }
  }

  db.prepare(
    `UPDATE departments
        SET name = ?, slug = ?, description = ?, is_active = ?, display_order = ?, updated_at = ?
      WHERE id = ?`,
  ).run(name, slug, description, isActive ? 1 : 0, displayOrder, nowIso(), id);

  const row = findDepartmentById(db, id);
  if (!row) throw AppError.notFound('Department not found');
  return mapDepartment(row);
}
