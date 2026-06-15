import { cn } from '@/features/ui/style/cn';
import { CircleCheck, Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDocumentsUploadContext } from './DocumentsUploadContext';
import { getUploadPhasePresentation } from './uploadPhasePresentation';

export const DocumentsUploadToast = () => {
  const { t } = useTranslation('Project');
  const { phase, minimized, maximize, close } = useDocumentsUploadContext();
  const { toastCanClose, toastVariant } = getUploadPhasePresentation(
    phase,
    minimized,
  );

  if (toastVariant === null) {
    return null;
  }

  const innerPillBg =
    toastVariant === 'uploading' ? 'bg-slate-800' : 'bg-green-800';
  const message =
    toastVariant === 'uploading'
      ? t('Documents.updateDocuments.toast.uploadingMessage')
      : t('Documents.updateDocuments.toast.successMessage');

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-start justify-end p-8">
      <div className="pointer-events-auto flex flex-col gap-2 rounded-[12px] border border-white/60 bg-white/20 p-1 shadow-flat backdrop-blur-2xl">
        <div
          className={cn(
            'flex items-center gap-1 rounded-lg p-1 text-white',
            innerPillBg,
          )}
        >
          <button
            type="button"
            onClick={maximize}
            aria-label={t('Documents.updateDocuments.toast.maximizeAria')}
            className="focus-ring flex cursor-pointer items-center gap-1 rounded text-left text-white"
          >
            <span className="flex size-6 items-center justify-center p-1">
              {toastVariant === 'uploading' ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <CircleCheck className="size-4" aria-hidden />
              )}
            </span>
            <span className="px-1 py-[3px] text-[13px] leading-[18px] tracking-[-0.01em]">
              {message}
            </span>
          </button>
          {toastCanClose && (
            <button
              type="button"
              onClick={close}
              aria-label={t('Documents.updateDocuments.toast.closeAria')}
              className="focus-ring flex size-6 cursor-pointer items-center justify-center rounded p-1 text-white/80 hover:text-white"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
