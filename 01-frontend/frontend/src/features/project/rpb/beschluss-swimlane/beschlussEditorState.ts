import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { JSONContent } from '@tiptap/core';
import type { BeschlussSection } from '../rpbBeschluss.types';
import { beschlussEditorSchema } from './beschlussEditorExtensionList';
import {
  buildEditorContent,
  buildStructureTemplate,
} from './beschlussEditorExtensions';
import { getSectionReferenceKey } from './beschlussSectionContent';

export const buildBeschlussEditorState = (sections: BeschlussSection[]) => {
  const structureTemplate = buildStructureTemplate(sections);
  // Canonical JSON lets string comparisons with `editor.getJSON()` ignore jsonb key order.
  const content: JSONContent = ProseMirrorNode.fromJSON(
    beschlussEditorSchema,
    buildEditorContent(sections),
  ).toJSON();
  const outlineNodeIds = sections.map((section) => section.vaeNodeId);

  return {
    content,
    contentJson: JSON.stringify(content),
    outlineNodeIds,
    outlineNodeIdsKey: outlineNodeIds.join('|'),
    persistedContentKeyByOutlineNodeId: new Map(
      sections.map((section) => [
        section.vaeNodeId,
        getSectionReferenceKey(section),
      ]),
    ),
    sectionByOutlineNodeId: new Map(
      sections.map((section) => [section.vaeNodeId, section]),
    ),
    structureTemplate,
  };
};
