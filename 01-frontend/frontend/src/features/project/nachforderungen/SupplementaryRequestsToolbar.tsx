import { Button } from '@/features/ui/button/Button';
import { getRouteApi, Link } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const route = getRouteApi('/verfahren/$verfahrenId');

export const SupplementaryRequestsToolbar = () => {
  const { verfahrenId } = route.useParams();
  const { t } = useTranslation('SupplementaryRequests');

  return (
    <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-2 py-[7px]">
      <Button
        asChild
        autoFocus
        variant="secondary"
        iconOnly
        aria-label={t('toolbar.back')}
      >
        <Link to="/verfahren/$verfahrenId" params={{ verfahrenId }}>
          <ChevronLeft className="size-4" />
        </Link>
      </Button>

      <span className="text-[16px] leading-[22px] font-medium tracking-[-0.16px] text-brand-950">
        {t('toolbar.title')}
      </span>
    </div>
  );
};
