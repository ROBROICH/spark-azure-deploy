import {
  resetProjectPermissionTestMocks,
  setProjectCanMutate,
} from '@/features/project/test/projectPermissionTestMocks';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tabs } from '@/features/ui/tabs/Tabs';
import { EwmsToolbar } from './EwmsToolbar';

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
  cleanup();
});

describe('EwmsToolbar permissions', () => {
  it('disables mutating toolbar actions when project mutation is denied', () => {
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
