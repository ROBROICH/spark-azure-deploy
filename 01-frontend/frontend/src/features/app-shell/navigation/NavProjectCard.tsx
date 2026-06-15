import { PROJECT_STEP_OPTIONS } from '@/features/project/route/routeStepMapping';
import { cn } from '@/features/ui/style/cn';
import { Link } from '@tanstack/react-router';
import { CalendarDays, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUpcomingDeadline } from './useUpcomingDeadline';

type NavProjectCardProps = {
  projectId: string;
  name: string;
  projectNumber?: string | null;
  initials: string;
  activeStepIndex?: number | null;
  expanded?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
  alwaysWhiteInitials?: boolean;
};

/**
 * Sidebar project card with two interaction modes:
 * - Clicking the row (initials + name) navigates to the project.
 * - Clicking the chevron toggles an accordion that shows the project number,
 *   the deadline tag, and the 5 process steps with the active step highlighted.
 */
export function NavProjectCard(props: NavProjectCardProps) {
  const {
    projectId,
    name,
    projectNumber,
    initials,
    activeStepIndex,
    expanded = false,
    onToggle,
    onNavigate,
    alwaysWhiteInitials = false,
  } = props;

  const { t } = useTranslation('shared');
  const upcomingDeadline = useUpcomingDeadline(projectId, true);

  const handleChevronClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggle?.();
  };

  return (
    <div
      className={cn(
        'relative w-full rounded-xl transition-colors',
        expanded
          ? 'overflow-hidden border border-slate-300/50 bg-slate-700 shadow-[0_2px_4px_rgba(2,6,23,0.1),0_4px_16px_rgba(2,6,23,0.1)]'
          : 'hover:bg-slate-700/40',
      )}
    >
      {/* Header row — clicking navigates to the project */}
      <Link
        to="/verfahren/$verfahrenId"
        params={{ verfahrenId: projectId }}
        onClick={onNavigate}
        className={cn(
          'focus-ring flex w-full cursor-pointer items-center gap-2 rounded-xl p-2 pr-10 transition-colors',
          expanded && 'border-b border-slate-300/30',
        )}
      >
        <span
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded text-[11px] font-medium',
            expanded || alwaysWhiteInitials
              ? 'bg-white text-slate-900'
              : 'bg-slate-300 text-slate-700',
          )}
        >
          {initials}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] leading-4.5 font-medium tracking-[-0.13px] text-white">
            {name}
          </span>
          {expanded && projectNumber && (
            <span className="text-[11px] leading-3.5 font-medium tracking-[0.22px] text-slate-300">
              {projectNumber}
            </span>
          )}
        </div>
        <span className="flex shrink-0 items-center gap-1">
          {!expanded && upcomingDeadline && !upcomingDeadline.isError && (
            <span className="flex size-6 shrink-0 items-center justify-center rounded border border-orange-600 bg-orange-50">
              <CalendarDays
                className="size-3.5 text-orange-800"
                aria-label={t('sidebar.deadlineLabel')}
              />
            </span>
          )}
        </span>
      </Link>

      <button
        type="button"
        onClick={handleChevronClick}
        className="focus-ring absolute top-1 right-1 flex size-8 shrink-0 items-center justify-center rounded hover:bg-slate-600"
        aria-label={
          expanded
            ? t('sidebar.collapseProject', { name })
            : t('sidebar.expandProject', { name })
        }
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronUp className="size-4 text-slate-300" />
        ) : (
          <ChevronDown className="size-4 text-slate-400" />
        )}
      </button>

      {/* Expandable content */}
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out',
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
        aria-hidden={!expanded}
        inert={expanded ? undefined : true}
      >
        <div className="overflow-hidden">
          {upcomingDeadline && !upcomingDeadline.isError && (
            <div className="flex flex-col gap-1 border-b border-slate-300/30 p-1">
              <div className="flex items-center gap-2 rounded-lg py-1 pr-3 pl-1">
                <span className="flex size-6 shrink-0 items-center justify-center rounded border border-orange-600 bg-orange-50">
                  <CalendarDays
                    className="size-3.5 text-orange-800"
                    aria-hidden="true"
                  />
                </span>
                <span className="flex-1 truncate text-[11px] leading-3.5 font-medium tracking-[0.22px] text-white">
                  {upcomingDeadline.label}
                </span>
              </div>
            </div>
          )}

          {/* Steps */}
          <ol
            className="flex flex-col gap-1 p-1"
            aria-label={t('sidebar.processSteps')}
          >
            {PROJECT_STEP_OPTIONS.map((step, i) => {
              const isActive = i === activeStepIndex;
              return (
                <li
                  key={step.value}
                  aria-current={isActive ? 'step' : undefined}
                  className={cn(
                    'flex items-center gap-2 rounded-lg py-1 pr-3 pl-1',
                    isActive
                      ? 'border border-blue-600 bg-slate-600'
                      : 'bg-transparent',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded text-[11px] leading-[14px] font-medium tracking-[0.22px] text-white',
                      isActive ? 'bg-blue-900' : 'bg-slate-500',
                    )}
                    aria-hidden="true"
                  >
                    {step.number}
                  </span>
                  <span
                    className={cn(
                      'truncate text-[11px] leading-[14px] font-medium tracking-[0.22px]',
                      isActive ? 'text-white' : 'text-slate-300',
                    )}
                  >
                    {t(step.labelKey)}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
