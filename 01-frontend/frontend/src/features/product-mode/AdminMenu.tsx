import { Button } from '@/features/ui/button/Button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/features/ui/popover/Popover';
import { SidebarLabel, SidebarMenuButton } from '@/features/ui/sidebar/Sidebar';
import { useRouterState } from '@tanstack/react-router';
import { ExternalLink, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getProductAppLink } from './productAppLink';

export function AdminMenu() {
  const { t } = useTranslation('ProductMode');
  const publicHref = useRouterState({
    select: (state) => state.location.publicHref,
  });
  const target = getProductAppLink(
    new URL(publicHref, window.location.origin).href,
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <SidebarMenuButton aria-label={t('adminMenu')} tooltip={t('adminMenu')}>
          <Settings className="size-4" aria-hidden="true" />
          <SidebarLabel>{t('adminMenu')}</SidebarLabel>
        </SidebarMenuButton>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" className="w-64 p-3">
        <h2 className="mb-3 text-sm font-semibold">{t('adminMenu')}</h2>
        {target ? (
          <Button asChild variant="ghost" size="sm">
            <a href={target.href} target="_blank" rel="noopener noreferrer">
              {t(target.product === 'ewms' ? 'openEwms' : 'openSpark')}
              <ExternalLink className="size-4" aria-hidden="true" />
            </a>
          </Button>
        ) : (
          <p className="text-xs text-text-secondary">{t('unavailable')}</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
