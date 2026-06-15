import { FieldError, FieldLabel } from '@/features/ui/form/field';
import { Textarea } from '@/features/ui/form/textarea';
import { useTranslation } from 'react-i18next';
import {
  FEEDBACK_TEXT_MAX_LENGTH,
  FEEDBACK_TEXT_MAX_LENGTH_ERROR_KEY,
} from './feedbackFormSchema';

const ANNOUNCE_THRESHOLD = 100;
const TEXTAREA_ID = 'feedback-dialog-text';
const TEXT_ERROR_ID = 'feedback-dialog-text-error';
const VISIBILITY_NOTE_ID = 'feedback-dialog-text-visibility-note';

type FeedbackFormTextFieldModel = {
  disabled?: boolean;
  errors: React.ComponentProps<typeof FieldError>['errors'];
  isInvalid: boolean;
  name: string;
  onBlur: () => void;
  onChange: (value: string) => void;
  value: string;
};

export function FeedbackFormTextField(props: {
  field: FeedbackFormTextFieldModel;
  namespace: string;
}) {
  const { field, namespace } = props;
  const {
    disabled = false,
    errors,
    isInvalid,
    name,
    onBlur,
    onChange,
    value,
  } = field;
  const { t } = useTranslation(namespace);
  const describedBy = isInvalid
    ? `${VISIBILITY_NOTE_ID} ${TEXT_ERROR_ID}`
    : VISIBILITY_NOTE_ID;
  const translatedErrors = errors?.map((error) => {
    if (error?.message !== FEEDBACK_TEXT_MAX_LENGTH_ERROR_KEY) {
      return error;
    }

    return {
      ...error,
      message: t(FEEDBACK_TEXT_MAX_LENGTH_ERROR_KEY, {
        max: FEEDBACK_TEXT_MAX_LENGTH,
      }),
    };
  });

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <FieldLabel
          htmlFor={TEXTAREA_ID}
          className="text-[11px] leading-[14px] font-medium tracking-[0.22px] text-text-secondary"
        >
          {t('FeedbackDialog.feedbackLabel')}
        </FieldLabel>
        <span
          className="text-xs text-text-secondary"
          aria-live="polite"
          aria-atomic="true"
        >
          {FEEDBACK_TEXT_MAX_LENGTH - value.length <= ANNOUNCE_THRESHOLD
            ? `${value.length}/${FEEDBACK_TEXT_MAX_LENGTH}`
            : null}
        </span>
      </div>
      <Textarea
        id={TEXTAREA_ID}
        name={name}
        rows={10}
        maxLength={FEEDBACK_TEXT_MAX_LENGTH}
        disabled={disabled}
        value={value}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t('FeedbackDialog.feedbackPlaceholder')}
        aria-describedby={describedBy}
        aria-invalid={isInvalid}
        className="min-h-[120px] resize-none text-base"
      />
      <p id={VISIBILITY_NOTE_ID} className="text-xs text-text-secondary">
        {t('FeedbackDialog.feedbackVisibilityNote')}
      </p>
      {isInvalid ? (
        <FieldError id={TEXT_ERROR_ID} errors={translatedErrors} />
      ) : null}
    </div>
  );
}
