import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { TabsList, TabsTrigger } from '@/features/ui/tabs/Tabs';
import { Button } from '@/features/ui/button/Button';
import { CloudUpload, Download, FileInput, LoaderCircle } from 'lucide-react';
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

  return (
    <div className="flex items-center justify-between border-b border-slate-200 bg-white pr-2">
      <TabsList>
        <TabsTrigger value="sender">{t('toolbar.tabs.sender')}</TabsTrigger>
        <TabsTrigger value="topics">{t('toolbar.tabs.topics')}</TabsTrigger>
      </TabsList>

      <div className="flex items-center gap-1">
        <div className={PROGRESS_BADGE_CLASSES} aria-live="polite">
          <LoaderCircle className="size-4" aria-hidden="true" />
          {t('toolbar.progressBadge', {
            checkedCount,
            count: totalCount,
            totalCount,
          })}
        </div>

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
      </div>
    </div>
  );
};

export { EwmsToolbar };
