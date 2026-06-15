import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiRiskWarningsEntry } from './AiRiskWarningsEntry';

const mocks = vi.hoisted(() => ({
  outlineNodeId: 'leaf' as string | undefined,
  risks: [] as {
    id: string;
    is_deleted: boolean;
    status: string;
    vae_node_id: string;
  }[],
  selectedVaeNode: { id: 'leaf' } as { id: string } | null,
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({ verfahrenId: 'verfahren-1' }),
    useSearch: (input: {
      select: (search: { outlineNodeId?: string }) => unknown;
    }) => input.select({ outlineNodeId: mocks.outlineNodeId }),
  }),
  Link: (props: { children?: ReactNode }) => <a>{props.children}</a>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/db/nodes/hooks/useGraph', () => ({
  useGraph: () => ({ index: {} }),
}));

vi.mock('@/db/nodes/examinationGraphModel', () => ({
  getDescendantNodeRefsByType: (
    _index: unknown,
    startId: string,
    nodeType: string,
  ) =>
    mocks.risks
      .filter((risk) => risk.vae_node_id === startId)
      .map((risk) => ({ id: risk.id, node_type: nodeType })),
}));

vi.mock('@/db/nodes/hooks/useLiveNodes', () => ({
  useLiveNodes: (refs: { id: string }[]) => ({
    data: refs.flatMap((ref) =>
      mocks.risks.filter((risk) => risk.id === ref.id),
    ),
  }),
}));

vi.mock('../../workspace-state/RpbOutlineContext', () => ({
  useRpbVaeNodeUrlState: () => ({
    selectedVaeNode: mocks.selectedVaeNode,
    selectedVaeNodeId: mocks.outlineNodeId ?? '',
  }),
}));

vi.mock('./RiskWarningsStartAnalysisButton', () => ({
  RiskWarningsStartAnalysisButton: (props: { labelKey?: string }) => (
    <button type="button">
      {props.labelKey ?? 'riskWarnings.startAnalysis.label'}
    </button>
  ),
}));

describe('AiRiskWarningsEntry', () => {
  beforeEach(() => {
    mocks.outlineNodeId = 'leaf';
    mocks.selectedVaeNode = { id: 'leaf' };
    mocks.risks = [
      { id: 'risk-1', is_deleted: false, status: 'open', vae_node_id: 'leaf' },
      { id: 'risk-2', is_deleted: false, status: 'open', vae_node_id: 'other' },
      {
        id: 'risk-3',
        is_deleted: false,
        status: 'corrected',
        vae_node_id: 'leaf',
      },
      { id: 'risk-4', is_deleted: true, status: 'open', vae_node_id: 'leaf' },
    ];
  });

  afterEach(cleanup);

  it('shows the selected outline node open risk count without the AI start button when count is non-zero', () => {
    render(<AiRiskWarningsEntry />);

    expect(screen.getByText('riskWarnings.entryRow (1)')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'riskWarnings.startAnalysis.label',
      }),
    ).not.toBeInTheDocument();
  });

  it('shows the shared AI start button when the selected outline node has no risks', () => {
    mocks.risks = [
      {
        id: 'risk-other',
        is_deleted: false,
        status: 'open',
        vae_node_id: 'other',
      },
    ];

    render(<AiRiskWarningsEntry />);

    expect(screen.getByText('riskWarnings.entryRow (0)')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'riskWarnings.startAnalysis.label',
      }),
    ).toBeInTheDocument();
  });

  it('shows the restart label when the selected outline node has only non-open risks', () => {
    mocks.risks = [
      {
        id: 'risk-corrected',
        is_deleted: false,
        status: 'corrected',
        vae_node_id: 'leaf',
      },
    ];

    render(<AiRiskWarningsEntry />);

    expect(screen.getByText('riskWarnings.entryRow (0)')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'riskWarnings.startAnalysis.retryLabel',
      }),
    ).toBeInTheDocument();
  });

  it('hides the AI start button when the selected outline node does not resolve', () => {
    mocks.selectedVaeNode = null;

    render(<AiRiskWarningsEntry />);

    expect(screen.getByText('riskWarnings.entryRow (0)')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
