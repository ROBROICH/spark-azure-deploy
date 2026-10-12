import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as AdministrationEditorRegistrationModule from './editor-navigation/AdministrationEditorRegistration';
import { AdministrationSectionsTabs } from './AdministrationSectionsTabs';

const mocks = vi.hoisted(() => ({
  blocker: {
    status: 'idle' as 'idle' | 'blocked',
    proceed: vi.fn(),
    reset: vi.fn(),
  },
  blockerOptions: null as null | {
    shouldBlockFn: () => boolean;
    enableBeforeUnload: () => boolean;
  },
  editor: {
    dirty: false,
    valid: true,
    saving: false,
    save: vi.fn<() => Promise<boolean>>(),
    discard: vi.fn(),
  },
  navigate: vi.fn(),
  section: 'catalog' as 'catalog' | 'required-documents' | 'decision-template',
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useNavigate: () => mocks.navigate,
    useSearch: (options: {
      select: (search: { section: typeof mocks.section }) => unknown;
    }) => options.select({ section: mocks.section }),
  }),
  useBlocker: (options: typeof mocks.blockerOptions) => {
    mocks.blockerOptions = options;
    return mocks.blocker.status === 'blocked'
      ? {
          status: 'blocked',
          proceed: mocks.blocker.proceed,
          reset: mocks.blocker.reset,
        }
      : {
          status: 'idle',
          proceed: undefined,
          reset: undefined,
        };
  },
}));

vi.mock('./catalog/CatalogSection', async () => {
  const registration = await vi.importActual<
    typeof AdministrationEditorRegistrationModule
  >('./editor-navigation/AdministrationEditorRegistration');

  return {
    CatalogSection: () => {
      registration.useAdministrationEditorRegistration(mocks.editor);
      return <div>catalog-editor</div>;
    },
  };
});

vi.mock('./required-documents/RequiredDocumentsSection', () => ({
  RequiredDocumentsSection: () => <div>required-documents-editor</div>,
}));

vi.mock('./decision-template/DecisionTemplateSection', () => ({
  DecisionTemplateSection: () => <div>decision-template-editor</div>,
}));

vi.mock('./export/CatalogExportButton', () => ({
  CatalogExportButton: () => null,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const renderTabs = () =>
  render(<AdministrationSectionsTabs projectTypeId="type-1" />);

beforeEach(() => {
  mocks.blocker.status = 'idle';
  mocks.blocker.proceed.mockReset();
  mocks.blocker.reset.mockReset();
  mocks.blockerOptions = null;
  mocks.editor.dirty = false;
  mocks.editor.valid = true;
  mocks.editor.saving = false;
  mocks.editor.save.mockReset();
  mocks.editor.save.mockResolvedValue(true);
  mocks.editor.discard.mockReset();
  mocks.navigate.mockReset();
  mocks.navigate.mockResolvedValue(undefined);
  mocks.section = 'catalog';
});

afterEach(() => {
  cleanup();
});

describe('AdministrationSectionsTabs dirty navigation', () => {
  it('switches a clean tab immediately and renders only the active editor', async () => {
    const user = userEvent.setup();
    renderTabs();

    expect(screen.getByText('catalog-editor')).toBeInTheDocument();
    expect(screen.queryByText('required-documents-editor')).toBeNull();
    expect(screen.queryByText('decision-template-editor')).toBeNull();
    mocks.navigate.mockClear();

    await user.click(
      screen.getByRole('tab', { name: 'requiredDocuments.title' }),
    );

    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.blockerOptions?.shouldBlockFn()).toBe(false);
  });

  it('saves successfully before continuing a blocked navigation', async () => {
    const user = userEvent.setup();
    mocks.blocker.status = 'blocked';
    mocks.editor.dirty = true;
    renderTabs();

    await user.click(
      screen.getByRole('button', {
        name: 'dirtyNavigation.saveAndSwitch',
      }),
    );

    await waitFor(() => expect(mocks.editor.save).toHaveBeenCalledTimes(1));
    expect(mocks.blocker.proceed).toHaveBeenCalledTimes(1);
    expect(mocks.blocker.reset).not.toHaveBeenCalled();
  });

  it('discards before continuing a blocked navigation', async () => {
    const user = userEvent.setup();
    mocks.blocker.status = 'blocked';
    mocks.editor.dirty = true;
    renderTabs();

    await user.click(
      screen.getByRole('button', {
        name: 'dirtyNavigation.discardAndSwitch',
      }),
    );

    expect(mocks.editor.discard).toHaveBeenCalledTimes(1);
    expect(mocks.blocker.proceed).toHaveBeenCalledTimes(1);
    expect(mocks.editor.discard.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.blocker.proceed.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('keeps the draft and current navigation when cancelled', async () => {
    const user = userEvent.setup();
    mocks.blocker.status = 'blocked';
    mocks.editor.dirty = true;
    renderTabs();

    await user.click(
      screen.getByRole('button', { name: 'dirtyNavigation.cancel' }),
    );

    expect(mocks.blocker.reset).toHaveBeenCalledTimes(1);
    expect(mocks.editor.save).not.toHaveBeenCalled();
    expect(mocks.editor.discard).not.toHaveBeenCalled();
  });

  it('stays on the current editor when the draft is invalid', async () => {
    const user = userEvent.setup();
    mocks.blocker.status = 'blocked';
    mocks.editor.dirty = true;
    mocks.editor.valid = false;
    renderTabs();

    await user.click(
      screen.getByRole('button', {
        name: 'dirtyNavigation.saveAndSwitch',
      }),
    );

    expect(mocks.editor.save).not.toHaveBeenCalled();
    expect(mocks.blocker.reset).toHaveBeenCalledTimes(1);
    expect(mocks.blocker.proceed).not.toHaveBeenCalled();
  });

  it('stays on the current editor when saving fails', async () => {
    const user = userEvent.setup();
    mocks.blocker.status = 'blocked';
    mocks.editor.dirty = true;
    mocks.editor.save.mockResolvedValue(false);
    renderTabs();

    await user.click(
      screen.getByRole('button', {
        name: 'dirtyNavigation.saveAndSwitch',
      }),
    );

    await waitFor(() => expect(mocks.blocker.reset).toHaveBeenCalledTimes(1));
    expect(mocks.blocker.proceed).not.toHaveBeenCalled();
  });

  it('guards route leaves and beforeunload only while the active draft is dirty', () => {
    renderTabs();

    expect(mocks.blockerOptions?.shouldBlockFn()).toBe(false);
    expect(mocks.blockerOptions?.enableBeforeUnload()).toBe(false);

    mocks.editor.dirty = true;

    expect(mocks.blockerOptions?.shouldBlockFn()).toBe(true);
    expect(mocks.blockerOptions?.enableBeforeUnload()).toBe(true);
  });
});
