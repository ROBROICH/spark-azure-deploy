import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentTypeBadgeSelect } from './DocumentTypeBadgeSelect';

const mocks = vi.hoisted(() => ({
  onManageCustomDocumentTypes: vi.fn(),
  onSelect: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'DocumentTypeDropdown.ariaLabel': 'Unterlagentyp auswählen',
        'DocumentTypeDropdown.ariaLabelWithValue': 'Unterlagentyp auswählen',
        'DocumentTypeDropdown.customCategoryLabel': 'Benutzerdefiniert',
        'DocumentTypeDropdown.manageLabel':
          '+ Dokumententyp anlegen oder verwalten',
        'DocumentTypeDropdown.selectLabel': 'Unterlagentyp auswählen',
      })[key] ?? key,
  }),
}));

afterEach(() => {
  cleanup();
  mocks.onManageCustomDocumentTypes.mockClear();
  mocks.onSelect.mockClear();
});

describe('DocumentTypeBadgeSelect', () => {
  it('renders custom document types in a passive custom section at the bottom', async () => {
    const user = userEvent.setup();

    render(
      <DocumentTypeBadgeSelect
        status={{ kind: 'unlinked' }}
        availableTypes={[
          {
            id: 'system-category',
            name: 'System',
            children: [
              {
                id: 'type-lageplan',
                name: 'Lageplan',
              },
            ],
          },
          {
            id: 'custom-category-id',
            name: 'Benutzerdefiniert',
            children: [
              {
                id: 'type-custom',
                name: 'Variantenprüfung',
              },
            ],
          },
        ]}
        onManageCustomDocumentTypes={mocks.onManageCustomDocumentTypes}
        onSelect={mocks.onSelect}
      />,
    );

    await user.click(
      screen.getByRole('button', {
        name: 'Unterlagentyp auswählen',
      }),
    );

    expect(await screen.findByText('Lageplan')).toBeTruthy();
    expect(screen.getByText('Benutzerdefiniert')).toBeTruthy();
    expect(screen.getByText('Variantenprüfung')).toBeTruthy();
    expect(
      screen.getByText('+ Dokumententyp anlegen oder verwalten'),
    ).toBeTruthy();

    await user.click(screen.getByText('Benutzerdefiniert'));

    expect(mocks.onSelect).not.toHaveBeenCalled();

    await user.click(screen.getByText('Variantenprüfung'));

    expect(mocks.onSelect).toHaveBeenCalledWith('type-custom');
  });

  it('keeps the custom manage action visible when there are no custom document types', async () => {
    const user = userEvent.setup();

    render(
      <DocumentTypeBadgeSelect
        status={{ kind: 'unlinked' }}
        availableTypes={[
          {
            id: 'custom-category-id',
            name: 'Benutzerdefiniert',
            children: [],
          },
        ]}
        onManageCustomDocumentTypes={mocks.onManageCustomDocumentTypes}
      />,
    );

    await user.click(
      screen.getByRole('button', {
        name: 'Unterlagentyp auswählen',
      }),
    );

    expect(screen.getByText('Benutzerdefiniert')).toBeTruthy();

    await user.click(
      screen.getByText('+ Dokumententyp anlegen oder verwalten'),
    );

    expect(mocks.onManageCustomDocumentTypes).toHaveBeenCalledTimes(1);
  });

  it('exposes single-select radio semantics with the current type checked', async () => {
    const user = userEvent.setup();

    render(
      <DocumentTypeBadgeSelect
        status={{
          kind: 'linked',
          label: 'Lageplan',
          selectedTypeId: 'type-lageplan',
        }}
        availableTypes={[
          {
            id: 'system-category',
            name: 'System',
            children: [
              { id: 'type-lageplan', name: 'Lageplan' },
              { id: 'type-uebersicht', name: 'Übersichtskarte' },
            ],
          },
        ]}
        onSelect={mocks.onSelect}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Unterlagentyp auswählen' }),
    );

    // Single-select must use menuitemradio (not menuitemcheckbox) so assistive
    // tech receives the current option state, and the active type is aria-checked.
    expect(await screen.findAllByRole('menuitemradio')).toHaveLength(2);
    expect(
      screen.getByRole('menuitemradio', { name: 'Lageplan', checked: true }),
    ).toBeTruthy();
    expect(
      screen.getByRole('menuitemradio', {
        name: 'Übersichtskarte',
        checked: false,
      }),
    ).toBeTruthy();

    await user.click(
      screen.getByRole('menuitemradio', { name: 'Übersichtskarte' }),
    );

    expect(mocks.onSelect).toHaveBeenCalledWith('type-uebersicht');
  });
});
