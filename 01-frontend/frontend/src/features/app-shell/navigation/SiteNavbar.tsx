import appVersion from '@/features/app-info/changelog/app-version.json';
import { SystemLoadSidebarButton } from '@/features/workflow-runtime/system-load/SystemLoadSidebarButton';
import { useCurrentUser } from '@/features/access-control/current-user/CurrentUserProvider';
import { isRoleSwitcherFeatureEnabled } from '@/features/shared/config/roleSwitcherFeature';
import { isRuntimeEnvironment } from '@/features/shared/config/runtimeEnvironment';
import { isDevModeAllowed, useDevMode } from '@/features/dev-mode/useDevMode';
import {
  Sidebar,
  SidebarBrand,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuLinkButton,
  SidebarSeparator,
  useSidebar,
} from '@/features/ui/sidebar/Sidebar';
import { cn } from '@/features/ui/style/cn';
import { useRouterState } from '@tanstack/react-router';
import {
  Home,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  PersonStanding,
  ScrollText,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFavorites } from '@/features/project/data/project-favorites/useFavorites';
import { LanguageSwitcher } from './LanguageSwitcher';
import { RoleSwitcher } from '../../access-control/current-user/RoleSwitcher';
import { CurrentProjectCard } from './CurrentProjectCard';
import { CurrentUserAvatar } from './CurrentUserAvatar';

import { SiteNavbarFavoriteProjectNavItem } from './SiteNavbarFavoriteProjectNavItem';

const DEV_MODE_LOGO_CLICK_THRESHOLD = 7;
export const MOBILE_SITE_NAVBAR_ID = 'mobile-site-navbar';

