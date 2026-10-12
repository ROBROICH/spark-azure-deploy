import { Alert, AlertDescription, AlertTitle } from '@/features/ui/alert/Alert';
import { Button } from '@/features/ui/button/Button';
import { useLocalStorage } from '@/features/shared/browser-storage/useLocalStorage';
import {
  type ZipWorkflowFailureCode,
  zipProcessingFailureMessageKey,
} from '@/features/project/data/file-processing/zipProcessingFailureMessages';
import { AlertTriangle, CircleX, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

const DISMISSED_FILE_PROCESSING_ALERTS_STORAGE_KEY =
  'file-processing-dismissed-alerts';

const dismissedAlertsSchema = z.object({
  keys: z.array(z.string()),
});

type DismissedAlertsState = {
  keys: string[];
};

const INITIAL_DISMISSED_ALERTS_STATE: DismissedAlertsState = {
  keys: [],
};

type FileProcessingAlertStatus = 'loading' | 'error';

type FileProcessingStatusAlertProps = {
  status: FileProcessingAlertStatus | null;
  dismissKey: string | null;
  workflowFailureCode?: ZipWorkflowFailureCode | null;
};

/**
 * Displays the ZIP processing banner for in-flight and failed runs.
 * Successful completions are reported via the upload-flow toast, not here.
 */
export const FileProcessingStatusAlert = (
  props: FileProcessingStatusAlertProps,
) => {
  const { status, dismissKey } = props;
  const workflowFailureCode = props.workflowFailureCode ?? null;
  const { t } = useTranslation('Project');
  const [dismissedAlerts, setDismissedAlerts] = useLocalStorage({
    key: DISMISSED_FILE_PROCESSING_ALERTS_STORAGE_KEY,
    initialValue: INITIAL_DISMISSED_ALERTS_STATE,
    schema: dismissedAlertsSchema,
  });

  const isDismissed =
    status === 'error' &&
    dismissKey !== null &&
    dismissedAlerts.keys.includes(dismissKey);

  const dismissAlert = () => {
    if (status !== 'error' || dismissKey === null) {
      return;
    }

    setDismissedAlerts((previous) => ({
      keys: [...previous.keys, dismissKey],
    }));
  };

  if (status === null || isDismissed) {
    return null;
  }

  if (status === 'loading') {
    return (
      <Alert variant="warning">
        <AlertTriangle className="text-warning-600" />
        <AlertTitle>{t('Documents.processing.title')}</AlertTitle>
        <AlertDescription>
          {t('Documents.processing.description')}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="border-red-200 bg-red-50 pr-12 text-red-800">
      <CircleX className="text-red-700" />
      <AlertTitle>{t('Documents.processingError.title')}</AlertTitle>
      <AlertDescription>
        {t(
          zipProcessingFailureMessageKey(
            workflowFailureCode,
            'Documents.processingError.description',
          ),
        )}
      </AlertDescription>
      <DismissButton
        ariaLabel={t('Documents.processingError.dismissAriaLabel')}
        onClick={dismissAlert}
      />
    </Alert>
  );
};

type DismissButtonProps = {
  ariaLabel: string;
  onClick: () => void;
};

function DismissButton(props: DismissButtonProps) {
  const { ariaLabel, onClick } = props;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      iconOnly
      aria-label={ariaLabel}
      onClick={onClick}
      className="absolute top-2 right-2"
    >
      <X />
    </Button>
  );
}
