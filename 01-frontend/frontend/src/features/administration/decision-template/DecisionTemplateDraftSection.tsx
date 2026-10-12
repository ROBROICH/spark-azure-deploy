import { Button } from '@/features/ui/button/Button';
import { Plus } from 'lucide-react';
import { useReducer, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DraftActionButtons } from '../DraftActionButtons';
import { getCatalogApiErrorMessage } from '../catalog/catalogApiError';
import { useSaveUsecase } from '../catalog/useSaveUsecase';
import type { Usecase } from '../data/usecaseApi';
import { useAdministrationEditorRegistration } from '../editor-navigation/AdministrationEditorRegistration';
import { useDraftServerBaseline } from '../editor-navigation/useDraftServerBaseline';
import {
  beschlussDraftReducer,
  beschlussIssueMessage,
  collectBeschlussIssues,
  createBeschlussDraftState,
  isBeschlussDraftDirty,
} from './beschlussDraft';
import { buildBeschlussTree, catalogTopicNames } from './beschlussTree';
import {
  DecisionTemplateProvider,
  NO_TOPIC_VALUE,
} from './DecisionTemplateContext';
import { DecisionTemplateNameDialog } from './DecisionTemplateNameDialog';
import { DecisionTemplateNode } from './DecisionTemplateNode';

export type DecisionTemplateDraftSectionProps = {
  usecase: Usecase;
};

type DraftDialogState =
  | { type: 'closed' }
  | { type: 'addChild'; parentId: string }
  | { type: 'addRoot' };

/**
 * Owns the Beschluss template draft for the selected catalog. One Speichern
 * writes only the beschluss slice through useSaveUsecase after topic validation.
 *
 * @param props The latest fetched usecase used as the draft baseline.
 * @returns The decision-template editor with save and discard.
 */
export function DecisionTemplateDraftSection(
  props: DecisionTemplateDraftSectionProps,
) {
  const { usecase } = props;
  const { t } = useTranslation('Administration');
  const [draft, dispatch] = useReducer(
    beschlussDraftReducer,
    usecase.beschluss,
    createBeschlussDraftState,
  );
  // eslint-disable-next-line no-restricted-syntax -- ephemeral editor dialog owner
  const [dialog, setDialog] = useState<DraftDialogState>({ type: 'closed' });
  const save = useSaveUsecase(usecase.projekttyp.id);
  const knownTopics = catalogTopicNames(usecase.gesetzesgrundlage.topics);
  const issues = collectBeschlussIssues(draft.document.nodes, knownTopics);
  const isDirty = isBeschlussDraftDirty(draft.document, usecase.beschluss);
  const isSaving = save.isPending;
  const persistError = save.error
    ? (getCatalogApiErrorMessage(save.error) ?? t('catalog.toasts.saveError'))
    : null;
  const refusalMessage = draft.lastRefusal
    ? beschlussIssueMessage(t, draft.lastRefusal)
    : null;
  const unknownTopicIssue = issues.find(
    (issue) => issue.code === 'unknownTopic',
  );
  const unknownTopicMessage = unknownTopicIssue
    ? beschlussIssueMessage(t, unknownTopicIssue)
    : null;
  const tree = buildBeschlussTree(draft.document.nodes);
  const topicItems = [
    { value: NO_TOPIC_VALUE, label: t('decisionTemplate.topic.none') },
    ...usecase.gesetzesgrundlage.topics.map((topic) => ({
      value: topic.name,
      label: topic.name,
    })),
  ];
  const draftBaseline = useDraftServerBaseline({
    serverSnapshot: usecase,
    serverBaseline: usecase.beschluss,
    draft: draft.document,
    isDirty: isBeschlussDraftDirty,
    replaceDraft: (document) => {
      dispatch({ type: 'replace', document });
    },
  });

  const handleSave = async (): Promise<boolean> => {
    if (issues.length > 0 || save.isPending) {
      return false;
    }

    try {
      const saved = await save.mutateAsync({
        snapshot: draftBaseline.draftSnapshot(),
        patch: { beschluss: draft.document },
      });
      draftBaseline.adoptSaved(saved, saved.beschluss);
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

  const closeDialog = () => setDialog({ type: 'closed' });

  return (
    <section
      className="flex flex-col gap-6"
      aria-labelledby="decision-template-heading"
    >
      <div className="flex flex-wrap items-center justify-end gap-2">
        <h2 id="decision-template-heading" className="sr-only">
          {t('decisionTemplate.title')}
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
      {unknownTopicMessage ? (
        <p role="alert" className="text-sm text-error-900">
          {unknownTopicMessage}
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
          disabled={isSaving}
          onClick={() => setDialog({ type: 'addRoot' })}
        >
          <Plus aria-hidden />
          {t('decisionTemplate.addRoot')}
        </Button>
      </div>

      {tree.length === 0 ? (
        <p className="text-sm text-text-secondary">
          {t('decisionTemplate.empty')}
        </p>
      ) : (
        <DecisionTemplateProvider
          value={{
            knownTopics,
            topicItems,
            disabled: isSaving,
            issues,
            onDispatch: dispatch,
            onAddChild: (parentId) => setDialog({ type: 'addChild', parentId }),
            onRemove: (nodeId) => dispatch({ type: 'removeNode', nodeId }),
          }}
        >
          <div className="flex flex-col gap-1">
            {tree.map((treeNode, index) => (
              <DecisionTemplateNode
                key={treeNode.node.id}
                treeNode={treeNode}
                siblingIndex={index}
                siblingCount={tree.length}
              />
            ))}
          </div>
        </DecisionTemplateProvider>
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

      {dialog.type === 'addChild' || dialog.type === 'addRoot' ? (
        <DecisionTemplateNameDialog
          kind={dialog.type}
          open
          onOpenChange={(open) => {
            if (!open) {
              closeDialog();
            }
          }}
          onSubmitTitle={(title) => {
            dispatch({
              type: 'addChild',
              parentId: dialog.type === 'addChild' ? dialog.parentId : null,
              title,
            });
          }}
        />
      ) : null}
    </section>
  );
}
