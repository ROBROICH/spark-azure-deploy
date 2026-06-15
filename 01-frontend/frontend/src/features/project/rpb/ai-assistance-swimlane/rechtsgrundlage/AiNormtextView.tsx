import type { NodeRefByType } from '@/db/nodes/types';
import { useDescendants } from '@/db/nodes/hooks/useDescendants';
import { useLiveNode } from '@/db/nodes/hooks/useLiveNodes';
import { useNode } from '@/db/nodes/hooks/useNodes';
import { LawChangeIndicator } from '@/features/project/law-changes/ui/LawChangeIndicator';
import { Button } from '@/features/ui/button/Button';
import { SwimlaneHeaderPortal } from '@/features/ui/swimlanes/SwimlaneHeaderPortal';
import { getRouteApi, Link } from '@tanstack/react-router';
import { BookOpenText, ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getNormLabel } from './aiNormLabel';

const route = getRouteApi('/verfahren/$verfahrenId/rpb');

const GENERATED_DEFINITION_LIST_MARKER =
  /(^|\n)([ \t]*(?:\d+\.|[a-z]\))[ \t]*)\r?\n[ \t]*:[ \t]*/g;

const formatNormTextForDisplay = (text: string) => {
  return text.replaceAll(GENERATED_DEFINITION_LIST_MARKER, '$1$2 ');
};

type AiNormtextViewProps = {
  topicNormRef: NodeRefByType<'topic_norm'>;
};

export const AiNormtextView = (props: AiNormtextViewProps) => {
  const { topicNormRef } = props;
  const { t } = useTranslation('Rpb');
  const { verfahrenId } = route.useParams();
  const navigate = route.useNavigate();
  const { data: topicNorm } = useLiveNode(topicNormRef);
  const normRefs = useDescendants('norm', topicNormRef);
  const normRef = normRefs[0] ?? null;
  const { data: norm } = useNode(normRef);
  const normText = formatNormTextForDisplay(norm?.text ?? '');

  return (
    <>
      <SwimlaneHeaderPortal>
        <Button
          asChild
          iconOnly
          variant="secondary"
          aria-label={t('aiAssistance.backToNorm')}
        >
          <Link
            to="/verfahren/$verfahrenId/rpb"
            params={{ verfahrenId }}
            search={(prev) => ({
              ...prev,
              showNormtext: undefined,
            })}
            resetScroll={false}
            aria-label={t('aiAssistance.backToNorm')}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Link>
        </Button>
        <span className="min-w-0 flex-1 truncate text-[13px] leading-[18px] font-medium tracking-[-0.13px] text-brand-950">
          {getNormLabel(norm)}
        </span>
        {topicNorm ? (
          <LawChangeIndicator
            jurabk={topicNorm.jurabk}
            paragraphNr={topicNorm.paragraph_nr}
            onOpen={(lawChange) => {
              navigate({
                to: '.',
                search: (prev) => ({
                  ...prev,
                  lawChangeId: lawChange.id,
                }),
                replace: true,
                resetScroll: false,
              });
            }}
          />
        ) : null}
        <span className="flex shrink-0 items-center gap-2 rounded border-[0.5px] border-slate-400 bg-white py-1 pr-2 pl-1">
          <BookOpenText className="size-4 text-slate-600" aria-hidden="true" />
          <span className="text-[11px] leading-[14px] font-medium tracking-[0.22px] whitespace-nowrap text-slate-600">
            {t('aiAssistance.legalText')}
          </span>
        </span>
      </SwimlaneHeaderPortal>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
        <p className="text-[16px] leading-[20px] font-medium tracking-[-0.16px] text-brand-950">
          {getNormLabel(norm)}
        </p>
        <hr className="border-border-primary" />
        {normText ? (
          <p className="text-[13px] leading-[20px] font-normal tracking-[-0.13px] whitespace-pre-line text-brand-950">
            {normText}
          </p>
        ) : (
          <p className="text-[13px] leading-[20px] font-normal tracking-[-0.13px] text-text-secondary">
            {t('aiAssistance.noLegalText')}
          </p>
        )}
      </div>
    </>
  );
};
