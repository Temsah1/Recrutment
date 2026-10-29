import {
  DEFAULT_SETTINGS,
  settingsSchema,
  type AppSettings,
} from '@esme/shared';
import type { Db } from '../db/connection.js';
import type { CycleRow } from '../db/rows.js';
import { getSettings, readSettingsRow, writeSettingsRow } from '../db/seed.js';
import { nowIso } from '../lib/time.js';

export { getSettings };

export function getCurrentCycle(db: Db): CycleRow | null {
  const row = db
    .prepare('SELECT * FROM recruitment_cycles WHERE is_current = 1 ORDER BY id DESC LIMIT 1')
    .get() as CycleRow | undefined;
  return row ?? null;
}

export function listCycles(db: Db): (CycleRow & { application_count: number })[] {
  return db
    .prepare(
      `SELECT c.*, COUNT(a.id) AS application_count
         FROM recruitment_cycles c
         LEFT JOIN applications a ON a.recruitment_cycle_id = c.id
        GROUP BY c.id
        ORDER BY c.is_current DESC, c.created_at DESC`,
    )
    .all() as (CycleRow & { application_count: number })[];
}

export interface RecruitmentState {
  settings: AppSettings;
  cycle: CycleRow | null;
  open: boolean;
  openStart: string | null;
  effectiveClose: string | null;
  closedReason: 'closed' | 'not_open_yet' | null;
}

/**
 * Single source of truth for "can applications be submitted?".
 * The cycle status is the on/off switch; opening/closing instants are enforced
 * in UTC regardless of the browser clock. The configured deadline acts as a
 * hard cutoff when the cycle has no closing time.
 */
export function resolveRecruitmentState(db: Db, now: Date = new Date()): RecruitmentState {
  const settings = getSettings(db);
  const cycle = getCurrentCycle(db);
  const openStart = cycle?.opens_at ?? null;
  const effectiveClose = cycle?.closes_at ?? settings.recruitment.deadline;
  const nowMs = now.getTime();

  const withinWindow =
    (!openStart || nowMs >= new Date(openStart).getTime()) &&
    (!effectiveClose || nowMs < new Date(effectiveClose).getTime());
  const open = cycle?.status === 'open' && withinWindow;

  let closedReason: RecruitmentState['closedReason'] = 'closed';
  if (cycle?.status === 'open' && openStart && nowMs < new Date(openStart).getTime()) {
    closedReason = 'not_open_yet';
  }

  return { settings, cycle, open, openStart, effectiveClose, closedReason };
}

export function updateSettings(
  db: Db,
  patch: Partial<AppSettings>,
): { settings: AppSettings; changedSections: string[] } {
  const current = getSettings(db);
  const merged = { ...current } as AppSettings;
  const changedSections: string[] = [];

  for (const key of Object.keys(patch) as (keyof AppSettings)[]) {
    const section = patch[key];
    if (!section) continue;
    if (!(key in DEFAULT_SETTINGS)) continue;
    merged[key] = { ...(current[key] as object), ...(section as object) } as never;
    changedSections.push(key);
  }

  const validated = settingsSchema.parse(merged);
  const run = db.transaction(() => {
    for (const key of changedSections) {
      writeSettingsRow(db, key, JSON.stringify(validated[key as keyof AppSettings]));
    }
  });
  run();
  return { settings: validated as AppSettings, changedSections };
}

export function getSettingValue(db: Db, key: keyof AppSettings): unknown {
  const raw = readSettingsRow(db, key);
  if (!raw) return DEFAULT_SETTINGS[key];
  try {
    return JSON.parse(raw);
  } catch {
    return DEFAULT_SETTINGS[key];
  }
}

export function touchSettings(db: Db): void {
  writeSettingsRow(db, 'updated_at', JSON.stringify(nowIso()));
}
