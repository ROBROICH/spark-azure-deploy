import { Button } from '@/features/ui/button/Button';
import { SplitButton } from '@/features/ui/button/SplitButton';
import { getRouteApi, Link } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useKiTopicNormState } from './AiTopicNormContext';
import { AiTopicHeader } from '../shared/AiTopicHeader';

const route = getRouteApi('/verfahren/$verfahrenId/rpb');

type AiNormDetailLayoutProps = {
  children: ReactNode;
};

export const AiNormDetailLayout = (props: AiNormDetailLayoutProps) => {
  const { children } = props;
  const { t } = useTranslation('Rpb');
  const { verfahrenId } = route.useParams();
  const {
    topicNorm,
    allSaetzeChecked,
    hasAnySaetze,
    hasAnySatzNeedsRevision,
    toggleAllSaetzeChecked,
  } = useKiTopicNormState();

  return (
    <>
      <AiTopicHeader
        titleKey="aiAssistance.title"
        showTopicSelect={false}
        leading={
          <Button
            asChild
            iconOnly
            variant="secondary"
            aria-label={t('aiAssistance.backToOverview')}
          >
            <Link
              to="/verfahren/$verfahrenId/rpb"
              params={{ verfahrenId }}
              search={(prev) => ({
                ...prev,
                topicNormId: undefined,
                showNormtext: undefined,
                satzId: undefined,
                rechtsmethodikSatzId: undefined,
              })}
              resetScroll={false}
              aria-label={t('aiAssistance.backToOverview')}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        }
        trailing={
          <SplitButton
            size="md"
            checked={allSaetzeChecked}
            uncheckedLabel={t(
              hasAnySatzNeedsRevision
                ? 'aiAssistance.allNeedsRevision'
                : 'aiAssistance.checkAll',
            )}
            checkedLabel={t('aiAssistance.allChecked')}
            disabled={topicNorm === null || !hasAnySaetze}
            onCheckedChange={toggleAllSaetzeChecked}
          />
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
        {children}
      </div>
    </>
  );
};
