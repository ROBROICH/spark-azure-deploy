import type { NodePayloadByType } from '@/db/nodes/types';

export const getNormReferenceLabel = (
  norm: NodePayloadByType<'norm'>,
  gesetzJurabk: string | null,
) => {
  const paragraphRef = norm.paragraphNr
    ? norm.paragraphNr.trim().startsWith('§')
      ? norm.paragraphNr.trim()
      : `§ ${norm.paragraphNr.trim()}`
    : '§';

  return [gesetzJurabk, paragraphRef].filter(Boolean).join(' ');
};

export const getNormSelectionLabel = (
  norm: NodePayloadByType<'norm'>,
  gesetzJurabk: string | null,
) => {
  return [getNormReferenceLabel(norm, gesetzJurabk), norm.paragraphTitel]
    .filter(Boolean)
    .join(' ');
};
