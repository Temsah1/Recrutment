import { DEFAULT_DEPARTMENTS, DEFAULT_SETTINGS, type AppSettings } from '@esme/shared';
import type { Db } from './connection.js';
import { nowIso } from '../lib/time.js';

const SETTINGS_SECTIONS = Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[];

/** Idempotent first-run defaults: settings keys, departments and a closed cycle. */
export function seedDefaults(db: Db): void {
  const now = nowIso();
  const run = db.transaction(() => {
    const insertSetting = db.prepare(
      'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO NOTHING',
    );
    for (const section of SETTINGS_SECTIONS) {
      insertSetting.run(section, JSON.stringify(DEFAULT_SETTINGS[section]), now);
    }

    const departmentCount = db.prepare('SELECT COUNT(*) AS count FROM departments').get() as {
      count: number;
    };
    if (departmentCount.count === 0) {
      const insert = db.prepare(
        `INSERT INTO departments (name, slug, description, is_active, display_order, created_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?, ?)`,
      );
      for (const department of DEFAULT_DEPARTMENTS) {
        insert.run(
          department.name,
          department.slug,
          department.description,
          department.displayOrder,
          now,
          now,
        );
      }
    }

    const cycleCount = db.prepare('SELECT COUNT(*) AS count FROM recruitment_cycles').get() as {
      count: number;
    };
    if (cycleCount.count === 0) {
      db.prepare(
        `INSERT INTO recruitment_cycles
           (name, status, opens_at, closes_at, privacy_policy_version, is_current, created_at, updated_at)
         VALUES (?, 'closed', NULL, NULL, ?, 1, ?, ?)`,
      ).run(DEFAULT_SETTINGS.recruitment.title, DEFAULT_SETTINGS.privacy.version, now, now);
    }
  });
  run();
}

export function readSettingsRow(db: Db, key: string): string | null {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function writeSettingsRow(db: Db, key: string, value: string): void {
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value, nowIso());
}

export function getSettings(db: Db): AppSettings {
  const result = structuredClone(DEFAULT_SETTINGS) as unknown as AppSettings;
  const read = db.prepare('SELECT key, value FROM app_settings').all() as {
    key: string;
    value: string;
  }[];
  for (const row of read) {
    if (!(row.key in result)) continue;
    try {
      const parsed = JSON.parse(row.value) as Record<string, unknown>;
      const sectionKey = row.key as keyof AppSettings;
      result[sectionKey] = {
        ...(result[sectionKey] as object),
        ...parsed,
      } as never;
    } catch {
      // Invalid JSON falls back to the default for that section.
    }
  }
  return result;
}
