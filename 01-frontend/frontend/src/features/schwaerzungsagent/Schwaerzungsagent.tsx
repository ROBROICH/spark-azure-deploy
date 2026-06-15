import { FileDropZone } from '@/features/ui/file-drop-zone/FileDropZone';
import { InfoCard } from '@/features/ui/info-card/InfoCard';
import { PaintRoller } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SchwaerzungsagentProgressStep } from './SchwaerzungsagentProgressStep';
import { useSchwaerzungsagentSession } from './schwaerzungsagentSession';
import { SchwaerzungsagentSuccessStep } from './SchwaerzungsagentSuccessStep';
import {
  estimateDurationFromFileSize,
  isPdfFile,
  MAX_PDF_FILE_SIZE_BYTES,
} from './schwaerzungsagentUtils';
import { useSchwaerzungsagentRedaction } from './useSchwaerzungsagentRedaction';

type RedactedFile = {
  filename: string;
  objectUrl: string;
};

const UPLOAD_ERROR_ID = 'schwaerzungsagent-upload-error';

/**
 * Orchestrates the Schwaerzungsagent upload flow from local PDF selection to a
 * resumable backend request and a browser-only redacted blob download.
 *
 * @returns The Schwaerzungsagent page content.
 */
export const Schwaerzungsagent = () => {
  const { t } = useTranslation('Schwaerzungsagent');
  // eslint-disable-next-line no-restricted-syntax -- only a newly started request should include the browser File in the request body.
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  // eslint-disable-next-line no-restricted-syntax -- local validation/estimation error belongs to this upload surface.
  const [uploadError, setUploadError] = useState<string | null>(null);
  // eslint-disable-next-line no-restricted-syntax -- object URLs are runtime-only and cannot be persisted safely.
  const [redactedFile, setRedactedFile] = useState<RedactedFile | null>(null);
  const { clearSession, markSessionCompleted, session, startOrResumeSession } =
    useSchwaerzungsagentSession();
  // eslint-disable-next-line no-restricted-syntax -- retry key reruns the completed-result reload request on user action.
  const [downloadRetryKey, setDownloadRetryKey] = useState(0);

  // eslint-disable-next-line no-restricted-syntax -- object URL cleanup is tied to browser resource lifecycle.
  useEffect(() => {
    return () => {
      if (redactedFile) {
        URL.revokeObjectURL(redactedFile.objectUrl);
      }
    };
  }, [redactedFile]);

  const handleRedactionSuccess = (blob: Blob) => {
    if (!session) {
      return;
    }

    markSessionCompleted(session.requestId);
    setUploadFile(null);

    setRedactedFile((currentFile) => {
      if (currentFile) {
        URL.revokeObjectURL(currentFile.objectUrl);
      }

      return {
        filename: session.redactedFilename,
        objectUrl: URL.createObjectURL(blob),
      };
    });
  };

  const shouldFetchRedactedFile = Boolean(session && !redactedFile);
  const { error: processingError } = useSchwaerzungsagentRedaction({
    enabled: shouldFetchRedactedFile,
    file: uploadFile,
    onSuccess: handleRedactionSuccess,
    retryKey: downloadRetryKey,
    session,
  });

  const handleFileSelect = (file: File | undefined) => {
    if (!file) {
      return;
    }

    if (!isPdfFile(file)) {
      setUploadError(t('upload.pdfOnlyError'));
      return;
    }

    if (file.size > MAX_PDF_FILE_SIZE_BYTES) {
      setUploadError(t('upload.fileTooLargeError'));
      return;
    }

    setUploadError(null);

    setRedactedFile((currentFile) => {
      if (currentFile) {
        URL.revokeObjectURL(currentFile.objectUrl);
      }

      return null;
    });
    const estimatedDurationMs = estimateDurationFromFileSize(file.size);

    const shouldUploadFile = startOrResumeSession(
      file,
      estimatedDurationMs,
      t('success.redactedFilenameSuffix'),
    );
    setUploadFile(shouldUploadFile ? file : null);
  };

  const handleRejectedFile = () => {
    setUploadError(t('upload.pdfOnlyError'));
  };

  const handleRemoveFile = () => {
    setUploadFile(null);
    setUploadError(null);

    setRedactedFile((currentFile) => {
      if (currentFile) {
        URL.revokeObjectURL(currentFile.objectUrl);
      }

      return null;
    });
    clearSession();
  };

  const handleRetryDownload = () => {
    setDownloadRetryKey((currentKey) => currentKey + 1);
  };

  const hasCompletedSession = Boolean(session?.resultAvailableAt);
  const progressSession =
    !redactedFile && !hasCompletedSession ? session : null;
  const successFilename =
    redactedFile?.filename ??
    (hasCompletedSession ? session?.redactedFilename : null);
  const successObjectUrl = redactedFile?.objectUrl ?? null;
  const isDownloadLoading = Boolean(
    successFilename && !successObjectUrl && !processingError,
  );
  const isInitialState = !progressSession && !successFilename;

  return (
    <main className="flex flex-col items-center p-6">
      <div className="w-full max-w-container pt-0 2xl:pt-10">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="rounded-lg bg-bg-quaternary p-2">
            <PaintRoller className="size-4" />
          </span>
          <h1 className="flex-1 text-base leading-5 font-medium text-text-primary">
            {t('pageTitle')}
          </h1>
        </div>

        {isInitialState ? (
          <div className="mt-4 grid w-full items-stretch gap-4 lg:grid-cols-[minmax(0,536px)_minmax(0,1fr)]">
            <div className="flex flex-col gap-4">
              <InfoCard
                body={t('start.warning.body')}
                isCollapsible={false}
                title={t('start.warning.title')}
                variant="warning"
              />

              <div className="flex flex-col gap-2">
                <p className="text-[13px] leading-[18px] font-medium text-text-primary">
                  {t('start.notes.heading')}
                </p>
                <ul className="list-disc space-y-1 pl-5 text-[13px] leading-[18px] text-text-secondary">
                  <li>{t('start.notes.categories')}</li>
                  <li>{t('start.notes.images')}</li>
                  <li>
                    <strong className="font-medium">
                      {t('start.notes.verification')}
                    </strong>
                  </li>
                </ul>
              </div>
            </div>

            <FileDropZone
              accept=".pdf,application/pdf"
              selectedFile={null}
              onFileSelect={(file) => void handleFileSelect(file)}
              onRejectedFile={handleRejectedFile}
              onRemoveFile={handleRemoveFile}
              dropZoneTitle={t('upload.dropZoneTitle')}
              dropZoneDescription={t('upload.dropZoneDescription')}
              formatHint={t('upload.formatHint')}
              chooseFileLabel={t('upload.chooseFile')}
              removeFileLabel={t('upload.removeFile')}
              fileInputLabel={t('upload.fileInputLabel')}
              uploadError={uploadError}
              uploadErrorId={UPLOAD_ERROR_ID}
              textMaxWidth="max-w-[356px]"
              className="min-h-0"
            />
          </div>
        ) : null}

        <div className="mx-auto w-full max-w-3xl">
          {progressSession ? (
            <SchwaerzungsagentProgressStep
              error={processingError}
              onCancel={handleRemoveFile}
              session={progressSession}
            />
          ) : null}

          {successFilename ? (
            <SchwaerzungsagentSuccessStep
              downloadError={processingError}
              filename={successFilename}
              isDownloadLoading={isDownloadLoading}
              objectUrl={successObjectUrl}
              onNewFile={handleRemoveFile}
              onRetryDownload={handleRetryDownload}
            />
          ) : null}
        </div>
      </div>
    </main>
  );
};
