import type { CompositeKey } from '@/db/nodes/compositeKey';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  EwmsArgumentNode,
  EwmsBeteiligungsEingang,
  EwmsTopicNode,
} from '../../data/ewms.nodes';
import { EWMS_ARGUMENT_STATUS_SUBTOPIC_REVIEWED } from '../../data/ewms.nodes';
import { ArgumentItemsList } from './ArgumentItemsList';

const mocks = vi.hoisted(() => ({
  canMutateProject: true,
  subtopicItemsByTopicId: new Map<string, { label: string; value: string }[]>(),
  virtualizedItemCount: null as number | null,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { referenceId?: string }) =>
      values?.referenceId ? `${key}:${values.referenceId}` : key,
  }),
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: {
    count: number;
    estimateSize: () => number;
    getItemKey?: (index: number) => string | number;
  }) => {
    const itemHeight = options.estimateSize();
    const virtualizedItemCount = mocks.virtualizedItemCount ?? options.count;
    const renderedItemCount = Math.min(virtualizedItemCount, options.count);

    return {
      getTotalSize: () => options.count * itemHeight,
      getVirtualItems: () =>
        Array.from({ length: renderedItemCount }).map((_, index) => ({
          index,
          key: options.getItemKey?.(index) ?? index,
          size: itemHeight,
          start: index * itemHeight,
        })),
      measureElement: vi.fn(),
    };
  },
}));

vi.mock(
  '@/features/access-control/project-permissions/useCanMutateProject',
  () => ({
    useCanMutateProject: () => ({
      canMutateProject: mocks.canMutateProject,
    }),
  }),
);

vi.mock('../EwmsSubtopicsContext', () => ({
  useEwmsSubtopics: () => ({
    getSubtopicItemsForTopic: (topicId: string | null | undefined) =>
      topicId ? (mocks.subtopicItemsByTopicId.get(topicId) ?? []) : [],
  }),
}));

vi.mock('@/features/ui/info-tooltip/InfoTooltip', () => ({
  InfoTooltip: (props: { ariaLabel: string }) => (
    <button type="button" aria-label={props.ariaLabel} />
  ),
}));

vi.mock('@/features/ui/select-menu/SelectMenu', () => ({
  SelectMenu: (props: {
    ariaLabel?: string;
    disabled?: boolean;
    items: { label: string; value: string }[];
    onChange: (value: string) => void;
    placeholder?: string;
    value: string;
  }) => {
    const selectedLabel = props.items.find(
      (item) => item.value === props.value,
    )?.label;

    return (
      <button
        type="button"
        aria-label={props.ariaLabel}
        disabled={props.disabled}
        onClick={() =>
          props.onChange(
            props.items.find((item) => item.value !== props.value)?.value ??
              'topic-2',
          )
        }
      >
        {selectedLabel ?? (props.value || props.placeholder)}
      </button>
    );
  },
}));

afterEach(() => {
  mocks.canMutateProject = true;
  mocks.subtopicItemsByTopicId.clear();
  mocks.virtualizedItemCount = null;
  cleanup();
});

const makeArgument = (overrides: Partial<EwmsArgumentNode> = {}) =>
  ({
    compositeKey: 'argument:argument-1' as CompositeKey,
    id: 'argument-1',
    nodeType: 'argument',
    beteiligungsEingangId: 'entry-1',
    extractionPayload: null,
    subTopicId: null,
    topicId: 'topic-1',
    status: 'open',
    topicConfidence: null,
    subTopicConfidence: null,
    text: 'Argument text',
    startIdx: null,
    endIdx: null,
    erwiderung: null,
    einordnung: null,
    context: null,
    contextStartIdx: null,
    contextEndIdx: null,
    argumentId: 'EXAMPLE-ARG-1',
    inVae: false,
    isValidArgument: true,
    projectId: 'project-1',
    isDeleted: false,
    frontendParentIds: [],
    updateType: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }) satisfies EwmsArgumentNode;

const makeEntry = () =>
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

