import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { SplitButton } from '@/features/ui/button/SplitButton';
import { DebouncedSearchInput } from '@/features/ui/search-input/DebouncedSearchInput';
import { Swimlanes } from '@/features/ui/swimlanes/Swimlanes';
import { LoaderCircle, Mail, MessageCircleWarning } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ArgumentsToolbar } from '../arguments/ArgumentsToolbar';
import { ArgumentsList } from '../arguments/ArgumentsList';
import type {
  EwmsArgumentNode,
  EwmsBeteiligungsEingang,
  EwmsObjectionListItem,
  EwmsObjectionSort,
  EwmsTopicNode,
  ObjectionsFilter,
} from '../../data/ewms.nodes';
import {
  isEwmsArgumentApproved,
  resolveEwmsClassificationState,
} from '../../data/ewms.nodes';
import { PreviewLanes } from '../preview/PreviewLanes';
import { ObjectionsFilterControls } from './ObjectionsFilterControls';
import { ObjectionsList } from './ObjectionsList';

// EWMS intentionally keeps local swimlane roots inside each tab/detail workflow.
// This is a deliberate exception to the workspace-wide swimlane owners expected
// by .agents/rules/codebase-structure/project-swimlane-owners.md.
type ObjectionsContentProps = {
  objections: EwmsObjectionListItem[];
  isLoadingMoreObjections: boolean;
  selectedObjectionArguments: EwmsArgumentNode[];
  selectedObjectionArgumentsLoading: boolean;
  allArguments: EwmsArgumentNode[];
  entriesById: Map<string, EwmsBeteiligungsEingang>;
  topics: EwmsTopicNode[];
  filter: ObjectionsFilter;
  search: string | undefined;
  sort: EwmsObjectionSort;
  onFilterChange: (value: ObjectionsFilter) => void;
  onSearchChange: (value: string) => void;
  onSortChange: (value: EwmsObjectionSort) => void;
  selectedObjectionId: string | undefined;
  onSelectObjection: (id: string) => void;
  onSetArgumentsApproval: (
    argumentsList: EwmsArgumentNode[],
    checked: boolean,
  ) => void;
  onDeleteArgument: (argument: EwmsArgumentNode) => void;
  onToggleArgument: (argument: EwmsArgumentNode) => void;
  onUpdateArgumentTopic: (argument: EwmsArgumentNode, topicId: string) => void;
  onUpdateArgumentSubtopic: (
    argument: EwmsArgumentNode,
    subtopicId: string,
  ) => void;
  onReviewArgumentClassification: (
    argument: EwmsArgumentNode,
    isAccepted: boolean,
  ) => void;
  onSelectArgument?: (argumentId: string, trigger: HTMLElement) => void;
};

/**
 * Renders the objections swimlane workspace and synchronizes the selected
 * objection with its preview and argument review panes.
 *
 * @param props Objection list state, selected argument state, and mutation handlers for the workspace.
 * @returns The three-pane objections review workspace.
 */
export const ObjectionsContent = (props: ObjectionsContentProps) => {
  const {
    objections,
    isLoadingMoreObjections,
    selectedObjectionArguments,
    selectedObjectionArgumentsLoading,
    allArguments,
    entriesById,
    topics,
    filter,
    search,
    sort,
    onFilterChange,
    onSearchChange,
    onSortChange,
    selectedObjectionId,
    onSelectObjection,
    onSetArgumentsApproval,
    onDeleteArgument,
    onToggleArgument,
    onUpdateArgumentTopic,
    onUpdateArgumentSubtopic,
    onReviewArgumentClassification,
    onSelectArgument,
  } = props;

  const { t } = useTranslation('Ewms');
  const { canMutateProject } = useCanMutateProject({ requiredLevel: 'user' });
  const selectedItem = selectedObjectionId
    ? objections.find(
        (item) =>
          item.entry.file_id === selectedObjectionId ||
          item.entry.id === selectedObjectionId,
      )
    : undefined;
  const objection = selectedItem?.entry;
  const selectedClassificationState =
    resolveEwmsClassificationState(selectedItem);
  const isSelectedArgumentsLoading =
    selectedItem !== undefined &&
    (selectedClassificationState === 'loading' ||
      (selectedClassificationState === 'done' &&
        selectedObjectionArgumentsLoading));
  const totalCount = selectedObjectionArguments.length;
  const approvedCount = selectedObjectionArguments.filter((arg) =>
    isEwmsArgumentApproved(arg),
  ).length;
  const areAllArgumentsApproved =
    totalCount > 0 && approvedCount === totalCount;

  return (
    <Swimlanes>
      <Swimlanes.Lane
        id="objections"
        title={t('objections.title')}
        icon={Mail}
        headerChildren={
          <ObjectionsFilterControls
            filter={filter}
            objections={objections}
            sort={sort}
            onFilterChange={onFilterChange}
            onSortChange={onSortChange}
          />
        }
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-border-primary p-2">
            <DebouncedSearchInput
              value={search ?? ''}
              onChange={onSearchChange}
              placeholder={t('objections.searchLabel')}
              inputLabel={t('objections.searchLabel')}
              className="w-full"
            />
          </div>
          <ObjectionsList
            objections={objections}
            argumentsList={allArguments}
            filter={filter}
            search={search}
            sort={sort}
            selectedObjectionId={selectedObjectionId}
            onSelectObjection={onSelectObjection}
          />
          {isLoadingMoreObjections ? (
            <div className="flex items-center justify-center gap-2 border-t border-slate-200 px-3 py-2 text-[13px] leading-[18px] text-text-secondary">
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              <span>{t('objections.loadingMore')}</span>
            </div>
          ) : null}
        </div>
      </Swimlanes.Lane>

      <PreviewLanes selectedItem={selectedItem} />

      <Swimlanes.Lane
        id="arguments"
        title={t('arguments.title')}
        icon={MessageCircleWarning}
        action={
          <SplitButton
            checked={areAllArgumentsApproved}
            disabled={
              !canMutateProject ||
              isSelectedArgumentsLoading ||
              selectedClassificationState !== 'done'
            }
            onCheckedChange={(checked) => {
              if (!objection) {
                return;
              }
              onSetArgumentsApproval(selectedObjectionArguments, checked);
            }}
            size="md"
            aria-label={t('arguments.toggleLabel')}
            checkedLabel={t('arguments.checked')}
            uncheckedLabel={t('arguments.checkAll')}
          />
        }
      >
        <ArgumentsToolbar
          totalCount={totalCount}
          approvedCount={approvedCount}
          isLoading={isSelectedArgumentsLoading}
        />
        <ArgumentsList
          selectedObjection={selectedItem}
          isLoading={isSelectedArgumentsLoading}
          argumentsList={selectedObjectionArguments}
          entriesById={entriesById}
          topics={topics}
          onDeleteArgument={onDeleteArgument}
          onToggleArgument={onToggleArgument}
          onUpdateArgumentTopic={onUpdateArgumentTopic}
          onUpdateArgumentSubtopic={onUpdateArgumentSubtopic}
          onReviewArgumentClassification={onReviewArgumentClassification}
          onSelectArgument={onSelectArgument}
        />
      </Swimlanes.Lane>
    </Swimlanes>
  );
};
