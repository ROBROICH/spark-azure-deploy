import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { FileText, MessageSquare } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CollapsedGroup } from './CollapsedGroup';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => cleanup());

describe('CollapsedGroup landmarks', () => {
  const laneMetas = [
    {
      id: 'documents',
      title: 'Documents lane',
      icon: FileText,
      children: <div>Documents content</div>,
    },
    {
      id: 'comments',
      title: 'Comments lane',
      icon: MessageSquare,
      children: <div>Comments content</div>,
    },
  ] as const;

  it('labels the active lane tab panel via aria-labelledby on the matching tab trigger', () => {
    render(
      <CollapsedGroup
        laneMetas={[...laneMetas]}
        value="documents"
        onValueChange={() => {}}
        ariaLabel="Collapsed swimlanes"
      />,
    );

    const documentsTab = screen.getByRole('tab', { name: 'Documents lane' });
    const documentsPanel = screen.getByRole('tabpanel');

    expect(documentsPanel).toHaveAttribute(
      'aria-labelledby',
      documentsTab.getAttribute('id'),
    );
    expect(documentsPanel).toHaveTextContent('Documents content');
    expect(documentsTab).toHaveAccessibleName('Documents lane');
  });

  it('labels the active lane tab panel after switching tabs', () => {
    const { rerender } = render(
      <CollapsedGroup
        laneMetas={[...laneMetas]}
        value="documents"
        onValueChange={() => {}}
        ariaLabel="Collapsed swimlanes"
      />,
    );

    rerender(
      <CollapsedGroup
        laneMetas={[...laneMetas]}
        value="comments"
        onValueChange={() => {}}
        ariaLabel="Collapsed swimlanes"
      />,
    );

    const commentsTab = screen.getByRole('tab', { name: 'Comments lane' });
    const commentsPanel = screen.getByRole('tabpanel');

    expect(commentsPanel).toHaveAttribute(
      'aria-labelledby',
      commentsTab.getAttribute('id'),
    );
    expect(commentsPanel).toHaveTextContent('Comments content');
    expect(commentsTab).toHaveAccessibleName('Comments lane');
  });
});
