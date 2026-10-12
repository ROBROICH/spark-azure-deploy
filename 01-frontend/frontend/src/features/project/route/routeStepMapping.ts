export const PROJECT_STEP_OPTIONS = [
  {
    value: 'fvp',
    code: '1',
    number: 1,
    labelKey: 'projectNavbar.steps.formalCompletenessCheck',
    to: '/verfahren/$verfahrenId/fvp/documents',
  },
  {
    value: 'mvp',
    code: '2',
    number: 2,
    labelKey: 'projectNavbar.steps.materialCompletenessCheck',
    to: '/verfahren/$verfahrenId/mvp',
  },
  {
    value: 'ewms',
    code: '3',
    number: 3,
    labelKey: 'projectNavbar.steps.ewms',
    to: '/verfahren/$verfahrenId/ewms',
  },
  {
    value: 'rpb',
    code: '4',
    number: 4,
    labelKey: 'projectNavbar.steps.legalReview',
    to: '/verfahren/$verfahrenId/rpb',
  },
] as const;

export type ProjectStepValue = (typeof PROJECT_STEP_OPTIONS)[number]['value'];

export const PROJECT_SWITCHER_OPTIONS = [
  {
    value: 'overview',
    code: '-',
    labelKey: 'projectNavbar.steps.projectOverview',
    to: '/verfahren/$verfahrenId',
  },
  ...PROJECT_STEP_OPTIONS,
] as const;

const EWMS_ONLY_STEP_OPTIONS = [
  { ...PROJECT_STEP_OPTIONS[2], code: '1', number: 1 },
] as const;

/**
 * Process steps offered for the effective product mode. EWMS-only mode keeps
 * exactly the EWMS step; SPARK keeps the full existing list.
 */
export const getProductStepOptions = (productMode: 'spark' | 'ewms') =>
  productMode === 'ewms' ? EWMS_ONLY_STEP_OPTIONS : PROJECT_STEP_OPTIONS;

/**
 * Stepper options (overview plus process steps) for the effective product
 * mode. EWMS-only mode offers exactly Verfahrensübersicht and EWMS.
 */
export const getProductSwitcherOptions = (productMode: 'spark' | 'ewms') => [
  PROJECT_SWITCHER_OPTIONS[0],
  ...getProductStepOptions(productMode),
];
