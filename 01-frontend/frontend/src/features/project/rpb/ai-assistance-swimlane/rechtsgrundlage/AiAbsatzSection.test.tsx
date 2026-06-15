import '@testing-library/jest-dom/vitest';
import type { NodeRefByType } from '@/db/nodes/types';
import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiAbsatzSection } from './AiAbsatzSection';

const mocks = vi.hoisted(() => ({
  aiSatzRowMock: vi.fn(),
}));

vi.mock('@/features/ui/accordion/Accordion', () => ({
  Accordion: (props: ComponentProps<'div'> & { children?: ReactNode }) => (
    <div data-testid="accordion">{props.children}</div>
  ),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useNavigate: () => vi.fn(),
  }),
}));

vi.mock('@/features/feedback/useFeedbackLookup', () => ({
  useFeedbackLookup: () => ({
    getFeedbackForTarget: () => ({ feedback: null, feedbackRef: null }),
  }),
}));

vi.mock('@/db/nodes/hooks/useDescendants', () => ({
  useDescendants: () => [
    { id: 'satz-late', node_type: 'satz' },
    { id: 'satz-missing-position', node_type: 'satz' },
    { id: 'satz-early', node_type: 'satz' },
  ],
}));

vi.mock('@/db/nodes/hooks/useNodes', () => ({
  useNodes: () => ({
    data: [
      {
        id: 'satz-late',
        node_type: 'satz',
        position: 20,
      },
      {
        id: 'satz-early',
        node_type: 'satz',
        position: 10,
      },
      {
        id: 'satz-missing-position',
        node_type: 'satz',
        position: null,
      },
    ],
  }),
}));

vi.mock('./AiSatzRow', () => ({
  AiSatzRow: (props: {
    satzRef: NodeRefByType<'satz'>;
    showDivider: boolean;
  }) => {
    mocks.aiSatzRowMock(props);

    return (
      <div data-testid="satz-row">
        {props.satzRef.id}:{String(props.showDivider)}
      </div>
    );
  },
  AiSatzRowSkeleton: (props: { showDivider: boolean }) => (
    <div data-testid="satz-row-skeleton">{String(props.showDivider)}</div>
  ),
}));

describe('AiAbsatzSection', () => {
  afterEach(() => {
    cleanup();
    mocks.aiSatzRowMock.mockReset();
  });

  it('renders sentence rows sorted by position', () => {
    render(
      <AiAbsatzSection
        absatzRef={{ id: 'absatz-1', node_type: 'absatz' }}
        hasMultipleAbsaetze={false}
        showDivider={false}
      />,
    );

    expect(screen.getAllByTestId('satz-row')).toHaveLength(3);
    expect(
      screen.getAllByTestId('satz-row').map((row) => row.textContent),
    ).toEqual([
      'satz-early:false',
      'satz-late:true',
      'satz-missing-position:true',
    ]);
  });
});
