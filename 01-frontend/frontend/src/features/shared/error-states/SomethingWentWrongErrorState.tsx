import { Button } from '@/features/ui/button/Button';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { DynamicAsset } from '../DynamicAsset';

const mediaClassName =
  'mt-5 aspect-[643/774] max-h-[min(20rem,42vh)] w-[min(18rem,72vw)] object-contain sm:mt-6 sm:max-h-[min(24rem,48vh)] sm:w-80 lg:max-h-[min(30rem,58vh)] lg:w-96';

export function SomethingWentWrongErrorState() {
  const { t } = useTranslation('shared');

  return (
    <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center overflow-y-auto bg-bg-secondary px-6 py-6 sm:py-8">
      <div className="flex max-w-xl flex-col items-center text-center">
        <h1 className="text-3xl leading-tight font-semibold text-text-primary sm:text-4xl">
          {t('somethingWentWrong.title')}
        </h1>
        <DynamicAsset name="owl-error" className={mediaClassName} />
        <p className="mt-5 text-sm text-text-secondary sm:mt-6 sm:text-base">
          {t('somethingWentWrong.description')}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3 sm:mt-6">
          <Button type="button" onClick={() => window.location.reload()}>
            {t('somethingWentWrong.reload')}
          </Button>
          <Button asChild variant="secondary">
            <Link to="/">{t('somethingWentWrong.dashboard')}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
