import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Badge } from './Badge';

afterEach(() => {
  cleanup();
});

describe('Badge', () => {
  it('slots a single child element when rendered asChild', () => {
    render(
      <Badge asChild variant="secondary" size="small">
        <button type="button">N</button>
      </Badge>,
    );

    expect(screen.getByRole('button', { name: 'N' }).dataset.slot).toBe(
      'badge',
    );
  });
});
