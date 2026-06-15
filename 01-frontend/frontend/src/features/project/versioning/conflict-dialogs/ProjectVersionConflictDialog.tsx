import { Button } from '@/features/ui/button/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/features/ui/dialog/Dialog';
import { experimentalRouteRemount } from '@/integrations/router/routeRemount';
import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProjectVersionConflictKind } from './projectVersionConflict';

const LOCKED_COUNTDOWN_SECONDS = 15;

const remountProjectRoute = async (
  projectId: string,
  onRecovered: ((recoveredProjectId: string) => void) | undefined,
) => {
  await experimentalRouteRemount(projectId);
  // Pass the resolved project id back so the owner only clears state when the
  // recovered project still matches the active conflict.
  onRecovered?.(projectId);
};

type ProjectVersionConflictDialogProps = {
  kind: ProjectVersionConflictKind;
  onRecovered?: (recoveredProjectId: string) => void;
  projectId: string;
};

export function ProjectVersionConflictDialog(
  props: ProjectVersionConflictDialogProps,
): ReactElement {
  const { kind, onRecovered, projectId } = props;
  const { t } = useTranslation('Versioning');
  // eslint-disable-next-line no-restricted-syntax -- this countdown is transient dialog UI state and does not belong in the route URL.
  const [secondsRemaining, setSecondsRemaining] = useState(
    LOCKED_COUNTDOWN_SECONDS,
  );

  // eslint-disable-next-line no-restricted-syntax -- version-locked conflicts auto-refresh after a visible countdown.
  useEffect(() => {
    if (kind !== 'version_locked') {
      return;
    }

    if (secondsRemaining <= 0) {
      void remountProjectRoute(projectId, onRecovered);
      return;
    }

    const timerId = window.setTimeout(() => {
      setSecondsRemaining((value) => Math.max(0, value - 1));
    }, 1000);

    return () => window.clearTimeout(timerId);
  }, [kind, onRecovered, projectId, secondsRemaining]);

  const dialogKey =
    kind === 'not_latest'
      ? 'projectVersionConflictDialog.notLatest'
      : 'projectVersionConflictDialog.versionLocked';

  return (
    <Dialog open={true}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md"
        onEscapeKeyDown={(event) => {
          event.preventDefault();
        }}
        onInteractOutside={(event) => {
          event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t(`${dialogKey}.title`)}</DialogTitle>
        </DialogHeader>
        <DialogDescription className="px-4 pt-4 text-base leading-6 text-text-secondary">
          {kind === 'version_locked'
            ? t('projectVersionConflictDialog.versionLocked.description', {
                count: secondsRemaining,
              })
            : t('projectVersionConflictDialog.notLatest.description')}
        </DialogDescription>
        <DialogFooter className="px-4 pt-2 pb-4">
          <Button
            type="button"
            size="lg"
            onClick={() => void remountProjectRoute(projectId, onRecovered)}
          >
            {t(`${dialogKey}.action`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
