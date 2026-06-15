import { useState } from 'react';
import { useLocalStorage } from '@/features/shared/browser-storage/useLocalStorage';
import { z } from 'zod';

const MVP_DOCUMENT_CHECKLIST_STORAGE_PREFIX = 'mvp-document-checklist:';
const DISABLED_STORAGE_SUFFIX = '__disabled__';
const DISABLED_STORAGE_KEY = `${MVP_DOCUMENT_CHECKLIST_STORAGE_PREFIX}${DISABLED_STORAGE_SUFFIX}`;

const topicDocumentChecklistSchema = z.object({
  topics: z.record(z.string(), z.array(z.string())),
});

type TopicDocumentChecklist = z.infer<typeof topicDocumentChecklistSchema>;

const INITIAL_VALUE: TopicDocumentChecklist = {
  topics: {},
};

/**
 * Tracks per-topic document review state with project-scoped persistence.
 *
 * When the route does not yet provide a usable `projectId`, the hook falls
 * back to ephemeral in-memory state so checklist updates do not leak into a
 * shared storage bucket.
 */
export const useTopicDocumentChecklist = (
  projectId: string,
  topicName: string,
  canMutateTopic: boolean,
) => {
  const hasProjectId = projectId.length > 0;
  const [fallbackChecklist, setFallbackChecklist] =
    // eslint-disable-next-line no-restricted-syntax -- missing project ids must fail closed for persistence, but the checklist still needs ephemeral in-memory state for the current render tree.
    useState<TopicDocumentChecklist>(INITIAL_VALUE);
  const [persistedChecklist, setPersistedChecklist] = useLocalStorage({
    key: hasProjectId
      ? `${MVP_DOCUMENT_CHECKLIST_STORAGE_PREFIX}${projectId}`
      : DISABLED_STORAGE_KEY,
    initialValue: INITIAL_VALUE,
    schema: topicDocumentChecklistSchema,
  });
  const checklist = hasProjectId ? persistedChecklist : fallbackChecklist;
  const setChecklist = hasProjectId
    ? setPersistedChecklist
    : setFallbackChecklist;

  const checkedDocumentIds = checklist.topics[topicName] ?? [];

  const isDocumentChecked = (documentId: string) => {
    return checkedDocumentIds.includes(documentId);
  };

  const toggleDocumentChecked = (documentId: string) => {
    if (!canMutateTopic) {
      return;
    }

    setChecklist((prev) => {
      const currentTopicDocumentIds = prev.topics[topicName] ?? [];
      const nextTopicDocumentIds = currentTopicDocumentIds.includes(documentId)
        ? currentTopicDocumentIds.filter((id) => id !== documentId)
        : [...currentTopicDocumentIds, documentId];

      if (nextTopicDocumentIds.length === 0) {
        const remainingTopics = { ...prev.topics };
        delete remainingTopics[topicName];

        return {
          topics: remainingTopics,
        };
      }

      return {
        topics: {
          ...prev.topics,
          [topicName]: nextTopicDocumentIds,
        },
      };
    });
  };

  return {
    checkedDocumentIds,
    isDocumentChecked,
    toggleDocumentChecked,
  };
};
