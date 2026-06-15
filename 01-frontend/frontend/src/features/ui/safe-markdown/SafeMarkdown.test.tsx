import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SafeMarkdown } from './SafeMarkdown';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key === 'safeMarkdown.externalUrlTooltip'
        ? 'External link. The content has not been verified.'
        : key,
  }),
}));

afterEach(() => {
  cleanup();
});

describe('SafeMarkdown', () => {
  it('renders allowed markdown elements', () => {
    render(
      <SafeMarkdown>
        {[
          '# Heading',
          'Paragraph with **strong** and _emphasis_.',
          '',
          '- First',
          '- Second',
          '',
          '> Quote',
          '',
          '`code`',
        ].join('\n')}
      </SafeMarkdown>,
    );

    expect(screen.getByRole('heading', { name: 'Heading' })).toBeVisible();
    expect(screen.getByText('strong')).toBeVisible();
    expect(screen.getByText('emphasis')).toBeVisible();
    expect(screen.getByText('First')).toBeVisible();
    expect(screen.getByText('Quote')).toBeVisible();
    expect(screen.getByText('code')).toBeVisible();
  });

  it('renders GFM tables', () => {
    const { container } = render(
      <SafeMarkdown>
        {['| Name | Count |', '| --- | ---: |', '| Open | 2 |'].join('\n')}
      </SafeMarkdown>,
    );

    expect(container.querySelector('table')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeVisible();
  });

  it('blocks raw HTML and images', () => {
    const { container } = render(
      <SafeMarkdown hrefMode="escape">
        {[
          'Safe text remains.',
          '',
          '<script>alert("xss")</script>',
          '<img src="x" onerror="alert(1)" />',
          '<p onclick="alert(1)">Injected HTML</p>',
          '![tracking pixel](https://example.test/pixel.png)',
        ].join('\n')}
      </SafeMarkdown>,
    );

    expect(screen.getByText('Safe text remains.')).toBeVisible();
    expect(container.querySelector('script')).not.toBeInTheDocument();
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(screen.queryByText('tracking pixel')).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain('onerror');
    expect(container.innerHTML).not.toContain('onclick');
  });

  it('removes markdown link labels and anchors in remove mode', () => {
    const { container } = render(
      <SafeMarkdown hrefMode="remove">
        {'Before [unsafe link](https://example.test) after.'}
      </SafeMarkdown>,
    );

    expect(screen.queryByText('unsafe link')).not.toBeInTheDocument();
    expect(container.querySelector('a')).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain('href');
  });

  it('prints safe markdown links without anchors in escape mode', () => {
    const { container } = render(
      <SafeMarkdown hrefMode="escape">
        {[
          '[Example portal](https://example.test)',
          '[https://example.test](https://example.test)',
          '[Danger](javascript:alert(1))',
        ].join('\n\n')}
      </SafeMarkdown>,
    );

    expect(screen.getByText(/Example portal/)).toHaveTextContent(
      'Example portal (https://example.test)',
    );
    expect(
      container.textContent.match(/https:\/\/example\.test/g),
    ).toHaveLength(2);
    expect(screen.getByText('Danger')).toBeVisible();
    expect(container.querySelector('a')).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain('href');
    expect(container.innerHTML).not.toContain('javascript:');
  });

  it('marks raw external URLs in escape mode with an informational indicator', () => {
    const { container } = render(
      <SafeMarkdown hrefMode="escape">
        {'Read https://example.test/status before continuing.'}
      </SafeMarkdown>,
    );

    expect(screen.getByText(/https:\/\/example\.test\/status/)).toBeVisible();
    expect(
      screen.getByLabelText(
        'External link. The content has not been verified.',
      ),
    ).toBeVisible();
    expect(container.querySelector('a')).not.toBeInTheDocument();
  });

  it('keeps inline code and code blocks literal', () => {
    render(
      <SafeMarkdown hrefMode="escape">
        {[
          '`https://example.test/[0001]`',
          '',
          '```txt',
          '[Label](https://example.test) and https://example.test',
          '```',
        ].join('\n')}
      </SafeMarkdown>,
    );

    expect(screen.getByText('https://example.test/[0001]')).toBeVisible();
    expect(
      screen.getByText(
        '[Label](https://example.test) and https://example.test',
      ),
    ).toBeVisible();
    expect(
      screen.queryByLabelText(
        'External link. The content has not been verified.',
      ),
    ).not.toBeInTheDocument();
  });
});
