import type { NodePayloadByType } from '@/db/nodes/types';
import { toast } from '@/features/ui/toast/Toast';
import { useAction } from '@/db/nodes/hooks/useAction';
import { useProjectRouteVersion } from '@/features/project/versioning/projectVersioning';
import * as Sentry from '@sentry/react';
import { getRouteApi } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { saveNormSelectionChanges } from '../screen-content/rechtsgrundlage-dialog/saveNormSelectionChanges';
import {
  createLegalBasisSelectionKey,
  type TopicNormEntry,
} from './useRechtsgrundlageData.helpers';

const route = getRouteApi('/verfahren/$verfahrenId/mvp/$topicName/');

type RemoveRechtsgrundlageNormParams = Pick<
  TopicNormEntry,
  'gesetz' | 'norm'
> & {
  topicNorms: NodePayloadByType<'topic_norm'>[];
};

/**
 * Persists removing a Rechtsgrundlage norm from the active topic using the
 * same topic_norm deletion semantics as the Rechtsgrundlage dialog.
 *
 * @returns The remove command and the id currently being persisted.
 */
export const useRemoveRechtsgrundlageNorm = (canMutateTopic: boolean) => {
  const { topicName, verfahrenId } = route.useParams();
  const projectVersion = useProjectRouteVersion();
  const { transact, update, delete: deleteNode } = useAction();
  const { t } = useTranslation('MvpRedesign');
  // eslint-disable-next-line no-restricted-syntax -- save progress is local to the destructive card action while persistence is in flight
  const [removingNormId, setRemovingNormId] = useState<string | null>(null);

  /**
   * Removes a topic-linked norm through the shared Rechtsgrundlage persistence
   * helper while keeping the destructive-card pending state local to this hook.
   */
  const removeNorm = async (params: RemoveRechtsgrundlageNormParams) => {
    if (!canMutateTopic || !params.norm || removingNormId) {
      return;
    }

    const normId = params.norm.id;
    const jurabk = params.gesetz?.jurabk ?? params.topicNorms[0]?.jurabk ?? '';
    const selectionKey = createLegalBasisSelectionKey(
      jurabk,
      params.norm.paragraphNr,
    );

    setRemovingNormId(normId);

    try {
      await saveNormSelectionChanges({
        availableNormEntries: [
          {
            gesetz: params.gesetz,
            legalBasis: {
              jurabk,
              paragraphNr: params.norm.paragraphNr,
            },
            norm: params.norm,
            projectNorm: params.norm,
            selectionKey,
            topicNorm: params.topicNorms[0] ?? null,
            topicNormLinks: params.topicNorms.map((topicNorm) => ({
              norm: params.norm,
              topicNorm,
            })),
            topicNorms: params.topicNorms,
          },
        ],
        draftModes: {
          [selectionKey]: 'remove',
        },
        projectId: verfahrenId,
        projectVersion,
        topicId: topicName,
        transact,
        update,
        deleteNode,
      });
      setRemovingNormId(null);
    } catch (error) {
      Sentry.captureException(error);
      toast.error(t('RechtsgrundlageDialog.errors.saveFailed'));
      setRemovingNormId(null);
    }
  };

  return {
    removeNorm,
    removingNormId,
  };
};
