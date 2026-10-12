import { getConfiguredProductMode } from '@/features/shared/config/productMode';
import { Button } from '@/features/ui/button/Button';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type MainPageHeaderProps = {
  userName: string | undefined;
  onCreateProject: () => void;
};

/** Dashboard page header with the welcome greeting and the create-project action. */
export const MainPageHeader = (props: MainPageHeaderProps) => {
  const { userName, onCreateProject } = props;
  const { t } = useTranslation('Dashboard');
  const effectiveMode = getConfiguredProductMode();

  return (
    <div className="flex items-start gap-4 sm:items-center">
      <img
        src={`${import.meta.env.BASE_URL}favicon.svg`}
        alt=""
        aria-hidden="true"
        className="size-12 shrink-0"
      />
      <div className="flex flex-1 flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[19px] leading-[1.4] font-medium tracking-[-0.19px] text-text-primary">
            {userName ? `${t('welcome')}, ${userName}.` : t('welcome')}
          </h1>
          <p className="text-base text-text-secondary">
            {effectiveMode === 'ewms'
              ? t('welcomeSubtitleEwms')
              : t('welcomeSubtitle')}
          </p>
        </div>
        <Button
          variant="primary"
          withIcon
          type="button"
          onClick={onCreateProject}
        >
          <Plus aria-hidden="true" />
          {t('newProject')}
        </Button>
      </div>
    </div>
  );
};
