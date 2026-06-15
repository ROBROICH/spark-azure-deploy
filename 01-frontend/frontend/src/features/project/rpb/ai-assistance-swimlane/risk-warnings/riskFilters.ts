import type { Risk } from './riskWarning.types';

export const getActiveRisks = (risks: Risk[]) =>
  risks.filter((risk) => !risk.is_deleted);
