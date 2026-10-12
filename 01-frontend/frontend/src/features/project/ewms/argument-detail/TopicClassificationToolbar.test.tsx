import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { CompositeKey } from '@/db/nodes/compositeKey';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { EwmsArgumentNode, EwmsTopicNode } from '../data/ewms.nodes';
import { TopicClassificationToolbar } from './TopicClassificationToolbar';

// Stub `matchMedia` for `useBelowLg`; tests target the wide code path.
beforeAll(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

const mocks = vi.hoisted(() => ({
  canMutateProject: true,
  subtopicItemsByTopicId: new Map<string, { label: string; value: string }[]>(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { referenceId?: string }) =>
      values?.referenceId ? `${key}:${values.referenceId}` : key,
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

vi.mock('../workspace/EwmsSubtopicsContext', () => ({
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

afterEach(() => {
  mocks.canMutateProject = true;
  mocks.subtopicItemsByTopicId.clear();
  cleanup();
});

describe('TopicClassificationToolbar review actions', () => {
  it('excludes topics hidden from EWMS from topic assignment options', () => {
    const onTopicIdChange = vi.fn();

    render(
      <TopicClassificationToolbar
        referenceId="EXAMPLE-ARG-1"
        argumentStatus="open"
        topics={[
          makeTopic('topic-1', 'Topic 1'),
          makeTopic('topic-hidden', 'Hidden Topic', { showInEwm: false }),
          makeTopic('topic-2', 'Topic 2'),
        ]}
        topicId="topic-1"
        subtopicId=""
        argument={makeArgument()}
        isTopicReviewOpen
        isApproved={false}
        onBack={() => undefined}
        onTopicIdChange={onTopicIdChange}
        onSubtopicIdChange={() => undefined}
        onAcceptClassification={() => undefined}
        onRejectClassification={() => undefined}
        onToggleApproval={() => undefined}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'topicClassification.topicNameLabel',
      }),
    );

    expect(onTopicIdChange).toHaveBeenCalledWith('topic-2');
  });

  it('disables mutation controls when project mutation is denied', () => {
    mocks.canMutateProject = false;
    const onAcceptClassification = vi.fn();
    const onRejectClassification = vi.fn();
    const onToggleApproval = vi.fn();
    const onTopicIdChange = vi.fn();
    const onSubtopicIdChange = vi.fn();

    render(
      <TopicClassificationToolbar
        referenceId="EXAMPLE-ARG-1"
        argumentStatus="open"
        topics={[makeTopic('topic-1', 'Topic 1')]}
        topicId="topic-1"
        subtopicId=""
        argument={makeArgument()}
        isTopicReviewOpen
        isApproved={false}
        onBack={() => undefined}
        onTopicIdChange={onTopicIdChange}
        onSubtopicIdChange={onSubtopicIdChange}
        onAcceptClassification={onAcceptClassification}
        onRejectClassification={onRejectClassification}
        onToggleApproval={onToggleApproval}
      />,
    );

    const topicSelect = screen.getByRole('button', {
      name: 'topicClassification.topicNameLabel',
    });
    const subtopicSelect = screen.getByRole('button', {
      name: 'topicClassification.subtopicNameLabel',
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
    const backButton = screen.getByRole('button', {
      name: 'topicClassification.back',
    });

    expect(topicSelect).toHaveProperty('disabled', true);
    expect(subtopicSelect).toHaveProperty('disabled', true);
    expect(acceptButton).toHaveProperty('disabled', true);
    expect(rejectButton).toHaveProperty('disabled', true);
    expect(approveButton).toHaveProperty('disabled', true);
    expect(backButton).toHaveProperty('disabled', false);

    fireEvent.click(topicSelect);
    fireEvent.click(subtopicSelect);
    fireEvent.click(acceptButton);
    fireEvent.click(rejectButton);
    fireEvent.click(approveButton);

    expect(onTopicIdChange).not.toHaveBeenCalled();
    expect(onSubtopicIdChange).not.toHaveBeenCalled();
    expect(onAcceptClassification).not.toHaveBeenCalled();
    expect(onRejectClassification).not.toHaveBeenCalled();
    expect(onToggleApproval).not.toHaveBeenCalled();
  });

  it('shows the selected subtopic from the selected topic options', () => {
    mocks.subtopicItemsByTopicId.set('topic-1', [
      { value: 'subtopic-1', label: 'Artenschutz' },
      { value: 'subtopic-2', label: 'Boden' },
    ]);

    render(
      <TopicClassificationToolbar
        referenceId="EXAMPLE-ARG-1"
        argumentStatus="open"
        topics={[makeTopic('topic-1', 'Topic 1')]}
        topicId="topic-1"
        subtopicId="subtopic-2"
        argument={makeArgument()}
        isTopicReviewOpen
        isApproved={false}
        onBack={() => undefined}
        onTopicIdChange={() => undefined}
        onSubtopicIdChange={() => undefined}
        onAcceptClassification={() => undefined}
        onRejectClassification={() => undefined}
        onToggleApproval={() => undefined}
      />,
    );

    expect(
      screen.getByRole('button', {
        name: 'topicClassification.subtopicNameLabel',
      }).textContent,
    ).toBe('Boden');
  });

  it('shows the uncertainty warning only while classification review is open', () => {
    const toolbarProps = {
      referenceId: 'EXAMPLE-ARG-1',
      argumentStatus: 'open' as const,
      topics: [makeTopic('topic-1', 'Topic 1')],
      topicId: 'topic-1',
      subtopicId: '',
      argument: makeArgument(),
      isApproved: false,
      onBack: () => undefined,
      onTopicIdChange: () => undefined,
      onSubtopicIdChange: () => undefined,
      onAcceptClassification: () => undefined,
      onRejectClassification: () => undefined,
      onToggleApproval: () => undefined,
    };

    const { rerender } = render(
      <TopicClassificationToolbar
        {...toolbarProps}
        isTopicReviewOpen
        argument={makeArgument({
          topicConfidence: 0.4,
          subTopicConfidence: 0.8,
        })}
      />,
    );
    expect(
      screen.getByRole('button', {
        name: 'arguments.classificationUncertainTopic',
      }),
    ).toBeTruthy();

    rerender(
      <TopicClassificationToolbar
        {...toolbarProps}
        isTopicReviewOpen
        argument={makeArgument({
          topicConfidence: 0.4,
          subTopicConfidence: 0.4,
        })}
      />,
    );
    expect(
      screen.getByRole('button', {
        name: 'arguments.classificationUncertainBoth',
      }),
    ).toBeTruthy();

    rerender(
      <TopicClassificationToolbar
        {...toolbarProps}
        isTopicReviewOpen
        argument={makeArgument({
          topicConfidence: 0.8,
          subTopicConfidence: 0.4,
        })}
      />,
    );
    expect(
      screen.getByRole('button', {
        name: 'arguments.classificationUncertainSubtopic',
      }),
    ).toBeTruthy();

    rerender(
      <TopicClassificationToolbar
        {...toolbarProps}
        isTopicReviewOpen
        argument={makeArgument({
          topicConfidence: 0.75,
          subTopicConfidence: null,
        })}
      />,
    );
    expect(
      screen.queryByRole('button', {
        name: 'arguments.classificationUncertainTopic',
      }),
    ).toBeNull();

    rerender(
      <TopicClassificationToolbar
        {...toolbarProps}
        argumentStatus="subtopic_reviewed"
        isTopicReviewOpen={false}
        argument={makeArgument({
          status: 'subtopic_reviewed',
          topicConfidence: 0.4,
          subTopicConfidence: 0.4,
        })}
      />,
    );
    expect(
      screen.queryByRole('button', {
        name: 'arguments.classificationUncertainBoth',
      }),
    ).toBeNull();
  });
});
