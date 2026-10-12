import {
  POPUP_CONTENT_CLASSES,
  POPUP_CONTENT_STYLE,
} from '@/features/ui/style/popupStyles';
import { cn } from '@/features/ui/style/cn';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
// eslint-disable-next-line no-restricted-syntax -- Radix UI DropdownMenu is namespace-oriented; named exports are not exposed individually
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { PdfFileTree } from './PdfFileTree';
import { PdfFileTreeContent } from './PdfFileTreeContent';
import { usePdfPopout } from '../PdfPopoutWorkspaceContext';
import { usePopupPortalContainer } from '../workspace-state/usePopupPortalContainer';

type PdfDarkFileTreeDropdownProps = {
  paneId: string;
  documentId?: string;
  title: string;
};

export const PdfDarkFileTreeDropdown = (
  props: PdfDarkFileTreeDropdownProps,
) => {
  const { paneId, documentId, title } = props;
  const { t } = useTranslation('PdfPopout');
  const {
    tree,
    isLoadingFiles,
    isFilesError,
    filePagination,
    recentDocuments,
    selectPaneDocument,
    requestFileCatalog,
  } = usePdfPopout();
  // eslint-disable-next-line no-restricted-syntax -- dropdown open state is transient local UI state for this viewer control
  const [open, setOpen] = useState(false);
  const { triggerRef, portalContainer } = usePopupPortalContainer();

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      requestFileCatalog();
    }
  };

  return (
    <DropdownMenuPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuPrimitive.Trigger
        ref={triggerRef}
        className="focus-ring flex max-w-full min-w-0 cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-bg-secondary"
        aria-label={t('PdfDarkFileTreeDropdown.triggerAria')}
      >
        <span className="min-w-0 truncate text-[13px] font-medium tracking-[-0.13px] text-brand-950">
          {title}
        </span>
        <ChevronDown className="size-4 shrink-0 text-brand-950" />
      </DropdownMenuPrimitive.Trigger>

      <DropdownMenuPrimitive.Portal container={portalContainer}>
        <DropdownMenuPrimitive.Content
          className={cn(POPUP_CONTENT_CLASSES, 'w-[320px] p-2')}
          style={POPUP_CONTENT_STYLE}
          sideOffset={4}
          align="start"
        >
          <div className="mb-2 border-b border-neutral-600 px-1 pb-2">
            <p className="text-[12px] leading-[16px] font-medium text-neutral-300">
              {t('PdfDarkFileTreeDropdown.heading')}
            </p>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            <PdfFileTreeContent
              isLoading={isLoadingFiles}
              isError={isFilesError}
              loadingAriaLabel={t('PdfDarkFileTreeDropdown.loadingAria')}
              errorMessage={t('PdfDarkFileTreeDropdown.loadError')}
              theme="dark"
            >
              <PdfFileTree
                nodes={tree}
                pagination={filePagination}
                selectedDocumentId={documentId}
                recentDocuments={recentDocuments}
                theme="dark"
                onSelectDocument={(nextDocumentId) => {
                  selectPaneDocument(paneId, nextDocumentId);
                  setOpen(false);
                }}
              />
            </PdfFileTreeContent>
          </div>
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
};
