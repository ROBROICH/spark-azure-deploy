import type { NodeRefByType } from '@/db/nodes/types';
import { Alert, AlertDescription, AlertTitle } from '@/features/ui/alert/Alert';
import { useDescendants } from '@/db/nodes/hooks/useDescendants';
import { getRouteApi } from '@tanstack/react-router';
import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AiNormDetailLayout } from './AiNormDetailLayout';
import { AiNormDetailContent } from './AiNormDetailContent';
import { AiTopicHeader } from '../shared/AiTopicHeader';
import { AiTopicNormProvider } from './AiTopicNormContext';

const route = getRouteApi('/verfahren/$verfahrenId/rpb');

export const AiNormDetailView = () => {
  const { t } = useTranslation('Rpb');
  const topicNormId = route.useSearch({
    select: (search) => search.topicNormId,
  });
  const topicNormRef = topicNormId
    ? ({
        id: topicNormId,
        nodeType: 'topic_norm',
      } satisfies NodeRefByType<'topic_norm'>)
    : null;
  const normRefs = useDescendants('norm', topicNormRef);
  const normRef = normRefs.at(0);
  const hasNormRef = topicNormRef !== null && normRefs.length > 0;

  return (
    <>
      {hasNormRef && normRef ? (
        <AiTopicNormProvider topicNormRef={topicNormRef}>
          <AiNormDetailLayout>
            <AiNormDetailContent normRef={normRef} />
          </AiNormDetailLayout>
        </AiTopicNormProvider>
      ) : (
        <>
          <AiTopicHeader titleKey="aiAssistance.title" />
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>{t('aiAssistance.normLoadErrorTitle')}</AlertTitle>
              <AlertDescription>
                {t('aiAssistance.normLoadErrorDescription')}
              </AlertDescription>
            </Alert>
          </div>
        </>
      )}
    </>
  );
};
