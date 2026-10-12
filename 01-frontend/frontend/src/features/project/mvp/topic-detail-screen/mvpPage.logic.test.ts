import { describe, expect, it } from 'vitest';
import {
  findConnectedProjectDocumentId,
  getLaneOrderSearchState,
  getLeftPanelTabSearchValue,
  getPreferredPrimaryLaneId,
} from './mvpPage.logic';

describe('mvpPage.logic', () => {
  it('finds the connected project document id from the loaded project documents', () => {
    const projectDocuments = [
      {
        id: 'topic-document-1',
        dmsFileId: 'project-document-1',
      },
      {
        id: 'topic-document-2',
        dmsFileId: 'project-document-2',
      },
      {
        id: 'external-document-3',
        dmsFileId: 'project-document-3',
      },
    ];

    expect(
      findConnectedProjectDocumentId(projectDocuments, 'topic-document-2'),
    ).toBe('project-document-2');
    expect(
      findConnectedProjectDocumentId(projectDocuments, 'external-document-3'),
    ).toBe('project-document-3');
  });

  it('ignores resolved preview documents outside the topic documents', () => {
    const topicDocuments = [
      {
        id: 'topic-document-1',
        dmsFileId: 'project-document-1',
      },
    ];

    expect(
      findConnectedProjectDocumentId(topicDocuments, 'external-document-3'),
    ).toBeUndefined();
  });

  it('maps the preferred primary lane from the lane-order preference', () => {
    expect(getPreferredPrimaryLaneId('documentsFirst')).toBe('dokumente');
    expect(getPreferredPrimaryLaneId('rechtsgrundlageFirst')).toBe(
      'rechtsgrundlage',
    );
  });

  it('omits the left-panel tab search param for the primary lane only', () => {
    expect(
      getLeftPanelTabSearchValue('dokumente', 'documentsFirst'),
    ).toBeUndefined();
    expect(
      getLeftPanelTabSearchValue('rechtsgrundlage', 'documentsFirst'),
    ).toBe('rechtsgrundlage');
  });

  it('preserves the currently visible lane when the lane order changes', () => {
    expect(
      getLaneOrderSearchState({
        currentLaneOrder: 'documentsFirst',
        currentLeftPanelTab: undefined,
        nextLaneOrder: 'rechtsgrundlageFirst',
      }),
    ).toEqual({
      laneOrder: 'rechtsgrundlageFirst',
      leftPanelTab: 'dokumente',
    });

    expect(
      getLaneOrderSearchState({
        currentLaneOrder: 'documentsFirst',
        currentLeftPanelTab: 'rechtsgrundlage',
        nextLaneOrder: 'rechtsgrundlageFirst',
      }),
    ).toEqual({
      laneOrder: 'rechtsgrundlageFirst',
      leftPanelTab: undefined,
    });
  });
});
