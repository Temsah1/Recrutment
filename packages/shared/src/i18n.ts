/**
 * All important public/admin copy lives here so an Arabic (RTL) locale can be
 * added later without touching component markup.
 */
export const en = {
  publicNav: {
    overview: 'Overview',
    departments: 'Departments',
    process: 'Process',
    guidelines: 'Guidelines',
    faq: 'FAQ',
    privacy: 'Privacy',
    apply: 'Apply now',
    applyClosed: 'Applications closed',
    admin: 'Team login',
  },
  hero: {
    eyebrow: 'ESME Cairo University Student Chapter',
    applyCta: 'Apply now',
    learnMore: 'Explore departments',
    openBadge: 'Recruitment is open',
    closedBadge: 'Recruitment is closed',
    deadlinePrefix: 'Applications close',
    noDeadline: 'No closing date announced',
  },
  sections: {
    overviewTitle: 'Recruitment at a glance',
    overviewBody:
      'ESME is the student chapter of the École Supérieure des Mines engineering school at Cairo University. Each cycle we invite students to join one of our technical departments, where members work on real projects, learn together, and support the chapter’s activities.',
    departmentsTitle: 'Departments',
    departmentsBody:
      'Choose the team where your interests fit best. You may also indicate an optional second preference.',
    processTitle: 'How the application works',
    guidelinesTitle: 'Before you apply',
    privacyTitle: 'Your data and privacy',
    faqTitle: 'Frequently asked questions',
    ctaTitle: 'Ready to build with us?',
    ctaBody:
      'Applications take about 10 minutes. Have your national ID (PDF) and university ID (image) ready before you start.',
  },
  process: [
    {
      title: 'Complete the form',
      body: 'Share your details, academic information, department preference and motivation. The form saves nothing until you submit it.',
    },
    {
      title: 'Upload your documents',
      body: 'Attach your national ID as a PDF and a clear image of your university ID card. Files stay private.',
    },
    {
      title: 'Review and submit',
      body: 'Check every answer, accept the privacy notice and submit. You receive a reference number immediately.',
    },
    {
      title: 'Selection process',
      body: 'The recruitment team reviews applications and contacts shortlisted applicants using the email you provide.',
    },
  ],
  guidelines: [
    'Use your full legal name exactly as it appears on your national ID.',
    'Provide an email address and phone number you check regularly.',
    'Your motivation statement matters more than polished formatting — be specific and honest.',
    'Only upload your own documents. Do not submit another person’s identity documents.',
    'Duplicate applications for the same email are not accepted; contact the team if you need to correct something.',
    'Applications are reviewed by authorized ESME administrators only.',
  ],
  faq: [
    {
      q: 'Do I need an account to apply?',
      a: 'No. The application is open to Cairo University students without registration. You only need a valid email address and your documents.',
    },
    {
      q: 'Can I apply to more than one department?',
      a: 'You choose one primary department and, when enabled, an optional secondary preference. The recruitment team considers your primary choice first.',
    },
    {
      q: 'What documents are required?',
      a: 'A PDF copy of your national ID and an image (JPEG, PNG or WebP) of your university ID card. The exact requirements are shown on the form and set by the recruitment team.',
    },
    {
      q: 'How do I know my application was received?',
      a: 'After a successful submission you receive a unique reference number on screen. Keep it for your records. Submitting does not mean you have been accepted.',
    },
    {
      q: 'Can I edit my application after submitting?',
      a: 'Submitted applications are locked. Contact the recruitment team with your reference number if something is materially incorrect.',
    },
    {
      q: 'What happens to my documents?',
      a: 'Documents are stored in private storage, accessible only to authorized administrators for verification. They are never published or emailed.',
    },
  ],
  form: {
    personal: 'Personal information',
    academic: 'Academic information',
    departments: 'Department selection',
    links: 'Links and motivation',
    documents: 'Documents',
    review: 'Review and submit',
    next: 'Continue',
    back: 'Back',
    submit: 'Submit application',
    submitting: 'Submitting…',
    required: 'Required',
    optional: 'Optional',
    reviewHint: 'Please review your answers. You will not be able to edit them after submission.',
    consentLabel:
      'I confirm the information I provided is accurate and I consent to ESME processing my application and documents for recruitment purposes, as described in the privacy notice.',
    consentRequired: 'You must accept the privacy notice to submit.',
  },
  success: {
    title: 'Application received',
    referenceLabel: 'Your reference number',
    nextStepsTitle: 'What happens next',
    nextSteps: [
      'The recruitment team reviews your application and documents.',
      'Shortlisted applicants are contacted by email using the address you provided.',
      'Keep your reference number — quote it in any correspondence with the team.',
    ],
    home: 'Back to home',
  },
  adminNav: {
    dashboard: 'Dashboard',
    applications: 'Applicants',
    recruitment: 'Recruitment cycle',
    departments: 'Departments',
    settings: 'Settings',
    administrators: 'Administrators',
    audit: 'Audit log',
    exports: 'Exports',
    system: 'System',
  },
  status: {
    pending: 'Pending',
    reviewing: 'Under review',
    shortlisted: 'Shortlisted',
    accepted: 'Accepted',
    rejected: 'Rejected',
  },
  errors: {
    generic: 'Something went wrong. Please try again.',
    network: 'We could not reach the server. Check your connection and try again.',
    closed: 'Recruitment is currently closed and applications cannot be submitted.',
    sessionExpired: 'Your session expired. Please sign in again.',
    forbidden: 'You do not have permission to perform this action.',
    notFound: 'The page you requested does not exist.',
  },
} as const;

export type MessageKey = keyof typeof en;

export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in vars ? String(vars[key]) : `{${key}}`,
  );
}
