import type { CompositeKey } from '@/db/nodes/compositeKey';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  EwmsArgumentNode,
  EwmsBeteiligungsEingang,
  EwmsObjectionListItem,
} from '../../data/ewms.nodes';
import { ObjectionsContent } from './ObjectionsContent';

const mocks = vi.hoisted(() => ({
  canMutateProject: true,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      values?: { approvedCount?: number; totalCount?: number },
    ) =>
      values
        ? `${key}:${values.approvedCount ?? ''}:${values.totalCount ?? ''}`
        : key,
  }),
}));

vi.mock(
  '@/features/access-control/project-permissions/useCanMutateProject',
  () => ({
    useCanMutateProject: () => ({
      canMutateProject: mocks.canMutateProject,
    }),
  }),
);

vi.mock('../arguments/ArgumentsList', () => ({
  ArgumentsList: () => <div data-testid="arguments-list" />,
}));

vi.mock('../preview/PreviewLanes', () => ({
  PreviewLanes: () => <div data-testid="preview-lanes" />,
}));

vi.mock('./ObjectionsList', () => ({
  ObjectionsList: () => <div data-testid="objections-list" />,
}));

const makeEntry = (): EwmsBeteiligungsEingang =>
  ({
    compositeKey: 'beteiligungs_eingang:entry-1' as CompositeKey,
    id: 'entry-1',
    nodeType: 'beteiligungs_eingang',
    beteiligungTyp: 'einwendung',
    fileId: 'file-1',
    filename: 'file-1.pdf',
    markdownId: null,
    extractionStatus: 'success',
    classificationStatus: 'done',
    projectId: 'project-1',
    isDeleted: false,
    isOutdated: false,
    frontendParentIds: [],
    projectVersion: 1,
    updateType: null,
    createdAt: '',
    updatedAt: '',
  }) satisfies EwmsBeteiligungsEingang;

const makeArgument = (): EwmsArgumentNode =>
  ({
    compositeKey: 'argument:argument-1' as CompositeKey,
    id: 'argument-1',
    nodeType: 'argument',
    beteiligungsEingangId: 'entry-1',
    extractionPayload: null,
    subTopicId: null,
    topicId: null,
    text: 'Argument',
    startIdx: null,
    endIdx: null,
    erwiderung: null,
    einordnung: null,
    context: null,
    contextStartIdx: null,
    contextEndIdx: null,
    argumentId: 'EXAMPLE-ARG-1',
    status: 'open',
    topicConfidence: null,
    subTopicConfidence: null,
    inVae: false,
    isValidArgument: true,
    projectId: 'project-1',
    isDeleted: false,
    frontendParentIds: [],
    updateType: null,
    createdAt: '',
    updatedAt: '',
  }) satisfies EwmsArgumentNode;

const renderObjectionsContent = (props?: {
  onSetArgumentsApproval?: (
    argumentsList: EwmsArgumentNode[],
    checked: boolean,
  ) => void;
}) => {
  const entry = makeEntry();
  const argument = makeArgument();
  const objections: EwmsObjectionListItem[] = [{ entry }];

  render(
    <ObjectionsContent
      objections={objections}
      isLoadingMoreObjections={false}
      selectedObjectionArguments={[argument]}
      selectedObjectionArgumentsLoading={false}
      allArguments={[argument]}
      entriesById={new Map([[entry.id, entry]])}
      topics={[]}
      filter={undefined}
      search={undefined}
      sort="nameAsc"
      onFilterChange={() => undefined}
      onSearchChange={() => undefined}
      onSortChange={() => undefined}
      selectedObjectionId={entry.id}
      onSelectObjection={() => undefined}
      onSetArgumentsApproval={
        props?.onSetArgumentsApproval ?? (() => undefined)
      }
      onDeleteArgument={() => undefined}
      onToggleArgument={() => undefined}
      onUpdateArgumentTopic={() => undefined}
      onUpdateArgumentSubtopic={() => undefined}
      onReviewArgumentClassification={() => undefined}
    />,
  );
};

afterEach(() => {
  mocks.canMutateProject = true;
  cleanup();
});

describe('ObjectionsContent permissions', () => {
  it('disables bulk approval when project mutation is denied', () => {
    mocks.canMutateProject = false;
    const onSetArgumentsApproval = vi.fn();

    renderObjectionsContent({ onSetArgumentsApproval });

    const bulkApprovalButton = screen.getByRole('button', {
      name: 'arguments.toggleLabel',
    });
    expect(bulkApprovalButton).toHaveProperty('disabled', true);

    fireEvent.click(bulkApprovalButton);

    expect(onSetArgumentsApproval).not.toHaveBeenCalled();
  });
});
