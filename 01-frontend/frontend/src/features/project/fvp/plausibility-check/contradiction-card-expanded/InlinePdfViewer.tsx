import { getRouteApi } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { useFileDownloadUrl } from '@/features/project/data/project-files/useFileDownloadUrl';
import { SafePdfIframe } from '@/features/shared/remote-files/SafePdfIframe';
import { toSafePdfIframeSrc } from '@/features/shared/remote-files/downloadUrlSafety';
import { Skeleton } from '@/features/ui/skeleton/Skeleton';
import { cn } from '@/features/ui/style/cn';

const route = getRouteApi('/verfahren/$verfahrenId/fvp/pp/');

type InlinePdfViewerProps = {
  documentId: string;
  pageNumber: number;
  label: string;
  viewerKey?: string;
  hideLabel?: boolean;
};

export const InlinePdfViewer = (props: InlinePdfViewerProps) => {
  const { documentId, pageNumber, label, viewerKey, hideLabel = false } = props;
  const { t } = useTranslation('PlausibilityCheck');
  const { previewDocumentId } = route.useSearch();
  const { downloadUrl, isError, isLoading } = useFileDownloadUrl(documentId);

  const isSelected = previewDocumentId === documentId;

  if (isLoading) {
    return <Skeleton className="h-[640px] w-full rounded-xl" />;
  }

  const pdfUrlWithPage = toSafePdfIframeSrc(downloadUrl, pageNumber);

  if (isError || !pdfUrlWithPage) {
    return (
      <div className="flex h-[640px] items-center justify-center rounded-xl bg-slate-700">
        <p className="text-sm text-white">{t('common.documentNotFound')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          'h-[640px] overflow-hidden rounded-xl bg-slate-700',
          isSelected && 'ring-primary ring-2 ring-offset-2',
        )}
      >
        <SafePdfIframe
          key={viewerKey}
          src={pdfUrlWithPage}
          title={label}
          className="h-full w-full"
        />
      </div>
      {!hideLabel && (
        <span className="text-muted-foreground text-center text-sm">
          {label}
        </span>
      )}
    </div>
  );
};
