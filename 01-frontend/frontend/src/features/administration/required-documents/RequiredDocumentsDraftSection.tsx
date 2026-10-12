import {
  Accordion,
  AccordionChevron,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/features/ui/accordion/Accordion';
import { Button } from '@/features/ui/button/Button';
import { Plus } from 'lucide-react';
import { useReducer, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DraftActionButtons } from '../DraftActionButtons';
import { getCatalogApiErrorMessage } from '../catalog/catalogApiError';
import { useSaveUsecase } from '../catalog/useSaveUsecase';
import type { Usecase } from '../data/usecaseApi';
import { useAdministrationEditorRegistration } from '../editor-navigation/AdministrationEditorRegistration';
import {
  createDokumenteDraftState,
  dokumenteDraftReducer,
  isDokumenteDraftDirty,
} from './dokumenteDraft';
import {
  collectDokumenteIssues,
  dokumenteIssueMessage,
} from './dokumenteDraftValidation';
import { RequiredDocumentsCategoryEditor } from './RequiredDocumentsCategoryEditor';
import {
  RequiredDocumentsNameDialog,
  type RequiredDocumentsNameDialogKind,
} from './RequiredDocumentsNameDialog';
import { useDokumenteBaseline } from './useDokumenteServerBaseline';

export type RequiredDocumentsDraftSectionProps = {
  usecase: Usecase;
};

type DraftDialogState =
  | { type: 'closed' }
  | { type: RequiredDocumentsNameDialogKind; categoryIndex?: number };

const nameDialogKinds = new Set<string>([
  'addCategory',
  'renameCategory',
  'addDocumentType',
]);

/**
 * Owns the dokumente draft for the selected catalog. One Speichern writes
 * only the dokumente slice through useSaveUsecase.
 *
 * @param props The latest fetched usecase used as the draft baseline.
 * @returns The required-documents editor with save and discard.
 */
export function RequiredDocumentsDraftSection(
  props: RequiredDocumentsDraftSectionProps,
) {
  const { usecase } = props;
  const { t } = useTranslation('Administration');
  const [draft, dispatch] = useReducer(
    dokumenteDraftReducer,
    usecase.dokumente,
    createDokumenteDraftState,
  );
  // eslint-disable-next-line no-restricted-syntax -- ephemeral editor dialog owner
  const [dialog, setDialog] = useState<DraftDialogState>({ type: 'closed' });
  const save = useSaveUsecase(usecase.projekttyp.id);
  const issues = collectDokumenteIssues(draft.document);
  const isDirty = isDokumenteDraftDirty(draft.document, usecase.dokumente);
  const isSaving = save.isPending;
  const persistError = save.error
    ? (getCatalogApiErrorMessage(save.error) ?? t('catalog.toasts.saveError'))
    : null;
  const refusalMessage = draft.lastRefusal
    ? dokumenteIssueMessage(t, draft.lastRefusal)
    : null;
  const editorsDisabled = isSaving;
  const draftBaseline = useDokumenteBaseline(usecase, draft.document, dispatch);

  const handleSave = async (): Promise<boolean> => {
    if (issues.length > 0 || save.isPending) {
      return false;
    }

    try {
      const saved = await save.mutateAsync({
        snapshot: draftBaseline.draftSnapshot(),
        patch: { dokumente: draft.document },
      });
      draftBaseline.adoptSaved(saved, saved.dokumente);
      return true;
    } catch {
      return false;
    }
  };

  const handleDiscard = () => {
    draftBaseline.restoreLatestServerBaseline();
    save.reset();
  };

  useAdministrationEditorRegistration({
    dirty: isDirty,
    valid: issues.length === 0,
    saving: isSaving,
    save: handleSave,
    discard: handleDiscard,
  });

  const handleNameSubmit = (name: string) => {
    if (dialog.type === 'addCategory') {
      dispatch({ type: 'addCategory', name });
      return;
    }

    if (
      dialog.type === 'renameCategory' &&
      dialog.categoryIndex !== undefined
    ) {
      dispatch({
        type: 'renameCategory',
        categoryIndex: dialog.categoryIndex,
        name,
      });
      return;
    }

    if (
      dialog.type === 'addDocumentType' &&
      dialog.categoryIndex !== undefined
    ) {
      dispatch({
        type: 'addDocumentType',
        categoryIndex: dialog.categoryIndex,
        name,
      });
    }
  };

  const closeDialog = () => setDialog({ type: 'closed' });
  const namedCategory =
    dialog.type === 'renameCategory' || dialog.type === 'addDocumentType'
      ? draft.document.categories[dialog.categoryIndex ?? -1]
      : undefined;

  return (
    <section
      className="flex flex-col gap-6"
      aria-labelledby="required-documents-heading"
    >
      <div className="flex flex-wrap items-center justify-end gap-2">
        <h2 id="required-documents-heading" className="sr-only">
          {t('requiredDocuments.title')}
        </h2>
        {isDirty ? (
          <p className="text-sm text-text-secondary" role="status">
            {t('catalog.dirty')}
          </p>
        ) : null}
        <DraftActionButtons
          discardDisabled={!isDirty || isSaving}
          saveDisabled={!isDirty || isSaving || issues.length > 0}
          isSaving={isSaving}
          onDiscard={handleDiscard}
          onSave={() => {
            void handleSave();
          }}
        />
      </div>

      {refusalMessage ? (
        <p role="alert" className="text-sm text-error-900">
          {refusalMessage}
        </p>
      ) : null}
      {persistError ? (
        <p role="alert" className="text-sm text-error-900">
          {persistError}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          withIcon
          disabled={editorsDisabled}
          onClick={() => setDialog({ type: 'addCategory' })}
        >
          <Plus aria-hidden />
          {t('requiredDocuments.addCategory')}
        </Button>
      </div>

      {draft.document.categories.length === 0 ? (
        <p className="text-sm text-text-secondary">
          {t('requiredDocuments.empty')}
        </p>
      ) : (
        <Accordion
          type="multiple"
          className="overflow-clip rounded-lg border border-border-primary"
        >
          {draft.document.categories.map((category, categoryIndex) => (
            <AccordionItem
              key={`category-${categoryIndex}`}
              value={`category-${categoryIndex}`}
              className="border-b border-border-primary last:border-b-0"
            >
              <AccordionTrigger className="flex w-full items-center gap-2 px-3 py-[11px] text-left text-sm text-text-primary">
                <AccordionChevron />
                {category.category}
              </AccordionTrigger>
              <AccordionContent>
                <RequiredDocumentsCategoryEditor
                  category={category}
                  categoryIndex={categoryIndex}
                  disabled={editorsDisabled}
                  issues={issues}
                  onDispatch={dispatch}
                  onRename={() =>
                    setDialog({ type: 'renameCategory', categoryIndex })
                  }
                  onRemove={() =>
                    dispatch({ type: 'removeCategory', categoryIndex })
                  }
                  onAddDocumentType={() =>
                    setDialog({ type: 'addDocumentType', categoryIndex })
                  }
                  onRemoveDocumentType={(typeIndex) =>
                    dispatch({
                      type: 'removeDocumentType',
                      categoryIndex,
                      typeIndex,
                    })
                  }
                />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      <div className="flex justify-end gap-2 border-t border-border-primary pt-4">
        <DraftActionButtons
          discardDisabled={!isDirty || isSaving}
          saveDisabled={!isDirty || isSaving || issues.length > 0}
          isSaving={isSaving}
          onDiscard={handleDiscard}
          onSave={() => {
            void handleSave();
          }}
        />
      </div>

      {nameDialogKinds.has(dialog.type) ? (
        <RequiredDocumentsNameDialog
          kind={dialog.type as RequiredDocumentsNameDialogKind}
          open
          initialName={
            dialog.type === 'renameCategory'
              ? (namedCategory?.category ?? '')
              : ''
          }
          onOpenChange={(open) => {
            if (!open) {
              closeDialog();
            }
          }}
          onSubmitName={handleNameSubmit}
        />
      ) : null}
    </section>
  );
}
