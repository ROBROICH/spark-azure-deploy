import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTopicDocumentChecklist } from './useTopicDocumentChecklist';

describe('useTopicDocumentChecklist', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('persists checked document ids by project and topic', () => {
    const { result, rerender } = renderHook(
      ({ projectId, topicName }) =>
        useTopicDocumentChecklist(projectId, topicName, true),
      {
        initialProps: { projectId: 'project-1', topicName: 'topic-1' },
      },
    );

    act(() => {
      result.current.toggleDocumentChecked('document-1');
    });

    expect(result.current.checkedDocumentIds).toEqual(['document-1']);
    expect(result.current.isDocumentChecked('document-1')).toBe(true);
    expect(
      JSON.parse(
        window.localStorage.getItem('mvp-document-checklist:project-1') ?? '',
      ),
    ).toEqual({ topics: { 'topic-1': ['document-1'] } });

    rerender({ projectId: 'project-2', topicName: 'topic-1' });

    expect(result.current.checkedDocumentIds).toEqual([]);
  });

  it('uses ephemeral state when no project id is available', () => {
    const { result, rerender } = renderHook(
      ({ projectId, topicName }) =>
        useTopicDocumentChecklist(projectId, topicName, true),
      {
        initialProps: { projectId: '', topicName: 'topic-1' },
      },
    );

    act(() => {
      result.current.toggleDocumentChecked('document-1');
    });

    expect(result.current.checkedDocumentIds).toEqual(['document-1']);
    expect(window.localStorage.getItem('mvp-document-checklist:')).toBeNull();
    expect(
      window.localStorage.getItem('mvp-document-checklist:__disabled__'),
    ).toBeNull();

    rerender({ projectId: 'project-1', topicName: 'topic-1' });

    expect(result.current.checkedDocumentIds).toEqual([]);
  });

  it('removes the topic entry when the final checked document is cleared', () => {
    const { result } = renderHook(() =>
      useTopicDocumentChecklist('project-1', 'topic-1', true),
    );

    act(() => {
      result.current.toggleDocumentChecked('document-1');
      result.current.toggleDocumentChecked('document-1');
    });

    expect(result.current.checkedDocumentIds).toEqual([]);
    expect(
      JSON.parse(
        window.localStorage.getItem('mvp-document-checklist:project-1') ?? '',
      ),
    ).toEqual({ topics: {} });
  });

  it('does not persist changes without topic mutation rights', () => {
    const { result } = renderHook(() =>
      useTopicDocumentChecklist('project-1', 'topic-1', false),
    );

    act(() => {
      result.current.toggleDocumentChecked('document-1');
    });

    expect(result.current.checkedDocumentIds).toEqual([]);
    expect(
      window.localStorage.getItem('mvp-document-checklist:project-1'),
    ).toBeNull();
  });
});
