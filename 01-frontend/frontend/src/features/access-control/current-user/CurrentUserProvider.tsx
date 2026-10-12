import { Button } from '@/features/ui/button/Button';
import type { UserOidcRole } from '@/api-clients/backend/types.gen';
import { isRoleSwitcherFeatureEnabled } from '@/features/shared/config/roleSwitcherFeature';
import { isRuntimeEnvironment } from '@/features/shared/config/runtimeEnvironment';
import { useDevMode } from '@/features/dev-mode/useDevMode';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
  type ReactElement,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  type CurrentUserIdentity,
  getCurrentUserDisplayName,
  getCurrentUserQueryOptions,
} from './currentUser';
import { useCurrentUserRoleMock } from './currentUserRoleMock';

type CurrentUserContextValue = {
  currentUser: CurrentUserIdentity;
  displayName: string;
  keycloakRole: UserOidcRole;
  role: UserOidcRole;
  userId: string;
};

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null);

function canUseCurrentUserRoleMock(isDevMode: boolean): boolean {
  return (
    isDevMode &&
    isRoleSwitcherFeatureEnabled() &&
    (import.meta.env.DEV || isRuntimeEnvironment('testing', 'staging'))
  );
}

function CurrentUserContextProvider(props: {
  children: ReactNode;
  currentUser: CurrentUserIdentity;
  isDevMode: boolean;
  mockRole: UserOidcRole | null;
}): ReactElement {
  const { children, currentUser: currentUserData, isDevMode, mockRole } = props;
  const keycloakRole = currentUserData.role;
  const role = canUseCurrentUserRoleMock(isDevMode)
    ? (mockRole ?? keycloakRole)
    : keycloakRole;
  // eslint-disable-next-line no-restricted-syntax -- Context consumers rely on stable identity when the resolved user and role are unchanged.
  const contextValue = useMemo(() => {
    const currentUser = {
      ...currentUserData,
      role,
    };

    return {
      currentUser,
      displayName: getCurrentUserDisplayName(currentUser),
      keycloakRole,
      role,
      userId: currentUser.userId,
    };
  }, [currentUserData, keycloakRole, role]);

  return (
    <CurrentUserContext.Provider value={contextValue}>
      {children}
    </CurrentUserContext.Provider>
  );
}

export function CurrentUserLoadingScreen(): ReactElement {
  const { t } = useTranslation('shared');

  return (
    <div
      className="flex min-h-svh flex-col items-center justify-center gap-4 bg-bg-secondary p-6"
      role="status"
      aria-live="polite"
    >
      <Loader2
        className="size-10 animate-spin text-text-secondary"
        aria-hidden="true"
      />
      <p className="text-base text-text-secondary">{t('app.loading')}</p>
    </div>
  );
}

function CurrentUserLoadErrorScreen(): ReactElement {
  const { t } = useTranslation('shared');

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-bg-secondary p-6">
      <div
        className="flex w-full max-w-[36rem] flex-col gap-4 rounded-xl border border-border-primary bg-neutral-white p-8 shadow-sm"
        role="alert"
        aria-live="assertive"
      >
        <div className="flex flex-col gap-2">
          <h1 className="text-heading-lg">{t('currentUserLoadError.title')}</h1>
          <p className="text-base text-text-secondary">
            {t('currentUserLoadError.description')}
          </p>
        </div>
        <Button
          type="button"
          size="lg"
          onClick={() => {
            window.location.reload();
          }}
        >
          {t('currentUserLoadError.reload')}
        </Button>
      </div>
    </div>
  );
}

export function CurrentUserProvider(props: {
  children: ReactNode;
}): ReactElement {
  const { children } = props;
  const query = useQuery(getCurrentUserQueryOptions());
  const [mockRole] = useCurrentUserRoleMock();
  const [isDevMode] = useDevMode();

  if (query.isPending) {
    return <CurrentUserLoadingScreen />;
  }

  if (query.isError) {
    return <CurrentUserLoadErrorScreen />;
  }

  return (
    <CurrentUserContextProvider
      currentUser={query.data}
      isDevMode={isDevMode}
      mockRole={mockRole}
    >
      {children}
    </CurrentUserContextProvider>
  );
}

export function useCurrentUser(): CurrentUserContextValue {
  const currentUser = useContext(CurrentUserContext);

  if (!currentUser) {
    throw new Error('useCurrentUser must be used within CurrentUserProvider');
  }

  return currentUser;
}
