import { APPLICATION_STATUSES, STATUS_LABELS, type ApplicationStatus } from './constants.js';

/**
 * Allowed status transitions. Decisions can be corrected (e.g. accepted -> rejected)
 * but every change is validated server-side and written to status history.
 */
const TRANSITIONS: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  pending: ['reviewing', 'shortlisted', 'rejected'],
  reviewing: ['pending', 'shortlisted', 'accepted', 'rejected'],
  shortlisted: ['reviewing', 'accepted', 'rejected'],
  accepted: ['shortlisted', 'rejected'],
  rejected: ['reviewing', 'shortlisted'],
};

export function canTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  if (from === to) return false;
  return TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: ApplicationStatus): readonly ApplicationStatus[] {
  return TRANSITIONS[from];
}

export function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return typeof value === 'string' && (APPLICATION_STATUSES as readonly string[]).includes(value);
}

export function statusLabel(status: ApplicationStatus): string {
  return STATUS_LABELS[status];
}

export const STATUS_TONES: Record<ApplicationStatus, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  pending: 'neutral',
  reviewing: 'info',
  shortlisted: 'warning',
  accepted: 'success',
  rejected: 'danger',
};
