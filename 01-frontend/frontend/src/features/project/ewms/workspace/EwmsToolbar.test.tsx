import {
  resetProjectPermissionTestMocks,
  setProjectCanMutate,
} from '@/features/project/test/projectPermissionTestMocks';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tabs } from '@/features/ui/tabs/Tabs';
import { EwmsToolbar } from './EwmsToolbar';

const stubViewportWidth = (matchesMobile: boolean) => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matchesMobile,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
};

const renderToolbar = (
  props: Partial<Parameters<typeof EwmsToolbar>[0]> = {},
) =>
  render(
    <Tabs value="sender">
      <EwmsToolbar checkedCount={1} totalCount={2} {...props} />
    </Tabs>,
  );

afterEach(() => {
  resetProjectPermissionTestMocks();
  vi.unstubAllGlobals();
  cleanup();
});

describe('EwmsToolbar permissions', () => {
  it('disables mutating toolbar actions when project mutation is denied', () => {
    stubViewportWidth(false);
    setProjectCanMutate(false);
    const onResponseImport = vi.fn();
    const onNachreichen = vi.fn();
    const onExport = vi.fn();

    renderToolbar({ onExport, onNachreichen, onResponseImport });

    const responseImportButton = screen.getByRole('button', {
      name: 'toolbar.importResponses',
    });
    const nachreichenButton = screen.getByRole('button', {
      name: 'toolbar.submitAdditionally',
    });
    const exportButton = screen.getByRole('button', {
      name: 'toolbar.export',
    });

    expect(responseImportButton).toHaveProperty('disabled', true);
    expect(nachreichenButton).toHaveProperty('disabled', true);
    expect(exportButton).toHaveProperty('disabled', true);

    fireEvent.click(responseImportButton);
    fireEvent.click(nachreichenButton);
    fireEvent.click(exportButton);

    expect(onResponseImport).not.toHaveBeenCalled();
    expect(onNachreichen).not.toHaveBeenCalled();
    expect(onExport).not.toHaveBeenCalled();
  });

  it('keeps existing loading states enabled for authorized users', () => {
    stubViewportWidth(false);
    renderToolbar({ isExporting: true, isNachreichenLoading: true });

    const nachreichenButton = screen.getByRole('button', {
      name: 'toolbar.submitAdditionally',
    });

    expect(nachreichenButton).toHaveProperty('disabled', true);
    expect(nachreichenButton.getAttribute('aria-busy')).toBe('true');
    expect(
      screen.getByRole('button', { name: 'toolbar.export' }),
    ).toHaveProperty('disabled', true);
    expect(
      screen.getByRole('button', { name: 'toolbar.importResponses' }),
    ).toHaveProperty('disabled', false);
    expect(
      screen.queryByText('toolbar.processingAdditionalObjections'),
    ).toBeNull();
  });
});

describe('EwmsToolbar compact mode', () => {
  it('collapses the three actions into an overflow menu on narrow viewports', async () => {
    stubViewportWidth(true);
    const user = userEvent.setup();
    const onResponseImport = vi.fn();
    const onNachreichen = vi.fn();
    const onExport = vi.fn();

    renderToolbar({ onExport, onNachreichen, onResponseImport });

    // Wide-mode buttons must not exist.
    expect(
      screen.queryByRole('button', { name: 'toolbar.importResponses' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'toolbar.submitAdditionally' }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'toolbar.export' })).toBeNull();

    const trigger = screen.getByRole('button', {
      name: 'toolbar.moreActionsAriaLabel',
    });
    await user.click(trigger);

    await user.click(
      screen.getByRole('menuitem', { name: /toolbar\.importResponses/u }),
    );
    expect(onResponseImport).toHaveBeenCalledTimes(1);

    await user.click(trigger);
    await user.click(
      screen.getByRole('menuitem', { name: /toolbar\.submitAdditionally/u }),
    );
    expect(onNachreichen).toHaveBeenCalledTimes(1);

    await user.click(trigger);
    await user.click(
      screen.getByRole('menuitem', { name: /toolbar\.export/u }),
    );
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('reflects loading and disabled states on menu items', async () => {
    stubViewportWidth(true);
    const user = userEvent.setup();

    renderToolbar({ isExporting: true, isNachreichenLoading: true });

    await user.click(
      screen.getByRole('button', {
        name: 'toolbar.moreActionsAriaLabel',
      }),
    );

    const nachreichenItem = screen.getByRole('menuitem', {
      name: /toolbar\.submitAdditionally/u,
    });
    const exportItem = screen.getByRole('menuitem', {
      name: /toolbar\.export/u,
    });
    const responseItem = screen.getByRole('menuitem', {
      name: /toolbar\.importResponses/u,
    });

    expect(nachreichenItem.getAttribute('aria-disabled')).toBe('true');
    expect(nachreichenItem.getAttribute('aria-busy')).toBe('true');
    expect(exportItem.getAttribute('aria-disabled')).toBe('true');
    expect(exportItem.getAttribute('aria-busy')).toBe('true');
    expect(responseItem.getAttribute('aria-disabled')).not.toBe('true');
    expect(
      screen.getByTestId('ewms-nachreichen-menu-spinner'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('ewms-export-menu-spinner')).toBeInTheDocument();
  });

  it('disables every overflow item when project mutation is denied', async () => {
    stubViewportWidth(true);
    setProjectCanMutate(false);
    const user = userEvent.setup();
    const onResponseImport = vi.fn();
    const onNachreichen = vi.fn();
    const onExport = vi.fn();

    renderToolbar({ onExport, onNachreichen, onResponseImport });

    await user.click(
      screen.getByRole('button', {
        name: 'toolbar.moreActionsAriaLabel',
      }),
    );

    for (const name of [
      /toolbar\.importResponses/u,
      /toolbar\.submitAdditionally/u,
      /toolbar\.export/u,
    ]) {
      const item = screen.getByRole('menuitem', { name });
      expect(item.getAttribute('aria-disabled')).toBe('true');
    }

    expect(onResponseImport).not.toHaveBeenCalled();
    expect(onNachreichen).not.toHaveBeenCalled();
    expect(onExport).not.toHaveBeenCalled();
  });
});
