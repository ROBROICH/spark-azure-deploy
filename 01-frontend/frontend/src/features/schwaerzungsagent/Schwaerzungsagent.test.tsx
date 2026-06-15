import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SCHWAERZUNGSAGENT_SESSION_STORAGE_KEY,
  type SchwaerzungsagentSession,
} from './schwaerzungsagentSession';
import {
  estimateDurationFromFileSize,
  MAX_PDF_FILE_SIZE_BYTES,
} from './schwaerzungsagentUtils';
import { Schwaerzungsagent } from './Schwaerzungsagent';
import type { useSchwaerzungsagentRedaction } from './useSchwaerzungsagentRedaction';

type RedactionProps = Parameters<typeof useSchwaerzungsagentRedaction>[0];

const mocks = vi.hoisted(() => ({
  redactionError: null as Error | null,
  redactionProps: [] as RedactionProps[],
  createObjectUrl: vi.fn(() => 'blob:redacted'),
  revokeObjectUrl: vi.fn(),
}));

vi.mock('./useSchwaerzungsagentRedaction', () => ({
  useSchwaerzungsagentRedaction: (props: RedactionProps) => {
    mocks.redactionProps.push(props);

    return {
      error: mocks.redactionError,
      isRunning: Boolean(
        props.enabled && props.session?.requestId && !mocks.redactionError,
      ),
    };
  },
}));

vi.mock('@/features/workflow-runtime/system-load/useSystemLoad', () => ({
  useSystemLoad: () => ({
    data: undefined,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: {
      language: 'de',
      resolvedLanguage: 'de-DE',
    },
    t: (key: string, params?: Record<string, string | number>) => {
      const values: Record<string, string> = {
        pageTitle: 'Schwärzungsagent',
        'start.warning.title': 'Testumgebung: Nutzen Sie fiktive Daten!',
        'start.warning.body':
          'Bitte laden Sie keine echten personenbezogenen Daten hoch.',
        'start.notes.heading': 'Hinweise zur Funktionsweise:',
        'start.notes.categories':
          'Der Schwärzungsagent identifiziert ausgewählte Daten, z. B. Namen.',
        'start.notes.images':
          'Personenbezogene Daten in eingebetteten Bildern werden nicht geschwärzt.',
        'start.notes.verification':
          'Die Ergebnisse sind stets durch eine menschliche Prüfung zu verifizieren.',
        'upload.dropZoneTitle': 'Dokument zur Schwärzung hochladen',
        'upload.dropZoneDescription':
          'Bitte wählen Sie eine Datei aus oder ziehen Sie diese in den vorgesehenen Bereich.',
        'upload.formatHint': 'Unterstütztes Format: PDF bis 100 MB',
        'upload.chooseFile': 'Datei auswählen',
        'upload.removeFile': 'Datei entfernen',
        'upload.fileInputLabel': 'PDF zur Schwärzung auswählen',
        'upload.pdfOnlyError': 'Bitte laden Sie eine PDF-Datei hoch.',
        'upload.fileTooLargeError':
          'PDF-Dateien dürfen maximal 100 MB groß sein.',
        'processing.heading': 'Schwärzung läuft ...',
        'processing.description': '{{filename}} wird verarbeitet.',
        'processing.progressLabel': 'Schwärzungsfortschritt',
        'processing.remainingTime': 'Verbleibende Zeit: ca. {{count}} Min.',
        'processing.almostDone': 'Die Schwärzung dauert länger als erwartet.',
        'processing.error': 'Die Schwärzung konnte nicht abgeschlossen werden.',
        'processing.cancel': 'Abbrechen',
        'success.heading': 'Datei erfolgreich geschwärzt',
        'success.description': '{{filename}} kann heruntergeladen werden.',
        'success.redactedFilenameSuffix': '_geschwärzt',
        'success.download': 'Datei herunterladen',
        'success.downloadPreparing': 'Download wird vorbereitet.',
        'success.newFile': 'Neue Datei schwärzen',
        'success.downloadError':
          'Die geschwärzte Datei konnte nicht geladen werden.',
        'success.retryDownload': 'Erneut versuchen',
        'success.confirmDialog.title': 'Neue Datei schwärzen',
        'success.confirmDialog.body':
          'Bitte stellen Sie sicher, dass Sie die Datei zuvor heruntergeladen haben.',
        'success.confirmDialog.cancel': 'Abbrechen',
        'success.confirmDialog.confirm': 'Fortfahren',
      };

      return (values[key] ?? key)
        .replace('{{filename}}', String(params?.filename ?? ''))
        .replace('{{count}}', String(params?.count ?? ''));
    },
  }),
}));

const completedSession = {
  version: 1,
  requestId: 'request-1',
  originalFilename: 'input.pdf',
  redactedFilename: 'input_geschwärzt.pdf',
  fileSize: 3,
  startedAt: 1,
  estimatedDurationMs: 300_000,
  resultAvailableAt: 2,
} satisfies SchwaerzungsagentSession;

function storeSession(session: SchwaerzungsagentSession) {
  window.sessionStorage.setItem(
    SCHWAERZUNGSAGENT_SESSION_STORAGE_KEY,
    JSON.stringify(session),
  );
}

