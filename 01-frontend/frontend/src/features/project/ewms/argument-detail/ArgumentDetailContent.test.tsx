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
    node_type: 'argument',
    beteiligungs_eingang_id: 'entry-1',
    sub_topic_id: null,
    topic_id: 'topic-1',
    status: 'open',
    text: 'Argument text',
    start_idx: null,
    end_idx: null,
    erwiderung: 'Response text',
    einordnung: 'Classification text',
    context: null,
    context_start_idx: null,
    context_end_idx: null,
    argument_id: 'EXAMPLE-ARG-1',
    in_vae: false,
    is_valid_argument: true,
    project_id: 'project-1',
    is_deleted: false,
    frontend_parent_ids: [],
    update_type: null,
    created_at: '',
    updated_at: '',
    sys_period: null,
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
