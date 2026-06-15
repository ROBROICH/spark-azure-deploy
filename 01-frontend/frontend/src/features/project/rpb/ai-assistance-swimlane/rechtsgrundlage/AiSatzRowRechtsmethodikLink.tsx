import { TooltipWrapper } from '@/features/ui/tooltip/TooltipWrapper';
import { Link } from '@tanstack/react-router';
import { Scale } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type AiSatzRowRechtsmethodikLinkProps = {
  satzId: string;
  topicId: string | undefined;
  topicNormId: string | undefined;
  verfahrenId: string;
};

export const AiSatzRowRechtsmethodikLink = (
  props: AiSatzRowRechtsmethodikLinkProps,
) => {
  const { satzId, topicId, topicNormId, verfahrenId } = props;
  const { t } = useTranslation('Rpb');
  const label = t('aiAssistance.openRechtsmethodik');

  return (
    <span className="pointer-events-auto relative z-10 inline-flex shrink-0">
      <TooltipWrapper content={label}>
        <Link
          to="/verfahren/$verfahrenId/rpb"
          params={{ verfahrenId }}
          search={(prev) => ({
            ...prev,
            topicId,
            topicNormId,
            satzId: undefined,
            rechtsmethodikSatzId: satzId,
            participationSubtopicId: undefined,
          })}
          resetScroll={false}
          className="focus-ring inline-flex size-8 items-center justify-center rounded-md text-slate-600"
          aria-label={label}
        >
          <Scale className="size-4" aria-hidden="true" />
        </Link>
      </TooltipWrapper>
    </span>
  );
};
