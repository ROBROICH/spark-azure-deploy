import { invariant } from 'es-toolkit/util';
import type { ReactNode } from 'react';
import type { BeschlussSection } from '../rpbBeschluss.types';

export type BeschlussEditorProps = {
  canExport: boolean;
  headerAccessory?: ReactNode;
  sections: BeschlussSection[];
  selectedVaeNodeId: string;
  onVaeNodeSelect: (vaeNodeId: string) => void;
  onExportClick: () => void;
  onTextBlur: (outlineNodeId: string, nextText: string) => void;
};

const areBeschlussSectionsEqual = (
  left: BeschlussSection[],
  right: BeschlussSection[],
) => {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const leftSection = left[index];
    const rightSection = right[index];
    invariant(leftSection !== undefined, 'Expected left Beschluss section');
    invariant(rightSection !== undefined, 'Expected right Beschluss section');

    if (
      leftSection.depth !== rightSection.depth ||
      leftSection.index !== rightSection.index ||
      leftSection.isEditable !== rightSection.isEditable ||
      leftSection.order !== rightSection.order ||
      leftSection.parentVaeNodeId !== rightSection.parentVaeNodeId ||
      leftSection.text !== rightSection.text ||
      leftSection.title !== rightSection.title ||
      leftSection.vaeNodeId !== rightSection.vaeNodeId
    ) {
      return false;
    }
  }

  return true;
};

export const areBeschlussEditorPropsEqual = (
  previous: BeschlussEditorProps,
  next: BeschlussEditorProps,
) => {
  return (
    previous.onExportClick === next.onExportClick &&
    previous.onTextBlur === next.onTextBlur &&
    previous.onVaeNodeSelect === next.onVaeNodeSelect &&
    previous.canExport === next.canExport &&
    previous.headerAccessory === next.headerAccessory &&
    previous.selectedVaeNodeId === next.selectedVaeNodeId &&
    areBeschlussSectionsEqual(previous.sections, next.sections)
  );
};
