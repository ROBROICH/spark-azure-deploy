import type { GetSystemLoadResponse } from '@/api-clients/backend/types.gen';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/features/ui/popover/Popover';
import {
  SidebarLabel,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/features/ui/sidebar/Sidebar';
import { useDevMode } from '@/features/dev-mode/useDevMode';
import { cn } from '@/features/ui/style/cn';
import { Sparkles } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSystemLoad } from './useSystemLoad';

type LoadTone = 'normal' | 'warning' | 'critical' | 'unknown';

const getLoadTone = (loadPercentage: number | undefined): LoadTone => {
  if (loadPercentage === undefined) {
    return 'unknown';
  }

  if (loadPercentage < 60) {
    return 'normal';
  }

  if (loadPercentage < 80) {
    return 'warning';
  }

  return 'critical';
};

const getLoadBarClassName = (tone: LoadTone) =>
  ({
    normal: 'bg-emerald-400',
    warning: 'bg-amber-300',
    critical: 'bg-red-400',
    unknown: 'bg-slate-500',
  })[tone];

const getLoadTextClassName = (tone: LoadTone) =>
  ({
    normal: 'text-emerald-200',
    warning: 'text-amber-200',
    critical: 'text-red-200',
    unknown: 'text-slate-300',
  })[tone];

const getLoadIndicatorClassName = (tone: LoadTone) =>
  ({
    normal: 'bg-emerald-400',
    warning: 'bg-amber-300',
    critical: 'bg-red-400',
    unknown: 'bg-slate-500',
  })[tone];

const numberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
});

const formatNumber = (value: number) => numberFormatter.format(value);

const formatLoadPercentage = (value: number) => `${formatNumber(value)}%`;

const clampProgressWidth = (loadPercentage: number | undefined) => {
  if (loadPercentage === undefined) {
    return 0;
  }

  return Math.min(Math.max(loadPercentage, 0), 100);
};

