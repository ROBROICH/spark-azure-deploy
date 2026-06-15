import type { NodePayloadByType } from '@/db/nodes/types';
import { toast } from '@/features/ui/toast/Toast';
import { useAction } from '@/db/nodes/hooks/useAction';
import * as Sentry from '@sentry/react';
import { getRouteApi } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { saveNormSelectionChanges } from '../screen-content/rechtsgrundlage-dialog/saveNormSelectionChanges';
import type { TopicNormEntry } from './useRechtsgrundlageData.helpers';

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
  const { topicName } = route.useParams();
  const { transact, insert, update, delete: deleteNode } = useAction();
  const { t } = useTranslation('MvpRedesign');
  // eslint-disable-next-line no-restricted-syntax -- save progress is local to the destructive card action while persistence is in flight
  const [removingNormId, setRemovingNormId] = useState<string | null>(null);

  const removeNorm = async (params: RemoveRechtsgrundlageNormParams) => {
    if (!canMutateTopic || !params.norm || removingNormId) {
      return;
    }

    const normId = params.norm.id;

    setRemovingNormId(normId);

    try {
      await saveNormSelectionChanges({
        availableNormEntries: [
          {
            gesetz: params.gesetz,
            norm: params.norm,
            topicNorm: params.topicNorms[0] ?? null,
            topicNorms: params.topicNorms,
          },
        ],
        draftModes: {
          [normId]: 'remove',
        },
        topicId: topicName,
        transact,
        insert,
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
