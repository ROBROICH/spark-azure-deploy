import { useProject } from '@/features/project/data/collections/projects.collection';
import {
  getProductSwitcherOptions,
  type ProjectStepValue,
} from '@/features/project/route/routeStepMapping';
import { getConfiguredProductMode } from '@/features/shared/config/productMode';
import { getProjectAvatarLabel } from '@/features/project/route/projectAvatarLabel';
import { ProjectIndicator } from '@/features/ui/project-indicator/ProjectIndicator';
import { StepSelect } from '@/features/ui/step-select/StepSelect';
import { Skeleton } from '@/features/ui/skeleton/Skeleton';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useSidebar } from '@/features/ui/sidebar/Sidebar';
import { MOBILE_ACTION_SIDEBAR_ID } from '@/features/project/action-sidebar/ActionSidebar';
import { Button } from '@/features/ui/button/Button';
import { PanelRightOpen, PanelRightClose } from 'lucide-react';
import { useProjectEntryAction } from '../project-entry/useProjectEntryAction';

const route = getRouteApi('/verfahren/$verfahrenId');
type ProjectNavbarStepValue = ProjectStepValue | 'overview' | 'pp';

type ProjectNavbarProps = {
  selectedStep: ProjectNavbarStepValue;
  showStepSelect?: boolean;
  titleOverride?: string;
};

const PROCESS_TITLE_KEYS = {
  overview: 'projectNavbar.titles.overview',
  ewms: 'projectNavbar.titles.ewms',
  fvp: 'projectNavbar.titles.fvp',
  mvp: 'projectNavbar.titles.mvp',
  pp: 'projectNavbar.titles.pp',
  rpb: 'projectNavbar.titles.rpb',
} as const satisfies Record<ProjectNavbarStepValue, string>;

/**
 * Shared project navbar.
 *
 * Both overview and process-step routes share the same compact top bar.
 */
export const ProjectNavbar = (props: ProjectNavbarProps) => {
  const { selectedStep, showStepSelect = true, titleOverride } = props;
  const { verfahrenId } = route.useParams();
  const { hasStartedFvpProcess, isProjectEntryActionLoading } =
    useProjectEntryAction();

  const { t } = useTranslation('shared');
  const { openMobile, toggleSidebar } = useSidebar();
  const { data: project } = useProject(verfahrenId);
  const projectName = project?.name;
  const internalProjectNumber = project?.internalProjectNumber;
  const title =
    titleOverride ??
    t(PROCESS_TITLE_KEYS[selectedStep], {
      projectName: projectName ?? '',
    });
  const selectedSwitcherValue = selectedStep === 'pp' ? 'fvp' : selectedStep;

  const effectiveMode = getConfiguredProductMode();

  const stepOptions = getProductSwitcherOptions(effectiveMode).map(
    (option) => ({
      value: option.value,
      code: option.code,
      title: t(option.labelKey),
      to: option.to,
      params: { verfahrenId },
    }),
  );

  const showStepper = effectiveMode === 'ewms' ? true : hasStartedFvpProcess;

  return (
    <header
      className="border-b border-neutral-200 bg-neutral-100"
      aria-label={t('projectNavbar.headerAriaLabel')}
    >
      <div className="p-2">
        <div className="flex flex-col gap-2 md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center md:gap-4">
          <div className="justify-self-start">
            {isProjectEntryActionLoading && (
              <Skeleton className="h-3 w-40 rounded" />
            )}

            <div className="flex flex-wrap items-center justify-between md:justify-start">
              <div>
                {showStepSelect &&
                  showStepper &&
                  !isProjectEntryActionLoading && (
                    <StepSelect
                      value={selectedSwitcherValue}
                      options={stepOptions}
                      triggerAriaLabel={t('projectNavbar.stepSelectLabel')}
                      navAriaLabel={t('projectNavbar.stepSelectNavAriaLabel')}
                    />
                  )}
              </div>

              <div className="md:hidden">
                <Button
                  iconOnly
                  variant="ghost"
                  size="sm"
                  onClick={toggleSidebar}
                  aria-haspopup="dialog"
                  aria-expanded={openMobile}
                  aria-controls={MOBILE_ACTION_SIDEBAR_ID}
                  aria-label={
                    openMobile
                      ? t('sidebar.closeActionSidebar')
                      : t('sidebar.openActionSidebar')
                  }
                >
                  {openMobile ? <PanelRightClose /> : <PanelRightOpen />}
                </Button>
              </div>
            </div>
          </div>

          <h1 className="min-w-0 text-center text-[13px] leading-[18px] font-medium tracking-[-0.13px] [overflow-wrap:anywhere] break-words text-neutral-600">
            {title}
          </h1>

          <div className="justify-self-end">
            {!projectName || !internalProjectNumber ? (
              <div className="flex items-center gap-2">
                <Skeleton className="size-8 rounded-lg" />
                <div className="space-y-1">
                  <Skeleton className="h-3 w-40 rounded" />
                  <Skeleton className="h-3 w-24 rounded" />
                </div>
              </div>
            ) : (
              <Link
                to="/verfahren/$verfahrenId"
                params={{ verfahrenId }}
                className="focus-ring inline-block cursor-pointer rounded-lg"
              >
                <ProjectIndicator
                  avatarLabel={getProjectAvatarLabel(projectName)}
                  title={projectName}
                  subtitle={internalProjectNumber}
                />
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
