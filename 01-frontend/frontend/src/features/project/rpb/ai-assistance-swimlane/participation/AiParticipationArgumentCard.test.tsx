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
    argumentId: 'A1',
    beteiligungsEingangId: 'entry-1',
    extractionPayload: null,
    compositeKey: toCompositeKey({
      id: overrides.id ?? 'argument-1',
      nodeType: 'argument',
    }),
    context: null,
    contextEndIdx: null,
    contextStartIdx: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    einordnung: null,
    endIdx: null,
    erwiderung: null,
    frontendParentIds: [],
    id: 'argument-1',
    inVae: false,
    isValidArgument: true,
    isDeleted: false,
    nodeType: 'argument',
    projectId: 'project-1',
    startIdx: null,
    status: 'open',
    topicConfidence: null,
    subTopicConfidence: null,
    subTopicId: null,
    text: 'Argument text',
    topicId: 'topic-1',
    updateType: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
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
        argument={argument({ inVae: true, isValidArgument: false })}
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
