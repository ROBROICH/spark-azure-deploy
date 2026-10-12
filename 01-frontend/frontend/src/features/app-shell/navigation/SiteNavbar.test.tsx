import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SiteNavbar } from './SiteNavbar';

const mocks = vi.hoisted(() => ({
  allowDevMode: true,
  roleSwitcherFeatureEnabled: false,
  isDevMode: false,
  currentUserRole: 'user' as 'admin' | 'user',
  currentPath: '/',
  setDevMode: vi.fn(),
  setOpenMobile: vi.fn(),
  toggleSidebar: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

type MockRouterState = {
  location: {
    pathname: string;
  };
};

vi.mock('@tanstack/react-router', () => ({
  useRouterState: (options?: {
    select?: (state: MockRouterState) => unknown;
  }) => {
    const routerState: MockRouterState = {
      location: {
        pathname: mocks.currentPath,
      },
    };

    return options?.select ? options.select(routerState) : routerState;
  },
}));

vi.mock(
  '@/features/workflow-runtime/system-load/SystemLoadSidebarButton',
  () => ({
    SystemLoadSidebarButton: () => <div />,
  }),
);

vi.mock('@/features/access-control/current-user/CurrentUserProvider', () => ({
  useCurrentUser: () => ({
    displayName: 'Test User',
    role: mocks.currentUserRole,
  }),
}));

vi.mock('@/features/shared/config/runtimeEnvironment', () => ({
  isRuntimeEnvironment: () => false,
}));

vi.mock('@/features/shared/config/roleSwitcherFeature', () => ({
  isRoleSwitcherFeatureEnabled: () => mocks.roleSwitcherFeatureEnabled,
}));

vi.mock('@/features/dev-mode/useDevMode', () => ({
  isDevModeAllowed: () => mocks.allowDevMode,
  useDevMode: () => [mocks.isDevMode, mocks.setDevMode],
}));

vi.mock('@/features/project/data/project-favorites/useFavorites', () => ({
  useFavorites: () => ({
    favoriteIds: [],
  }),
}));

vi.mock('./LanguageSwitcher', () => ({
  LanguageSwitcher: () => <div />,
}));

vi.mock('../../access-control/current-user/RoleSwitcher', () => ({
  RoleSwitcher: () => <div data-testid="role-switcher" />,
}));

vi.mock('@/features/product-mode/AdminMenu', () => ({
  AdminMenu: () => <div data-testid="product-mode-switcher" />,
}));

vi.mock('./CurrentProjectCard', () => ({
  CurrentProjectCard: () => <div />,
}));

vi.mock('./CurrentUserAvatar', () => ({
  CurrentUserAvatar: () => <span />,
}));

vi.mock('./SiteNavbarFavoriteProjectNavItem', () => ({
  SiteNavbarFavoriteProjectNavItem: () => <div />,
}));

vi.mock('@/features/ui/sidebar/Sidebar', async () => {
  const React = await import('react');

  type BaseProps = {
    children?: React.ReactNode;
  };

  type ButtonProps = BaseProps & {
    'aria-label'?: string;
    disabled?: boolean;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    type?: 'button' | 'submit' | 'reset';
  };

  type LinkButtonProps = BaseProps & {
    'aria-label'?: string;
    isActive?: boolean;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
    to?: string;
  };

  const Div = (props: BaseProps) => <div>{props.children}</div>;
  const Ul = (props: BaseProps) => <ul>{props.children}</ul>;
  const Li = (props: BaseProps) => <li>{props.children}</li>;
  const Span = (props: BaseProps) => <span>{props.children}</span>;

  const SidebarMenuButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
    function SidebarMenuButton(props, ref) {
      return (
        <button
          ref={ref}
          type={props.type ?? 'button'}
          aria-label={props['aria-label']}
          disabled={props.disabled}
          onClick={props.onClick}
        >
          {props.children}
        </button>
      );
    },
  );

  const SidebarMenuLinkButton = (props: LinkButtonProps) => (
    <a
      href={props.to ?? '#'}
      aria-label={props['aria-label']}
      aria-current={props.isActive ? 'page' : undefined}
      onClick={(event) => {
        event.preventDefault();
        props.onClick?.(event);
      }}
    >
      {props.children}
    </a>
  );

  return {
    Sidebar: Div,
    SidebarBrand: Div,
    SidebarContent: Div,
    SidebarFooter: Div,
    SidebarGroup: Div,
    SidebarGroupContent: Div,
    SidebarGroupLabel: Div,
    SidebarHeader: Div,
    SidebarLabel: Span,
    SidebarMenu: Ul,
    SidebarMenuButton,
    SidebarMenuItem: Li,
    SidebarMenuLinkButton,
    SidebarSeparator: Div,
    useSidebar: () => ({
      open: true,
      setOpenMobile: mocks.setOpenMobile,
      toggleSidebar: mocks.toggleSidebar,
    }),
  };
});

async function clickLogoTimes(times: number) {
  const user = userEvent.setup();
  const logoButton = screen.getByRole('button', { name: 'SPARK Workflow' });

  for (let clickIndex = 0; clickIndex < times; clickIndex += 1) {
    // eslint-disable-next-line no-await-in-loop -- Ordered clicks preserve the logo click-count state transitions under test.
    await user.click(logoButton);
  }
}

describe('SiteNavbar', () => {
  afterEach(() => {
    cleanup();
    mocks.allowDevMode = true;
    mocks.roleSwitcherFeatureEnabled = false;
    mocks.isDevMode = false;
    mocks.currentUserRole = 'user';
    mocks.currentPath = '/';
    mocks.setDevMode.mockClear();
    mocks.setOpenMobile.mockClear();
    mocks.toggleSidebar.mockClear();
  });

  it('enables dev mode after seven logo clicks', async () => {
    render(<SiteNavbar />);

    await clickLogoTimes(7);

    expect(mocks.setDevMode).toHaveBeenCalledTimes(1);
    const toggleDevMode = mocks.setDevMode.mock.calls[0]?.[0];

    expect(typeof toggleDevMode).toBe('function');
    expect(toggleDevMode(false)).toBe(true);
  });

  it('does not enable dev mode after seven logo clicks when dev mode is not allowed', async () => {
    mocks.allowDevMode = false;
    render(<SiteNavbar />);

    await clickLogoTimes(7);

    expect(mocks.setDevMode).not.toHaveBeenCalled();
  });

  it('disables dev mode after seven logo clicks while dev mode is active', async () => {
    mocks.isDevMode = true;
    render(<SiteNavbar />);

    await clickLogoTimes(7);

    expect(mocks.setDevMode).toHaveBeenCalledTimes(1);
    const toggleDevMode = mocks.setDevMode.mock.calls[0]?.[0];

    expect(typeof toggleDevMode).toBe('function');
    expect(toggleDevMode(true)).toBe(false);
  });

  it('closes the mobile sidebar when primary navigation is clicked', async () => {
    const user = userEvent.setup();
    render(<SiteNavbar />);

    await user.click(screen.getByRole('link', { name: 'sidebar.projects' }));

    expect(mocks.setOpenMobile).toHaveBeenCalledWith(false);
  });

  it('renders the role switcher when dev mode and the dangerous role switcher flag are active', () => {
    mocks.isDevMode = true;
    mocks.roleSwitcherFeatureEnabled = true;

    render(<SiteNavbar />);

    expect(screen.getByTestId('role-switcher')).toBeTruthy();
  });

  it('hides the role switcher when dev mode is inactive', () => {
    mocks.roleSwitcherFeatureEnabled = true;

    render(<SiteNavbar />);

    expect(screen.queryByTestId('role-switcher')).toBeNull();
  });

  it('hides the role switcher when the dangerous role switcher flag is inactive', () => {
    mocks.isDevMode = true;

    render(<SiteNavbar />);

    expect(screen.queryByTestId('role-switcher')).toBeNull();
  });

  it('hides the product mode switch while dev mode is inactive', () => {
    render(<SiteNavbar />);

    expect(screen.queryByTestId('product-mode-switcher')).toBeNull();
  });

  it('shows the product mode switch only after dev mode is activated', () => {
    mocks.isDevMode = true;

    render(<SiteNavbar />);

    expect(screen.getByTestId('product-mode-switcher')).toBeTruthy();
  });

  it('renders the administration destination for admins', () => {
    mocks.currentUserRole = 'admin';

    render(<SiteNavbar />);

    expect(
      screen.getByRole('link', { name: 'sidebar.administration' }),
    ).toBeTruthy();
  });

  it('hides the administration destination for regular users', () => {
    mocks.currentUserRole = 'user';

    render(<SiteNavbar />);

    expect(
      screen.queryByRole('link', { name: 'sidebar.administration' }),
    ).toBeNull();
  });

  it('keeps the administration destination active on nested project-type routes', () => {
    mocks.currentUserRole = 'admin';
    mocks.currentPath = '/administration/type-1';

    render(<SiteNavbar />);

    expect(
      screen
        .getByRole('link', { name: 'sidebar.administration' })
        .getAttribute('aria-current'),
    ).toBe('page');
  });
});
