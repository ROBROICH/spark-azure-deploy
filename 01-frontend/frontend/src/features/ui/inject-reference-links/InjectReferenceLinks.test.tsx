import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  InjectReferenceLinks,
  type InjectReferenceMap,
} from './InjectReferenceLinks';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key === 'safeMarkdown.externalUrlTooltip'
        ? 'External link. The content has not been verified.'
        : key,
  }),
}));

const references: InjectReferenceMap = {
  '0001': {
    document_id: 'document-1',
    node_id: 'node-1',
    title: 'Source document',
    chunk_ids: ['chunk-1'],
    page_numbers: [1],
  },
};

afterEach(() => {
  cleanup();
});

describe('InjectReferenceLinks', () => {
  it('turns references outside markdown links into buttons', async () => {
    const user = userEvent.setup();
    const onReferenceClick = vi.fn();

    render(
      <InjectReferenceLinks
        references={references}
        text="Supported by [0001]."
        onReferenceClick={onReferenceClick}
      />,
    );

    const referenceButton = screen.getByRole('button', {
      name: '[0001] Source document',
    });
    await user.click(referenceButton);

    expect(onReferenceClick).toHaveBeenCalledWith({
      ...references['0001'],
      referenceId: '0001',
    });
  });

  it('keeps references inside markdown links as plain text', () => {
    render(
      <InjectReferenceLinks
        references={references}
        text="[See [0001]](https://example.test) and [0001]."
        onReferenceClick={vi.fn()}
      />,
    );

    expect(screen.getByText(/See \[0001\]/)).toBeVisible();
    expect(
      screen.getByRole('button', { name: '[0001] Source document' }),
    ).toBeVisible();
  });

  it('does not render anchors for markdown links', () => {
    const { container } = render(
      <InjectReferenceLinks
        references={references}
        text="[Example portal](https://example.test)"
        onReferenceClick={vi.fn()}
      />,
    );

    expect(screen.getByText(/Example portal/)).toHaveTextContent(
      'Example portal (https://example.test)',
    );
    expect(container.querySelector('a')).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain('href');
  });

  it('keeps raw URLs printable and unclickable', () => {
    const { container } = render(
      <InjectReferenceLinks
        references={references}
        text="Read https://example.test/status [0001]."
        format="text"
        onReferenceClick={vi.fn()}
      />,
    );

    expect(screen.getByText(/https:\/\/example\.test\/status/)).toBeVisible();
    expect(
      screen.getByRole('button', { name: '[0001] Source document' }),
    ).toBeVisible();
    expect(
      screen.getByLabelText(
        'External link. The content has not been verified.',
      ),
    ).toBeVisible();
    expect(container.querySelector('a')).not.toBeInTheDocument();
  });
});