function AppSidebarToggle() {
  const { open, toggleSidebar } = useSidebar();
  const { t } = useTranslation('shared');

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={toggleSidebar}
        aria-label={
          open ? t('sidebar.collapseSidebar') : t('sidebar.expandSidebar')
        }
        tooltip={
          open ? t('sidebar.collapseSidebar') : t('sidebar.expandSidebar')
        }
      >
        {open ? (
          <PanelLeftClose className="size-4" />
        ) : (
          <PanelLeftOpen className="size-4" />
        )}
        <SidebarLabel>
          {open ? t('sidebar.collapseSidebar') : t('sidebar.expandSidebar')}
        </SidebarLabel>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * Main application sidebar. Renders:
 * - Site logo and branding
 * - Primary nav links (home, Verfahren overview)
 * - "Current project" section — delegated to CurrentProjectCard which detects
 *   the active /verfahren/:id route via useMatch
 * - Favorites section — driven by the user's persisted favorite IDs, filtered to
 *   projects that exist in the local DB collection
 * - Footer items: accessibility link, settings (disabled), language switcher,
 *   current user avatar, and collapse toggle
 *
 * Accordion expand state is ephemeral (local useState) and user-controlled.
 */
export const SiteNavbar = () => {
  const { t } = useTranslation('shared');
  const { open, setOpenMobile } = useSidebar();
  const [isDevMode, setDevMode] = useDevMode();
  const currentPath = useRouterState({
    select: (state) => state.location.pathname,
  });
  const { displayName: userName } = useCurrentUser();
  const showRoleSwitcher =
    isDevMode &&
    isRoleSwitcherFeatureEnabled() &&
    (import.meta.env.DEV || isRuntimeEnvironment('testing', 'staging'));

  const { favoriteIds } = useFavorites();

  const closeMobileSidebar = () => {
    setOpenMobile(false);
  };

  // eslint-disable-next-line no-restricted-syntax -- expanded favorite navigation is ephemeral sidebar UI state, not route state.
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // eslint-disable-next-line no-restricted-syntax -- logo click count is a transient hidden gesture buffer for toggling dev mode.
  const [logoClickCount, setLogoClickCount] = useState(0);
  const handleToggle = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));
  const handleBrandClick = () => {
    const nextLogoClickCount = logoClickCount + 1;

    if (nextLogoClickCount >= DEV_MODE_LOGO_CLICK_THRESHOLD) {
      if (!isDevModeAllowed()) {
        setLogoClickCount(0);
        return;
      }

      setDevMode((currentValue) => !currentValue);
      setLogoClickCount(0);
      return;
    }

    setLogoClickCount(nextLogoClickCount);
  };

  return (
    <Sidebar
      id={MOBILE_SITE_NAVBAR_ID}
      collapsible="icon"
      expandDirection="left-to-right"
      theme="dark"
      aria-label={t('sidebar.mainNavAriaLabel')}
    >
      <SidebarHeader className="px-2 py-1.5">
        <SidebarBrand>
          <button
            type="button"
            onClick={handleBrandClick}
            aria-label="SPARK Workflow"
            className="focus-ring flex min-w-0 flex-1 cursor-default appearance-none items-center overflow-hidden rounded border-0 bg-transparent p-0 text-left"
          >
            <img
              src={`${import.meta.env.BASE_URL}favicon.svg`}
              alt=""
              aria-hidden="true"
              className="h-8 w-8 shrink-0 grow-0 self-start object-contain"
            />
            <div className="-mt-[3px] ml-2 grid flex-1 text-left group-data-[collapsible=icon]:hidden">
              <span className="text-[13px] leading-[18px] font-medium text-white">
                Planungsbehörde
              </span>
              <span className="text-[11px] leading-[14px] font-medium tracking-[0.02em] text-slate-300">
                KI-Lösung
              </span>
            </div>
          </button>
        </SidebarBrand>
        <SidebarSeparator />
      </SidebarHeader>
      <SidebarContent className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuLinkButton
              isActive={currentPath === '/'}
              to="/"
              onClick={closeMobileSidebar}
              tooltip={t('sidebar.home')}
            >
              <Home className="size-4" aria-hidden="true" />
              <SidebarLabel>{t('sidebar.home')}</SidebarLabel>
            </SidebarMenuLinkButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuLinkButton
              isActive={currentPath === '/verfahren'}
              to="/verfahren"
              onClick={closeMobileSidebar}
              tooltip={t('sidebar.projects')}
            >
              <LayoutGrid className="size-4" aria-hidden="true" />
              <SidebarLabel>{t('sidebar.projects')}</SidebarLabel>
            </SidebarMenuLinkButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <CurrentProjectCard
          expandedId={expandedId}
          onToggle={handleToggle}
          onNavigate={closeMobileSidebar}
        />

        {favoriteIds.length > 0 && (
          <>
            <SidebarSeparator />

            <SidebarGroup className="overflow-y-auto p-0">
              <SidebarGroupLabel className="my-2 px-2 text-[11px] leading-[14px] font-medium tracking-[0.22px] text-slate-300 normal-case group-data-[collapsible=icon]:hidden">
                {t('sidebar.favorites')}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {favoriteIds.map((favoriteId) => (
                    <SiteNavbarFavoriteProjectNavItem
                      key={favoriteId}
                      projectId={favoriteId}
                      expandedId={expandedId}
                      onToggle={handleToggle}
                      onNavigate={closeMobileSidebar}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="mt-auto gap-2 p-2 pt-0">
        <SidebarMenu>
          <SystemLoadSidebarButton />
        </SidebarMenu>

        <SidebarMenu>
          {/* <SidebarMenuItem>
            <SidebarMenuButton
              aria-label={t('sidebar.performance')}
              disabled
              className="gap-2 text-text-secondary/50"
            >
              <span className="relative shrink-0">
                <Activity className="text-text-secondary/50" />
                <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-green-500" />
              </span>
              <span className="group-data-[collapsible=icon]:hidden">
                {t('sidebar.performance')}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem> */}

          <SidebarMenuItem>
            <SidebarMenuLinkButton
              isActive={currentPath.startsWith('/barrierefreiheit')}
              to="/barrierefreiheit"
              onClick={closeMobileSidebar}
              aria-label={t('sidebar.accessibility')}
              tooltip={t('sidebar.accessibility')}
            >
              <PersonStanding className="size-4" aria-hidden="true" />
              <SidebarLabel>{t('sidebar.accessibility')}</SidebarLabel>
            </SidebarMenuLinkButton>
          </SidebarMenuItem>

          {/* <SidebarMenuItem>
            <SidebarMenuButton aria-label={t('sidebar.settings')} disabled>
              <Settings className="size-4" />
              <SidebarLabel>{t('sidebar.settings')}</SidebarLabel>
            </SidebarMenuButton>
          </SidebarMenuItem> */}

          <SidebarMenuItem>
            <LanguageSwitcher showLabel className="w-full" />
          </SidebarMenuItem>

          {showRoleSwitcher && (
            <SidebarMenuItem>
              <RoleSwitcher />
            </SidebarMenuItem>
          )}
        </SidebarMenu>

        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton aria-label={userName} disabled>
              <CurrentUserAvatar className="border-transparent bg-transparent text-slate-300" />
              <SidebarLabel>{userName}</SidebarLabel>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuLinkButton
              isActive={currentPath.startsWith('/changelog')}
              to="/changelog"
              onClick={closeMobileSidebar}
              tooltip={t('sidebar.changelog')}
              aria-label={t('sidebar.changelogAriaLabelWithVersion', {
                version: appVersion.version,
              })}
              className="relative group-data-[collapsible=icon]:min-h-11 group-data-[collapsible=icon]:py-1"
            >
              <ScrollText className="size-4" aria-hidden="true" />
              <span
                className={cn(
                  'font-medium text-slate-400! tabular-nums transition-[color,opacity,transform] duration-150 ease-linear group-data-[theme=dark]:text-slate-500',
                  open
                    ? 'ml-auto text-right text-[11px] leading-none'
                    : 'pointer-events-none absolute bottom-[2px] left-1/2 -translate-x-1/2 text-[9px] leading-none',
                )}
              >
                {appVersion.version}
              </span>
              <SidebarLabel>{t('sidebar.changelog')}</SidebarLabel>
            </SidebarMenuLinkButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarSeparator />

        <SidebarMenu>
          <AppSidebarToggle />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
};
