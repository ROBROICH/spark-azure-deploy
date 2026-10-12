import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { Textarea } from '@/features/ui/form/textarea';
import { Swimlanes } from '@/features/ui/swimlanes/Swimlanes';
import { Layers2, Mail, MessageCircleReply } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { EwmsArgumentNode } from '../data/ewms.nodes';

// EWMS intentionally keeps local swimlane roots inside each tab/detail workflow.
// This is a deliberate exception to the workspace-wide swimlane owners expected
// by .agents/rules/codebase-structure/project-swimlane-owners.md.
type ArgumentDetailContentProps = {
  argument: EwmsArgumentNode;
  argumentDraft: string;
  contextDraft: string;
  classificationDraft: string;
  onArgumentDraftChange: (value: string) => void;
  onArgumentDraftCommit: (value: string) => void;
  onContextDraftChange: (value: string) => void;
  onContextDraftCommit: (value: string) => void;
  onClassificationDraftChange: (value: string) => void;
  onClassificationDraftCommit: (value: string) => void;
};

/**
 * Renders the detail view for a single EWMS argument across three swimlanes:
 *
 * 1. **Argument** - Provides editable argument and source context textareas.
 * 2. **Erwiderung** - Displays the read-only response/rebuttal content.
 * 3. **Einordnung** - Provides an editable textarea for classification notes.
 */
export const ArgumentDetailContent = (props: ArgumentDetailContentProps) => {
  const {
    argument,
    argumentDraft,
    contextDraft,
    classificationDraft,
    onArgumentDraftChange,
    onArgumentDraftCommit,
    onContextDraftChange,
    onContextDraftCommit,
    onClassificationDraftChange,
    onClassificationDraftCommit,
  } = props;
  const { t } = useTranslation('Ewms');
  const { canMutateProject } = useCanMutateProject({ requiredLevel: 'user' });
  const response = argument.erwiderung ?? '';

  return (
    <Swimlanes className="flex-1">
      <Swimlanes.Lane
        id="einwendungen"
        title={t('topicClassification.argument')}
        icon={Mail}
        headerChildren={
          argument.isValidArgument === false ? (
            <span className="shrink-0 rounded border border-slate-400 bg-white px-2 py-[5px] text-[11px] leading-[14px] font-medium tracking-[0.22px] text-slate-600">
              {t('arguments.invalidBadge')}
            </span>
          ) : null
        }
      >
        <div className="flex flex-col gap-6 p-6">
          <section className="flex flex-col gap-3">
            <label
              className="text-xs leading-4 font-medium text-slate-500"
              htmlFor="ewms-argument-detail-text"
            >
              {t('topicClassification.argument')}
            </label>
            <Textarea
              id="ewms-argument-detail-text"
              className="[field-sizing:fixed] min-h-40 resize-y overflow-auto bg-white text-[13px] leading-5 text-brand-950"
              value={argumentDraft}
              onChange={(event) => onArgumentDraftChange(event.target.value)}
              onBlur={(event) =>
                onArgumentDraftCommit(event.currentTarget.value)
              }
              disabled={!canMutateProject}
            />
          </section>

          <section className="flex flex-col gap-3 border-t border-slate-200 pt-5">
            <label
              className="text-xs leading-4 font-medium text-brand-950"
              htmlFor="ewms-argument-detail-context"
            >
              {t('topicClassification.contextLabel')}
            </label>
            <Textarea
              id="ewms-argument-detail-context"
              className="[field-sizing:fixed] min-h-32 resize-y overflow-auto bg-white text-[13px] leading-5 text-slate-600"
              value={contextDraft}
              onChange={(event) => onContextDraftChange(event.target.value)}
              onBlur={(event) =>
                onContextDraftCommit(event.currentTarget.value)
              }
              disabled={!canMutateProject}
            />
          </section>
        </div>
      </Swimlanes.Lane>
      <Swimlanes.Lane
        id="erwiderung"
        title={t('topicClassification.erwiderung')}
        icon={MessageCircleReply}
      >
        <div className="flex min-h-0 flex-1 flex-col p-6">
          <p className="text-[13px] leading-5 whitespace-pre-wrap text-brand-950">
            {response}
          </p>
        </div>
      </Swimlanes.Lane>
      <Swimlanes.Lane
        id="einordnung"
        title={t('topicClassification.einordnung')}
        icon={Layers2}
      >
        <div className="flex min-h-0 flex-1 flex-col p-2">
          <Textarea
            className="[field-sizing:fixed] min-h-96 resize-y overflow-auto bg-white"
            value={classificationDraft}
            onChange={(event) =>
              onClassificationDraftChange(event.target.value)
            }
            onBlur={(event) =>
              onClassificationDraftCommit(event.currentTarget.value)
            }
            aria-label={t('topicClassification.einordnung')}
            placeholder={t('topicClassification.einordnungPlaceholder')}
            disabled={!canMutateProject}
          />
        </div>
      </Swimlanes.Lane>
    </Swimlanes>
  );
};
