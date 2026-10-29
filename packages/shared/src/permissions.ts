import type { Role } from './constants.js';

export const PERMISSIONS = [
  'applications.view',
  'applications.view_all',
  'applications.status',
  'applications.assign',
  'applications.notes',
  'documents.view',
  'documents.download',
  'exports.create',
  'departments.manage',
  'settings.manage',
  'settings.security',
  'cycles.manage',
  'administrators.manage',
  'audit.view',
  'backups.run',
  'retention.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  super_admin: PERMISSIONS,
  recruitment_admin: [
    'applications.view',
    'applications.view_all',
    'applications.status',
    'applications.assign',
    'applications.notes',
    'documents.view',
    'documents.download',
    'exports.create',
    'cycles.manage',
  ],
  reviewer: [
    'applications.view',
    'applications.notes',
    'documents.view',
  ],
};

export function hasPermission(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function canManageAdministrators(role: Role | undefined | null): boolean {
  return hasPermission(role, 'administrators.manage');
}

/** A non-super-admin must never create or promote a Super Admin. */
export function canAssignRole(actorRole: Role, _targetRole: Role): boolean {
  if (actorRole === 'super_admin') return true;
  return false;
}
