import { Field, FieldError, FieldLabel } from '@/features/ui/form/field';
import { Textarea } from '@/features/ui/form/textarea';
import { Input } from '@/features/ui/input/Input';
import { SelectMenu } from '@/features/ui/select-menu/SelectMenu';
import { Toggle } from '@/features/ui/toggle/Toggle';
import { useTranslation } from 'react-i18next';

import type { BeschlussNode } from '../data/usecaseApi';
import { beschlussIssueMessage } from './beschlussDraft';
import { isUnknownTopic } from './beschlussTree';
import {
  NO_TOPIC_VALUE,
  useDecisionTemplateContext,
} from './DecisionTemplateContext';

export type DecisionTemplateNodeFieldsProps = {
  node: BeschlussNode;
};

/**
 * Edits one Beschluss template node: required title, text, catalog topic
 * (with a stale-topic warning), hidden flag, and can_add_child.
 *
 * @param props The node currently expanded in the template tree.
 * @returns The node field editor.
 */
export function DecisionTemplateNodeFields(
  props: DecisionTemplateNodeFieldsProps,
) {
  const { node } = props;
  const { t } = useTranslation('Administration');
  const { knownTopics, topicItems, disabled, issues, onDispatch } =
    useDecisionTemplateContext();
  const titleId = `decision-node-${node.id}-title`;
  const titleErrorId = `${titleId}-error`;
  const textId = `decision-node-${node.id}-text`;
  const topicId = `decision-node-${node.id}-topic`;
  const topicLabelId = `${topicId}-label`;
  const topicErrorId = `${topicId}-error`;
  const titleIssue = issues.find(
    (issue) => issue.code === 'emptyTitle' && issue.nodeId === node.id,
  );
  const topicIssue = issues.find(
    (issue) => issue.code === 'unknownTopic' && issue.nodeId === node.id,
  );
  const titleError = titleIssue ? beschlussIssueMessage(t, titleIssue) : null;
  const unknownTopic = isUnknownTopic(node.topic, knownTopics);
  const staleTopicName = unknownTopic ? node.topic : null;
  let topicError = topicIssue ? beschlussIssueMessage(t, topicIssue) : null;
  if (!topicError && staleTopicName) {
    topicError = t('decisionTemplate.topic.unknown', { name: staleTopicName });
  }
  const selectItems = staleTopicName
    ? [...topicItems, { value: staleTopicName, label: staleTopicName }]
    : topicItems;

  return (
    <div className="flex flex-col gap-4 px-3 pb-3">
      <Field data-invalid={titleError ? true : undefined}>
        <FieldLabel htmlFor={titleId}>
          {t('decisionTemplate.fields.title')}*
        </FieldLabel>
        <Input
          id={titleId}
          value={node.title}
          disabled={disabled}
          onChange={(event) =>
            onDispatch({
              type: 'updateNode',
              nodeId: node.id,
              patch: { title: event.target.value },
            })
          }
          aria-required
          aria-invalid={Boolean(titleError)}
          aria-describedby={titleError ? titleErrorId : undefined}
        />
        {titleError ? (
          <FieldError id={titleErrorId}>{titleError}</FieldError>
        ) : null}
      </Field>
      <Field>
        <FieldLabel htmlFor={textId}>
          {t('decisionTemplate.fields.text')}
        </FieldLabel>
        <Textarea
          id={textId}
          value={node.text}
          disabled={disabled}
          onChange={(event) =>
            onDispatch({
              type: 'updateNode',
              nodeId: node.id,
              patch: { text: event.target.value },
            })
          }
        />
      </Field>
      <Field data-invalid={topicError ? true : undefined}>
        <FieldLabel id={topicLabelId} htmlFor={topicId}>
          {t('decisionTemplate.fields.topic')}
          {unknownTopic ? (
            <span className="text-error-900" role="status">
              {t('decisionTemplate.unknownTopicMarker')}
            </span>
          ) : null}
        </FieldLabel>
        <SelectMenu
          id={topicId}
          items={selectItems}
          value={node.topic ?? NO_TOPIC_VALUE}
          disabled={disabled}
          invalid={Boolean(topicError)}
          ariaLabelledBy={topicLabelId}
          ariaDescribedby={topicError ? topicErrorId : undefined}
          onChange={(value) =>
            onDispatch({
              type: 'updateNode',
              nodeId: node.id,
              patch: { topic: value === NO_TOPIC_VALUE ? null : value },
            })
          }
        />
        {topicError ? (
          <FieldError id={topicErrorId}>{topicError}</FieldError>
        ) : null}
      </Field>
      <Toggle
        checked={node.is_hidden}
        disabled={disabled}
        label={t('decisionTemplate.fields.isHidden')}
        onCheckedChange={(checked) =>
          onDispatch({
            type: 'updateNode',
            nodeId: node.id,
            patch: { is_hidden: checked },
          })
        }
      />
      <Toggle
        checked={node.can_add_child}
        disabled={disabled}
        label={t('decisionTemplate.fields.canAddChild')}
        onCheckedChange={(checked) =>
          onDispatch({
            type: 'updateNode',
            nodeId: node.id,
            patch: { can_add_child: checked },
          })
        }
      />
    </div>
  );
}
