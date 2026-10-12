import {
  Accordion,
  AccordionChevron,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/features/ui/accordion/Accordion';
import { Button } from '@/features/ui/button/Button';
import { Plus, Trash2 } from 'lucide-react';
import { useReducer, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AdministrationDeleteButton } from '../AdministrationDeleteButton';
import { DraftActionButtons } from '../DraftActionButtons';
import type { Usecase } from '../data/usecaseApi';
import { useAdministrationEditorRegistration } from '../editor-navigation/AdministrationEditorRegistration';
import { useDraftServerBaseline } from '../editor-navigation/useDraftServerBaseline';
import { getCatalogApiErrorMessage } from './catalogApiError';
import {
  collectCatalogIssues,
  collectNewCatalogIssues,
} from './catalogDraftValidation';
import { catalogIssueMessage } from './catalogIssueMessage';
import { CatalogLegalBasisActions } from './CatalogLegalBasisActions';
import {
  CatalogNameDialog,
  type CatalogNameDialogKind,
} from './CatalogNameDialog';
import { CatalogTopicEditor } from './CatalogTopicEditor';
import {
  catalogDraftReducer,
  createCatalogDraftState,
  isCatalogDraftDirty,
} from './gesetzesgrundlageDraft';
import { useSaveUsecase } from './useSaveUsecase';

export type CatalogDraftSectionProps = {
  usecase: Usecase;
};

type NameDialogState =
  | { type: 'closed' }
  | { type: CatalogNameDialogKind; topicIndex?: number };

/**
 * Owns the gesetzesgrundlage draft for topics, federal-law assignment, and the
 * hidden state-norm adapter. One Speichern writes the document through
 * useSaveUsecase.
 *
 * @param props The latest fetched usecase used as the draft baseline.
 * @returns The catalog draft editors with save and discard.
 */
export function CatalogDraftSection(props: CatalogDraftSectionProps) {
  const { usecase } = props;
  const { t } = useTranslation('Administration');
  const [draft, dispatch] = useReducer(
    catalogDraftReducer,
    {
      document: usecase.gesetzesgrundlage,
      nodes: usecase.beschluss.nodes,
    },
    (initial) => createCatalogDraftState(initial.document, initial.nodes),
  );
  // eslint-disable-next-line no-restricted-syntax -- ephemeral add-name dialog owner
  const [nameDialog, setNameDialog] = useState<NameDialogState>({
    type: 'closed',
  });
  const save = useSaveUsecase(usecase.projekttyp.id);
  const issues = collectCatalogIssues(draft.document);
  const newIssues = collectNewCatalogIssues(
    draft.document,
    usecase.gesetzesgrundlage,
  );
  const isDirty = isCatalogDraftDirty(
    draft.document,
    usecase.gesetzesgrundlage,
  );
  const isSaving = save.isPending;
  const persistError = save.error
    ? (getCatalogApiErrorMessage(save.error) ?? t('catalog.toasts.saveError'))
    : null;
  const refusalMessage = draft.lastRefusal
    ? catalogIssueMessage(t, draft.lastRefusal)
    : null;
  const editorsDisabled = isSaving;
  const draftBaseline = useDraftServerBaseline({
    serverSnapshot: usecase,
    serverBaseline: usecase.gesetzesgrundlage,
    draft: draft.document,
    isDirty: isCatalogDraftDirty,
    replaceDraft: (document) => {
      dispatch({
        type: 'replace',
        document,
        beschlussNodes: usecase.beschluss.nodes,
      });
    },
    onPreserveDirtyDraft: () => {
      dispatch({
        type: 'refreshReferencedTopics',
        beschlussNodes: usecase.beschluss.nodes,
      });
    },
  });

  const handleSave = async (): Promise<boolean> => {
    if (newIssues.length > 0 || save.isPending) {
      return false;
    }

    try {
      const saved = await save.mutateAsync({
        snapshot: draftBaseline.draftSnapshot(),
        patch: { gesetzesgrundlage: draft.document },
      });
      draftBaseline.adoptSaved(saved, saved.gesetzesgrundlage);
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
    valid: newIssues.length === 0,
    saving: isSaving,
    save: handleSave,
    discard: handleDiscard,
  });

  const handleNameSubmit = (name: string) => {
    if (nameDialog.type === 'topic') {
      dispatch({ type: 'addTopic', name });
      return;
    }

    if (nameDialog.type === 'subtopic' && nameDialog.topicIndex !== undefined) {
      dispatch({
        type: 'addSubtopic',
        topicIndex: nameDialog.topicIndex,
        name,
      });
    }
  };

  return (
    <section className="flex flex-col gap-6" aria-labelledby="catalog-heading">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <h2 id="catalog-heading" className="sr-only">
          {t('catalog.title')}
        </h2>
        {isDirty ? (
          <p className="text-sm text-text-secondary" role="status">
            {t('catalog.dirty')}
          </p>
        ) : null}
        <DraftActionButtons
          discardDisabled={!isDirty || isSaving}
          saveDisabled={!isDirty || isSaving || newIssues.length > 0}
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

      <section className="flex flex-col gap-4" aria-labelledby="topics-heading">
        <div className="flex items-center gap-2">
          <h3
            id="topics-heading"
            className="flex-1 text-base font-medium tracking-tight text-text-primary"
          >
            {t('catalog.topics.title')}
          </h3>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            withIcon
            disabled={editorsDisabled}
            onClick={() => setNameDialog({ type: 'topic' })}
          >
            <Plus aria-hidden />
            {t('catalog.topics.add')}
          </Button>
        </div>

        {draft.document.topics.length === 0 ? (
          <p className="text-sm text-text-secondary">
            {t('catalog.topics.empty')}
          </p>
        ) : (
          <Accordion
            type="multiple"
            className="overflow-clip rounded-lg border border-border-primary"
          >
            {draft.document.topics.map((topic, topicIndex) => (
              <AccordionItem
                key={`topic-${topicIndex}`}
                value={`topic-${topicIndex}`}
                className="border-b border-border-primary last:border-b-0"
              >
                <div className="flex flex-col gap-2 px-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 sm:flex-1">
                    <AccordionTrigger className="flex w-full items-center gap-2 py-[11px] text-left text-sm text-text-primary">
                      <AccordionChevron />
                      <span className="sm:truncate">{topic.name}</span>
                    </AccordionTrigger>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:ml-auto sm:shrink-0 sm:justify-end">
                    <CatalogLegalBasisActions
                      scope={{ kind: 'topic', topicIndex, topic }}
                      document={draft.document}
                      disabled={editorsDisabled}
                      onDispatch={dispatch}
                    />
                    <AdministrationDeleteButton
                      variant="ghost"
                      size="xs"
                      withIcon
                      disabled={editorsDisabled}
                      onConfirm={() =>
                        dispatch({ type: 'removeTopic', topicIndex })
                      }
                      aria-label={t('catalog.topics.remove', {
                        name: topic.name,
                      })}
                    >
                      <Trash2 aria-hidden />
                      {t('catalog.actions.remove')}
                    </AdministrationDeleteButton>
                  </div>
                </div>
                <AccordionContent>
                  <CatalogTopicEditor
                    topic={topic}
                    topicIndex={topicIndex}
                    document={draft.document}
                    disabled={editorsDisabled}
                    issues={issues}
                    onDispatch={dispatch}
                    onAddSubtopic={(index) =>
                      setNameDialog({ type: 'subtopic', topicIndex: index })
                    }
                  />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </section>

      <div className="flex justify-end gap-2 border-t border-border-primary pt-4">
        <DraftActionButtons
          discardDisabled={!isDirty || isSaving}
          saveDisabled={!isDirty || isSaving || newIssues.length > 0}
          isSaving={isSaving}
          onDiscard={handleDiscard}
          onSave={() => {
            void handleSave();
          }}
        />
      </div>

      {nameDialog.type !== 'closed' ? (
        <CatalogNameDialog
          kind={nameDialog.type}
          open
          onOpenChange={(open) => {
            if (!open) {
              setNameDialog({ type: 'closed' });
            }
          }}
          onSubmitName={handleNameSubmit}
        />
      ) : null}
    </section>
  );
}
