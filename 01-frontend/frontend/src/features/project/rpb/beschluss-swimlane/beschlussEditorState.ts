import type { BeschlussSection } from '../rpbBeschluss.types';
import {
  buildEditorContent,
  buildStructureTemplate,
} from './beschlussEditorExtensions';

export const buildBeschlussEditorState = (sections: BeschlussSection[]) => {
  const structureTemplate = buildStructureTemplate(sections);
  const content = buildEditorContent(sections);
  const outlineNodeIds = sections.map((section) => section.vaeNodeId);

  return {
    content,
    contentJson: JSON.stringify(content),
    outlineNodeIds,
    outlineNodeIdsKey: outlineNodeIds.join('|'),
    persistedTextByOutlineNodeId: new Map(
      sections.map((section) => [section.vaeNodeId, section.text]),
    ),
    sectionByOutlineNodeId: new Map(
      sections.map((section) => [section.vaeNodeId, section]),
    ),
    structureTemplate,
  };
};
