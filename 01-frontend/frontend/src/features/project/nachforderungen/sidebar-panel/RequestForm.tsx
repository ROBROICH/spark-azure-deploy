import { Button } from '@/features/ui/button/Button';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/features/ui/form/field';
import { Textarea } from '@/features/ui/form/textarea';
import { Input } from '@/features/ui/input/Input';
import { Label } from '@/features/ui/label/Label';
import {
  RadioGroup,
  RadioGroupItem,
} from '@/features/ui/radio-group/RadioGroup';
import { toast } from '@/features/ui/toast/Toast';
import { getHttpErrorStatus } from '@/integrations/api-clients/httpErrorStatus';
import * as Sentry from '@sentry/react';
import { useForm } from '@tanstack/react-form';
import { getRouteApi } from '@tanstack/react-router';
import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import {
  addRequestItem,
  editRequestItem,
} from '@/features/project/nachforderungen/data/actions/requestItemActions';
import type {
  RequestItem,
  RequestItemPriority,
  RequestItemSourceRef,
} from '@/features/project/nachforderungen/data/schemas/requestItem.schema';
import { createRequestFormSchema } from './requestFormSchema';

const route = getRouteApi('/verfahren/$verfahrenId');

type RequestFormProps = {
  onClose: () => void;
  canMutateProject: boolean;
  onSave?: () => void;
  sourceRef?: RequestItemSourceRef;
  topicId?: string;
  documentId?: string;
  initialTitle?: string;
  editItem?: RequestItem;
};

const DUPLICATE_SOURCE_BINDING_STATUS = 409;

/**
 * Request-list create/edit form. On submit failure it keeps the form open and
 * shows an error toast so the user can retry without losing their input.
 */
export const RequestForm = (props: RequestFormProps) => {
  const {
    onClose,
    canMutateProject,
    onSave,
    sourceRef,
    topicId,
    documentId,
    initialTitle,
    editItem,
  } = props;
  const { t } = useTranslation('SupplementaryRequests');
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const isEditMode = !!editItem;
  // Prefix field/error ids so multiple sidebar forms can render without id collisions.
  const formId = useId();
  const { verfahrenId } = route.useParams();
  const priorityOptions: { value: RequestItemPriority; label: string }[] = [
    { value: 'must', label: t('RequestListPanel.priority.must') },
    { value: 'should', label: t('RequestListPanel.priority.should') },
  ];

  const requestFormSchema = createRequestFormSchema(t);

  const form = useForm({
    defaultValues: {
      priority: editItem?.priority ?? ('must' as RequestItemPriority),
      title: editItem?.title ?? initialTitle ?? '',
      reason: editItem?.reason ?? '',
    },
    validators: {
      onSubmit: requestFormSchema,
      onBlur: requestFormSchema,
    },
    onSubmit: async ({ value }) => {
      if (!canMutateProject) {
        return;
      }

      try {
        if (isEditMode) {
          await editRequestItem(
            editItem.id,
            value.priority,
            value.title,
            value.reason,
          );
        } else {
          await addRequestItem(
            verfahrenId,
            value.priority,
            value.title,
            value.reason,
            sourceRef,
            topicId,
            documentId,
          );
        }
      } catch (error) {
        // Keep the form open so the user can retry instead of losing their input.
        if (getHttpErrorStatus(error) === DUPLICATE_SOURCE_BINDING_STATUS) {
          toast.error(t('RequestListPanel.form.duplicateSourceError'));
          return;
        }

        Sentry.captureException(error);
        toast.error(t('RequestListPanel.form.saveError'));
        return;
      }

      onSave?.();
      onClose();
    },
  });

  // Auto-focus reason field if document name is pre-populated (new item only)
  // eslint-disable-next-line no-restricted-syntax -- DOM focus management after mount
  useEffect(() => {
    if (initialTitle && !isEditMode && reasonRef.current) {
      reasonRef.current.focus();
    }
  }, [initialTitle, isEditMode]);

  return (
    <div className="shrink-0 bg-neutral-white">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
      >
        <FieldGroup className="gap-4">
          {/* Priority Radio Group */}
          <form.Field name="priority">
            {(field) => (
              <Field>
                <FieldLabel
                  id={`${formId}-priority-label`}
                  className="text-[11px] leading-[14px] font-medium tracking-[0.22px] text-text-secondary"
                >
                  {t('RequestListPanel.form.priorityLabel')}
                </FieldLabel>
                <RadioGroup
                  aria-labelledby={`${formId}-priority-label`}
                  value={field.state.value}
                  disabled={!canMutateProject}
                  onValueChange={(value) =>
                    field.handleChange(value as RequestItemPriority)
                  }
                  className="flex gap-4"
                >
                  {priorityOptions.map((option) => (
                    <div key={option.value} className="flex items-center gap-2">
                      <RadioGroupItem
                        value={option.value}
                        id={`${formId}-priority-${option.value}`}
                      />
                      <Label
                        htmlFor={`${formId}-priority-${option.value}`}
                        className="cursor-pointer text-[11px] leading-[14px] font-normal tracking-[0.22px]"
                      >
                        {option.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </Field>
            )}
          </form.Field>

          <form.Field name="title">
            {(field) => {
              const isInvalid =
                field.state.meta.isTouched &&
                field.state.meta.errors.length > 0;
              const errorId = `${formId}-${field.name}-error`;
              return (
                <Field data-invalid={isInvalid || undefined}>
                  <FieldLabel
                    htmlFor={`${formId}-${field.name}`}
                    className="text-[11px] leading-[14px] font-medium tracking-[0.22px] text-text-secondary"
                  >
                    {t('RequestListPanel.form.titleLabel')}
                  </FieldLabel>
                  <Input
                    id={`${formId}-${field.name}`}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={isInvalid}
                    aria-describedby={isInvalid ? errorId : undefined}
                    placeholder={t('RequestListPanel.form.titlePlaceholder')}
                    autoComplete="off"
                    disabled={!canMutateProject}
                    className="py-3 text-base"
                  />
                  {isInvalid ? (
                    <FieldError id={errorId} errors={field.state.meta.errors} />
                  ) : null}
                </Field>
              );
            }}
          </form.Field>

          <form.Field name="reason">
            {(field) => {
              const isInvalid =
                field.state.meta.isTouched &&
                field.state.meta.errors.length > 0;
              const errorId = `${formId}-${field.name}-error`;
              return (
                <Field data-invalid={isInvalid || undefined}>
                  <FieldLabel
                    htmlFor={`${formId}-${field.name}`}
                    className="text-[11px] leading-[14px] font-medium tracking-[0.22px] text-text-secondary"
                  >
                    {t('RequestListPanel.form.reasonLabel')}
                  </FieldLabel>
                  <Textarea
                    ref={reasonRef}
                    id={`${formId}-${field.name}`}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder={t('RequestListPanel.form.reasonPlaceholder')}
                    rows={5}
                    disabled={!canMutateProject}
                    className="resize-none text-base"
                    aria-invalid={isInvalid}
                    aria-describedby={isInvalid ? errorId : undefined}
                  />
                  {isInvalid ? (
                    <FieldError id={errorId} errors={field.state.meta.errors} />
                  ) : null}
                </Field>
              );
            }}
          </form.Field>
        </FieldGroup>

        <div className="mt-5 flex items-center justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {t('RequestListPanel.form.cancel')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!canMutateProject}
          >
            {t('RequestListPanel.form.save')}
          </Button>
        </div>
      </form>
    </div>
  );
};