function SystemLoadWorkflowBreakdown(props: {
  breakdown: NonNullable<GetSystemLoadResponse['breakdown']>;
}) {
  const { t } = useTranslation('shared');

  return (
    <div className="mt-3 border-t border-slate-700 pt-3">
      <div className="mb-2 text-[11px] leading-4 font-semibold tracking-[0.08em] text-slate-400 uppercase">
        {t('sidebar.systemLoad.breakdown')}
      </div>

      {props.breakdown.length > 0 ? (
        <div className="space-y-2">
          {props.breakdown.map((item) => (
            <div
              key={
                item.workflowType === null
                  ? 'remainder'
                  : `type:${item.workflowType}`
              }
              className="rounded-md bg-slate-800/70 p-2"
            >
              <div className="truncate text-xs leading-4 font-semibold text-white">
                {item.workflowType ??
                  t('sidebar.systemLoad.otherWorkflowTypes')}
              </div>
              <dl className="mt-2 grid grid-cols-3 gap-2 text-[10px] leading-3 text-slate-400">
                <div>
                  <dt>{t('sidebar.systemLoad.runningCount')}</dt>
                  <dd className="mt-1 text-xs font-semibold text-slate-100 tabular-nums">
                    {formatNumber(item.runningCount)}
                  </dd>
                </div>
                <div>
                  <dt>{t('sidebar.systemLoad.complexityWeight')}</dt>
                  <dd className="mt-1 text-xs font-semibold text-slate-100 tabular-nums">
                    {formatNumber(item.complexityWeight)}
                  </dd>
                </div>
                <div>
                  <dt>{t('sidebar.systemLoad.totalComplexity')}</dt>
                  <dd className="mt-1 text-xs font-semibold text-slate-100 tabular-nums">
                    {formatNumber(item.totalComplexity)}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs leading-4 text-slate-300">
          {t('sidebar.systemLoad.noBreakdown')}
        </p>
      )}
    </div>
  );
}

function SystemLoadTooltipContent(props: {
  load: GetSystemLoadResponse | undefined;
  isError: boolean;
  isLoading: boolean;
  showWorkflowBreakdown: boolean;
}) {
  const { t } = useTranslation('shared');
  const loadPercentage = props.load?.loadPercentage;
  const tone = getLoadTone(loadPercentage);
  const progressWidth = clampProgressWidth(loadPercentage);
  const statusMessage = props.isLoading
    ? t('sidebar.systemLoad.loading')
    : props.isError
      ? t('sidebar.systemLoad.error')
      : null;

  return (
    <div className="w-[21rem] max-w-[calc(100vw-2rem)] text-left">
      <div className="-mx-3 -mt-2 mb-3 h-1.5 overflow-hidden rounded-t-[5px] bg-slate-700">
        <div
          className={cn(
            'h-full transition-[width] duration-300 ease-out',
            getLoadBarClassName(tone),
          )}
          style={{ width: `${progressWidth}%` }}
        />
      </div>

      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] leading-4 font-semibold tracking-[0.12em] text-slate-400 uppercase">
            {t('sidebar.systemLoad.title')}
          </div>
          {statusMessage && (
            <div className="mt-0.5 text-[13px] leading-5 text-slate-200">
              {statusMessage}
            </div>
          )}
        </div>

        <div
          className={cn(
            'text-right text-2xl leading-none font-semibold tabular-nums',
            getLoadTextClassName(tone),
          )}
        >
          {loadPercentage === undefined
            ? t('sidebar.systemLoad.unavailableValue')
            : formatLoadPercentage(loadPercentage)}
        </div>
      </div>

      {props.load && (
        <>
          <dl className="grid grid-cols-3 gap-2">
            <div className="rounded-md bg-slate-800/80 p-2">
              <dt className="text-[10px] leading-3 text-slate-400">
                {t('sidebar.systemLoad.runningWorkflows')}
              </dt>
              <dd className="mt-1 text-sm leading-5 font-semibold text-white tabular-nums">
                {formatNumber(props.load.runningWorkflows)}
              </dd>
            </div>
            <div className="rounded-md bg-slate-800/80 p-2">
              <dt className="text-[10px] leading-3 text-slate-400">
                {t('sidebar.systemLoad.currentComplexity')}
              </dt>
              <dd className="mt-1 text-sm leading-5 font-semibold text-white tabular-nums">
                {formatNumber(props.load.currentComplexity)}
              </dd>
            </div>
            <div className="rounded-md bg-slate-800/80 p-2">
              <dt className="text-[10px] leading-3 text-slate-400">
                {t('sidebar.systemLoad.maxComplexity')}
              </dt>
              <dd className="mt-1 text-sm leading-5 font-semibold text-white tabular-nums">
                {formatNumber(props.load.maxComplexity)}
              </dd>
            </div>
          </dl>

          {props.showWorkflowBreakdown && (
            <SystemLoadWorkflowBreakdown breakdown={props.load.breakdown} />
          )}
        </>
      )}
    </div>
  );
}

export function SystemLoadSidebarButton() {
  const { t } = useTranslation('shared');
  const systemLoad = useSystemLoad();
  const [isDevMode] = useDevMode();
  // eslint-disable-next-line no-restricted-syntax -- the open state is ephemeral popover UI state local to this sidebar control
  const [isOpen, setIsOpen] = useState(false);
  const keepOpenOnTriggerInteractionRef = useRef(false);
  const loadPercentage = systemLoad.data?.loadPercentage;
  const tone = getLoadTone(loadPercentage);
  const loadLabel =
    loadPercentage === undefined
      ? t('sidebar.systemLoad.unavailableValue')
      : formatLoadPercentage(loadPercentage);

  const handleRefresh = () => {
    void systemLoad.refetch();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && keepOpenOnTriggerInteractionRef.current) {
      keepOpenOnTriggerInteractionRef.current = false;
      return;
    }

    keepOpenOnTriggerInteractionRef.current = false;
    setIsOpen(nextOpen);
  };

  const preserveOpenStateOnTriggerInteraction = () => {
    if (!isOpen) {
      return;
    }

    keepOpenOnTriggerInteractionRef.current = true;
  };

  return (
    <SidebarMenuItem>
      <Popover open={isOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <SidebarMenuButton
            type="button"
            onClick={handleRefresh}
            onClickCapture={preserveOpenStateOnTriggerInteraction}
            aria-label={t('sidebar.systemLoad.buttonAria', {
              load: loadLabel,
            })}
            aria-busy={systemLoad.isFetching}
          >
            <span className="relative shrink-0">
              <Sparkles className="size-4" />
              <span
                className={cn(
                  'absolute -top-1 -right-1 size-2 rounded-full ring-2 ring-slate-800',
                  getLoadIndicatorClassName(tone),
                )}
                aria-hidden
              />
            </span>
            <SidebarLabel>{t('sidebar.systemLoad.label')}</SidebarLabel>
            <span
              className={cn(
                'ml-auto text-[11px] leading-none font-semibold tabular-nums group-data-[collapsible=icon]:hidden',
                getLoadTextClassName(tone),
              )}
            >
              {loadLabel}
            </span>
          </SidebarMenuButton>
        </PopoverTrigger>
        <PopoverContent
          side="right"
          align="center"
          sideOffset={8}
          aria-label={t('sidebar.systemLoad.title')}
          className="max-h-(--radix-popper-available-height) overflow-y-auto overscroll-contain border-slate-700 bg-slate-900 px-3 py-2"
        >
          <span
            aria-hidden
            className="absolute top-1/2 left-0 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-t border-l border-slate-700 bg-slate-900"
          />
          <SystemLoadTooltipContent
            load={systemLoad.data}
            isError={systemLoad.isError}
            isLoading={systemLoad.isLoading}
            showWorkflowBreakdown={isDevMode}
          />
        </PopoverContent>
      </Popover>
    </SidebarMenuItem>
  );
}
