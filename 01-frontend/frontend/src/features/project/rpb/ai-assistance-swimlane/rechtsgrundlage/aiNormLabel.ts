import type { NodePayloadByType } from '@/db/nodes/types';

export const getNormLabel = (
  norm: NodePayloadByType<'norm'> | null | undefined,
) => {
  if (!norm) {
    return '';
  }

  const paragraphRef = `§ ${norm.paragraph_nr}`;

  if (!norm.paragraph_titel) {
    return paragraphRef;
  }

  return `${paragraphRef} ${norm.paragraph_titel}`;
};
