import { describe, expect, it } from 'vitest';
import { mvpLeftPanelTabSearchSchema, mvpSearchSchema } from './mvp.search';

describe('mvpLeftPanelTabSearchSchema', () => {
  it('parses a valid left panel tab value', () => {
    expect(
      mvpLeftPanelTabSearchSchema.parse({ leftPanelTab: 'rechtsgrundlage' }),
    ).toEqual({ leftPanelTab: 'rechtsgrundlage' });
  });

  it('leaves the tab undefined when the key is missing', () => {
    expect(mvpLeftPanelTabSearchSchema.parse({})).toEqual({});
  });

  it('falls back to undefined for an invalid member', () => {
    expect(
      mvpLeftPanelTabSearchSchema.parse({ leftPanelTab: 'invalid' }),
    ).toEqual({ leftPanelTab: undefined });
  });
});

describe('mvpSearchSchema', () => {
  it('applies defaults for all optional fields', () => {
    const result = mvpSearchSchema.parse({});

    expect(result.laneOrder).toBeUndefined();
    expect(result.previewDocumentId).toBeUndefined();
    expect(result.selectedNormId).toBeUndefined();
    expect(result.rechtsgrundlageLawGroupId).toBeUndefined();
    expect(result.lawChangeId).toBeUndefined();
    expect(result.leftPanelTab).toBeUndefined();
  });

  it('parses a full search object', () => {
    const result = mvpSearchSchema.parse({
      search: 'wasser',
      topicAssigneeIds: ['user-1'],
      topicSort: 'titleDesc',
      topicStatus: 'inProgress',
      laneOrder: 'rechtsgrundlageFirst',
      leftPanelTab: 'rechtsgrundlage',
      previewDocumentId: 'doc-1',
      selectedNormId: 'norm-1',
      rechtsgrundlageLawGroupId: 'gesetz-1',
      lawChangeId: 'BNatSchG__45__2026-05-23',
    });

    expect(result).toEqual({
      search: 'wasser',
      topicAssigneeIds: ['user-1'],
      topicSort: 'titleDesc',
      topicStatus: 'inProgress',
      laneOrder: 'rechtsgrundlageFirst',
      leftPanelTab: 'rechtsgrundlage',
      previewDocumentId: 'doc-1',
      selectedNormId: 'norm-1',
      rechtsgrundlageLawGroupId: 'gesetz-1',
      lawChangeId: 'BNatSchG__45__2026-05-23',
    });
  });

  it('falls back to an undefined lane order for invalid stored search values', () => {
    const result = mvpSearchSchema.parse({
      laneOrder: 'invalid',
      leftPanelTab: 'invalid',
    });

    expect(result.laneOrder).toBeUndefined();
    expect(result.leftPanelTab).toBeUndefined();
  });

  it('strips retired TopicCheck search params while preserving overview params', () => {
    const result = mvpSearchSchema.parse({
      search: 'filter',
      topicAssigneeIds: ['user-1'],
      topicSort: 'titleAsc',
      topicStatus: 'open',
      topic: 'legacy-topic',
      topicId: 'legacy-topic-id',
      document: 'legacy-document',
      normScope: 'material',
      normStateFilter: 'nachgefordert',
    });

    expect(result).toEqual({
      search: 'filter',
      topicAssigneeIds: ['user-1'],
      topicSort: 'titleAsc',
      topicStatus: 'open',
    });
  });
});
