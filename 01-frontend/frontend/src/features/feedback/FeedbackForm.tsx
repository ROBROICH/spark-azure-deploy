import { FieldError } from '@/features/ui/form/field';
import { Button } from '@/features/ui/button/Button';
import { DialogBody } from '@/features/ui/dialog/Dialog';
import { useForm } from '@tanstack/react-form';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  feedbackFormSchema,
  type FeedbackFormValues,
} from './feedbackFormSchema';
import {
  getFeedbackReasonsForRating,
  isFeedbackReason,
  type FeedbackReason,
  type FeedbackSelection,
} from './feedbackOptions';
import { FeedbackFormFooter } from './FeedbackFormFooter';
import { FeedbackFormTextField } from './FeedbackFormTextField';
import { FeedbackReasonRadioGroup } from './FeedbackReasonRadioGroup';

export type { FeedbackSelection as FeedbackRating } from './feedbackOptions';

type FeedbackFormProps = {
  initialRating: FeedbackSelection;
  initialReason: string | null;
  initialText: string | null;
  onClose: () => void;
  onSave: (feedback: {
    rating: Exclude<FeedbackSelection, null>;
    reason: FeedbackReason | null;
    text: string | null;
  }) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  namespace: string;
};

const FORM_ID = 'feedback-dialog-form';
const RATING_GROUP_LABEL_ID = 'feedback-dialog-rating-label';
const QUALITY_GROUP_LABEL_ID = 'feedback-dialog-quality-label';
const QUALITY_GROUP_ERROR_ID = 'feedback-dialog-quality-error';

const getInitialReason = (rating: FeedbackSelection, reason: string | null) => {
  if (!isFeedbackReason(reason)) {
    return null;
  }

  return getFeedbackReasonsForRating(rating).includes(reason) ? reason : null;
};

const getDefaultValues = (
  initialRating: FeedbackSelection,
  initialReason: string | null,
  initialText: string | null,
): FeedbackFormValues => {
  const rating = initialRating ?? 'positive';

  return {
    rating,
    reason: getInitialReason(rating, initialReason),
    text: initialText ?? '',
  };
};

/**
 * Coordinates one TanStack Form session across rating selection, reason
 * validation, free-text feedback, and the optional delete-confirmation action.
 */
