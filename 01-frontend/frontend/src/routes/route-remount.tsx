import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';

export const Route = createFileRoute('/route-remount')({
  component: RouteRemountPage,
});

const ROUTE_REMOUNT_PATH = '/route-remount';
const ESCAPE_TIMEOUT_MS = 2000;
const HISTORY_BACK_SETTLE_MS = 250;

const isRouteRemountPath = (pathname: string) =>
  pathname === ROUTE_REMOUNT_PATH || pathname.endsWith(ROUTE_REMOUNT_PATH);

export function RouteRemountPage() {
  const router = useRouter();

  // eslint-disable-next-line no-restricted-syntax -- route-remount is a temporary blank route; this escape hatch prevents failed remount flows from stranding users there.
  useEffect(() => {
    let fallbackTimer: number | undefined;
    const escapeTimer = window.setTimeout(() => {
      if (!isRouteRemountPath(router.state.location.pathname)) {
        return;
      }

      window.history.back();

      fallbackTimer = window.setTimeout(() => {
        if (!isRouteRemountPath(router.state.location.pathname)) {
          return;
        }

        void router.navigate({
          to: '/',
          replace: true,
          resetScroll: false,
        });
      }, HISTORY_BACK_SETTLE_MS);
    }, ESCAPE_TIMEOUT_MS);

    return () => {
      window.clearTimeout(escapeTimer);
      if (fallbackTimer !== undefined) {
        window.clearTimeout(fallbackTimer);
      }
    };
  }, [router]);

  return null;
}