const makeTopic = (
  id: string,
  name: string,
  overrides: Partial<EwmsTopicNode> = {},
) =>
  ({
    compositeKey: `topic:${id}` as CompositeKey,
    id,
    nodeType: 'topic',
    name,
    description: null,
    parentTopicId: null,
    mvpAssignee: null,
    mvpAssignees: [],
    showInMvp: true,
    showInEwm: true,
    showInBeschluss: true,
    projectId: 'project-1',
    isDeleted: false,
    frontendParentIds: [],
    updateType: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }) as unknown as EwmsTopicNode;

describe('ArgumentItemsList topic assignment', () => {
  it('renders only the virtualized argument items', () => {
    mocks.virtualizedItemCount = 3;
    const argumentsList = Array.from({ length: 20 }).map((_, index) =>
      makeArgument({
        compositeKey: `argument:argument-${index + 1}` as CompositeKey,
        id: `argument-${index + 1}`,
        argumentId: `FB-${String(index + 1).padStart(4, '0')}-A1`,
        text: `Argument text ${index + 1}`,
      }),
    );

    render(
      <ArgumentItemsList
        argumentsList={argumentsList}
        entriesById={new Map([['entry-1', makeEntry()]])}
        topics={[makeTopic('topic-1', 'Topic 1')]}
        onDeleteArgument={() => undefined}
        onToggleArgument={() => undefined}
        onUpdateArgumentTopic={() => undefined}
        onUpdateArgumentSubtopic={() => undefined}
        onReviewArgumentClassification={() => undefined}
      />,
    );

    expect(screen.getByText('Argument text 1')).toBeTruthy();
    expect(screen.getByText('Argument text 3')).toBeTruthy();
    expect(screen.queryByText('Argument text 4')).toBeNull();
  });

  it('uses the green success card without the AI badge only for done arguments', () => {
    const argument = makeArgument({ status: 'done' });
    const { container } = render(
      <ArgumentItemsList
        argumentsList={[argument]}
        entriesById={new Map([['entry-1', makeEntry()]])}
        topics={[makeTopic('topic-1', 'Topic 1')]}
        onDeleteArgument={() => undefined}
        onToggleArgument={() => undefined}
        onUpdateArgumentTopic={() => undefined}
        onUpdateArgumentSubtopic={() => undefined}
        onReviewArgumentClassification={() => undefined}
      />,
    );

    expect(
      container
        .querySelector('[data-slot="argument-card"]')
        ?.getAttribute('data-variant'),
    ).toBe('success');
    expect(
      screen.queryByRole('img', { name: 'aiSuggestionBadge.label' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: 'arguments.moreActionsLabel:EXAMPLE-ARG-1',
      }),
    ).toBeNull();
    expect(
      screen.getByRole('button', {
        name: 'arguments.deleteArgumentLabel:EXAMPLE-ARG-1',
      }),
    ).toBeTruthy();
  });

  it('allows topic changes for the selected argument card', () => {
    const argument = makeArgument();
    const onUpdateArgumentTopic = vi.fn();

    render(
      <ArgumentItemsList
        argumentsList={[argument]}
        entriesById={new Map([['entry-1', makeEntry()]])}
        topics={[
          makeTopic('topic-1', 'Topic 1'),
          makeTopic('topic-hidden', 'Hidden Topic', { showInEwm: false }),
          makeTopic('topic-2', 'Topic 2'),
        ]}
        onDeleteArgument={() => undefined}
        onToggleArgument={() => undefined}
        onUpdateArgumentTopic={onUpdateArgumentTopic}
        onUpdateArgumentSubtopic={() => undefined}
        onReviewArgumentClassification={() => undefined}
      />,
    );

    const topicSelect = screen.getByRole('button', {
      name: 'arguments.topicLabel:EXAMPLE-ARG-1',
    });

    expect(topicSelect).toHaveProperty('disabled', false);

    fireEvent.click(topicSelect);

    expect(onUpdateArgumentTopic).toHaveBeenCalledWith(argument, 'topic-2');
  });

  it('shows the selected subtopic from the selected topic options', () => {
    mocks.subtopicItemsByTopicId.set('topic-1', [
      { value: 'subtopic-1', label: 'Artenschutz' },
      { value: 'subtopic-2', label: 'Boden' },
    ]);
    const argument = makeArgument({ subTopicId: 'subtopic-2' });

    render(
      <ArgumentItemsList
        argumentsList={[argument]}
        entriesById={new Map([['entry-1', makeEntry()]])}
        topics={[makeTopic('topic-1', 'Topic 1')]}
        onDeleteArgument={() => undefined}
        onToggleArgument={() => undefined}
        onUpdateArgumentTopic={() => undefined}
        onUpdateArgumentSubtopic={() => undefined}
        onReviewArgumentClassification={() => undefined}
      />,
    );

    expect(
      screen.getByRole('button', {
        name: 'arguments.subtopicLabel:EXAMPLE-ARG-1',
      }).textContent,
    ).toBe('Boden');
  });

  it('shows response and classification badges from non-empty argument fields', () => {
    const argument = makeArgument({
      erwiderung: 'Response text',
      einordnung: '  ',
      inVae: true,
    });

    render(
      <ArgumentItemsList
        argumentsList={[argument]}
        entriesById={new Map([['entry-1', makeEntry()]])}
        topics={[makeTopic('topic-1', 'Topic 1')]}
        onDeleteArgument={() => undefined}
        onToggleArgument={() => undefined}
        onUpdateArgumentTopic={() => undefined}
        onUpdateArgumentSubtopic={() => undefined}
        onReviewArgumentClassification={() => undefined}
      />,
    );

    expect(
      screen
        .getByText('topicClassification.erwiderung')
        .closest('[data-slot="argument-status-badge"]')
        ?.getAttribute('data-state'),
    ).toBe('checked');
    expect(
      screen
        .getByText('topicClassification.einordnung')
        .closest('[data-slot="argument-status-badge"]')
        ?.getAttribute('data-state'),
    ).toBe('unchecked');
    expect(
      screen
        .getByText('arguments.inResolutionBadge')
        .closest('[data-slot="argument-status-badge"]')
        ?.getAttribute('data-state'),
    ).toBe('checked');
  });

  it('allows open classification review actions and approval', () => {
    const argument = makeArgument({ status: 'open' });
    const onReviewArgumentClassification = vi.fn();
    const onToggleArgument = vi.fn();

    const { container } = render(
      <ArgumentItemsList
        argumentsList={[argument]}
        entriesById={new Map([['entry-1', makeEntry()]])}
        topics={[makeTopic('topic-1', 'Topic 1')]}
        onDeleteArgument={() => undefined}
        onToggleArgument={onToggleArgument}
        onUpdateArgumentTopic={() => undefined}
        onUpdateArgumentSubtopic={() => undefined}
        onReviewArgumentClassification={onReviewArgumentClassification}
      />,
    );

    const acceptButton = screen.getByRole('button', {
      name: 'arguments.acceptClassificationLabel:EXAMPLE-ARG-1',
    });
    const rejectButton = screen.getByRole('button', {
      name: 'arguments.rejectClassificationLabel:EXAMPLE-ARG-1',
    });
    const approveButton = screen.getByRole('button', {
      name: 'arguments.approveArgumentLabel:EXAMPLE-ARG-1',
    });
    const controls = container.querySelector(
      '[data-slot="argument-classification-controls"]',
    );
    const statusRow = container.querySelector(
      '[data-slot="argument-status-row"]',
    );

    expect(acceptButton).toHaveProperty('disabled', false);
    expect(rejectButton).toHaveProperty('disabled', false);
    expect(approveButton).toHaveProperty('disabled', false);
    expect(statusRow?.contains(approveButton)).toBe(true);
    expect(controls?.contains(approveButton)).toBe(false);
    expect(controls?.classList.contains('bg-slate-100')).toBe(true);
    expect(controls?.classList.contains('p-1')).toBe(true);
    expect(controls?.classList.contains('inline-flex')).toBe(true);
    expect(controls?.classList.contains('w-fit')).toBe(true);
    expect(controls?.classList.contains('self-start')).toBe(true);
    expect(controls?.classList.contains('flex-wrap')).toBe(false);
    expect(controls?.classList.contains('w-full')).toBe(false);
    expect(controls?.classList.contains('flex-1')).toBe(false);

    fireEvent.click(acceptButton);
    fireEvent.click(rejectButton);
    fireEvent.click(approveButton);

    expect(onReviewArgumentClassification).toHaveBeenCalledWith(argument, true);
    expect(onReviewArgumentClassification).toHaveBeenCalledWith(
      argument,
      false,
    );
    expect(onToggleArgument).toHaveBeenCalledWith(argument);
  });

  it('disables mutation controls when project mutation is denied', () => {
    mocks.canMutateProject = false;
    const argument = makeArgument({ status: 'open' });
    const onReviewArgumentClassification = vi.fn();
    const onToggleArgument = vi.fn();
    const onDeleteArgument = vi.fn();
    const onUpdateArgumentTopic = vi.fn();
    const onUpdateArgumentSubtopic = vi.fn();

    render(
      <ArgumentItemsList
        argumentsList={[argument]}
        entriesById={new Map([['entry-1', makeEntry()]])}
        topics={[makeTopic('topic-1', 'Topic 1')]}
        onDeleteArgument={onDeleteArgument}
        onToggleArgument={onToggleArgument}
        onUpdateArgumentTopic={onUpdateArgumentTopic}
        onUpdateArgumentSubtopic={onUpdateArgumentSubtopic}
        onReviewArgumentClassification={onReviewArgumentClassification}
      />,
    );

    const topicSelect = screen.getByRole('button', {
      name: 'arguments.topicLabel:EXAMPLE-ARG-1',
    });
    const subtopicSelect = screen.getByRole('button', {
      name: 'arguments.subtopicLabel:EXAMPLE-ARG-1',
    });
    const acceptButton = screen.getByRole('button', {
      name: 'arguments.acceptClassificationLabel:EXAMPLE-ARG-1',
    });
    const rejectButton = screen.getByRole('button', {
      name: 'arguments.rejectClassificationLabel:EXAMPLE-ARG-1',
    });
    const approveButton = screen.getByRole('button', {
      name: 'arguments.approveArgumentLabel:EXAMPLE-ARG-1',
    });
    const deleteButton = screen.getByRole('button', {
      name: 'arguments.deleteArgumentLabel:EXAMPLE-ARG-1',
    });
    expect(topicSelect).toHaveProperty('disabled', true);
    expect(subtopicSelect).toHaveProperty('disabled', true);
    expect(acceptButton).toHaveProperty('disabled', true);
    expect(rejectButton).toHaveProperty('disabled', true);
    expect(approveButton).toHaveProperty('disabled', true);
    expect(deleteButton).toHaveProperty('disabled', true);

    fireEvent.click(topicSelect);
    fireEvent.click(subtopicSelect);
    fireEvent.click(acceptButton);
    fireEvent.click(rejectButton);
    fireEvent.click(approveButton);
    fireEvent.click(deleteButton);

    expect(onUpdateArgumentTopic).not.toHaveBeenCalled();
    expect(onUpdateArgumentSubtopic).not.toHaveBeenCalled();
    expect(onReviewArgumentClassification).not.toHaveBeenCalled();
    expect(onToggleArgument).not.toHaveBeenCalled();
    expect(onDeleteArgument).not.toHaveBeenCalled();
  });

  it('confirms before deleting an argument', () => {
    const argument = makeArgument();
    const onDeleteArgument = vi.fn();

    render(
      <ArgumentItemsList
        argumentsList={[argument]}
        entriesById={new Map([['entry-1', makeEntry()]])}
        topics={[makeTopic('topic-1', 'Topic 1')]}
        onDeleteArgument={onDeleteArgument}
        onToggleArgument={() => undefined}
        onUpdateArgumentTopic={() => undefined}
        onUpdateArgumentSubtopic={() => undefined}
        onReviewArgumentClassification={() => undefined}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'arguments.deleteArgumentLabel:EXAMPLE-ARG-1',
      }),
    );

    expect(onDeleteArgument).not.toHaveBeenCalled();
    expect(
      screen.getByRole('heading', { name: 'arguments.deleteDialog.title' }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: 'arguments.deleteDialog.confirm' }),
    );

    expect(onDeleteArgument).toHaveBeenCalledWith(argument);
  });

  it('hides classification accept and reject actions after topic review', () => {
    const argument = makeArgument({
      status: EWMS_ARGUMENT_STATUS_SUBTOPIC_REVIEWED,
    });

    const { container } = render(
      <ArgumentItemsList
        argumentsList={[argument]}
        entriesById={new Map([['entry-1', makeEntry()]])}
        topics={[makeTopic('topic-1', 'Topic 1')]}
        onDeleteArgument={() => undefined}
        onToggleArgument={() => undefined}
        onUpdateArgumentTopic={() => undefined}
        onUpdateArgumentSubtopic={() => undefined}
        onReviewArgumentClassification={() => undefined}
      />,
    );

    expect(
      screen.queryByRole('button', {
        name: 'arguments.acceptClassificationLabel:EXAMPLE-ARG-1',
      }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: 'arguments.rejectClassificationLabel:EXAMPLE-ARG-1',
      }),
    ).toBeNull();
    expect(
      container
        .querySelector('[data-slot="argument-classification-controls"]')
        ?.classList.contains('bg-slate-100'),
    ).toBe(false);
  });

  it('shows the topic uncertainty warning only while classification review is open', () => {
    const listProps = {
      entriesById: new Map([['entry-1', makeEntry()]]),
      topics: [makeTopic('topic-1', 'Topic 1')],
      onDeleteArgument: () => undefined,
      onToggleArgument: () => undefined,
      onUpdateArgumentTopic: () => undefined,
      onUpdateArgumentSubtopic: () => undefined,
      onReviewArgumentClassification: () => undefined,
    };

    const { rerender } = render(
      <ArgumentItemsList
        {...listProps}
        argumentsList={[
          makeArgument({
            topicConfidence: 0.4,
            subTopicConfidence: 0.8,
          }),
        ]}
      />,
    );

    expect(
      screen.getByRole('button', {
        name: 'arguments.classificationUncertainTopic',
      }),
    ).toBeTruthy();

    rerender(
      <ArgumentItemsList
        {...listProps}
        argumentsList={[
          makeArgument({
            topicConfidence: 0.4,
            subTopicConfidence: 0.4,
          }),
        ]}
      />,
    );
    expect(
      screen.getByRole('button', {
        name: 'arguments.classificationUncertainBoth',
      }),
    ).toBeTruthy();

    rerender(
      <ArgumentItemsList
        {...listProps}
        argumentsList={[
          makeArgument({
            topicConfidence: 0.8,
            subTopicConfidence: 0.4,
          }),
        ]}
      />,
    );
    expect(
      screen.getByRole('button', {
        name: 'arguments.classificationUncertainSubtopic',
      }),
    ).toBeTruthy();

    rerender(
      <ArgumentItemsList
        {...listProps}
        argumentsList={[
          makeArgument({
            topicConfidence: 0.75,
            subTopicConfidence: null,
          }),
        ]}
      />,
    );
    expect(
      screen.queryByRole('button', {
        name: 'arguments.classificationUncertainTopic',
      }),
    ).toBeNull();

    rerender(
      <ArgumentItemsList
        {...listProps}
        argumentsList={[
          makeArgument({
            status: EWMS_ARGUMENT_STATUS_SUBTOPIC_REVIEWED,
            topicConfidence: 0.4,
            subTopicConfidence: 0.4,
          }),
        ]}
      />,
    );
    expect(
      screen.queryByRole('button', {
        name: 'arguments.classificationUncertainBoth',
      }),
    ).toBeNull();
  });
});
