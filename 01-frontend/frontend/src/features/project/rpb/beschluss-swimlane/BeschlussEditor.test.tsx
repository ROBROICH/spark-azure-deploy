import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { BeschlussSection } from '../rpbBeschluss.types';
import { BeschlussEditor } from './BeschlussEditor';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const originalRequestAnimationFrame = globalThis.requestAnimationFrame;

const makeSection = (
  outlineNodeId: string,
  title: string,
  text: string,
): BeschlussSection => ({
  depth: 0,
  index: 0,
  isEditable: true,
  order: 0,
  parentVaeNodeId: null,
  text,
  title,
  vaeNodeId: outlineNodeId,
});

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: vi.fn(),
  });

  globalThis.requestAnimationFrame = (callback) => {
    callback(0);
    return 0;
  };
});

afterAll(() => {
  globalThis.requestAnimationFrame = originalRequestAnimationFrame;
});

afterEach(cleanup);

describe('BeschlussEditor', () => {
  it('moves the focused paragraph on every external vae node selection without echoing the callback', async () => {
    const onVaeNodeSelect = vi.fn();
    const sections = [
      makeSection('node-a', 'A. Tenor', 'Alpha paragraph'),
      makeSection('node-b', 'B. Begruendung', 'Beta paragraph'),
    ];
    const { rerender } = render(
      <BeschlussEditor
        canExport={true}
        sections={sections}
        selectedVaeNodeId="node-a"
        onVaeNodeSelect={onVaeNodeSelect}
        onExportClick={vi.fn()}
        onTextBlur={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen
          .getByText('Alpha paragraph')
          .classList.contains('rpb-outline-paragraph-focused'),
      ).toBe(true);
    });

    onVaeNodeSelect.mockClear();

    rerender(
      <BeschlussEditor
        canExport={true}
        sections={sections}
        selectedVaeNodeId="node-b"
        onVaeNodeSelect={onVaeNodeSelect}
        onExportClick={vi.fn()}
        onTextBlur={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen
          .getByText('Beta paragraph')
          .classList.contains('rpb-outline-paragraph-focused'),
      ).toBe(true);
    });

    expect(onVaeNodeSelect).not.toHaveBeenCalled();

    rerender(
      <BeschlussEditor
        canExport={true}
        sections={sections}
        selectedVaeNodeId="node-a"
        onVaeNodeSelect={onVaeNodeSelect}
        onExportClick={vi.fn()}
        onTextBlur={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen
          .getByText('Alpha paragraph')
          .classList.contains('rpb-outline-paragraph-focused'),
      ).toBe(true);
    });

    expect(onVaeNodeSelect).not.toHaveBeenCalled();
  });

  it('renders the export action beside the saved badge and wires the click handler', () => {
    const onExportClick = vi.fn();

    render(
      <BeschlussEditor
        canExport={true}
        sections={[makeSection('node-a', 'A. Tenor', 'Alpha paragraph')]}
        selectedVaeNodeId="node-a"
        onVaeNodeSelect={vi.fn()}
        onExportClick={onExportClick}
        onTextBlur={vi.fn()}
      />,
    );

    expect(screen.getByText('beschluss.savedBadge')).toBeDefined();

    const exportButton = screen.getByRole('button', {
      name: 'beschluss.export',
    });
    expect((exportButton as HTMLButtonElement).disabled).toBe(false);

    exportButton.click();

    expect(onExportClick).toHaveBeenCalledTimes(1);
  });

  it('disables the export action when export is not allowed', () => {
    const onExportClick = vi.fn();

    render(
      <BeschlussEditor
        canExport={false}
        sections={[makeSection('node-a', 'A. Tenor', 'Alpha paragraph')]}
        selectedVaeNodeId="node-a"
        onVaeNodeSelect={vi.fn()}
        onExportClick={onExportClick}
        onTextBlur={vi.fn()}
      />,
    );

    const exportButton = screen.getByRole('button', {
      name: 'beschluss.export',
    });
    expect((exportButton as HTMLButtonElement).disabled).toBe(true);

    exportButton.click();

    expect(onExportClick).not.toHaveBeenCalled();
  });

  it('keeps Ctrl+A text selection inside the editor without changing the outline node', async () => {
    const onVaeNodeSelect = vi.fn();

    render(
      <BeschlussEditor
        canExport={true}
        sections={[
          makeSection('node-a', 'A. Tenor', 'Alpha paragraph'),
          makeSection('node-b', 'B. Begruendung', 'Beta paragraph'),
        ]}
        selectedVaeNodeId="node-b"
        onVaeNodeSelect={onVaeNodeSelect}
        onExportClick={vi.fn()}
        onTextBlur={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen
          .getByText('Beta paragraph')
          .classList.contains('rpb-outline-paragraph-focused'),
      ).toBe(true);
    });

    onVaeNodeSelect.mockClear();
    fireEvent.keyDown(screen.getByLabelText('beschluss.editorAriaLabel'), {
      ctrlKey: true,
      key: 'a',
    });

    expect(onVaeNodeSelect).not.toHaveBeenCalled();
  });
});
