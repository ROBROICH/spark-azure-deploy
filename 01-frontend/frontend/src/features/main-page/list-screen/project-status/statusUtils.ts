import type { StatusBadgeVariant } from '@/features/ui/status-badge/StatusBadge';
import type { TFunction } from 'i18next';
import { ProjectStatus } from '@/features/main-page/data/schemas/project.schema';

/**
 * Maps a project status string to a StatusBadge variant.
 *
 * @param status - The project status string (case-insensitive)
 * @returns The StatusBadge variant to use for the status
 */
export const getStatusBadgeVariant = (status: string): StatusBadgeVariant => {
  const normalized = status.toLowerCase();
  if (normalized === ProjectStatus.Genehmigt.toLowerCase()) {
    return 'success';
  }
  if (normalized === ProjectStatus.Offen.toLowerCase()) {
    return 'neutral';
  }
  return 'default';
};

/**
 * Resolves the localized display label for a project status, falling back to the
 * raw backend status name when no translation exists. The raw `statusName` stays
 * the canonical filter value so favorite cards and table cells render the same
 * translated copy without diverging from the backend status used for filtering.
 *
 * @param status - The raw backend status name (e.g. `Offen`).
 * @param t - The `Dashboard` namespace translation function.
 * @returns The translated status label, or the raw status when untranslated.
 */
export const getStatusLabel = (
  status: string,
  t: TFunction<'Dashboard'>,
): string => {
  const key = `FavoriteCard.${status}` as const;
  const translated = t(key, { defaultValue: status });
  return translated;
};
