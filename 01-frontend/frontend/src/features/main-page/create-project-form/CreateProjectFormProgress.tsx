import { StepIndicator } from './StepIndicator';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import type { Step } from './formReducer';

type CreateProjectFormProgressProps = {
  currentStep: Step;
  stepTitles: Record<Step, string>;
  navigationLabel: string;
};

const steps: Step[] = [1, 2];

export function CreateProjectFormProgress(
  props: CreateProjectFormProgressProps,
): React.ReactElement {
  const { currentStep, stepTitles, navigationLabel } = props;
  const { t } = useTranslation('CreateProjectForm');

  return (
    <nav
      aria-label={navigationLabel}
      className="m-0 flex w-full items-center justify-center pb-4"
    >
      {steps.map((step) => {
        const isCurrent = step === currentStep;
        const isCompleted = step < currentStep;
        const statusLabel = isCurrent
          ? t('stepCurrent')
          : isCompleted
            ? t('stepCompleted')
            : undefined;
        const ariaLabel = statusLabel
          ? `${stepTitles[step]}, ${statusLabel}`
          : stepTitles[step];

        return (
          <StepIndicator
            key={step}
            status={isCurrent ? 'selected' : 'default'}
            stepNumber={step}
            label={stepTitles[step]}
            aria-label={ariaLabel}
          />
        );
      })}
    </nav>
  );
}
