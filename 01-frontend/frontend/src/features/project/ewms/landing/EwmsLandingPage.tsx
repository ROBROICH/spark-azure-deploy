import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { Button } from '@/features/ui/button/Button';
import { getRouteApi } from '@tanstack/react-router';
import { CloudUpload, FileCheck2, Mail, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const route = getRouteApi('/verfahren/$verfahrenId/ewms/');

type EwmsLandingPageProps = {
  isFeatureEnabled: boolean;
};

/**
 * Landing page for the EWMS empty state. The import flow itself is owned by the
 * project-level file import dialog so other project surfaces can open it too.
 */
export const EwmsLandingPage = (props: EwmsLandingPageProps) => {
  const { isFeatureEnabled } = props;
  const { t } = useTranslation('Ewms');
  const navigate = route.useNavigate();
  const { canMutateProject } = useCanMutateProject({ requiredLevel: 'user' });

  const openImportDialog = () => {
    if (!isFeatureEnabled || !canMutateProject) {
      return;
    }

    navigate({
      search: (prev) => ({
        ...prev,
        importDialogOpen: true,
      }),
      replace: true,
      resetScroll: false,
    });
  };

  return (
    <div className="flex flex-1 flex-col gap-6 bg-white px-4 py-8 md:px-8 md:py-12 xl:px-32 xl:py-16">
      <div className="mx-auto flex w-full max-w-container flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="rounded-lg bg-slate-200 p-2">
            <Mail className="size-4 text-brand-950" aria-hidden />
          </div>
          <p className="flex-1 text-base leading-5 font-medium text-brand-950">
            {t('importPage.pageTitle')}
          </p>
          <Button
            variant="primary"
            size="sm"
            withIcon
            disabled={!isFeatureEnabled || !canMutateProject}
            onClick={openImportDialog}
          >
            <CloudUpload aria-hidden />
            {t('importPage.importButton')}
          </Button>
        </div>

        <p className="text-[13px] leading-4.5 text-slate-500">
          {t('importPage.pageDescription')}
        </p>

        <ol className="flex list-none flex-col gap-4 lg:flex-row">
          <li className="flex flex-1 flex-col items-center gap-4 rounded-2xl bg-slate-50 p-4 text-center">
            <div className="p-2">
              <CloudUpload className="size-8 text-brand-950" aria-hidden />
            </div>
            <div className="flex w-full flex-col items-center gap-2">
              <p className="text-base leading-5 font-medium text-brand-950">
                1. {t('importPage.step1Title')}
              </p>
              <p className="max-w-[320px] text-[13px] leading-4.5 text-slate-700">
                {t('importPage.step1Description')}
              </p>
            </div>
          </li>

          <li className="flex flex-1 flex-col items-center gap-4 rounded-2xl bg-slate-50 p-4 text-center">
            <div className="p-2">
              <Sparkles className="size-8 text-brand-950" aria-hidden />
            </div>
            <div className="flex w-full flex-col items-center gap-2">
              <p className="text-base leading-5 font-medium text-brand-950">
                2. {t('importPage.step2Title')}
              </p>
              <p className="max-w-[320px] text-[13px] leading-4.5 text-slate-700">
                {t('importPage.step2Description')}
              </p>
            </div>
          </li>

          <li className="flex flex-1 flex-col items-center gap-4 rounded-2xl bg-slate-50 p-4 text-center">
            <div className="p-2">
              <FileCheck2 className="size-8 text-brand-950" aria-hidden />
            </div>
            <div className="flex w-full flex-col items-center gap-2">
              <p className="text-base leading-5 font-medium text-brand-950">
                3. {t('importPage.step3Title')}
              </p>
              <p className="max-w-[320px] text-[13px] leading-4.5 text-slate-700">
                {t('importPage.step3Description')}
              </p>
            </div>
          </li>
        </ol>
      </div>
    </div>
  );
};
