import { Tabs, TabsContent } from '@/features/ui/tabs/Tabs';
import { ArgumentDetailView } from '../argument-detail/ArgumentDetailView';
import { resolveEwmsClassificationState } from '../data/ewms.nodes';
import { EwmsToolbar } from './EwmsToolbar';
import { EwmsWorkspaceSkeleton } from './EwmsWorkspaceSkeleton';
import { ObjectionsContent } from './objections/ObjectionsContent';
import { TopicsContent } from './topics/TopicsContent';
import { useEwmsWorkspace } from './useEwmsWorkspace';

type EwmsWorkspaceProps = {
  isEwmsFileImportWorkflowRunning: boolean;
};

export const EwmsWorkspace = (props: EwmsWorkspaceProps) => {
  const { isEwmsFileImportWorkflowRunning } = props;
  const {
    allArguments,
    checkedCount,
    entriesById,
    objectionsFilter,
    ewmsWorkspaceDataLoading,
    ewmsDocumentsLoadingMore,
    handleArgumentBack,
    handleExportResponses,
    handleExpandTopicGroup,
    handleFilterChange,
    handleOpenImportDialog,
    handleOpenResponseImportDialog,
    handleSearchChange,
    handleSelectArgument,
    handleSelectObjection,
    handleSelectSubtopic,
    handleSelectTopic,
    handleSortChange,
    handleDeleteArgument,
    handleSetArgumentsApproval,
    handleTabChange,
    handleToggleArgument,
    handleReviewArgumentClassification,
    handleUpdateArgumentTopic,
    handleUpdateArgumentSubtopic,
    isExportingResponses,
    objectionItems,
    objectionsSort,
    objectionsSearch,
    selectedObjectionId,
    selectedObjectionArguments,
    selectedObjectionArgumentsLoading,
    selectedArgumentRef,
    selectedTopicArguments,
    selectedSubtopicId,
    selectedTopicId,
    expandedTopicGroupId,
    tab,
    topics,
  } = useEwmsWorkspace();

  if (ewmsWorkspaceDataLoading) {
    return <EwmsWorkspaceSkeleton />;
  }

  if (selectedArgumentRef) {
    return (
      <ArgumentDetailView
        key={selectedArgumentRef.id}
        argumentRef={selectedArgumentRef}
        topics={topics}
        onBack={handleArgumentBack}
      />
    );
  }
  const hasClassifyingObjections = objectionItems.some(
    (item) => resolveEwmsClassificationState(item) === 'loading',
  );
  // Keep the import button loading until both Temporal and node-backed EWMS
  // state have settled, so the toolbar cannot get ahead of entry loading UI.
  const isNachreichenLoading =
    (isEwmsFileImportWorkflowRunning || hasClassifyingObjections) &&
    objectionItems.length > 0;

  return (
    <Tabs
      value={tab}
      onValueChange={handleTabChange}
      className="min-h-0 w-full flex-1 gap-0"
    >
      <EwmsToolbar
        checkedCount={checkedCount}
        isExporting={isExportingResponses}
        isNachreichenLoading={isNachreichenLoading}
        totalCount={allArguments.length}
        onExport={handleExportResponses}
        onNachreichen={handleOpenImportDialog}
        onResponseImport={handleOpenResponseImportDialog}
      />
      <TabsContent value="sender" className="p-0">
        <ObjectionsContent
          objections={objectionItems}
          isLoadingMoreObjections={ewmsDocumentsLoadingMore}
          selectedObjectionArguments={selectedObjectionArguments}
          selectedObjectionArgumentsLoading={selectedObjectionArgumentsLoading}
          allArguments={allArguments}
          entriesById={entriesById}
          topics={topics}
          filter={objectionsFilter}
          search={objectionsSearch}
          sort={objectionsSort}
          onFilterChange={handleFilterChange}
          onSearchChange={handleSearchChange}
          onSortChange={handleSortChange}
          selectedObjectionId={selectedObjectionId}
          onSelectObjection={handleSelectObjection}
          onSetArgumentsApproval={handleSetArgumentsApproval}
          onDeleteArgument={handleDeleteArgument}
          onToggleArgument={handleToggleArgument}
          onUpdateArgumentTopic={handleUpdateArgumentTopic}
          onUpdateArgumentSubtopic={handleUpdateArgumentSubtopic}
          onReviewArgumentClassification={handleReviewArgumentClassification}
          onSelectArgument={handleSelectArgument}
        />
      </TabsContent>
      <TabsContent value="topics" className="p-0">
        <TopicsContent
          topics={topics}
          allArguments={allArguments}
          selectedTopicArguments={selectedTopicArguments}
          entriesById={entriesById}
          selectedSubtopicId={selectedSubtopicId}
          selectedTopicId={selectedTopicId}
          onSelectTopic={handleSelectTopic}
          onSelectSubtopic={handleSelectSubtopic}
          expandedTopicGroupId={expandedTopicGroupId}
          onExpandTopicGroup={handleExpandTopicGroup}
          onSetArgumentsApproval={handleSetArgumentsApproval}
          onDeleteArgument={handleDeleteArgument}
          onToggleArgument={handleToggleArgument}
          onUpdateArgumentTopic={handleUpdateArgumentTopic}
          onUpdateArgumentSubtopic={handleUpdateArgumentSubtopic}
          onReviewArgumentClassification={handleReviewArgumentClassification}
          onSelectArgument={handleSelectArgument}
        />
      </TabsContent>
    </Tabs>
  );
};
