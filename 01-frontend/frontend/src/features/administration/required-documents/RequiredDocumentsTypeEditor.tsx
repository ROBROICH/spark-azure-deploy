import { Field, FieldError, FieldLabel } from '@/features/ui/form/field';
import { Textarea } from '@/features/ui/form/textarea';
import { Input } from '@/features/ui/input/Input';
import { useTranslation } from 'react-i18next';

import type { DokumenteDocument } from '../data/usecaseApi';
import type { DocumentTypePatch } from './dokumenteDraft';
import {
  dokumenteIssueMessage,
  parseExpectedCountInput,
  type DokumenteDraftIssue,
} from './dokumenteDraftValidation';

export type RequiredDocumentsTypeEditorProps = {
  categoryIndex: number;
  typeIndex: number;
  documentType: DokumenteDocument['categories'][number]['document_types'][number];
  disabled: boolean;
  issues: DokumenteDraftIssue[];
  onPatch: (patch: DocumentTypePatch) => void;
};

type Translate = (key: string, options?: Record<string, string>) => string;

const typeNameError = (
  issues: DokumenteDraftIssue[],
  categoryIndex: number,
  typeIndex: number,
  t: Translate,
): string | null => {
  const issue = issues.find(
    (candidate) =>
      (candidate.code === 'duplicateDocumentTypeName' ||
        candidate.code === 'emptyDocumentTypeName') &&
      candidate.categoryIndex === categoryIndex &&
      candidate.typeIndex === typeIndex,
  );
  return issue ? dokumenteIssueMessage(t, issue) : null;
};

const expectedCountError = (
  issues: DokumenteDraftIssue[],
  categoryIndex: number,
  typeIndex: number,
  t: Translate,
): string | null => {
  const issue = issues.find(
    (candidate) =>
      candidate.code === 'invalidExpectedCount' &&
      candidate.categoryIndex === categoryIndex &&
      candidate.typeIndex === typeIndex,
  );
  return issue ? dokumenteIssueMessage(t, issue) : null;
};

/**
 * Edits one document type: required name, description, and optional expected
 * count (empty stores null).
 *
 * @param props Type snapshot, indexes, disable flag, issues, and draft callbacks.
 * @returns The expanded document-type fields.
 */
export function RequiredDocumentsTypeEditor(
  props: RequiredDocumentsTypeEditorProps,
) {
  const { categoryIndex, typeIndex, documentType, disabled, issues, onPatch } =
    props;
  const { t } = useTranslation('Administration');
  const idPrefix = `document-type-${categoryIndex}-${typeIndex}`;
  const nameId = `${idPrefix}-name`;
  const nameErrorId = `${idPrefix}-name-error`;
  const descriptionId = `${idPrefix}-description`;
  const expectedCountId = `${idPrefix}-expected-count`;
  const expectedCountErrorId = `${idPrefix}-expected-count-error`;
  const nameError = typeNameError(issues, categoryIndex, typeIndex, t);
  const countError = expectedCountError(issues, categoryIndex, typeIndex, t);

  return (
    <div className="flex flex-col gap-4 p-3">
      <Field data-invalid={nameError ? true : undefined}>
        <FieldLabel htmlFor={nameId}>{t('catalog.fields.name')}*</FieldLabel>
        <Input
          id={nameId}
          value={documentType.name}
          disabled={disabled}
          onChange={(event) => onPatch({ name: event.target.value })}
          aria-required
          aria-invalid={Boolean(nameError)}
          aria-describedby={nameError ? nameErrorId : undefined}
        />
        {nameError ? (
          <FieldError id={nameErrorId}>{nameError}</FieldError>
        ) : null}
      </Field>
      <Field>
        <FieldLabel htmlFor={descriptionId}>
          {t('catalog.fields.description')}
        </FieldLabel>
        <Textarea
          id={descriptionId}
          value={documentType.description}
          disabled={disabled}
          onChange={(event) => onPatch({ description: event.target.value })}
        />
      </Field>
      <Field data-invalid={countError ? true : undefined}>
        <FieldLabel htmlFor={expectedCountId}>
          {t('requiredDocuments.fields.expectedCount')}
        </FieldLabel>
        <Input
          id={expectedCountId}
          type="text"
          inputMode="numeric"
          value={
            documentType.expected_count === null
              ? ''
              : String(documentType.expected_count)
          }
          disabled={disabled}
          onChange={(event) => {
            const parsed = parseExpectedCountInput(event.target.value);
            if (parsed === 'invalid') {
              return;
            }
            onPatch({ expected_count: parsed });
          }}
          aria-invalid={Boolean(countError)}
          aria-describedby={countError ? expectedCountErrorId : undefined}
        />
        {countError ? (
          <FieldError id={expectedCountErrorId}>{countError}</FieldError>
        ) : null}
      </Field>
    </div>
  );
}
