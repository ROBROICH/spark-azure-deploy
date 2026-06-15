import { buildProjectNodeIndex } from '@/db/nodes/examinationGraphModel';
import type { NodeSummary } from '@/db/nodes/types';
import { describe, expect, it } from 'vitest';
import {
  createMvpFundstellenContextValue,
  createMvpFundstellenRefIndexes,
} from './mvpFundstellenContext.logic';

const node = <T extends NodeSummary['node_type']>(
  id: string,
  nodeType: T,
  parents: NodeSummary[] = [],
): NodeSummary<T> => ({
  id,
  node_type: nodeType,
  parents: parents.map((parent) => ({
    id: parent.id,
    node_type: parent.node_type,
  })),
});

describe('mvpFundstellenContext.logic', () => {
  it('builds document, norm, and combined Fundstellen presence from shared ancestor chains', () => {
    const topic = node('topic-1', 'topic');
    const document = node('document-1', 'dokument', [topic]);
    const norm = node('norm-1', 'norm', [topic]);
    const chunk = node('chunk-1', 'chunk', [document, norm]);
    const fundstelle = node('fundstelle-1', 'fundstelle', [chunk]);
    const index = buildProjectNodeIndex([
      topic,
      document,
      norm,
      chunk,
      fundstelle,
    ]);

    const indexes = createMvpFundstellenRefIndexes(index, [fundstelle]);
    const context = createMvpFundstellenContextValue(indexes);

    expect(context.hasAnyFundstellenForDocument('document-1')).toBe(true);
    expect(context.hasAnyFundstellenForNorm('norm-1')).toBe(true);
    expect(
      context.hasFundstellenForDocumentAndNorm('document-1', 'norm-1'),
    ).toBe(true);
    expect(
      context.hasFundstellenForDocumentAndNorm('document-1', 'norm-2'),
    ).toBe(false);
  });
});
