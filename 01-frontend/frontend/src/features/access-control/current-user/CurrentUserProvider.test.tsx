import '@testing-library/jest-dom/vitest';
import { v1IdentityGetCurrentIdentity as getCurrentIdentity } from '@/api-clients/backend/sdk.gen';
import type {
  IdentityResponse,
  OidcRole,
} from '@/api-clients/backend/types.gen';
import { DEV_MODE_STORAGE_KEY } from '@/features/dev-mode/useDevMode';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PureComponent, memo, useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CurrentUserProvider, useCurrentUser } from './CurrentUserProvider';
import { CURRENT_USER_ROLE_MOCK_STORAGE_KEY } from './currentUserRoleMock';

vi.mock('@/api-clients/backend/sdk.gen', () => ({
  v1IdentityGetCurrentIdentity: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const getIdentityMeGetMock = vi.mocked(getCurrentIdentity);

const originalLocation = window.location;

type IdentityClientResult = {
  data: IdentityResponse;
  error: undefined;
};

const createIdentityClientResult = (
  identity: IdentityResponse,
): IdentityClientResult => ({
  data: identity,
  error: undefined,
});

function CurrentUserProbe() {
  const { keycloakRole, role } = useCurrentUser();

  return (
    <div data-testid="current-user-roles">{`${role}/${keycloakRole}`}</div>
  );
}

type RenderCountDisplayProps = {
  role: string;
};

class RenderCountDisplay extends PureComponent<RenderCountDisplayProps> {
  private renderCount = 0;

  override render() {
    this.renderCount += 1;

    return (
      <div data-testid="render-count">{`${this.props.role}/${this.renderCount}`}</div>
    );
  }
}

const MemoizedRenderCountProbe = memo(function MemoizedRenderCountProbe() {
  const { role } = useCurrentUser();

  return <RenderCountDisplay role={role} />;
});

function CurrentUserProviderRerenderHarness() {
  // eslint-disable-next-line no-restricted-syntax -- Local test harness state triggers an unrelated parent rerender without involving router state.
  const [count, setCount] = useState(0);

  return (
    <div>
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        rerender {count}
      </button>
      <CurrentUserProvider>
        <MemoizedRenderCountProbe />
      </CurrentUserProvider>
    </div>
  );
}

function renderWithQueryClient(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  );
}

function renderCurrentUserProvider() {
  renderWithQueryClient(
    <CurrentUserProvider>
      <CurrentUserProbe />
    </CurrentUserProvider>,
  );
}

describe('CurrentUserProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DEV_API_MODE', '');
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'production');
    getIdentityMeGetMock.mockReset();
    getIdentityMeGetMock.mockResolvedValue(
      createIdentityClientResult({
        userId: 'user-1',
        email: 'user@example.com',
        firstName: null,
        lastName: null,
        role: 'user',
      }),
    );
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    vi.unstubAllEnvs();
  });

  it('renders the current-user loading status while the query is pending', () => {
    getIdentityMeGetMock.mockReturnValue(new Promise<never>(() => undefined));

    renderCurrentUserProvider();

    expect(screen.getByRole('status')).toHaveTextContent('app.loading');
  });

  it('renders a focused alert with a reload action when loading fails', async () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        reload: reloadMock,
      },
    });
    getIdentityMeGetMock.mockRejectedValue(new Error('backend detail'));

    renderCurrentUserProvider();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'currentUserLoadError.title',
    );
    const reloadButton = screen.getByRole('button', {
      name: 'currentUserLoadError.reload',
    });

    reloadButton.focus();
    expect(reloadButton).toHaveFocus();

    await userEvent.click(reloadButton);

    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it.each<{ label: string; role: OidcRole | null }>([
    { label: 'service role', role: 'service' },
    { label: 'null role', role: null },
  ])('renders the error screen for a backend $label', async ({ role }) => {
    getIdentityMeGetMock.mockResolvedValue(
      createIdentityClientResult({
        userId: 'user-1',
        email: 'user@example.com',
        firstName: null,
        lastName: null,
        role,
      }),
    );

    renderCurrentUserProvider();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'currentUserLoadError.title',
    );
    expect(screen.queryByTestId('current-user-roles')).toBeNull();
  });

  it('ignores stored role mocks outside the dev tooling boundary', async () => {
    window.localStorage.setItem(
      CURRENT_USER_ROLE_MOCK_STORAGE_KEY,
      JSON.stringify('admin'),
    );

    renderCurrentUserProvider();

    expect(await screen.findByTestId('current-user-roles')).toHaveTextContent(
      'user/user',
    );
  });

  it('ignores stored role mocks in testing when dev mode is inactive', async () => {
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'testing');
    vi.stubEnv('VITE_DANGEROUS_ENABLE_ROLE_SWITCHER', 'true');
    window.localStorage.setItem(
      CURRENT_USER_ROLE_MOCK_STORAGE_KEY,
      JSON.stringify('admin'),
    );

    renderCurrentUserProvider();

    expect(await screen.findByTestId('current-user-roles')).toHaveTextContent(
      'user/user',
    );
  });

  it('ignores stored role mocks in testing when the role switcher feature is disabled', async () => {
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'testing');
    vi.stubEnv('ALLOW_DEV_MODE', 'true');
    vi.stubEnv('VITE_DANGEROUS_ENABLE_ROLE_SWITCHER', 'false');
    window.localStorage.setItem(DEV_MODE_STORAGE_KEY, JSON.stringify(true));
    window.localStorage.setItem(
      CURRENT_USER_ROLE_MOCK_STORAGE_KEY,
      JSON.stringify('admin'),
    );

    renderCurrentUserProvider();

    expect(await screen.findByTestId('current-user-roles')).toHaveTextContent(
      'user/user',
    );
  });

  it('applies stored role mocks when dev mode is active in testing', async () => {
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'testing');
    vi.stubEnv('ALLOW_DEV_MODE', 'true');
    vi.stubEnv('VITE_DANGEROUS_ENABLE_ROLE_SWITCHER', 'true');
    window.localStorage.setItem(DEV_MODE_STORAGE_KEY, JSON.stringify(true));
    window.localStorage.setItem(
      CURRENT_USER_ROLE_MOCK_STORAGE_KEY,
      JSON.stringify('admin'),
    );

    renderCurrentUserProvider();

    expect(await screen.findByTestId('current-user-roles')).toHaveTextContent(
      'admin/user',
    );
  });

  it('applies stored user role mocks when dev mode is active in testing', async () => {
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'testing');
    vi.stubEnv('ALLOW_DEV_MODE', 'true');
    vi.stubEnv('VITE_DANGEROUS_ENABLE_ROLE_SWITCHER', 'true');
    getIdentityMeGetMock.mockResolvedValue({
      data: {
        userId: 'admin-1',
        email: 'admin@example.com',
        firstName: null,
        lastName: null,
        role: 'admin',
      },
      error: undefined,
    });
    window.localStorage.setItem(DEV_MODE_STORAGE_KEY, JSON.stringify(true));
    window.localStorage.setItem(
      CURRENT_USER_ROLE_MOCK_STORAGE_KEY,
      JSON.stringify('user'),
    );

    renderCurrentUserProvider();

    expect(await screen.findByTestId('current-user-roles')).toHaveTextContent(
      'user/admin',
    );
  });

  it('rejects stale stored role mocks even when dev mode is active', async () => {
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'testing');
    vi.stubEnv('ALLOW_DEV_MODE', 'true');
    vi.stubEnv('VITE_DANGEROUS_ENABLE_ROLE_SWITCHER', 'true');
    window.localStorage.setItem(DEV_MODE_STORAGE_KEY, JSON.stringify(true));
    window.localStorage.setItem(
      CURRENT_USER_ROLE_MOCK_STORAGE_KEY,
      JSON.stringify('service'),
    );

    renderCurrentUserProvider();

    expect(await screen.findByTestId('current-user-roles')).toHaveTextContent(
      'user/user',
    );
  });

  it('keeps memoized consumers stable across unrelated parent rerenders', async () => {
    renderWithQueryClient(<CurrentUserProviderRerenderHarness />);

    expect(await screen.findByTestId('render-count')).toHaveTextContent(
      'user/1',
    );

    await userEvent.click(screen.getByRole('button', { name: /rerender 0/u }));

    expect(screen.getByTestId('render-count')).toHaveTextContent('user/1');
  });
});
