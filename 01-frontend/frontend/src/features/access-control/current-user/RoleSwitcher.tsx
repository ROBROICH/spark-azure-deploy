import { v1IdentityReplaceCurrentUserRolesMutation as replaceCurrentUserRolesMutation } from '@/api-clients/backend/@tanstack/react-query.gen';
import type { UserOidcRole } from '@/api-clients/backend/types.gen';
import { CURRENT_USER_QUERY_KEY } from '@/features/access-control/current-user/currentUser';
import { useCurrentUser } from '@/features/access-control/current-user/CurrentUserProvider';
import { useCurrentUserRoleMock } from '@/features/access-control/current-user/currentUserRoleMock';
import { isRuntimeEnvironment } from '@/features/shared/config/runtimeEnvironment';
import {
  ActionMenu,
  ActionMenuContent,
  ActionMenuRadioGroup,
  ActionMenuRadioItem,
  ActionMenuSeparator,
  ActionMenuTrigger,
} from '@/features/ui/action-menu/ActionMenu';
import { SidebarLabel } from '@/features/ui/sidebar/Sidebar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/features/ui/tooltip/Tooltip';
import { toast } from '@/features/ui/toast/Toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckIcon,
  CircleHelp,
  KeyRound,
  Loader2,
  MonitorCog,
  Shield,
  TriangleAlert,
  User,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

const roleIcons = {
  admin: Shield,
  user: User,
} satisfies Record<UserOidcRole, LucideIcon>;

const MOCKABLE_ROLES = ['admin', 'user'] as const satisfies UserOidcRole[];
const LOGOUT_PATH = '/app/logout';

