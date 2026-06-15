import { Button } from '@/features/ui/button/Button';
import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type FinalizeProcedureDialogFooterProps = {
  activeDownloadFormat: 'pdf' | 'docx' | null;
  onCancel: () => void;
  onDownload: (format: 'pdf' | 'docx') => void;
};

export const FinalizeProcedureDialogFooter = (
  props: FinalizeProcedureDialogFooterProps,
) => {
  const { activeDownloadFormat, onCancel, onDownload } = props;
  const { t } = useTranslation('Rpb');

  return (
    <>
      <Button type="button" variant="secondary" onClick={onCancel}>
        {t('finalize.cancel')}
      </Button>
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          withIcon
          disabled={activeDownloadFormat !== null}
          onClick={() => onDownload('pdf')}
        >
          <Download aria-hidden="true" />
          {activeDownloadFormat === 'pdf'
            ? t('finalize.downloadPdfLoading')
            : t('finalize.downloadPdf')}
        </Button>
        <Button
          type="button"
          variant="primary"
          withIcon
          disabled={activeDownloadFormat !== null}
          onClick={() => onDownload('docx')}
        >
          <Download aria-hidden="true" />
          {activeDownloadFormat === 'docx'
            ? t('finalize.downloadDocxLoading')
            : t('finalize.downloadDocx')}
        </Button>
      </div>
    </>
  );
};
