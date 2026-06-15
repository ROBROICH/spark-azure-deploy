import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toCompositeKey } from '@/db/nodes/compositeKey';
import type { RpbArgumentNode } from './rpbParticipationArguments';
import { AiParticipationArgumentCard } from './AiParticipationArgumentCard';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/features/ui/ai-suggestion-badge/AiSuggestionBadge', () => ({
  AiSuggestionBadge: () => <span>ai</span>,
}));

const argument = (overrides: Partial<RpbArgumentNode> = {}): RpbArgumentNode =>
  ({
    argument_id: 'A1',
    beteiligungs_eingang_id: 'entry-1',
    compositeKey: toCompositeKey({
      id: overrides.id ?? 'argument-1',
      node_type: 'argument',
    }),
    context: null,
    context_end_idx: null,
    context_start_idx: null,
    created_at: '2026-01-01T00:00:00.000Z',
    einordnung: null,
    end_idx: null,
    erwiderung: null,
    frontend_parent_ids: [],
    id: 'argument-1',
    in_vae: false,
    is_valid_argument: true,
    is_deleted: false,
    node_type: 'argument',
    project_id: 'project-1',
    start_idx: null,
    status: 'open',
    sub_topic_id: null,
    sys_period: null,
    text: 'Argument text',
    topic_id: 'topic-1',
    update_type: null,
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) satisfies RpbArgumentNode;

describe('AiParticipationArgumentCard', () => {
  afterEach(cleanup);

  it('renders a toggle button for valid arguments', async () => {
    const toggle = vi.fn();

    render(
      <AiParticipationArgumentCard
        argument={argument()}
        canMutate
        onToggleInBeschluss={toggle}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', {
        name: /aiAssistance\.participationDetailStatus\.addToBeschluss/,
      }),
    );

    expect(toggle).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'argument-1' }),
    );
  });

  it('hides the action for invalid arguments even when already in_vae', () => {
    render(
      <AiParticipationArgumentCard
        argument={argument({ in_vae: true, is_valid_argument: false })}
        canMutate
        onToggleInBeschluss={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(
      screen.queryByText('aiAssistance.participationDetailStatus.imBeschluss'),
    ).not.toBeInTheDocument();
  });

  it('disables the action and does not toggle when mutation is unavailable', async () => {
    const toggle = vi.fn();

    render(
      <AiParticipationArgumentCard
        argument={argument()}
        canMutate={false}
        onToggleInBeschluss={toggle}
      />,
    );

    const action = screen.getByRole('button', {
      name: /aiAssistance\.participationDetailStatus\.addToBeschluss/,
    });

    expect(action).toBeDisabled();

    await userEvent.click(action);

    expect(toggle).not.toHaveBeenCalled();
  });
});
