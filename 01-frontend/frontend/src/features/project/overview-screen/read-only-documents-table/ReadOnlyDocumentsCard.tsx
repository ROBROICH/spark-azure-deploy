import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { useProjectFiles } from '@/features/project/data/project-files/useProjectFiles';
import { useProjectProcessingState } from '@/features/project/data/file-processing/useProjectProcessingState';
import { isDocumentVersioningFeatureEnabled } from '@/features/project/versioning/documentVersioningFeature';
import { useDocumentsUploadContext } from '@/features/project/overview-screen/documents-update-dialog/DocumentsUploadContext';
import { Button } from '@/features/ui/button/Button';
import type { SelectMenuItem } from '@/features/ui/select-menu/SelectMenu';
import { SelectMenu } from '@/features/ui/select-menu/SelectMenu';
import { getRouteApi } from '@tanstack/react-router';
import { CloudUpload, Files } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileProcessingStatusAlert } from './FileProcessingStatusAlert';
import { ReadOnlyDocumentsTable } from './ReadOnlyDocumentsTable';
import { ReadOnlyDocumentsToolbar } from './ReadOnlyDocumentsToolbar';
import { ReadOnlyPdfPreview } from './ReadOnlyPdfPreview';
import { useSelectedDocumentVersion } from './useSelectedDocumentVersion';

const route = getRouteApi('/verfahren/$verfahrenId/');

const getVersionOptions = (
  latestVersion: number,
  formatLabel: (version: number) => string,
): SelectMenuItem[] => {
  return Array.from({ length: Math.max(latestVersion, 1) }, (_, index) => {
    const version = latestVersion - index;

    return {
      label: formatLabel(version),
      value: String(version),
    };
  });
};

type ProcessingStatus = 'loading' | 'error' | null;

const resolveProcessingStatus = (flags: {
  hasActive: boolean;
  hasFailed: boolean;
}): ProcessingStatus => {
  if (flags.hasActive) {
    return 'loading';
  }
  if (flags.hasFailed) {
    return 'error';
  }
  return null;
};

/**
 * SingleProject documents card. Owns the documents view, the version badge
 * derived from completed ZIP uploads, and the trigger that opens the
 * app-level DocumentsUpdateDialog.
 */
export const ReadOnlyDocumentsCard = () => {
  const { previewDocumentId } = route.useSearch({
    select: (currentSearch) => ({
      previewDocumentId: currentSearch.previewDocumentId,
    }),
  });
  const navigate = route.useNavigate();
  const { verfahrenId } = route.useParams();
  const { t } = useTranslation('Project');
  const { latestVersion, selectedDocumentVersion } =
    useSelectedDocumentVersion();
  const versionOptions = getVersionOptions(latestVersion, (version) =>
    t('Documents.updateDocuments.versionOption', { version }),
  );
  const selectedVersionValue = String(selectedDocumentVersion);
  const {
    hasActiveFileProcessing,
    hasFailedFileProcessing,
    fileProcessingBannerDismissKey,
  } = useProjectProcessingState({
    projectId: verfahrenId,
  });
  const processingStatus = resolveProcessingStatus({
    hasActive: hasActiveFileProcessing,
    hasFailed: hasFailedFileProcessing,
  });

  const { files, isLoading } = useProjectFiles(verfahrenId, {
    documentVersion: selectedDocumentVersion,
  });
  const hasDocuments = files.length > 0;
  const showEmptyState =
    !isLoading && !hasDocuments && processingStatus === null;

  const { openForProject } = useDocumentsUploadContext();
  const { canMutateProject } = useCanMutateProject({ requiredLevel: 'user' });
  // eslint-disable-next-line no-restricted-syntax -- ephemeral click-pending state while the pre-open zip-files lookup resolves; not URL-worthy.
  const [isOpening, setIsOpening] = useState(false);

  const handleOpen = () => {
    setIsOpening(true);
    return Promise.resolve()
      .then(() => openForProject(verfahrenId))
      .finally(() => {
        setIsOpening(false);
      });
  };

  const selectDocumentVersion = (value: string) => {
    const nextVersion = Number(value);
    navigate({
      search: (prev) => ({
        ...prev,
        documentVersion:
          Number.isInteger(nextVersion) && nextVersion !== latestVersion
            ? nextVersion
            : undefined,
        previewDocumentId: undefined,
      }),
      replace: true,
      resetScroll: false,
    });
  };

  const versionSelect = (
    <SelectMenu
      align="start"
      items={versionOptions}
      value={selectedVersionValue}
      onChange={selectDocumentVersion}
      ariaLabel={t('Documents.updateDocuments.versionSelectAriaLabel')}
      triggerClassName="inline-flex h-6 items-center gap-1 rounded-full border border-green-200 bg-green-100 px-2 text-green-700 hover:bg-green-200"
      valueClassName="text-[11px] leading-[14px] tracking-[0.02em] text-green-700"
      chevronClassName="size-3 text-green-700"
    />
  );

  const isDocumentVersioningBlocked =
    hasDocuments && !isDocumentVersioningFeatureEnabled();
  const updateDocumentsButton =
    canMutateProject && !isDocumentVersioningBlocked ? (
      <Button
        variant="secondary"
        size="sm"
        loading={isOpening}
        onClick={() => {
          void handleOpen();
        }}
      >
        {t('Documents.updateDocuments.buttonLabel')}
      </Button>
    ) : null;

  const emptyStateAction = canMutateProject ? (
    <Button
      type="button"
      size="sm"
      loading={isOpening}
      onClick={() => {
        void handleOpen();
      }}
    >
      {t('Documents.uploadButton')}
    </Button>
  ) : null;

  return (
    <div className="flex flex-col gap-4 p-2">
      <div className="flex items-center gap-2">
        <span aria-hidden className="rounded-lg bg-bg-quaternary p-2">
          <Files className="size-4" />
        </span>
        <div className="flex flex-1 items-center gap-2">
          <h2 className="text-base font-medium tracking-tight text-text-primary">
            {t('Documents.sectionTitle')}
          </h2>
          {versionSelect}
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {showEmptyState ? (
          <div className="flex flex-col items-center justify-center gap-6 rounded-2xl border border-border-primary bg-bg-secondary p-10">
            <span aria-hidden className="p-2">
              <CloudUpload className="size-8 text-neutral-700" />
            </span>
            <div className="flex flex-col gap-2 text-center">
              <p className="text-base font-medium tracking-tight text-text-primary">
                {t('Documents.readOnlyEmptyState.title')}
              </p>
              <p className="text-text-on-secondary text-sm">
                {t('Documents.readOnlyEmptyState.description')}
              </p>
            </div>
            {emptyStateAction}
          </div>
        ) : (
          <>
            <ReadOnlyDocumentsToolbar actions={updateDocumentsButton} />
            <FileProcessingStatusAlert
              status={processingStatus}
              dismissKey={fileProcessingBannerDismissKey}
            />
            <div className="flex items-start gap-6">
              <div
                className={
                  previewDocumentId
                    ? 'min-w-0 flex-1 overflow-x-clip'
                    : 'w-full'
                }
              >
                <ReadOnlyDocumentsTable />
              </div>
              {previewDocumentId && (
                <div className="sticky top-8 h-[min(64rem,calc(100dvh-8rem))] w-1/2 shrink-0 self-start">
                  <ReadOnlyPdfPreview />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
