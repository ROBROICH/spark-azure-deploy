import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiDocumentsSection } from './AiDocumentsSection';

const testState = vi.hoisted(() => ({
  documents: [] as { filename: string; id: string }[],
  navigateMock: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useNavigate: () => testState.navigateMock,
    useSearch: () => ({ topicId: 'topic-1' }),
  }),
}));

vi.mock('@/db/nodes/hooks/useDescendantNodes', () => ({
  useDescendantNodes: () => ({
    data: testState.documents,
  }),
}));

vi.mock('@/features/ui/accordion/Accordion', () => ({
  AccordionContent: (props: { children?: ReactNode }) => (
    <div data-testid="documents-content">{props.children}</div>
  ),
  AccordionItem: (props: ComponentProps<'div'> & { value?: string }) => {
    const { children, className } = props;

    return <div className={className}>{children}</div>;
  },
}));

vi.mock('../shared/AiSectionTrigger', () => ({
  AiSectionTrigger: (props: { count: number }) => (
    <button type="button">Unterlagen ({props.count})</button>
  ),
}));

describe('AiDocumentsSection', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    testState.documents = [];
    testState.navigateMock.mockReset();
  });

  it('does not render an empty content wrapper when Unterlagen has no documents', () => {
    render(<AiDocumentsSection />);

    expect(
      screen.getByRole('button', { name: 'Unterlagen (0)' }),
    ).toBeVisible();
    expect(screen.queryByTestId('documents-content')).not.toBeInTheDocument();
  });

  it('renders document rows when Unterlagen has documents', () => {
    testState.documents = [
      {
        filename: 'uploads/document-one.pdf',
        id: 'document-1',
      },
    ];

    render(<AiDocumentsSection />);

    expect(
      screen.getByRole('button', { name: 'document-one.pdf' }),
    ).toBeVisible();
    expect(screen.getByTestId('documents-content')).not.toBeEmptyDOMElement();
  });
});
