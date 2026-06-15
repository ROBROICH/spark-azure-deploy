import {
  Close as SheetClose,
  Title as SheetTitle,
} from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/features/ui/button/Button';
import { SidebarPanelHeader } from './SidebarPanelHeader';
import { SidebarPanelShell } from './SidebarPanelShell';

type ActionSidebarPlaceholderProps = {
  titleKey: string;
  descriptionKey: string;
  sidebarExpanded: boolean;
  open: boolean;
  onClose: () => void;
};

export const ActionSidebarPlaceholder = (
  props: ActionSidebarPlaceholderProps,
) => {
  const { titleKey, descriptionKey, sidebarExpanded, open, onClose } = props;
  const { t } = useTranslation('MaterialCompletenessCheck');
  const title = t(titleKey);
  const description = t(descriptionKey);

  return (
    <SidebarPanelShell
      open={open}
      onClose={onClose}
      sidebarExpanded={sidebarExpanded}
      className="w-[32rem]"
    >
      <SidebarPanelHeader title={title} titleWrapper={SheetTitle}>
        <SheetClose asChild>
          <Button
            variant="ghost"
            size="default"
            iconOnly
            aria-label={t('Sidebar.close')}
          >
            <X className="size-4" />
          </Button>
        </SheetClose>
      </SidebarPanelHeader>
      <div className="text-body flex flex-1 items-center justify-center p-6 text-text-secondary">
        {description}
      </div>
    </SidebarPanelShell>
  );
};
