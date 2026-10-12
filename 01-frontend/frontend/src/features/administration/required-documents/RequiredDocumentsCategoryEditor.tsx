import {
  Accordion,
  AccordionChevron,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/features/ui/accordion/Accordion';
import { Button } from '@/features/ui/button/Button';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AdministrationDeleteButton } from '../AdministrationDeleteButton';
import type { DokumenteDocument } from '../data/usecaseApi';
import type { DokumenteDraftAction } from './dokumenteDraft';
import type { DokumenteDraftIssue } from './dokumenteDraftValidation';
import { RequiredDocumentsTypeEditor } from './RequiredDocumentsTypeEditor';

export type RequiredDocumentsCategoryEditorProps = {
  category: DokumenteDocument['categories'][number];
  categoryIndex: number;
  disabled: boolean;
  issues: DokumenteDraftIssue[];
  onDispatch: (action: DokumenteDraftAction) => void;
  onRename: () => void;
  onRemove: () => void;
  onAddDocumentType: () => void;
  onRemoveDocumentType: (typeIndex: number) => void;
};

export function RequiredDocumentsCategoryEditor(
  props: RequiredDocumentsCategoryEditorProps,
) {
  const {
    category,
    categoryIndex,
    disabled,
    issues,
    onDispatch,
    onRename,
    onRemove,
    onAddDocumentType,
    onRemoveDocumentType,
  } = props;
  const { t } = useTranslation('Administration');
  const typesHeadingId = `document-types-${categoryIndex}-heading`;

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          withIcon
          disabled={disabled}
          onClick={onRename}
          aria-label={t('requiredDocuments.renameCategoryAria', {
            name: category.category,
          })}
        >
          <Pencil aria-hidden />
          {t('requiredDocuments.renameCategory')}
        </Button>
        <AdministrationDeleteButton
          variant="ghost"
          size="sm"
          withIcon
          disabled={disabled}
          onConfirm={onRemove}
          aria-label={t('requiredDocuments.removeCategory', {
            name: category.category,
          })}
        >
          <Trash2 aria-hidden />
          {t('catalog.actions.remove')}
        </AdministrationDeleteButton>
      </div>
      <section className="flex flex-col gap-3" aria-labelledby={typesHeadingId}>
        <div className="flex flex-wrap items-center gap-2">
          <h4
            id={typesHeadingId}
            className="flex-1 text-sm font-medium text-text-primary"
          >
            {t('requiredDocuments.documentTypes')}
          </h4>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            withIcon
            disabled={disabled}
            onClick={onAddDocumentType}
          >
            <Plus aria-hidden />
            {t('requiredDocuments.addDocumentType')}
          </Button>
        </div>
        {category.document_types.length === 0 ? (
          <p className="text-sm text-text-secondary">
            {t('requiredDocuments.emptyDocumentTypes')}
          </p>
        ) : (
          <Accordion type="multiple">
            {category.document_types.map((documentType, typeIndex) => (
              <AccordionItem
                key={`type-${categoryIndex}-${typeIndex}`}
                value={`type-${categoryIndex}-${typeIndex}`}
              >
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="min-w-0 sm:flex-1">
                    <AccordionTrigger className="flex w-full items-center gap-2 py-2 text-left text-sm text-text-primary">
                      <AccordionChevron />
                      {documentType.name}
                    </AccordionTrigger>
                  </div>
                  <AdministrationDeleteButton
                    variant="ghost"
                    size="sm"
                    withIcon
                    className="self-start sm:shrink-0"
                    disabled={disabled}
                    onConfirm={() => onRemoveDocumentType(typeIndex)}
                    aria-label={t('requiredDocuments.removeDocumentType', {
                      name: documentType.name,
                    })}
                  >
                    <Trash2 aria-hidden />
                    {t('catalog.actions.remove')}
                  </AdministrationDeleteButton>
                </div>
                <AccordionContent>
                  <RequiredDocumentsTypeEditor
                    categoryIndex={categoryIndex}
                    typeIndex={typeIndex}
                    documentType={documentType}
                    disabled={disabled}
                    issues={issues}
                    onPatch={(patch) =>
                      onDispatch({
                        type: 'updateDocumentType',
                        categoryIndex,
                        typeIndex,
                        patch,
                      })
                    }
                  />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </section>
    </div>
  );
}
