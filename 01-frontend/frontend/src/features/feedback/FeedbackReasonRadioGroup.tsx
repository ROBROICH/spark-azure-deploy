import { buttonVariants } from '@/features/ui/button/Button';
import { cn } from '@/features/ui/style/cn';
import {
  Item as RadioGroupItemPrimitive,
  Root as RadioGroupRootPrimitive,
} from '@radix-ui/react-radio-group';
import { useTranslation } from 'react-i18next';
import {
  FEEDBACK_REASON_LABEL_KEYS,
  isFeedbackReason,
  type FeedbackReason,
} from './feedbackOptions';

type FeedbackReasonRadioGroupProps = {
  ariaDescribedBy: string | undefined;
  ariaLabelledBy: string;
  disabled?: boolean;
  isInvalid: boolean;
  namespace: string;
  onSelect: (reason: FeedbackReason) => void;
  reasonOptions: ReadonlyArray<FeedbackReason>;
  selectedReason: FeedbackReason | null;
};

/**
 * Renders the feedback reason options as a real Radix radio group so selection
 * exposes roving focus, arrow-key navigation, and programmatic checked state,
 * while keeping the existing pill-chip visual styling.
 */
export function FeedbackReasonRadioGroup(props: FeedbackReasonRadioGroupProps) {
  const {
    ariaDescribedBy,
    ariaLabelledBy,
    disabled = false,
    isInvalid,
    namespace,
    onSelect,
    reasonOptions,
    selectedReason,
  } = props;
  const { t } = useTranslation(namespace);

  return (
    <RadioGroupRootPrimitive
      className="flex flex-wrap gap-2"
      value={selectedReason ?? ''}
      onValueChange={(value) => {
        if (isFeedbackReason(value)) {
          onSelect(value);
        }
      }}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      aria-invalid={isInvalid}
      data-invalid={isInvalid}
      disabled={disabled}
    >
      {reasonOptions.map((option) => {
        const isSelected = selectedReason === option;

        return (
          <RadioGroupItemPrimitive
            key={option}
            value={option}
            disabled={disabled}
            className={cn(
              buttonVariants({ variant: 'secondary', size: 'sm' }),
              isSelected
                ? 'border-primary-600 bg-primary-50 text-primary-900 hover:bg-primary-50 hover:text-primary-900'
                : undefined,
            )}
          >
            {t(FEEDBACK_REASON_LABEL_KEYS[option])}
          </RadioGroupItemPrimitive>
        );
      })}
    </RadioGroupRootPrimitive>
  );
}
