import {
  Accordion,
  AccordionChevron,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/features/ui/accordion/Accordion';
import { Button } from '@/features/ui/button/Button';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AdministrationDeleteButton } from '../AdministrationDeleteButton';
import type {
  CatalogTopic,
  GesetzesgrundlageDocument,
} from '../data/usecaseApi';
import type { CatalogDraftIssue } from './catalogDraftValidation';
import { catalogSubtopicNameError } from './catalogIssueMessage';
import { CatalogLegalBasisActions } from './CatalogLegalBasisActions';
import { CatalogTopicFields } from './CatalogTopicFields';
import type { CatalogDraftAction } from './gesetzesgrundlageDraft';

type CatalogSubtopicsEditorProps = {
  topic: CatalogTopic;
  topicIndex: number;
  document: GesetzesgrundlageDocument;
  disabled: boolean;
  issues: CatalogDraftIssue[];
  onDispatch: (action: CatalogDraftAction) => void;
  onAddSubtopic: (topicIndex: number) => void;
};

export function CatalogSubtopicsEditor(props: CatalogSubtopicsEditorProps) {
  const {
    topic,
    topicIndex,
    document,
    disabled,
    issues,
    onDispatch,
    onAddSubtopic,
  } = props;
  const { t } = useTranslation('Administration');

  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby={`topic-${topicIndex}-subtopics-heading`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h4
          id={`topic-${topicIndex}-subtopics-heading`}
          className="flex-1 text-sm font-medium text-text-primary"
        >
          {t('catalog.subtopics.title')}
        </h4>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          withIcon
          disabled={disabled}
          onClick={() => onAddSubtopic(topicIndex)}
        >
          <Plus aria-hidden />
          {t('catalog.subtopics.add')}
        </Button>
      </div>
      {topic.subtopics.length === 0 ? (
        <p className="text-sm text-text-secondary">
          {t('catalog.subtopics.empty')}
        </p>
      ) : (
        <Accordion type="multiple">
          {topic.subtopics.map((subtopic, subtopicIndex) => {
            const idPrefix = `topic-${topicIndex}-sub-${subtopicIndex}`;
            return (
              <AccordionItem key={idPrefix} value={idPrefix}>
                <div className="flex items-center gap-2">
                  <AccordionTrigger className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left text-sm text-text-primary">
                    <AccordionChevron />
                    <span className="truncate">{subtopic.name}</span>
                  </AccordionTrigger>
                  <CatalogLegalBasisActions
                    scope={{
                      kind: 'subtopic',
                      topicIndex,
                      subtopicIndex,
                      topic,
                    }}
                    document={document}
                    disabled={disabled}
                    onDispatch={onDispatch}
                  />
                </div>
                <AccordionContent className="flex flex-col gap-6 pb-3 pl-4">
                  <div className="flex justify-end">
                    <AdministrationDeleteButton
                      variant="ghost"
                      size="sm"
                      withIcon
                      disabled={disabled}
                      onConfirm={() =>
                        onDispatch({
                          type: 'removeSubtopic',
                          topicIndex,
                          subtopicIndex,
                        })
                      }
                      aria-label={t('catalog.subtopics.remove', {
                        name: subtopic.name,
                      })}
                    >
                      <Trash2 aria-hidden />
                      {t('catalog.actions.remove')}
                    </AdministrationDeleteButton>
                  </div>
                  <CatalogTopicFields
                    idPrefix={idPrefix}
                    name={subtopic.name}
                    description={subtopic.description}
                    showInMvp={subtopic.showInMvp}
                    showInEwm={subtopic.showInEwm}
                    showInBeschluss={subtopic.showInBeschluss}
                    disabled={disabled}
                    nameError={catalogSubtopicNameError(
                      issues,
                      topicIndex,
                      subtopicIndex,
                      t,
                    )}
                    onPatch={(patch) =>
                      onDispatch({
                        type: 'updateSubtopic',
                        topicIndex,
                        subtopicIndex,
                        patch,
                      })
                    }
                  />
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </section>
  );
}
