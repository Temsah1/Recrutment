import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  ROLES,
  canAssignRole,
  canManageAdministrators,
  hasPermission,
  permissionsFor,
  type Role,
} from '../src/index.js';

describe('RBAC permission matrix', () => {
  it('grants every permission to super_admin', () => {
    for (const permission of PERMISSIONS) {
      expect(hasPermission('super_admin', permission), permission).toBe(true);
    }
  });

  it('limits recruitment_admin to operational recruitment permissions', () => {
    const expected = [
      'applications.view',
      'applications.view_all',
      'applications.status',
      'applications.assign',
      'applications.notes',
      'documents.view',
      'documents.download',
      'exports.create',
      'cycles.manage',
    ];
    expect([...permissionsFor('recruitment_admin')].sort()).toEqual([...expected].sort());
    for (const forbidden of [
      'settings.manage',
      'settings.security',
      'administrators.manage',
      'audit.view',
      'backups.run',
      'retention.manage',
      'departments.manage',
    ] as const) {
      expect(hasPermission('recruitment_admin', forbidden), forbidden).toBe(false);
    }
  });

  it('limits reviewers to viewing assigned applications and notes', () => {
    expect([...permissionsFor('reviewer')].sort()).toEqual(
      ['applications.view', 'applications.notes', 'documents.view'].sort(),
    );
    expect(hasPermission('reviewer', 'applications.view_all')).toBe(false);
    expect(hasPermission('reviewer', 'applications.status')).toBe(false);
    expect(hasPermission('reviewer', 'documents.download')).toBe(false);
  });

  it('denies every permission without a role', () => {
    for (const permission of PERMISSIONS) {
      expect(hasPermission(undefined, permission)).toBe(false);
      expect(hasPermission(null, permission)).toBe(false);
    }
  });

  it('only allows Super Admins to manage administrators or assign roles', () => {
    for (const role of ROLES) {
      expect(canManageAdministrators(role)).toBe(role === 'super_admin');
      for (const target of ROLES) {
        expect(canAssignRole(role as Role, target)).toBe(role === 'super_admin');
      }
    }
  });
});
