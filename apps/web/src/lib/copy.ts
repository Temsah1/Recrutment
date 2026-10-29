/**
 * Longer-form public copy lives here so the landing page and application flow
 * can be localized later without rewriting components.
 */
export const landingCopy = {
  hero: {
    supporting:
      'A student chapter at Cairo University building software, data and automation with engineers who learn by doing.',
    previewTitle: 'Recruitment application',
    previewSubtitle: 'A Calm, Guided Process',
    previewSteps: [
      { label: 'Personal details', detail: 'Name, contact information' },
      { label: 'Academic background', detail: 'University, faculty, year' },
      { label: 'Department preference', detail: 'Primary and optional second choice' },
      { label: 'Motivation and links', detail: 'Tell us what you want to build' },
      { label: 'Required documents', detail: 'National ID and university ID' },
    ],
    privateNote: 'Documents are stored privately and only visible to authorized reviewers.',
    trust: ['Five technical departments', 'One application per cycle', 'Private document handling'],
  },
  overview: {
    eyebrow: 'Why ESME',
    title: 'A chapter built around technical practice',
    body: 'Five technical departments, one team that learns by building. Recruitment is how we find students who want to work on real chapter projects alongside others.',
    pillars: [
      {
        icon: 'hammer',
        title: 'Learn by building',
        body: 'Departments ship real chapter work, from web platforms to internal tooling and data projects.',
      },
      {
        icon: 'users',
        title: 'Grow with a team',
        body: 'Join a department of students guided by members who have already delivered chapter projects.',
      },
      {
        icon: 'compass',
        title: 'Choose your direction',
        body: 'Pick the department that fits your interests, with an optional second preference.',
      },
    ] satisfies { icon: 'hammer' | 'users' | 'compass'; title: string; body: string }[],
  },
  process: {
    eyebrow: 'Application process',
    body: 'Four clear stages, from form to decision. You always know where your application stands.',
    note: 'Submitting an application does not guarantee acceptance. The team reviews every complete application against the needs of each department.',
  },
  guidelines: {
    eyebrow: 'Guidelines',
    body: 'A complete, accurate application helps the team assess you fairly.',
    closing:
      'If something changes after you submit, contact the recruitment team with your reference number. Do not create a second application.',
  },
  privacy: {
    eyebrow: 'Privacy',
    body: 'Your application and documents are private recruitment records, handled only by authorized ESME administrators.',
    bullets: [
      'Applications are reviewed only by authorized ESME recruitment administrators.',
      'National ID and university ID documents are stored in private storage, never on a public website.',
      'Documents are not emailed, published or shared outside the recruitment process.',
      'Data is retained according to the retention policy configured by the chapter.',
    ],
    linkLabel: 'Read the full privacy notice',
  },
  faq: {
    eyebrow: 'Questions',
    body: 'A few things applicants usually ask before starting.',
  },
  cta: {
    eyebrow: 'Current cycle',
    title: 'Your next chapter starts here.',
    body: 'Ten minutes, one application, and a reference number as soon as you submit.',
    note: 'You can review every answer before submitting. Nothing is saved until you confirm.',
  },
  footer: {
    tagline:
      'ESME Cairo University Student Chapter. A student organization for engineers, builders and problem-solvers.',
    exploreTitle: 'Explore',
    applyTitle: 'Recruitment',
    rights: 'ESME Cairo University Student Chapter',
  },
  closed: {
    title: 'Applications are currently closed',
    body: 'The recruitment team is not accepting new applications right now. When the next cycle opens, the form will be available again.',
    earlyBody: 'The next recruitment cycle has not opened yet. Check back later for the opening date.',
    contactNote: 'If you already submitted an application, keep your reference number for any correspondence.',
    backHome: 'Back to overview',
  },
} as const;

export const applyCopy = {
  title: 'Recruitment application',
  subtitle: 'Six short steps. Review everything before you submit.',
  stepLabels: {
    personal: 'Personal information',
    academic: 'Academic information',
    department: 'Department selection',
    links: 'Links and motivation',
    documents: 'Required documents',
    review: 'Review and submit',
  },
  privacyLink: 'Read the full privacy notice',
  documentHelp:
    'Files are validated on the server and stored privately. You can replace or remove a file before submitting.',
  reviewNoteTitle: 'Before you submit',
  confirmAccuracy:
    'Check your name, email and phone number carefully — the team will use them to contact you about this application.',
  closed: {
    title: 'Applications are closed',
    body: 'This application form is not accepting submissions. If the cycle reopens, the form will become available again.',
  },
  deadlineLabel: 'Applications close',
  saveNote: 'Nothing is saved until you press Submit application.',
  successNote: 'Keep your reference number. You can use it when contacting the recruitment team.',
} as const;
