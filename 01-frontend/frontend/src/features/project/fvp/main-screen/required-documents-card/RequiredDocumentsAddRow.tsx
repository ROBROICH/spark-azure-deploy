import { Button } from '@/features/ui/button/Button';
import { Plus } from 'lucide-react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';

type RequiredDocumentsAddRowProps = {
  isAddingNew: boolean;
  newDocName: string;
  hasDuplicateDocumentType: boolean;
  newInputRef: RefObject<HTMLInputElement | null>;
  anchorRef: RefObject<HTMLDivElement | null>;
  onNewDocNameChange: (value: string) => void;
  onConfirmAddNew: () => void;
  onCancelAddNew: () => void;
  onStartAddingNew: () => void;
};

export const RequiredDocumentsAddRow = (
  props: RequiredDocumentsAddRowProps,
) => {
  const { t } = useTranslation('FormalCompletenessCheck');
  const {
    isAddingNew,
    newDocName,
    hasDuplicateDocumentType,
    newInputRef,
    anchorRef,
    onNewDocNameChange,
    onConfirmAddNew,
    onCancelAddNew,
    onStartAddingNew,
  } = props;

  return (
    <div ref={anchorRef}>
      {isAddingNew ? (
        <div className="ml-6">
          <div className="mt-2 flex items-center gap-2 rounded-[8px] border border-border-primary bg-neutral-white px-3 py-2">
            <input
              ref={newInputRef}
              type="text"
              value={newDocName}
              onChange={(event) => onNewDocNameChange(event.target.value)}
              onBlur={onConfirmAddNew}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  onConfirmAddNew();
                } else if (event.key === 'Escape') {
                  onCancelAddNew();
                }
              }}
              aria-invalid={hasDuplicateDocumentType ? true : undefined}
              aria-describedby={
                hasDuplicateDocumentType
                  ? 'new-required-document-error'
                  : undefined
              }
              placeholder={t(
                'EditRequiredDocumentsDialog.newDocumentPlaceholder',
              )}
              aria-label={t(
                'EditRequiredDocumentsDialog.newDocumentPlaceholder',
              )}
              className="focus-ring flex-1 rounded-md border border-border-primary bg-neutral-white px-2 py-1 text-[13px] leading-[18px] text-text-primary aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20"
            />
          </div>
          {hasDuplicateDocumentType ? (
            <p
              id="new-required-document-error"
              role="alert"
              className="mt-1 text-[13px] leading-[18px] text-error-600"
            >
              {t('EditRequiredDocumentsDialog.duplicateDocumentTypeError')}
            </p>
          ) : null}
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          withIcon
          className="mt-2 ml-6 w-fit"
          onClick={onStartAddingNew}
        >
          <Plus aria-hidden="true" />
          {t('EditRequiredDocumentsDialog.addDocument')}
        </Button>
      )}
    </div>
  );
};
