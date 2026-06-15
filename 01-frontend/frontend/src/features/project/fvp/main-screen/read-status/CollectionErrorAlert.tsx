import { Alert, AlertDescription, AlertTitle } from '@/features/ui/alert/Alert';
import { Button } from '@/features/ui/button/Button';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type CollectionErrorAlertProps = {
  onRetry?: () => void;
};

export const CollectionErrorAlert = (props: CollectionErrorAlertProps) => {
  const { onRetry } = props;
  const { t } = useTranslation('FormalCompletenessCheck');

  return (
    <Alert variant="warning">
      <AlertTriangle className="text-warning-600" />
      <AlertTitle>{t('common.errors.collection.title')}</AlertTitle>
      <AlertDescription>
        {t('common.errors.collection.description')}
      </AlertDescription>
      {onRetry && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          withIcon
          onClick={onRetry}
          className="col-start-2 mt-2 justify-self-start"
        >
          <RotateCcw aria-hidden="true" />
          {t('common.errors.collection.retry')}
        </Button>
      )}
    </Alert>
  );
};
