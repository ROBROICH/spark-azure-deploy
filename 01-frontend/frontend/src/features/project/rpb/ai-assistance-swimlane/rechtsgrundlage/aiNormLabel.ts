import type { NodePayloadByType } from '@/db/nodes/types';

export const getNormLabel = (
  norm: NodePayloadByType<'norm'> | null | undefined,
) => {
  if (!norm) {
    return '';
  }

  const paragraphRef = `§ ${norm.paragraphNr}`;

  if (!norm.paragraphTitel) {
    return paragraphRef;
  }

  return `${paragraphRef} ${norm.paragraphTitel}`;
};
