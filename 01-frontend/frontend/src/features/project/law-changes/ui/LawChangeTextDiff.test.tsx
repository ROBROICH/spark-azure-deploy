import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LawChangeTextDiff } from './LawChangeTextDiff';

describe('LawChangeTextDiff', () => {
  it('highlights removed text on the left and added text on the right', () => {
    const oldView = render(
      <LawChangeTextDiff
        previousText="Alpha Beta"
        nextText="Alpha Gamma"
        mode="old"
      />,
    );

    expect(screen.getByText('Beta').className).toContain('bg-red-200');
    expect(screen.queryByText('Gamma')).toBeNull();

    oldView.unmount();

    render(
      <LawChangeTextDiff
        previousText="Alpha Beta"
        nextText="Alpha Gamma"
        mode="new"
      />,
    );

    expect(screen.getByText('Gamma').className).toContain('bg-green-200');
    expect(screen.queryByText('Beta')).toBeNull();
  });
});
