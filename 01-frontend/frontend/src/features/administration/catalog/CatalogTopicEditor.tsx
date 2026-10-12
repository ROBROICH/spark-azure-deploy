import { useTranslation } from 'react-i18next';

import type {
  CatalogTopic,
  GesetzesgrundlageDocument,
} from '../data/usecaseApi';
import type { CatalogDraftIssue } from './catalogDraftValidation';
import { catalogTopicNameError } from './catalogIssueMessage';
import { CatalogSubtopicsEditor } from './CatalogSubtopicsEditor';
import { CatalogTopicFields } from './CatalogTopicFields';
import type {
  CatalogDraftAction,
  CatalogTopicFieldsPatch,
} from './gesetzesgrundlageDraft';

export type CatalogTopicEditorProps = {
  topic: CatalogTopic;
  topicIndex: number;
  document: GesetzesgrundlageDocument;
  disabled: boolean;
  issues: CatalogDraftIssue[];
  onDispatch: (action: CatalogDraftAction) => void;
  onAddSubtopic: (topicIndex: number) => void;
};

export function CatalogTopicEditor(props: CatalogTopicEditorProps) {
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
  const idPrefix = `topic-${topicIndex}`;

  return (
    <div className="flex flex-col gap-6 p-3">
      <CatalogTopicFields
        idPrefix={idPrefix}
        name={topic.name}
        description={topic.description}
        showInMvp={topic.showInMvp}
        showInEwm={topic.showInEwm}
        showInBeschluss={topic.showInBeschluss}
        disabled={disabled}
        nameError={catalogTopicNameError(issues, topicIndex, t)}
        onPatch={(patch: CatalogTopicFieldsPatch) =>
          onDispatch({ type: 'updateTopic', topicIndex, patch })
        }
      />
      <CatalogSubtopicsEditor
        topic={topic}
        topicIndex={topicIndex}
        document={document}
        disabled={disabled}
        issues={issues}
        onDispatch={onDispatch}
        onAddSubtopic={onAddSubtopic}
      />
    </div>
  );
}
