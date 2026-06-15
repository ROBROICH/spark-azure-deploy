import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { usePdfPopoutShell } from '../PdfPopoutShellContext';

export const PdfPopoutWindow = () => {
  const { t } = useTranslation('PdfPopout');
  const { popupRoot, hasActiveWorkspace } = usePdfPopoutShell();

  if (!popupRoot || hasActiveWorkspace) {
    return null;
  }

  return createPortal(
    <div className="flex h-full w-full items-center justify-center bg-bg-secondary">
      <div className="max-w-lg px-8 text-center">
        <h2 className="text-lg font-medium text-brand-950">
          {t('PdfPopoutWindow.reservedTitle')}
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          {t('PdfPopoutWindow.reservedDescription')}
        </p>
      </div>
    </div>,
    popupRoot,
  );
};
