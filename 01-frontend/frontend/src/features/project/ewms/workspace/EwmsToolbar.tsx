import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import {
  ActionMenu,
  ActionMenuContent,
  ActionMenuItem,
  ActionMenuTrigger,
} from '@/features/ui/action-menu/ActionMenu';
import { Button } from '@/features/ui/button/Button';
import { useBelowLg } from '@/features/ui/responsive/useMobile';
import { TabsList, TabsTrigger } from '@/features/ui/tabs/Tabs';
import {
  CloudUpload,
  Download,
  FileInput,
  LoaderCircle,
  MoreVertical,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

const PROGRESS_BADGE_CLASSES =
  'flex items-center gap-2 rounded-lg px-2 py-1 text-green-900 text-[11px] font-medium tracking-[0.02em] leading-[14px] whitespace-nowrap';

type EwmsToolbarProps = {
  checkedCount: number;
  isNachreichenLoading?: boolean;
  isExporting?: boolean;
  totalCount: number;
  onNachreichen?: () => void;
  onExport?: () => void;
  onResponseImport?: () => void;
};

/**
 * EWMS workspace toolbar: tabs, progress badge, and three shared actions
 * (import responses, import participation entries, export). Below `lg` the
 * three actions collapse into a three-dot overflow ActionMenu.
 */
const EwmsToolbar = (props: EwmsToolbarProps) => {
  const {
    checkedCount,
    isExporting = false,
    isNachreichenLoading = false,
    totalCount,
    onNachreichen,
    onExport,
    onResponseImport,
  } = props;
  const { t } = useTranslation('Ewms');
  const { canMutateProject } = useCanMutateProject({ requiredLevel: 'user' });
  const isCompact = useBelowLg();
  const isAnyActionPending = isNachreichenLoading || isExporting;

  const progressBadge = (
    <div className={PROGRESS_BADGE_CLASSES} aria-live="polite">
      <LoaderCircle className="size-4" aria-hidden="true" />
      {t('toolbar.progressBadge', {
        checkedCount,
        count: totalCount,
        totalCount,
      })}
    </div>
  );

  const wideActions = (
    <>
      <Button
        variant="secondary"
        size="sm"
        withIcon
        disabled={!canMutateProject}
        onClick={onResponseImport}
      >
        <CloudUpload />
        {t('toolbar.importResponses')}
      </Button>

      <Button
        variant="secondary"
        size="sm"
        withIcon
        className="disabled:pointer-events-auto disabled:cursor-not-allowed data-[loading=true]:pointer-events-auto data-[loading=true]:cursor-not-allowed"
        loading={isNachreichenLoading}
        disabled={!canMutateProject}
        onClick={onNachreichen}
      >
        <FileInput />
        {t('toolbar.submitAdditionally')}
      </Button>

      <Button
        variant="secondary"
        size="sm"
        withIcon
        loading={isExporting}
        disabled={!canMutateProject}
        onClick={onExport}
      >
        <Download />
        {t('toolbar.export')}
      </Button>
    </>
  );

  const compactActionsMenu = (
    <ActionMenu>
      <ActionMenuTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          iconOnly
          aria-label={t('toolbar.moreActionsAriaLabel')}
          aria-busy={isAnyActionPending || undefined}
        >
          <MoreVertical aria-hidden="true" />
        </Button>
      </ActionMenuTrigger>
      <ActionMenuContent align="end">
        <ActionMenuItem
          disabled={!canMutateProject}
          onSelect={(event) => {
            event.preventDefault();
            onResponseImport?.();
          }}
        >
          <CloudUpload aria-hidden="true" />
          {t('toolbar.importResponses')}
        </ActionMenuItem>
        <ActionMenuItem
          disabled={!canMutateProject || isNachreichenLoading}
          aria-busy={isNachreichenLoading || undefined}
          onSelect={(event) => {
            event.preventDefault();
            onNachreichen?.();
          }}
        >
          {isNachreichenLoading ? (
            <LoaderCircle
              className="animate-spin"
              aria-hidden="true"
              data-testid="ewms-nachreichen-menu-spinner"
            />
          ) : (
            <FileInput aria-hidden="true" />
          )}
          {t('toolbar.submitAdditionally')}
        </ActionMenuItem>
        <ActionMenuItem
          disabled={!canMutateProject || isExporting}
          aria-busy={isExporting || undefined}
          onSelect={(event) => {
            event.preventDefault();
            onExport?.();
          }}
        >
          {isExporting ? (
            <LoaderCircle
              className="animate-spin"
              aria-hidden="true"
              data-testid="ewms-export-menu-spinner"
            />
          ) : (
            <Download aria-hidden="true" />
          )}
          {t('toolbar.export')}
        </ActionMenuItem>
      </ActionMenuContent>
    </ActionMenu>
  );

  return (
    <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-white pr-2">
      <TabsList>
        <TabsTrigger value="sender">{t('toolbar.tabs.sender')}</TabsTrigger>
        <TabsTrigger value="topics">{t('toolbar.tabs.topics')}</TabsTrigger>
      </TabsList>

      <div className="flex flex-wrap items-center gap-1">
        {progressBadge}
        {isCompact ? compactActionsMenu : wideActions}
      </div>
    </div>
  );
};

export { EwmsToolbar };
