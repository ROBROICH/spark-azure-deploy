import type { CompositeKey } from '@/db/nodes/compositeKey';
import {
  resetProjectPermissionTestMocks,
  setProjectCanMutate,
} from '@/features/project/test/projectPermissionTestMocks';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { EwmsArgumentNode } from '../data/ewms.nodes';
import { ArgumentDetailContent } from './ArgumentDetailContent';

const makeArgument = () =>
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
    erwiderung: 'Response text',
    einordnung: 'Classification text',
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
  }) satisfies EwmsArgumentNode;

afterEach(() => {
  resetProjectPermissionTestMocks();
  cleanup();
});

describe('ArgumentDetailContent permissions', () => {
  it('disables the einordnung textarea when project mutation is denied', () => {
    setProjectCanMutate(false);

    render(
      <ArgumentDetailContent
        argument={makeArgument()}
        argumentDraft="Argument text"
        contextDraft="Context text"
        classificationDraft="Classification text"
        onArgumentDraftChange={() => undefined}
        onArgumentDraftCommit={() => undefined}
        onContextDraftChange={() => undefined}
        onContextDraftCommit={() => undefined}
        onClassificationDraftChange={() => undefined}
        onClassificationDraftCommit={() => undefined}
      />,
    );

    const textarea = screen.getByRole('textbox', {
      name: 'topicClassification.einordnung',
    });

    expect(textarea).toHaveProperty('disabled', true);
  });

  it('disables argument and context textareas when project mutation is denied', () => {
    setProjectCanMutate(false);

    render(
      <ArgumentDetailContent
        argument={makeArgument()}
        argumentDraft="Argument text"
        contextDraft="Context text"
        classificationDraft="Classification text"
        onArgumentDraftChange={() => undefined}
        onArgumentDraftCommit={() => undefined}
        onContextDraftChange={() => undefined}
        onContextDraftCommit={() => undefined}
        onClassificationDraftChange={() => undefined}
        onClassificationDraftCommit={() => undefined}
      />,
    );

    const argumentTextarea = screen.getByRole('textbox', {
      name: 'topicClassification.argument',
    });
    const contextTextarea = screen.getByRole('textbox', {
      name: 'topicClassification.contextLabel',
    });

    expect(argumentTextarea).toHaveProperty('disabled', true);
    expect(contextTextarea).toHaveProperty('disabled', true);
  });
});
