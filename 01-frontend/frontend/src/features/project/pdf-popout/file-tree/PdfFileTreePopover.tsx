import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/features/ui/popover/Popover';
import { FolderTree } from 'lucide-react';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PdfFileTree } from './PdfFileTree';
import { PdfFileTreeContent } from './PdfFileTreeContent';
import { usePopupPortalContainer } from '../workspace-state/usePopupPortalContainer';

type PdfFileTreePopoverProps = {
  isLoading: boolean;
  isError?: boolean;
  nodes: ComponentProps<typeof PdfFileTree>['nodes'];
  pagination?: ComponentProps<typeof PdfFileTree>['pagination'];
  selectedDocumentId?: string;
  recentDocuments?: ComponentProps<typeof PdfFileTree>['recentDocuments'];
  onSelectDocument: (documentId: string) => void;
  onRequestFiles?: () => void;
  align?: 'start' | 'center' | 'end';
  children?: ReactNode;
};

export const PdfFileTreePopover = (props: PdfFileTreePopoverProps) => {
  const {
    isLoading,
    isError = false,
    nodes,
    pagination,
    selectedDocumentId,
    recentDocuments,
    onSelectDocument,
    onRequestFiles,
    align = 'start',
    children,
  } = props;
  const { t } = useTranslation('PdfPopout');
  // eslint-disable-next-line no-restricted-syntax -- popover open state is transient local UI state for this viewer control
  const [open, setOpen] = useState(false);
  const { triggerRef, portalContainer } = usePopupPortalContainer();

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      onRequestFiles?.();
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        ref={triggerRef}
        className="focus-ring inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-neutral-100 active:bg-neutral-200"
        aria-label={t('PdfFileTreePopover.openTreeAria')}
      >
        {children ?? <FolderTree className="size-4" />}
      </PopoverTrigger>
      <PopoverContent
        container={portalContainer}
        className="w-[320px] border border-border-primary bg-neutral-white p-2 text-brand-950 backdrop-blur-none"
        align={align}
      >
        <div className="mb-2 border-b border-border-primary px-1 pb-2">
          <p className="text-[12px] leading-[16px] font-medium text-brand-950">
            {t('PdfFileTreePopover.heading')}
          </p>
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          <PdfFileTreeContent
            isLoading={isLoading}
            isError={isError}
            loadingAriaLabel={t('PdfFileTreePopover.loadingAria')}
            errorMessage={t('PdfFileTreePopover.loadError')}
          >
            <PdfFileTree
              nodes={nodes}
              pagination={pagination}
              selectedDocumentId={selectedDocumentId}
              recentDocuments={recentDocuments}
              onSelectDocument={(documentId) => {
                onSelectDocument(documentId);
                setOpen(false);
              }}
            />
          </PdfFileTreeContent>
        </div>
      </PopoverContent>
    </Popover>
  );
};
