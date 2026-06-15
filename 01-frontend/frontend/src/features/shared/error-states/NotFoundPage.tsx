import { Button } from '@/features/ui/button/Button';
import { Link } from '@tanstack/react-router';
import { DynamicAsset } from '../DynamicAsset';

type NotFoundPageProps = {
  dashboardLabel: string;
  description: string;
};

const mediaClassName =
  'mt-5 aspect-[9/16] max-h-[min(20rem,42vh)] w-[min(18rem,72vw)] object-contain sm:mt-6 sm:max-h-[min(24rem,48vh)] sm:w-80 lg:max-h-[min(30rem,58vh)] lg:w-96';

export function NotFoundPage(props: NotFoundPageProps) {
  const { dashboardLabel, description } = props;

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto bg-bg-secondary px-6 py-6 sm:py-8">
      <div className="flex max-w-xl flex-col items-center text-center">
        <h1 className="text-5xl leading-none font-semibold text-text-primary sm:text-6xl lg:text-7xl">
          404
        </h1>
        <DynamicAsset name="owl-404" className={mediaClassName} />
        <p className="mt-5 text-sm text-text-secondary sm:mt-6 sm:text-base">
          {description}
        </p>
        <Button asChild className="mt-5 sm:mt-6">
          <Link to="/">{dashboardLabel}</Link>
        </Button>
      </div>
    </div>
  );
}
