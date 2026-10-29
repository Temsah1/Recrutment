export const BRAND = {
  name: 'ESME Recruitment OS',
  shortName: 'ESME',
  organization: 'ESME Cairo University Student Chapter',
  publicHeading: 'Build the Future With ESME',
  publicSupporting:
    'Join a community of engineers, innovators, and problem-solvers. Tell us about yourself, explore your interests, and apply to the team where you can make an impact.',
  adminName: 'ESME Recruitment Command Center',
  colors: {
    navy: '#0B1F3A',
    navySoft: '#12305A',
    orange: '#F28C28',
    orangeDeep: '#D96E0C',
    white: '#FFFFFF',
    offWhite: '#F7F8FA',
    gray: '#E5E7EB',
  },
} as const;

export const API_PREFIX = '/api/v1';
export const SESSION_COOKIE = 'esme_session';
export const CSRF_COOKIE = 'esme_csrf';
export const CSRF_HEADER = 'x-esme-csrf';
export const IDEMPOTENCY_HEADER = 'idempotency-key';
