import { Button } from '@/features/ui/button/Button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/features/ui/dialog/Dialog';
import { useLiveQuery } from '@tanstack/react-db';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  lawChangesCollection,
  retryLawChangesRead,
} from '../data/collections/lawChanges.collection';
import { getLawChangeMatchesForNorm } from '../data/lawChanges.utils';
import { LawChangeDialog } from './LawChangeDialog';

type LawChangeDialogControllerProps = {
  lawChangeId: string | undefined;
  normLabel?: string;
  onOpenChange: (open: boolean) => void;
  onSelectLawChangeId: (lawChangeId: string) => void;
};

type LawChangeDialogStatusProps = {
  status: 'error' | 'notFound';
  onOpenChange: (open: boolean) => void;
};

function LawChangeDialogStatus(props: LawChangeDialogStatusProps) {
  const { status, onOpenChange } = props;
  const { t } = useTranslation('Rpb');
  const descriptionId = `law-change-dialog-${status}`;
  const isError = status === 'error';

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[420px]"
        aria-describedby={descriptionId}
      >
        <DialogHeader className="pr-16">
          <DialogTitle>{t('rechtsaenderung.title')}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-red-700" aria-hidden="true">
              <TriangleAlert className="size-4" />
            </span>
            <DialogDescription
              id={descriptionId}
              className="text-[13px] leading-[18px] text-text-secondary"
              role="alert"
            >
              {t(`rechtsaenderung.dialog.${status}`)}
            </DialogDescription>
          </div>
          {isError ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              withIcon
              className="self-start"
              onClick={retryLawChangesRead}
            >
              <RotateCcw aria-hidden="true" />
              {t('rechtsaenderung.dialog.retry')}
            </Button>
          ) : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export function LawChangeDialogController(
  props: LawChangeDialogControllerProps,
) {
  const { lawChangeId, normLabel, onOpenChange, onSelectLawChangeId } = props;
  const {
    data: lawChanges,
    isError,
    isLoading,
  } = useLiveQuery((q) => q.from({ lawChanges: lawChangesCollection }));

  if (!lawChangeId) {
    return null;
  }

  if (isError) {
    return <LawChangeDialogStatus status="error" onOpenChange={onOpenChange} />;
  }

  if (isLoading && lawChanges.length === 0) {
    return null;
  }

  const lawChange = lawChanges.find((item) => item.id === lawChangeId);

  if (!lawChange) {
    return (
      <LawChangeDialogStatus status="notFound" onOpenChange={onOpenChange} />
    );
  }

  const matchingLawChanges = getLawChangeMatchesForNorm(lawChanges, {
    jurabk: lawChange.jurabk,
    paragraphNr: lawChange.paragraphNr,
  });
  const currentLawChangeIndex = matchingLawChanges.findIndex(
    (item) => item.id === lawChange.id,
  );

  if (currentLawChangeIndex < 0) {
    return null;
  }

  const canGoPrevious = currentLawChangeIndex > 0;
  const canGoNext = currentLawChangeIndex < matchingLawChanges.length - 1;

  return (
    <LawChangeDialog
      activeLawChange={lawChange}
      canGoNext={canGoNext}
      canGoPrevious={canGoPrevious}
      currentIndex={currentLawChangeIndex}
      normLabel={normLabel}
      onGoNext={() => {
        const nextLawChange = matchingLawChanges[currentLawChangeIndex + 1];
        if (nextLawChange) {
          onSelectLawChangeId(nextLawChange.id);
        }
      }}
      onGoPrevious={() => {
        const previousLawChange = matchingLawChanges[currentLawChangeIndex - 1];
        if (previousLawChange) {
          onSelectLawChangeId(previousLawChange.id);
        }
      }}
      open={true}
      onOpenChange={onOpenChange}
      totalCount={matchingLawChanges.length}
    />
  );
}