function RoleSwitcherSectionHeader(props: {
  icon: LucideIcon;
  label: string;
  tooltip: string;
  tooltipLabel: string;
}) {
  const { icon: Icon, label, tooltip, tooltipLabel } = props;

  return (
    <div className="flex items-center gap-2 px-2 py-1 text-[10px] leading-[12px] font-medium tracking-[0.06em] text-neutral-400 uppercase">
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={tooltipLabel}
            className="focus-ring -m-1 rounded p-1 text-neutral-400 hover:text-neutral-white"
          >
            <CircleHelp className="size-3.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          className="max-w-72 text-left text-[13px] leading-[18px] normal-case"
        >
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

/**
 * Dev-only role testing menu for independently changing the frontend role mock
 * and the Keycloak-backed role used by backend authorization.
 */
export const RoleSwitcher = () => {
  const { t } = useTranslation('shared');
  const { keycloakRole, role } = useCurrentUser();
  const [mockRole, setMockRole] = useCurrentUserRoleMock();
  const queryClient = useQueryClient();
  const updateKeycloakRoleMutation = useMutation({
    ...replaceCurrentUserRolesMutation(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CURRENT_USER_QUERY_KEY });
      toast.success(t('sidebar.roleSwitcher.keycloakRoleUpdateSuccess'));
      window.location.assign(LOGOUT_PATH);
    },
    onError: () => {
      toast.error(t('sidebar.roleSwitcher.keycloakRoleUpdateError'));
    },
  });

  // roleLabels must stay inside the component because it requires t() from useTranslation.
  const roleLabels = {
    admin: t('sidebar.roleSwitcher.roles.admin'),
    user: t('sidebar.roleSwitcher.roles.user'),
  } satisfies Record<UserOidcRole, string>;

  const CurrentRoleIcon = roleIcons[role];
  const hasRoleMismatch = role !== keycloakRole;
  const canChangeKeycloakRole = isRuntimeEnvironment('testing', 'staging');
  const frontendRoleOptions = [
    ...MOCKABLE_ROLES.map((nextRole) => ({
      key: nextRole,
      role: nextRole,
      label: roleLabels[nextRole],
      onSelect: () => setMockRole(nextRole),
      selected: mockRole === nextRole,
    })),
    {
      key: 'keycloak',
      role: keycloakRole,
      label: t('sidebar.roleSwitcher.useKeycloakRole', {
        role: roleLabels[keycloakRole],
      }),
      onSelect: () => setMockRole(null),
      selected: mockRole === null,
    },
  ];
  const keycloakRoleOptions = MOCKABLE_ROLES.map((nextRole) => ({
    key: nextRole,
    role: nextRole,
    label: roleLabels[nextRole],
    onSelect: () => {
      if (nextRole === keycloakRole || updateKeycloakRoleMutation.isPending) {
        return;
      }

      const confirmed = window.confirm(
        t('sidebar.roleSwitcher.keycloakRoleSwitchConfirm', {
          role: roleLabels[nextRole],
        }),
      );
      if (!confirmed) {
        return;
      }

      updateKeycloakRoleMutation.mutate({
        body: { roles: [nextRole] },
      });
    },
    selected: keycloakRole === nextRole,
  }));

  return (
    <ActionMenu>
      <ActionMenuTrigger
        aria-label={t('sidebar.roleSwitcher.ariaCurrent', {
          frontendRole: roleLabels[role],
          keycloakRole: roleLabels[keycloakRole],
        })}
        className="focus-ring flex min-h-8 w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm font-medium text-slate-300 hover:bg-slate-700/70 hover:text-white"
      >
        <CurrentRoleIcon className="size-4 shrink-0" aria-hidden="true" />
        <SidebarLabel>
          {t('sidebar.roleSwitcher.triggerLabel', {
            frontendRole: roleLabels[role],
            keycloakRole: roleLabels[keycloakRole],
          })}
        </SidebarLabel>
      </ActionMenuTrigger>
      <ActionMenuContent align="end" className="z-9999 min-w-[240px]">
        <div className="flex flex-col gap-1 px-2 py-1.5 text-[11px] leading-[14px] text-neutral-300">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <MonitorCog className="size-3.5 shrink-0" aria-hidden="true" />
              {t('sidebar.roleSwitcher.frontendRole')}
            </span>
            <span className="font-medium text-neutral-white">
              {roleLabels[role]}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <KeyRound className="size-3.5 shrink-0" aria-hidden="true" />
              {t('sidebar.roleSwitcher.keycloakRole')}
            </span>
            <span className="font-medium text-neutral-white">
              {roleLabels[keycloakRole]}
            </span>
          </div>
          {hasRoleMismatch ? (
            <div className="mt-1 flex items-start gap-1.5 text-amber-200">
              <TriangleAlert
                className="mt-px size-3 shrink-0"
                aria-hidden="true"
              />
              <span>{t('sidebar.roleSwitcher.roleMismatch')}</span>
            </div>
          ) : null}
          {!canChangeKeycloakRole ? (
            <div className="mt-1 flex items-start gap-1.5 text-neutral-400">
              <KeyRound className="mt-px size-3 shrink-0" aria-hidden="true" />
              <span>{t('sidebar.roleSwitcher.keycloakUnavailable')}</span>
            </div>
          ) : null}
        </div>

        <ActionMenuSeparator />
        <RoleSwitcherSectionHeader
          icon={MonitorCog}
          label={t('sidebar.roleSwitcher.frontendRole')}
          tooltip={t('sidebar.roleSwitcher.frontendRoleTooltip')}
          tooltipLabel={t('sidebar.roleSwitcher.frontendRoleTooltipLabel')}
        />
        <ActionMenuRadioGroup value={mockRole ?? 'keycloak'}>
          {frontendRoleOptions.map((option) => {
            const RoleIcon = roleIcons[option.role];
            return (
              <ActionMenuRadioItem
                key={option.key}
                value={option.key}
                className="gap-3"
                onSelect={option.onSelect}
              >
                <RoleIcon className="size-4 shrink-0" aria-hidden="true" />
                <span className="text-[11px] font-medium">{option.label}</span>
                {option.selected ? (
                  <CheckIcon size={12} className="ml-auto" aria-hidden="true" />
                ) : null}
              </ActionMenuRadioItem>
            );
          })}
        </ActionMenuRadioGroup>

        {canChangeKeycloakRole ? (
          <>
            <ActionMenuSeparator />
            <RoleSwitcherSectionHeader
              icon={KeyRound}
              label={t('sidebar.roleSwitcher.keycloakRole')}
              tooltip={t('sidebar.roleSwitcher.keycloakRoleTooltip')}
              tooltipLabel={t('sidebar.roleSwitcher.keycloakRoleTooltipLabel')}
            />
            <ActionMenuRadioGroup value={keycloakRole}>
              {keycloakRoleOptions.map((option) => {
                const RoleIcon = roleIcons[option.role];
                const isUpdating =
                  updateKeycloakRoleMutation.isPending && !option.selected;
                let trailingIcon = null;
                if (isUpdating) {
                  trailingIcon = (
                    <Loader2
                      size={12}
                      className="ml-auto animate-spin"
                      aria-hidden="true"
                    />
                  );
                } else if (option.selected) {
                  trailingIcon = (
                    <CheckIcon
                      size={12}
                      className="ml-auto"
                      aria-hidden="true"
                    />
                  );
                }

                return (
                  <ActionMenuRadioItem
                    key={option.key}
                    value={option.key}
                    className="gap-3"
                    onSelect={option.onSelect}
                    disabled={updateKeycloakRoleMutation.isPending}
                  >
                    <RoleIcon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="text-[11px] font-medium">
                      {option.label}
                    </span>
                    {trailingIcon}
                  </ActionMenuRadioItem>
                );
              })}
            </ActionMenuRadioGroup>
          </>
        ) : null}
      </ActionMenuContent>
    </ActionMenu>
  );
};
