import { useTranslation } from 'react-i18next';
import { Button } from '@/features/ui/button/Button';
import { TooltipWrapper } from '@/features/ui/tooltip/TooltipWrapper';
import { ExternalLink, Minimize2 } from 'lucide-react';
import { usePdfPopout } from '../PdfPopoutWorkspaceContext';
import { POPUP_WINDOW_NAME } from '../pdfPopout.logic';

/**
 * Narrow icon-only indicator rendered in the main app when the PDF viewer is
 * popped out. Shows a focus button to bring the popup window to the foreground
 * and a minimize button to restore the inline viewer, anchored at the bottom.
 */
export const PdfCollapsedLane = () => {
  const { t } = useTranslation('PdfPopout');
  const { popIn, isPoppedOut } = usePdfPopout();

  if (!isPoppedOut) {
    return null;
  }

  const focusPopupWindow = () => {
    const popup = window.open('', POPUP_WINDOW_NAME);
    if (popup && !popup.closed) {
      popup.focus();
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-end gap-2 pb-4">
      <TooltipWrapper
        content={t('PdfCollapsedLane.focusWindowTooltip')}
        side="left"
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          iconOnly
          onClick={focusPopupWindow}
          aria-label={t('PdfCollapsedLane.focusWindowAria')}
        >
          <ExternalLink />
        </Button>
      </TooltipWrapper>
      <TooltipWrapper content={t('PdfCollapsedLane.popInTooltip')} side="left">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          iconOnly
          onClick={popIn}
          aria-label={t('PdfCollapsedLane.popInAria')}
        >
          <Minimize2 />
        </Button>
      </TooltipWrapper>
    </div>
  );
};
