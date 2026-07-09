import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SelectMenu } from './SelectMenu';

const ITEMS = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
];

afterEach(() => cleanup());

describe('SelectMenu', () => {
  it('wires ariaDescribedby to the trigger', () => {
    render(
      <SelectMenu
        items={ITEMS}
        value="a"
        onChange={() => {}}
        ariaDescribedby="hint-id"
      />,
    );
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-describedby',
      'hint-id',
    );
  });

  it('wires ariaLabelledBy to the trigger accessible name', () => {
    render(
      <>
        <span id="select-label">Project type</span>
        <SelectMenu
          items={ITEMS}
          value="a"
          onChange={() => {}}
          ariaLabelledBy="select-label"
        />
      </>,
    );

    expect(
      screen.getByRole('combobox', { name: 'Project type' }),
    ).toHaveAttribute('aria-labelledby', 'select-label');
  });

  it('marks the trigger aria-invalid when invalid is true', () => {
    render(<SelectMenu items={ITEMS} value="a" onChange={() => {}} invalid />);
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('does not set aria-invalid when invalid is false', () => {
    render(<SelectMenu items={ITEMS} value="a" onChange={() => {}} />);
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-invalid');
  });

  it('marks the trigger aria-required when required is true', () => {
    render(<SelectMenu items={ITEMS} value="a" onChange={() => {}} required />);
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-required',
      'true',
    );
  });

  it('disables the trigger when disabled is true', () => {
    render(<SelectMenu items={ITEMS} value="a" onChange={() => {}} disabled />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('applies the id to the trigger', () => {
    render(
      <SelectMenu items={ITEMS} value="a" onChange={() => {}} id="my-select" />,
    );
    expect(screen.getByRole('combobox')).toHaveAttribute('id', 'my-select');
  });

  it('calls onBlur when the menu closes', async () => {
    const user = userEvent.setup();
    const onBlur = vi.fn();

    render(
      <SelectMenu
        items={ITEMS}
        value="a"
        onChange={() => {}}
        onBlur={onBlur}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    await user.keyboard('{Escape}');

    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('does not call onBlur when trigger focus moves into the Radix portal wrapper', () => {
    const onBlur = vi.fn();
    const portalWrapper = document.createElement('div');
    portalWrapper.setAttribute('data-radix-popper-content-wrapper', '');
    const portalButton = document.createElement('button');
    portalWrapper.append(portalButton);
    document.body.append(portalWrapper);

    render(
      <SelectMenu
        items={ITEMS}
        value="a"
        onChange={() => {}}
        onBlur={onBlur}
      />,
    );

    fireEvent.blur(screen.getByRole('combobox'), {
      relatedTarget: portalButton,
    });

    expect(onBlur).not.toHaveBeenCalled();

    portalWrapper.remove();
  });
});
