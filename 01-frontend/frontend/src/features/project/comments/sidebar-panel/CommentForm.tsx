import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/features/ui/form/field';
import { Input } from '@/features/ui/input/Input';
import { Textarea } from '@/features/ui/form/textarea';
import { Button } from '@/features/ui/button/Button';
import { SelectMenu } from '@/features/ui/select-menu/SelectMenu';
import { toast } from '@/features/ui/toast/Toast';
import { useForm } from '@tanstack/react-form';
import { getRouteApi } from '@tanstack/react-router';
import * as Sentry from '@sentry/react';
import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import {
  addComment,
  editComment,
} from '@/features/project/comments/data/actions/commentActions';
import type {
  CommentItem,
  CommentProcessStep,
  CommentSourceRef,
} from '@/features/project/comments/data/schemas/comment.schema';
import { createCommentFormSchema } from './commentFormSchema';

const route = getRouteApi('/verfahren/$verfahrenId');

type CommentFormProps = {
  onClose: () => void;
  canMutateProject: boolean;
  onSave?: () => void;
  initialTitle?: string;
  initialContent?: string;
  editItem?: CommentItem;
  sourceRef?: CommentSourceRef;
  scrollIntoViewOnMount?: boolean;
} & (
  | {
      /** Fixed process step (used when the form is scoped to a specific step, e.g. from URL init items) */
      processStep: CommentProcessStep;
      processStepOptions?: never;
    }
  | {
      /** List of selectable process steps (used when no step is pre-selected) */
      processStepOptions: CommentProcessStep[];
      processStep?: never;
    }
);

/**
 * Comment create/edit form. On submit failure it keeps the form open and shows
 * an error toast so the user can retry without losing their input.
 */
export const CommentForm = (props: CommentFormProps) => {
  const {
    onClose,
    processStep,
    processStepOptions,
    canMutateProject,
    onSave,
    initialTitle,
    initialContent,
    editItem,
    sourceRef,
    scrollIntoViewOnMount = false,
  } = props;
  const { verfahrenId } = route.useParams();
  const { t } = useTranslation('Project');
  const isEditMode = !!editItem;
  const formRef = useRef<HTMLDivElement>(null);
  // Prefix field/error ids so multiple sidebar forms can render without id collisions.
  const formId = useId();

  const commentFormSchema = createCommentFormSchema({
    titleRequired: t('Sidebar.commentForm.validation.titleRequired'),
    titleMaxLength: t('Sidebar.commentForm.validation.titleMaxLength'),
    contentRequired: t('Sidebar.commentForm.validation.contentRequired'),
    contentMaxLength: t('Sidebar.commentForm.validation.contentMaxLength'),
    processStepRequired: t(
      'Sidebar.commentForm.validation.processStepRequired',
    ),
  });

  const form = useForm({
    defaultValues: {
      processStep:
        processStep ?? editItem?.processStep ?? ('' as CommentProcessStep),
      title: editItem?.title ?? initialTitle ?? '',
      content: editItem?.content ?? initialContent ?? '',
    },
    validators: {
      onSubmit: commentFormSchema,
      onBlur: commentFormSchema,
    },
    onSubmit: async ({ value }) => {
      if (!canMutateProject) {
        return;
      }

      try {
        if (isEditMode) {
          await editComment(editItem.id, value.title, value.content);
        } else {
          await addComment(
            verfahrenId,
            value.title,
            value.content,
            value.processStep,
            sourceRef,
          );
        }
      } catch (error) {
        // Keep the form open so the user can retry instead of losing their input.
        Sentry.captureException(error);
        toast.error(t('Sidebar.commentForm.saveError'));
        return;
      }

      onSave?.();
      onClose();
    },
  });

  // eslint-disable-next-line no-restricted-syntax -- DOM scroll management after mount
  useEffect(() => {
    if (!scrollIntoViewOnMount || isEditMode) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const root = formRef.current;
      if (!root) {
        return;
      }

      root.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [scrollIntoViewOnMount, isEditMode]);

  return (
    <div ref={formRef} className="shrink-0 bg-neutral-white">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
      >
        <FieldGroup className="gap-4">
          {/* Process step select — only shown when no fixed step is provided */}
          {processStepOptions && (
            <form.Field name="processStep">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched &&
                  field.state.meta.errors.length > 0;
                const errorId = `${formId}-${field.name}-error`;
                const labelId = `${formId}-${field.name}-label`;
                return (
                  <Field data-invalid={isInvalid || undefined}>
                    <FieldLabel
                      id={labelId}
                      htmlFor={`${formId}-${field.name}`}
                      className="text-[11px] leading-[14px] font-medium tracking-[0.22px] text-text-secondary"
                    >
                      {t('Sidebar.commentForm.processStepLabel')}
                    </FieldLabel>
                    <SelectMenu
                      id={`${formId}-${field.name}`}
                      items={processStepOptions.map((step) => ({
                        value: step,
                        label: t(`Sidebar.commentsPanel.processSteps.${step}`),
                      }))}
                      value={field.state.value}
                      onChange={(value) =>
                        field.handleChange(value as CommentProcessStep)
                      }
                      invalid={isInvalid}
                      onBlur={field.handleBlur}
                      placeholder={t(
                        'Sidebar.commentForm.processStepPlaceholder',
                      )}
                      triggerClassName="w-full"
                      required
                      disabled={!canMutateProject}
                      ariaLabelledBy={labelId}
                      ariaDescribedby={isInvalid ? errorId : undefined}
                    />
                    {isInvalid ? (
                      <FieldError
                        id={errorId}
                        errors={field.state.meta.errors}
                      />
                    ) : null}
                  </Field>
                );
              }}
            </form.Field>
          )}

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
                    {t('Sidebar.commentForm.titleLabel')}
                  </FieldLabel>
                  <Input
                    id={`${formId}-${field.name}`}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={isInvalid}
                    aria-describedby={isInvalid ? errorId : undefined}
                    placeholder={t('Sidebar.commentForm.titlePlaceholder')}
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

          <form.Field name="content">
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
                    {t('Sidebar.commentForm.contentLabel')}
                  </FieldLabel>
                  <Textarea
                    id={`${formId}-${field.name}`}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder={t('Sidebar.commentForm.contentPlaceholder')}
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
            {t('Sidebar.commentForm.cancel')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!canMutateProject}
          >
            {t('Sidebar.commentForm.save')}
          </Button>
        </div>
      </form>
    </div>
  );
};
