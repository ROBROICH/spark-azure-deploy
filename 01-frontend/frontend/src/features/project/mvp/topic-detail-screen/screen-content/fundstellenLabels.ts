import type { NodePayloadByType } from '@/db/nodes/types';

export const getNormReferenceLabel = (
  norm: NodePayloadByType<'norm'>,
  gesetzJurabk: string | null,
) => {
  const paragraphRef = norm.paragraph_nr
    ? norm.paragraph_nr.trim().startsWith('§')
      ? norm.paragraph_nr.trim()
      : `§ ${norm.paragraph_nr.trim()}`
    : '§';

  return [gesetzJurabk, paragraphRef].filter(Boolean).join(' ');
};

export const getNormSelectionLabel = (
  norm: NodePayloadByType<'norm'>,
  gesetzJurabk: string | null,
) => {
  return [getNormReferenceLabel(norm, gesetzJurabk), norm.paragraph_titel]
    .filter(Boolean)
    .join(' ');
};
