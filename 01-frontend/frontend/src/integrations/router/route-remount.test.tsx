import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteRemountPage } from '@/routes/route-remount';

const mocks = vi.hoisted(() => ({
  router: {
    state: {
      location: {
        pathname: '/route-remount',
      },
    },
    navigate: vi.fn(),
  },
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => config,
  useRouter: () => mocks.router,
}));

describe('RouteRemountPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.router.state.location.pathname = '/route-remount';
    mocks.router.navigate.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    cleanup();
  });

  it('uses browser back after the escape timeout when still on route-remount', () => {
    const backSpy = vi
      .spyOn(window.history, 'back')
      .mockImplementation(() => {});

    render(<RouteRemountPage />);

    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(backSpy).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(backSpy).toHaveBeenCalledTimes(1);
  });

  it('clears the fallback timer when unmounted after browser back is requested', () => {
    const backSpy = vi
      .spyOn(window.history, 'back')
      .mockImplementation(() => {});

    const { unmount } = render(<RouteRemountPage />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(backSpy).toHaveBeenCalledTimes(1);

    unmount();

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(mocks.router.navigate).not.toHaveBeenCalled();
  });

  it('clears the escape timer when unmounted before browser back is requested', () => {
    const backSpy = vi
      .spyOn(window.history, 'back')
      .mockImplementation(() => {});

    const { unmount } = render(<RouteRemountPage />);

    unmount();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(backSpy).not.toHaveBeenCalled();
    expect(mocks.router.navigate).not.toHaveBeenCalled();
  });

  it('does not replace to app root when browser back leaves route-remount', () => {
    vi.spyOn(window.history, 'back').mockImplementation(() => {
      mocks.router.state.location.pathname = '/verfahren/project-1/';
    });

    render(<RouteRemountPage />);

    act(() => {
      vi.advanceTimersByTime(2250);
    });

    expect(mocks.router.navigate).not.toHaveBeenCalled();
  });

  it('replaces to app root when browser back stays on route-remount', () => {
    vi.spyOn(window.history, 'back').mockImplementation(() => {});

    render(<RouteRemountPage />);

    act(() => {
      vi.advanceTimersByTime(2250);
    });

    expect(mocks.router.navigate).toHaveBeenCalledWith({
      to: '/',
      replace: true,
      resetScroll: false,
    });
  });

  it('treats route-remount under the app base path as recoverable', () => {
    mocks.router.state.location.pathname = '/app/route-remount';
    const backSpy = vi
      .spyOn(window.history, 'back')
      .mockImplementation(() => {});

    render(<RouteRemountPage />);

    act(() => {
      vi.advanceTimersByTime(2250);
    });

    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(mocks.router.navigate).toHaveBeenCalledWith({
      to: '/',
      replace: true,
      resetScroll: false,
    });
  });
});