export function FeedbackForm(props: FeedbackFormProps) {
  const {
    initialRating,
    initialReason,
    initialText,
    onDelete,
    onClose,
    onSave,
    namespace,
  } = props;
  const { t } = useTranslation(namespace);
  // eslint-disable-next-line no-restricted-syntax -- delete confirmation is ephemeral modal button state and should reset with the dialog session.
  const [deleteConfirmPending, setDeleteConfirmPending] = useState(false);
  const [isSaving, setIsSaving] =
    // eslint-disable-next-line no-restricted-syntax -- save persistence drives dialog-local loading and disabled states while node writes settle.
    useState(false);

  const form = useForm({
    defaultValues: getDefaultValues(initialRating, initialReason, initialText),
    validators: { onSubmit: feedbackFormSchema },
    onSubmit: async ({ value }) => {
      if (isSaving) {
        return;
      }

      setIsSaving(true);

      try {
        await onSave({
          rating: value.rating,
          reason: value.reason,
          text: value.text.trim() || null,
        });
      } catch {
        // Keep the dialog open if persistence fails so the user can retry; the
        // save handler already surfaced the failure toast.
        setIsSaving(false);
        return;
      }

      onClose();
    },
  });

  const handleDelete = () => {
    if (!onDelete || isSaving) {
      return;
    }

    if (!deleteConfirmPending) {
      setDeleteConfirmPending(true);
      return;
    }

    onClose();
    try {
      void Promise.resolve(onDelete()).catch(() => undefined);
    } catch {
      // The delete handler owns user-visible failure reporting. The dialog has
      // already closed so a sync failure should not remount the edit flow.
    }
  };

  return (
    <form
      id={FORM_ID}
      aria-busy={isSaving}
      onSubmit={(event) => {
        event.preventDefault();
        form.handleSubmit();
      }}
    >
      <DialogBody className="flex flex-col gap-4">
        <form.Field name="rating">
          {(ratingField) => (
            <form.Field name="reason">
              {(reasonField) => {
                const rating = ratingField.state.value;
                const selectedReason = reasonField.state.value;
                const reasonOptions = getFeedbackReasonsForRating(rating);
                const isReasonInvalid =
                  reasonField.state.meta.errors.length > 0;
                const selectRating = (
                  nextRating: Exclude<FeedbackSelection, null>,
                ) => {
                  ratingField.handleChange(nextRating);
                  if (
                    selectedReason &&
                    !getFeedbackReasonsForRating(nextRating).includes(
                      selectedReason,
                    )
                  ) {
                    reasonField.handleChange(null);
                  }
                };

                return (
                  <>
                    <div className="flex flex-col gap-3">
                      <p
                        id={RATING_GROUP_LABEL_ID}
                        className="text-sm font-medium text-text-primary"
                      >
                        {t('FeedbackDialog.ratingQuestion')}
                      </p>
                      <div
                        className="flex gap-2"
                        role="group"
                        aria-labelledby={RATING_GROUP_LABEL_ID}
                      >
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          withIcon
                          disabled={isSaving}
                          aria-pressed={rating === 'positive'}
                          onClick={() => selectRating('positive')}
                          className={
                            rating === 'positive'
                              ? 'border-border-success bg-green-50 text-text-success hover:bg-green-50 hover:text-text-success'
                              : undefined
                          }
                        >
                          <ThumbsUp aria-hidden="true" />
                          {t('FeedbackDialog.zufrieden')}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          withIcon
                          disabled={isSaving}
                          aria-pressed={rating === 'negative'}
                          onClick={() => selectRating('negative')}
                          className={
                            rating === 'negative'
                              ? 'border-border-error bg-highlight-error text-text-error hover:bg-highlight-error hover:text-text-error'
                              : undefined
                          }
                        >
                          <ThumbsDown aria-hidden="true" />
                          {t('FeedbackDialog.unzufrieden')}
                        </Button>
                      </div>
                    </div>

                    <hr className="border-border-primary" />

                    <div className="flex flex-col gap-3">
                      <p
                        id={QUALITY_GROUP_LABEL_ID}
                        className="text-sm font-medium text-text-primary"
                      >
                        {t('FeedbackDialog.qualityQuestion')}
                      </p>
                      <FeedbackReasonRadioGroup
                        ariaDescribedBy={
                          isReasonInvalid ? QUALITY_GROUP_ERROR_ID : undefined
                        }
                        ariaLabelledBy={QUALITY_GROUP_LABEL_ID}
                        isInvalid={isReasonInvalid}
                        disabled={isSaving}
                        namespace={namespace}
                        onSelect={(reason) => reasonField.handleChange(reason)}
                        reasonOptions={reasonOptions}
                        selectedReason={selectedReason}
                      />
                      {isReasonInvalid ? (
                        <FieldError id={QUALITY_GROUP_ERROR_ID}>
                          {t('FeedbackDialog.reasonRequired')}
                        </FieldError>
                      ) : null}
                    </div>
                  </>
                );
              }}
            </form.Field>
          )}
        </form.Field>

        <form.Field name="text">
          {(field) => {
            const isInvalid = field.state.meta.errors.length > 0;

            return (
              <FeedbackFormTextField
                field={{
                  errors: field.state.meta.errors,
                  disabled: isSaving,
                  isInvalid,
                  name: field.name,
                  onBlur: field.handleBlur,
                  onChange: field.handleChange,
                  value: field.state.value,
                }}
                namespace={namespace}
              />
            );
          }}
        </form.Field>
      </DialogBody>

      <FeedbackFormFooter
        disabled={isSaving}
        isDeleteConfirmationPending={deleteConfirmPending}
        isSaveLoading={isSaving}
        namespace={namespace}
        onDelete={onDelete ? handleDelete : undefined}
      />
    </form>
  );
}
