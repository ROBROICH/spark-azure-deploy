import {
  zipProcessingFailureMessageKey,
  GENERIC_ANALYSIS_FAILURE_MESSAGE_KEY,
} from '@/features/project/data/file-processing/zipProcessingFailureMessages';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/features/ui/tooltip/Tooltip';
import type { WorkflowFailureCode } from '@/features/workflow-runtime/workflow-status/workflowStatus.types';
import { CircleX } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type ProcessingFailureArea =
  | 'tableOfContents'
  | 'requiredDocuments'
  | 'plausibility'
  | 'mvpNorm'
  | 'rpbRating'
  | 'rpbRiskWarnings';

const AREA_TITLE_KEYS = {
  tableOfContents: 'processingFailure.areas.tableOfContents',
  requiredDocuments: 'processingFailure.areas.requiredDocuments',
  plausibility: 'processingFailure.areas.plausibility',
  mvpNorm: 'processingFailure.areas.mvpNorm',
  rpbRating: 'processingFailure.areas.rpbRating',
  rpbRiskWarnings: 'processingFailure.areas.rpbRiskWarnings',
} as const satisfies Record<ProcessingFailureArea, string>;

type ProcessingFailureBadgeProps = {
  area: ProcessingFailureArea;
  errorCode: WorkflowFailureCode;
  /** Names the affected item when one screen shows several chips of the same area, such as one per norm. */
  subject?: string;
};

/**
 * Marks a failed processing run in the area that owns its result. Hovering or
 * focusing the chip shows the area and the cause from the error-code mapping,
 * never raw failure text, so internal workflow names stay out of the interface.
 */
export const ProcessingFailureBadge = (props: ProcessingFailureBadgeProps) => {
  const { area, errorCode, subject } = props;
  const { t } = useTranslation('Project');
  const areaTitle = t(AREA_TITLE_KEYS[area]);

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={
              subject === undefined
                ? areaTitle
                : t('processingFailure.badge.ariaLabelWithSubject', {
                    area: areaTitle,
                    subject,
                  })
            }
            className="focus-ring inline-flex h-6 shrink-0 cursor-default items-center gap-1 rounded-sm border-[0.5px] border-border-error bg-highlight-error px-2 text-[11px] leading-[14px] font-medium whitespace-nowrap text-text-error"
          >
            <CircleX aria-hidden="true" className="size-3 shrink-0" />
            {t('processingFailure.badge.label')}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end" className="max-w-[320px]">
          <p className="font-medium">{areaTitle}</p>
          <p>
            {t(
              zipProcessingFailureMessageKey(
                errorCode,
                GENERIC_ANALYSIS_FAILURE_MESSAGE_KEY,
              ),
            )}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
