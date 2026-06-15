import { Button } from '@/features/ui/button/Button';
import { DialogFooter } from '@/features/ui/dialog/Dialog';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { nextButtonLabelByStep } from './CreateProjectForm.helpers';
import type { Step } from './formReducer';

type CreateProjectFormFooterProps = {
  currentStep: Step;
  disableNext?: boolean;
  isSubmitting: boolean;
  onBack: () => void;
  onCancel: () => void;
  onNext: () => void;
};

export function CreateProjectFormFooter(
  props: CreateProjectFormFooterProps,
): React.ReactElement {
  const {
    currentStep,
    disableNext = false,
    isSubmitting,
    onBack,
    onCancel,
    onNext,
  } = props;
  const { t } = useTranslation('CreateProjectForm');

  return (
    <DialogFooter className="flex flex-col gap-3 border-t-2 border-border-primary bg-neutral-white p-5">
      <div className="flex w-full items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          className="text-text-clickable"
          onClick={onCancel}
        >
          {t('cancelCreation')}
        </Button>
        <div className="flex items-center gap-3">
          {currentStep === 2 && (
            <Button
              type="button"
              variant="secondary"
              onClick={onBack}
              disabled={isSubmitting}
            >
              {t('back')}
            </Button>
          )}
          <Button
            type="button"
            onClick={onNext}
            disabled={disableNext || isSubmitting}
            loading={isSubmitting}
          >
            {isSubmitting ? t('saving') : t(nextButtonLabelByStep[currentStep])}
          </Button>
        </div>
      </div>
    </DialogFooter>
  );
}
