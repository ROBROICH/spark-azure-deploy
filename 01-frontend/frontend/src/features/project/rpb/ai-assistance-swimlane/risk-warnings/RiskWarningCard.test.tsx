import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toCompositeKey } from '@/db/nodes/compositeKey';
import type { NodePayloadByType } from '@/db/nodes/types';
import { RiskWarningCard } from './RiskWarningCard';
import { RiskWarningsMutationProvider } from './RiskWarningsMutationContext';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const buildRisk = (
  overrides: Partial<NodePayloadByType<'risks'>>,
): NodePayloadByType<'risks'> => ({
  nodeType: 'risks',
  id: 'risk-1',
  compositeKey: toCompositeKey({ id: 'risk-1', nodeType: 'risks' }),
  vaeNodeId: 'vae-1',
  problem:
    'Im Beispielabschnitt fehlt ein Verweis auf die synthetische Kennung.',
  recommendation: 'Synthetische Kennung und Beispieldatum ergänzen.',
  quote: 'Dieser neutrale Beispielauszug bleibt absichtlich allgemein...',
  severity: 8,
  implication:
    'Eine synthetische Gegenposition könnte daraus abgeleitet werden...',
  status: 'open',
  projectId: 'project-1',
  isDeleted: false,
  isOutdated: false,
  frontendParentIds: [],
  projectVersion: 0,
  updateType: null,
  createdAt: '2026-05-12T00:00:00Z',
  updatedAt: '2026-05-12T00:00:00Z',
  ...overrides,
});

const renderRiskWarningCard = (
  risk: NodePayloadByType<'risks'>,
  options?: {
    canMutateProject?: boolean;
    hasTopicMutationRights?: (topicId: string) => boolean;
    onStatusChange?: (
      changedRisk: NodePayloadByType<'risks'>,
      nextStatus: NodePayloadByType<'risks'>['status'],
    ) => void;
    topicIdByVaeNodeId?: Map<string, string | null>;
  },
) => {
  const onStatusChange = options?.onStatusChange ?? vi.fn();

  render(
    <RiskWarningsMutationProvider
      canMutateProject={options?.canMutateProject ?? true}
      hasTopicMutationRights={options?.hasTopicMutationRights ?? (() => true)}
      onStatusChange={onStatusChange}
      topicIdByVaeNodeId={
        options?.topicIdByVaeNodeId ?? new Map([[risk.vaeNodeId, 'topic-1']])
      }
    >
      <RiskWarningCard risk={risk} />
    </RiskWarningsMutationProvider>,
  );

  return onStatusChange;
};

describe('RiskWarningCard', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders problem, implication, recommendation and the German-quoted quote', () => {
    const risk = buildRisk({});
    renderRiskWarningCard(risk);

    expect(screen.getAllByText(risk.problem).length).toBeGreaterThan(0);
    expect(screen.getByText(risk.implication)).toBeInTheDocument();
    expect(screen.getByText(risk.recommendation as string)).toBeInTheDocument();
    expect(screen.getByText(`„${risk.quote}“`)).toBeInTheDocument();
  });

  it('hides the action footer for non-open risks', () => {
    renderRiskWarningCard(buildRisk({ status: 'corrected' }));

    expect(
      screen.queryByText('riskWarnings.actions.dismiss'),
    ).not.toBeInTheDocument();
  });

  it('does not render a duplicate overflow action menu', () => {
    renderRiskWarningCard(buildRisk({ status: 'open' }));

    expect(
      screen.queryByRole('button', {
        name: 'riskWarnings.actions.moreOptionsAria',
      }),
    ).not.toBeInTheDocument();
  });

  it('renders the overflow menu with reopen action for non-open risks', async () => {
    const risk = buildRisk({ status: 'ignored' });
    const onStatusChange = renderRiskWarningCard(risk);

    await userEvent.click(
      screen.getByRole('button', {
        name: 'riskWarnings.actions.moreOptionsAria',
      }),
    );
    await userEvent.click(screen.getByText('riskWarnings.actions.reopen'));

    expect(onStatusChange).toHaveBeenCalledWith(risk, 'open');
  });

  it('invokes onStatusChange with `ignored` from the dismiss footer button', async () => {
    const risk = buildRisk({});
    const onStatusChange = renderRiskWarningCard(risk);

    await userEvent.click(
      screen.getByRole('button', { name: 'riskWarnings.actions.dismiss' }),
    );

    expect(onStatusChange).toHaveBeenCalledWith(risk, 'ignored');
  });

  it('disables status actions when mutation rights are missing', () => {
    const risk = buildRisk({});
    const onStatusChange = renderRiskWarningCard(risk, {
      hasTopicMutationRights: () => false,
    });

    expect(
      screen.getByRole('button', { name: 'riskWarnings.actions.dismiss' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', {
        name: 'riskWarnings.actions.markCorrected',
      }),
    ).toBeDisabled();
    expect(onStatusChange).not.toHaveBeenCalled();
  });
});
