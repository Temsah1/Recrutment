import { describe, expect, it } from 'vitest';
import {
  STATUS_LABELS,
  STATUS_TONES,
  APPLICATION_STATUSES,
  allowedTransitions,
  canTransition,
  isApplicationStatus,
  statusLabel,
  type ApplicationStatus,
} from '../src/index.js';

const VALID: Record<ApplicationStatus, ApplicationStatus[]> = {
  pending: ['reviewing', 'shortlisted', 'rejected'],
  reviewing: ['pending', 'shortlisted', 'accepted', 'rejected'],
  shortlisted: ['reviewing', 'accepted', 'rejected'],
  accepted: ['shortlisted', 'rejected'],
  rejected: ['reviewing', 'shortlisted'],
};

describe('status transitions', () => {
  it('allows exactly the documented transitions', () => {
    for (const from of APPLICATION_STATUSES) {
      for (const to of APPLICATION_STATUSES) {
        const expected = from !== to && VALID[from].includes(to);
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(expected);
      }
    }
  });

  it('never allows a no-op transition', () => {
    for (const status of APPLICATION_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it('exposes the same set through allowedTransitions', () => {
    for (const status of APPLICATION_STATUSES) {
      expect([...allowedTransitions(status)].sort()).toEqual([...VALID[status]].sort());
    }
  });

  it('validates unknown status values', () => {
    expect(isApplicationStatus('pending')).toBe(true);
    expect(isApplicationStatus('accepted')).toBe(true);
    expect(isApplicationStatus('hired')).toBe(false);
    expect(isApplicationStatus(1)).toBe(false);
    expect(isApplicationStatus(null)).toBe(false);
  });

  it('has a label and tone for every status', () => {
    for (const status of APPLICATION_STATUSES) {
      expect(statusLabel(status)).toBe(STATUS_LABELS[status]);
      expect(STATUS_TONES[status]).toBeTruthy();
    }
  });
});
