import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InfoCard } from './InfoCard';

describe('InfoCard', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders non-collapsible cards open without a persisted name', () => {
    render(
      <InfoCard
        body="Visible body"
        isCollapsible={false}
        title="Static warning"
        variant="warning"
      />,
    );

    expect(screen.getByText('Static warning')).toBeInTheDocument();
    expect(screen.getByText('Visible body')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('persists collapsible state under a variant-prefixed key', async () => {
    const user = userEvent.setup();

    render(
      <InfoCard
        body="Persistent body"
        isCollapsible
        name="test-card"
        title="Persistent warning"
        variant="warning"
      />,
    );

    const toggle = screen.getByRole('button', { name: 'Persistent warning' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Persistent body')).not.toBeInTheDocument();
    expect(
      window.localStorage.getItem('info-card:warning:test-card:collapsed'),
    ).toBe('true');
  });

  it('keeps collapsible interaction non-fatal when storage writes fail', async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });

    render(
      <InfoCard
        body="Storage failure body"
        isCollapsible
        name="storage-failure-card"
        title="Storage failure warning"
        variant="warning"
      />,
    );

    const toggle = screen.getByRole('button', {
      name: 'Storage failure warning',
    });

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Storage failure body')).toBeInTheDocument();
  });

  it('renders a custom leading icon in the header', () => {
    render(
      <InfoCard
        body="AI body"
        isCollapsible={false}
        leadingIcon={<span data-testid="custom-leading-icon">Icon</span>}
        title="AI card"
        variant="ai"
      />,
    );

    expect(screen.getByTestId('custom-leading-icon')).toBeInTheDocument();
  });
});
