import { Button } from '@/features/ui/button/Button';
import { invariant } from 'es-toolkit/util';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  CatalogSubtopic,
  CatalogTopic,
  GesetzesgrundlageDocument,
} from '../data/usecaseApi';
import { CatalogFederalLawDialog } from './CatalogFederalLawDialog';
import { CatalogStateLawDialog } from './CatalogStateLawDialog';
import { countUniqueNorms } from './catalogDraftValidation';
import type { CatalogDraftAction } from './gesetzesgrundlageDraft';
import {
  countTopicStateNorms,
  readTopicStateNormsByState,
} from './topicStateNormAdapter';

type CatalogLegalBasisScope =
  | { kind: 'topic'; topicIndex: number; topic: CatalogTopic }
  | {
      kind: 'subtopic';
      topicIndex: number;
      subtopicIndex: number;
      topic: CatalogTopic;
    };

export type CatalogLegalBasisActionsProps = {
  scope: CatalogLegalBasisScope;
  document: GesetzesgrundlageDocument;
  disabled: boolean;
  onDispatch: (action: CatalogDraftAction) => void;
};

const ownerForScope = (
  scope: CatalogLegalBasisScope,
): CatalogTopic | CatalogSubtopic => {
  if (scope.kind === 'topic') {
    return scope.topic;
  }

  const subtopic = scope.topic.subtopics[scope.subtopicIndex];
  invariant(subtopic !== undefined, 'Catalog subtopic index is out of range');
  return subtopic;
};

/**
 * Renders topic-scoped federal and state law selection actions.
 *
 * @param props Topic scope, document, and draft dispatcher.
 * @returns Action buttons and their selection dialogs.
 */
export function CatalogLegalBasisActions(props: CatalogLegalBasisActionsProps) {
  const { scope, document, disabled, onDispatch } = props;
  const { t } = useTranslation('Administration');
  const owner = ownerForScope(scope);
  const federalCount = countUniqueNorms([
    owner.pruefungsNorms,
    owner.verfahrensNorms,
  ]);
  const stateCount =
    scope.kind === 'topic'
      ? countTopicStateNorms(document, scope.topic.name)
      : 0;
  // eslint-disable-next-line no-restricted-syntax -- dialog owner is local to this topic row
  const [openDialog, setOpenDialog] = useState<'federal' | 'state' | null>(
    null,
  );
  const path =
    scope.kind === 'topic'
      ? { topicIndex: scope.topicIndex }
      : {
          topicIndex: scope.topicIndex,
          subtopicIndex: scope.subtopicIndex,
        };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        size="xs"
        disabled={disabled}
        aria-label={t('catalog.legalBasis.federalActionAria', {
          name: owner.name,
          count: federalCount,
        })}
        onClick={() => setOpenDialog('federal')}
      >
        {t('catalog.legalBasis.federalAction', { count: federalCount })}
      </Button>
      {scope.kind === 'topic' ? (
        <Button
          type="button"
          variant="secondary"
          size="xs"
          disabled={disabled}
          aria-label={t('catalog.legalBasis.stateActionAria', {
            name: owner.name,
            count: stateCount,
          })}
          onClick={() => setOpenDialog('state')}
        >
          {t('catalog.legalBasis.stateAction', { count: stateCount })}
        </Button>
      ) : null}

      <CatalogFederalLawDialog
        open={openDialog === 'federal'}
        persistedPruefungsNorms={owner.pruefungsNorms}
        persistedVerfahrensNorms={owner.verfahrensNorms}
        onOpenChange={(open) => setOpenDialog(open ? 'federal' : null)}
        onApply={(selected) =>
          onDispatch({
            type: 'setFederalNorms',
            path,
            selected,
          })
        }
      />
      {scope.kind === 'topic' ? (
        <CatalogStateLawDialog
          open={openDialog === 'state'}
          persistedByState={readTopicStateNormsByState(
            document,
            scope.topic.name,
          )}
          onOpenChange={(open) => setOpenDialog(open ? 'state' : null)}
          onApply={(selectedByState) =>
            onDispatch({
              type: 'setTopicStateNorms',
              topicIndex: scope.topicIndex,
              selectedByState,
            })
          }
        />
      ) : null}
    </div>
  );
}
