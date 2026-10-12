import { Field, FieldError, FieldLabel } from '@/features/ui/form/field';
import { Textarea } from '@/features/ui/form/textarea';
import { Input } from '@/features/ui/input/Input';
import { Toggle } from '@/features/ui/toggle/Toggle';
import { useTranslation } from 'react-i18next';

import type { CatalogTopicFieldsPatch } from './gesetzesgrundlageDraft';

export type CatalogTopicFieldsProps = {
  idPrefix: string;
  name: string;
  description: string;
  showInMvp: boolean;
  showInEwm: boolean;
  showInBeschluss: boolean;
  disabled: boolean;
  nameError: string | null;
  onPatch: (patch: CatalogTopicFieldsPatch) => void;
};

export function CatalogTopicFields(props: CatalogTopicFieldsProps) {
  const {
    idPrefix,
    name,
    description,
    showInMvp,
    showInEwm,
    showInBeschluss,
    disabled,
    nameError,
    onPatch,
  } = props;
  const { t } = useTranslation('Administration');
  const nameId = `${idPrefix}-name`;
  const nameErrorId = `${idPrefix}-name-error`;
  const descriptionId = `${idPrefix}-description`;

  return (
    <div className="flex flex-col gap-4">
      <Field data-invalid={nameError ? true : undefined}>
        <FieldLabel htmlFor={nameId}>{t('catalog.fields.name')}*</FieldLabel>
        <Input
          id={nameId}
          value={name}
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
          value={description}
          disabled={disabled}
          onChange={(event) => onPatch({ description: event.target.value })}
        />
      </Field>
      <div className="flex flex-col gap-1">
        <Toggle
          checked={showInMvp}
          disabled={disabled}
          label={t('catalog.fields.showInMvp')}
          onCheckedChange={(checked) => onPatch({ showInMvp: checked })}
        />
        <Toggle
          checked={showInEwm}
          disabled={disabled}
          label={t('catalog.fields.showInEwm')}
          onCheckedChange={(checked) => onPatch({ showInEwm: checked })}
        />
        <Toggle
          checked={showInBeschluss}
          disabled={disabled}
          label={t('catalog.fields.showInBeschluss')}
          onCheckedChange={(checked) => onPatch({ showInBeschluss: checked })}
        />
      </div>
    </div>
  );
}