describe('Schwaerzungsagent', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    mocks.redactionError = null;
    mocks.redactionProps = [];
    mocks.createObjectUrl.mockClear();
    mocks.revokeObjectUrl.mockClear();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: mocks.createObjectUrl,
      revokeObjectURL: mocks.revokeObjectUrl,
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('rejects PDFs larger than 100 MiB before starting anonymization', async () => {
    const user = userEvent.setup();
    const file = new File(['pdf'], 'large.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', {
      value: MAX_PDF_FILE_SIZE_BYTES + 1,
    });

    render(<Schwaerzungsagent />);

    await user.upload(
      screen.getByLabelText('PDF zur Schwärzung auswählen'),
      file,
    );

    expect(
      await screen.findByText('PDF-Dateien dürfen maximal 100 MB groß sein.'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('PDF zur Schwärzung auswählen'),
    ).toHaveAttribute('aria-describedby', 'schwaerzungsagent-upload-error');
    expect(
      screen.getByLabelText('PDF zur Schwärzung auswählen'),
    ).toHaveAttribute('aria-invalid', 'true');
    expect(mocks.redactionProps.some((props) => props.enabled)).toBe(false);
  });

  it('starts anonymization with a duration estimate derived from file size', async () => {
    const user = userEvent.setup();
    const file = new File(['pdf'], 'scan.pdf', { type: 'application/pdf' });

    render(<Schwaerzungsagent />);

    await user.upload(
      screen.getByLabelText('PDF zur Schwärzung auswählen'),
      file,
    );

    expect(mocks.redactionProps.at(-1)).toMatchObject({
      enabled: true,
      file,
      session: expect.objectContaining({
        estimatedDurationMs: estimateDurationFromFileSize(file.size),
        originalFilename: 'scan.pdf',
      }),
    });

    act(() => {
      mocks.redactionProps.at(-1)?.onSuccess(new Blob(['redacted']));
    });

    const storedSession = JSON.parse(
      window.sessionStorage.getItem(SCHWAERZUNGSAGENT_SESSION_STORAGE_KEY) ??
        'null',
    );
    expect(storedSession).toMatchObject({
      estimatedDurationMs: estimateDurationFromFileSize(file.size),
      originalFilename: 'scan.pdf',
      resultAvailableAt: expect.any(Number),
    });
    expect(mocks.createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
    await waitFor(() => {
      expect(mocks.redactionProps.at(-1)).toMatchObject({
        enabled: false,
        file: null,
      });
      expect(
        screen.getByRole('button', { name: 'Datei herunterladen' }),
      ).toBeEnabled();
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Datei erfolgreich geschwärzt',
    );
  });

  it('reattaches an in-progress session without uploading the file again', () => {
    const { resultAvailableAt, ...inProgressSession } = completedSession;
    void resultAvailableAt;
    storeSession(inProgressSession);

    render(<Schwaerzungsagent />);

    expect(mocks.redactionProps.at(-1)).toMatchObject({
      enabled: true,
      file: null,
      session: expect.objectContaining({
        requestId: 'request-1',
        redactedFilename: 'input_geschwärzt.pdf',
      }),
    });
  });

  it('renders the test-environment warning and functional notes on the initial upload screen', () => {
    render(<Schwaerzungsagent />);

    expect(
      screen.getByText('Testumgebung: Nutzen Sie fiktive Daten!'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Bitte laden Sie keine echten personenbezogenen Daten hoch.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Hinweise zur Funktionsweise:'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Der Schwärzungsagent identifiziert ausgewählte Daten, z. B. Namen.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Personenbezogene Daten in eingebetteten Bildern werden nicht geschwärzt.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Die Ergebnisse sind stets durch eine menschliche Prüfung zu verifizieren.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Datei auswählen' }),
    ).toBeInTheDocument();
  });

  it('reopens a completed session with a loading download button and then enables download after the blob returns', async () => {
    storeSession(completedSession);

    render(<Schwaerzungsagent />);

    const downloadButton = screen.getByRole('button', {
      name: 'Datei herunterladen',
    });
    expect(downloadButton).toBeDisabled();
    expect(screen.getByText('Download wird vorbereitet.')).toHaveAttribute(
      'role',
      'status',
    );
    expect(downloadButton.querySelector('svg.animate-spin')).not.toBeNull();
    expect(mocks.redactionProps.at(-1)).toMatchObject({
      enabled: true,
      file: null,
      session: expect.objectContaining({ requestId: 'request-1' }),
    });

    act(() => {
      mocks.redactionProps.at(-1)?.onSuccess(new Blob(['redacted']));
    });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Datei herunterladen' }),
      ).toBeEnabled();
    });
    expect(mocks.createObjectUrl).toHaveBeenCalled();
  });

  it('keeps completed sessions on the success screen and retries failed result reloads', async () => {
    const user = userEvent.setup();
    storeSession(completedSession);
    mocks.redactionError = new Error('reload failed');

    render(<Schwaerzungsagent />);

    expect(
      screen.getByText('Die geschwärzte Datei konnte nicht geladen werden.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Datei herunterladen' }),
    ).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));

    await waitFor(() => {
      expect(mocks.redactionProps.at(-1)?.retryKey).toBe(1);
    });
  });

  it('clears the completed session after confirming the new-file action', async () => {
    const user = userEvent.setup();
    storeSession(completedSession);

    render(<Schwaerzungsagent />);

    await user.click(
      screen.getByRole('button', { name: 'Neue Datei schwärzen' }),
    );

    expect(
      screen.getByRole('button', { name: 'Fortfahren' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Fortfahren' }));

    expect(
      window.sessionStorage.getItem(SCHWAERZUNGSAGENT_SESSION_STORAGE_KEY),
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Datei auswählen' }),
    ).toBeInTheDocument();
  });
});
