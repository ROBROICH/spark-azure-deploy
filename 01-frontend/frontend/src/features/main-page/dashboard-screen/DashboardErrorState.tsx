import { Button } from '@/features/ui/button/Button';
import { RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type DashboardErrorStateProps = {
  message: string;
  onRetry: () => void;
};

/**
 * Inline error surface for dashboard data sections (projects table, calendar).
 * Shows a user-visible failure message and a retry action so a failed
 * collection load is not silently rendered as an empty section.
 */
export const DashboardErrorState = (props: DashboardErrorStateProps) => {
  const { message, onRetry } = props;
  const { t } = useTranslation('Dashboard');

  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border border-border-primary bg-neutral-white p-8 text-center text-sm text-text-secondary"
    >
      <p>{message}</p>
      <Button
        variant="secondary"
        size="sm"
        withIcon
        type="button"
        onClick={onRetry}
      >
        <RotateCcw aria-hidden="true" />
        {t('retry')}
      </Button>
    </div>
  );
};
