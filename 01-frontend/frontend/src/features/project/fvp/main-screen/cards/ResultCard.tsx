import {
  ActionMenu,
  ActionMenuContent,
  ActionMenuItem,
  ActionMenuTrigger,
} from '@/features/ui/action-menu/ActionMenu';
import { Card } from '@/features/ui/card/Card';
import { InfoTooltip } from '@/features/ui/info-tooltip/InfoTooltip';
import { StatusBadge } from '@/features/ui/status-badge/StatusBadge';
import { cn } from '@/features/ui/style/cn';
import type { TOptions } from 'i18next';
import { MoreVertical } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FvpAiBadge } from './FvpAiBadge';
import { StatusProgressRing } from './StatusProgressRing';

export type ResultCardHintStatus = 'open' | 'irrelevant' | 'requested';

export type ResultCardHintAction = {
  id: string;
  labelKey: string;
  labelOptions?: TOptions;
  onSelect: () => void;
};

type ResultCardHintBase = {
  id: string;
  label: string;
  status?: ResultCardHintStatus;
  statusLabelKey?: string;
  statusLabelOptions?: TOptions;
};

type ResultCardHintWithoutActions = ResultCardHintBase & {
  menuAriaLabelKey?: string;
  menuAriaLabelOptions?: TOptions;
  actions?: undefined;
};

type ResultCardHintWithActions = ResultCardHintBase & {
  menuAriaLabelKey: string;
  menuAriaLabelOptions?: TOptions;
  actions: ResultCardHintAction[];
};

export type ResultCardHint =
  | ResultCardHintWithoutActions
  | ResultCardHintWithActions;

const STATUS_BADGE_VARIANT = {
  irrelevant: 'default',
  requested: 'warning',
} as const satisfies Record<
  Exclude<ResultCardHintStatus, 'open'>,
  'default' | 'warning'
>;

type ResultCardProps = {
  processed: number;
  total: number;
  statusTextKey: string;
  statusTextOptions?: TOptions;
  titleKey: string;
  infoTooltipKey: string;
  infoTooltipAriaLabelKey: string;
  titleAction?: ReactNode;
  descriptionKey: string;
  hintsHeadingKey: string;
  hintsHeadingOptions?: TOptions;
  hints: ResultCardHint[];
  hintsListClassName?: string;
  footerStart?: ReactNode;
  footerEnd?: ReactNode;
  /** Marker at the end of the status row, such as a failed latest run. */
  statusAddon?: ReactNode;
};

export const ResultCard = (props: ResultCardProps) => {
  const {
    processed,
    total,
    statusTextKey,
    statusTextOptions,
    titleKey,
    infoTooltipKey,
    infoTooltipAriaLabelKey,
    titleAction,
    descriptionKey,
    hintsHeadingKey,
    hintsHeadingOptions,
    hints,
    hintsListClassName,
    footerStart,
    footerEnd,
    statusAddon,
  } = props;
  const { t } = useTranslation('FormalCompletenessCheck');
  const statusText = t(statusTextKey, statusTextOptions);

  return (
    <Card className="flex h-full flex-col gap-0 overflow-hidden rounded-2xl bg-bg-secondary p-0 shadow-none">
      <div className="flex items-center gap-2 border-b border-border-secondary px-4 py-4">
        <StatusProgressRing processed={processed} total={total} />
        <span className="text-xs leading-4 font-medium tracking-[0.02em] text-green-900">
          {statusText}
        </span>
        {statusAddon ? (
          <span className="ml-auto flex shrink-0">{statusAddon}</span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex flex-col gap-2">
          <div className="flex h-8 items-center justify-between gap-2">
            <h3 className="min-w-0 flex-1 truncate text-base leading-5 font-medium tracking-[-0.01em] text-text-primary">
              {t(titleKey)}
            </h3>
            <div className="flex shrink-0 items-center gap-1">
              <InfoTooltip
                ariaLabel={t(infoTooltipAriaLabelKey)}
                content={t(infoTooltipKey)}
                className="inline-flex size-5 text-text-secondary"
                iconClassName="size-5"
              />
              {titleAction}
            </div>
          </div>
          <p className="text-sm leading-[18px] tracking-[-0.01em] text-text-secondary">
            {t(descriptionKey)}
          </p>
        </div>

        {hints.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs leading-4 font-medium tracking-[0.02em] text-text-secondary">
              {t(hintsHeadingKey, hintsHeadingOptions)}
            </span>
            <ul className={cn('flex flex-col gap-2', hintsListClassName)}>
              {hints.map((hint) => {
                const isIrrelevant = hint.status === 'irrelevant';
                const statusLabelKey = hint.statusLabelKey;
                const showBadge =
                  hint.status && hint.status !== 'open' && statusLabelKey;
                return (
                  <li
                    key={hint.id}
                    className="flex h-8 shrink-0 items-center gap-2 rounded-lg bg-neutral-white p-1 ring-[0.5px] ring-slate-400 ring-inset"
                  >
                    <div
                      className={cn(
                        'flex min-w-0 flex-1 items-center gap-2',
                        isIrrelevant && 'opacity-50',
                      )}
                    >
                      <FvpAiBadge />
                      <span className="flex-1 truncate text-xs leading-4 font-medium tracking-[0.02em] text-slate-600">
                        {hint.label}
                      </span>
                      {showBadge && hint.status && hint.status !== 'open' ? (
                        <StatusBadge
                          variant={STATUS_BADGE_VARIANT[hint.status]}
                          size="sm"
                        >
                          {t(statusLabelKey, hint.statusLabelOptions)}
                        </StatusBadge>
                      ) : null}
                    </div>
                    {hint.actions && hint.actions.length > 0 ? (
                      <ActionMenu>
                        <ActionMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label={t(
                              hint.menuAriaLabelKey,
                              hint.menuAriaLabelOptions,
                            )}
                            className="focus-ring inline-flex size-6 shrink-0 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
                          >
                            <MoreVertical
                              aria-hidden="true"
                              className="size-4"
                            />
                          </button>
                        </ActionMenuTrigger>
                        <ActionMenuContent align="end">
                          {hint.actions.map((action) => (
                            <ActionMenuItem
                              key={action.id}
                              onSelect={(event) => {
                                event.preventDefault();
                                action.onSelect();
                              }}
                            >
                              {t(action.labelKey, action.labelOptions)}
                            </ActionMenuItem>
                          ))}
                        </ActionMenuContent>
                      </ActionMenu>
                    ) : (
                      <span
                        aria-hidden="true"
                        className="inline-flex size-6 shrink-0"
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {(footerStart || footerEnd) && (
          <div className="mt-auto flex items-center justify-between gap-2">
            <span>{footerStart}</span>
            <span>{footerEnd}</span>
          </div>
        )}
      </div>
    </Card>
  );
};
