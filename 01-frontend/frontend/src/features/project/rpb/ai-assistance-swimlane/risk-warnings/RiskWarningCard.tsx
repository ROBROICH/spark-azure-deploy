import { EllipsisVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  ActionMenu,
  ActionMenuContent,
  ActionMenuItem,
  ActionMenuTrigger,
} from '@/features/ui/action-menu/ActionMenu';
import { Badge } from '@/features/ui/badge/Badge';
import { AiSparklesChip } from '@/features/ui/ai/AiSparklesChip';
import { Button } from '@/features/ui/button/Button';
import { SplitButton } from '@/features/ui/button/SplitButton';
import { useRiskWarningsMutationContext } from './RiskWarningsMutationContext';
import { getRiskSeverityInfo } from './riskSeverity';
import type { Risk } from './riskWarning.types';

type RiskWarningCardProps = {
  risk: Risk;
};

type RiskWarningSectionProps = {
  body: string;
  labelKey: string;
};

const RiskWarningSection = (props: RiskWarningSectionProps) => {
  const { labelKey, body } = props;
  const { t } = useTranslation('Rpb');

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] leading-[14px] font-medium tracking-[0.02em] text-slate-600">
        {t(labelKey)}
      </span>
      <p className="text-[13px] leading-[18px] tracking-[-0.01em] text-brand-950">
        {body}
      </p>
    </div>
  );
};

export const RiskWarningCard = (props: RiskWarningCardProps) => {
  const { risk } = props;
  const { t } = useTranslation('Rpb');
  const { canChangeStatus, changeStatus } = useRiskWarningsMutationContext();

  const severity = getRiskSeverityInfo(risk.severity);
  const { Icon: SeverityIcon } = severity;
  const markCorrectedLabel = t('riskWarnings.actions.markCorrected');
  const dismissLabel = t('riskWarnings.actions.dismiss');
  const reopenLabel = t('riskWarnings.actions.reopen');
  const isOpen = risk.status === 'open';
  const canMutateStatus = canChangeStatus(risk);

  return (
    <article className="flex flex-col overflow-hidden rounded-lg border-[0.5px] border-slate-400 bg-white">
      <header className="flex items-center gap-2 bg-slate-100 p-1">
        <AiSparklesChip size="sm" aria-hidden="true" />
        <h3
          title={risk.problem}
          className="min-w-0 flex-1 truncate text-[11px] leading-[14px] font-medium tracking-[0.02em] text-slate-600"
        >
          {risk.problem}
        </h3>
        <Badge
          variant={severity.badgeVariant}
          size="small"
          className="h-6 shrink-0 gap-1 rounded-[4px] py-1 pr-2 pl-1 text-[11px] leading-4"
        >
          <SeverityIcon aria-hidden="true" />
          {t(severity.labelKey)}
        </Badge>
        {!isOpen ? (
          <ActionMenu>
            <ActionMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label={t('riskWarnings.actions.moreOptionsAria')}
                disabled={!canMutateStatus}
                className="size-6 shrink-0 text-slate-600"
              >
                <EllipsisVertical aria-hidden="true" className="size-4" />
              </Button>
            </ActionMenuTrigger>
            <ActionMenuContent align="end">
              <ActionMenuItem
                disabled={!canMutateStatus}
                onSelect={() => changeStatus(risk, 'open')}
              >
                {reopenLabel}
              </ActionMenuItem>
            </ActionMenuContent>
          </ActionMenu>
        ) : null}
      </header>

      <div className="flex flex-col gap-3 p-4">
        {risk.quote ? (
          <>
            <p className="text-[13px] leading-[18px] font-medium tracking-[-0.01em] text-brand-950">
              {`„${risk.quote}“`}
            </p>
            <div className="h-px w-full bg-slate-300" aria-hidden="true" />
          </>
        ) : null}

        <RiskWarningSection
          body={risk.problem}
          labelKey="riskWarnings.card.sections.problem"
        />
        <RiskWarningSection
          body={risk.implication}
          labelKey="riskWarnings.card.sections.implication"
        />
        {risk.recommendation ? (
          <RiskWarningSection
            body={risk.recommendation}
            labelKey="riskWarnings.card.sections.recommendation"
          />
        ) : null}
      </div>

      {isOpen ? (
        <footer className="flex items-center justify-between p-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 rounded-[4px] px-2 py-[5px] text-slate-700"
            disabled={!canMutateStatus}
            onClick={() => changeStatus(risk, 'ignored')}
          >
            {dismissLabel}
          </Button>
          <SplitButton
            size="sm"
            checked={false}
            uncheckedLabel={markCorrectedLabel}
            disabled={!canMutateStatus}
            onCheckedChange={() => changeStatus(risk, 'corrected')}
          />
        </footer>
      ) : null}
    </article>
  );
};
