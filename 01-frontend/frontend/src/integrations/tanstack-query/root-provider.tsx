import * as Sentry from '@sentry/react';
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { SessionExpiredDialog } from '@/features/access-control/current-user/SessionExpiredDialog';
import { subscribeSessionExpired } from '@/features/access-control/current-user/sessionExpired';
import { ProjectVersionConflictDialog } from '@/features/project/versioning/conflict-dialogs/ProjectVersionConflictDialog';
import { isHandledProjectVersionConflictError } from '@/integrations/api-clients/projectVersionConflictHandledError';
import {
  subscribeProjectVersionConflict,
  type ProjectVersionConflict,
} from '@/features/project/versioning/conflict-dialogs/projectVersionConflict';
import { getMountedProjectIds } from '@/features/project/versioning/projectVersioning';

type TanstackErrorKind = 'mutation' | 'query';

type GeneratedOperationTelemetry = {
  operationId?: string;
  infinite?: true;
};

type ErrorTelemetry = {
  errorName?: string;
  httpStatus?: number;
  nonErrorThrownType?: string;
  nonErrorThrownKeys?: string[];
};

const GENERATED_QUERY_KEY_TELEMETRY_FIELDS = {
  _id: 'operationId',
  _infinite: 'infinite',
} as const;

function getAllowlistedGeneratedQueryKeyTelemetry(
  key: ReadonlyArray<unknown> | undefined,
): GeneratedOperationTelemetry {
  const firstKeyPart = key?.[0];

  if (typeof firstKeyPart !== 'object' || firstKeyPart === null) {
    return {};
  }

  const keyShape = firstKeyPart as Record<string, unknown>;
  const telemetry: GeneratedOperationTelemetry = {};

  if (typeof keyShape._id === 'string') {
    telemetry[GENERATED_QUERY_KEY_TELEMETRY_FIELDS._id] = keyShape._id;
  }

  if (keyShape._infinite === true) {
    telemetry[GENERATED_QUERY_KEY_TELEMETRY_FIELDS._infinite] = true;
  }

  return telemetry;
}

function getHttpStatus(error: Record<string, unknown>): number | undefined {
  const status = error.status ?? error.statusCode;
  return typeof status === 'number' ? status : undefined;
}

function getScalarThrownType(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null) {
    return undefined;
  }

  return error === null ? 'null' : typeof error;
}

function getNonErrorObjectTelemetry(
  error: Record<string, unknown>,
): Pick<ErrorTelemetry, 'nonErrorThrownKeys' | 'nonErrorThrownType'> {
  const keys = Object.keys(error).sort();

  if (keys.length === 0) {
    return { nonErrorThrownType: 'empty-object' };
  }

  return {
    nonErrorThrownKeys: keys,
    nonErrorThrownType: 'object',
  };
}

function getNonErrorThrownTelemetry(
  error: unknown,
): Pick<ErrorTelemetry, 'nonErrorThrownKeys' | 'nonErrorThrownType'> {
  if (error instanceof Error) {
    return {};
  }

  const scalarType = getScalarThrownType(error);

  if (scalarType !== undefined) {
    return { nonErrorThrownType: scalarType };
  }

  return getNonErrorObjectTelemetry(error as Record<string, unknown>);
}

function getAllowlistedErrorTelemetry(error: unknown): ErrorTelemetry {
  const telemetry: ErrorTelemetry = {
    ...getNonErrorThrownTelemetry(error),
  };

  if (error instanceof Error) {
    telemetry.errorName = error.name;
  }

  if (typeof error === 'object' && error !== null) {
    const errorShape = error as Record<string, unknown>;
    const status = getHttpStatus(errorShape);

    if (status !== undefined) {
      telemetry.httpStatus = status;
    }
  }

  return telemetry;
}

function getErrorForCapture(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error('TanStack Query captured a non-Error thrown value');
}

export function createTanstackErrorTelemetry(
  kind: TanstackErrorKind,
  key: ReadonlyArray<unknown> | undefined,
  error: unknown,
): Record<string, unknown> {
  return {
    kind,
    ...getAllowlistedGeneratedQueryKeyTelemetry(key),
    ...getAllowlistedErrorTelemetry(error),
  };
}

function reportQueryError(
  error: unknown,
  context: Record<string, unknown>,
): void {
  Sentry.captureException(getErrorForCapture(error), {
    tags: {
      area: 'tanstack-query',
    },
    extra: context,
  });
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (isHandledProjectVersionConflictError(error)) {
        return;
      }

      reportQueryError(error, {
        ...createTanstackErrorTelemetry('query', query.queryKey, error),
      });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (isHandledProjectVersionConflictError(error)) {
        return;
      }

      reportQueryError(error, {
        ...createTanstackErrorTelemetry(
          'mutation',
          mutation.options.mutationKey,
          error,
        ),
      });
    },
  }),
});

export function getContext() {
  return {
    queryClient,
  };
}

/**
 * Hosts the shared query client and bridges session/version-conflict events into
 * global blocking dialogs that sit outside individual route subtrees.
 */
export function Provider({
  children,
  queryClient: client,
}: {
  children: ReactNode;
  queryClient: QueryClient;
}) {
  // eslint-disable-next-line no-restricted-syntax -- Session expiry is ephemeral UI state derived from API transport failures, not route state.
  const [isSessionExpired, setIsSessionExpired] = useState(false);
  const [projectVersionConflict, setProjectVersionConflict] =
    // eslint-disable-next-line no-restricted-syntax -- version conflicts are blocking write feedback emitted by explicit versioned mutation paths.
    useState<ProjectVersionConflict | null>(null);

  // eslint-disable-next-line no-restricted-syntax -- The provider bridges transport events into React state for the global session-expired dialog.
  useEffect(() => {
    return subscribeSessionExpired(() => {
      setIsSessionExpired(true);
    });
  }, []);

  // eslint-disable-next-line no-restricted-syntax -- The provider bridges explicit version-conflict events into React state for the blocking dialog.
  useEffect(() => {
    return subscribeProjectVersionConflict((conflict) => {
      // Fail closed: only honor conflicts for a project the user is currently
      // viewing. This prevents any same-origin code from dispatching a foreign
      // or stale projectId that would block or remount the active route.
      if (!getMountedProjectIds().has(conflict.projectId)) {
        return;
      }

      setProjectVersionConflict((currentConflict) => {
        if (
          currentConflict?.kind === 'version_locked' &&
          conflict.kind === 'not_latest'
        ) {
          return currentConflict;
        }

        return conflict;
      });
    });
  }, []);

  return (
    <QueryClientProvider client={client}>
      {children}
      <SessionExpiredDialog open={isSessionExpired} />
      {projectVersionConflict ? (
        <ProjectVersionConflictDialog
          kind={projectVersionConflict.kind}
          onRecovered={(recoveredProjectId) =>
            setProjectVersionConflict((currentConflict) =>
              currentConflict?.projectId === recoveredProjectId
                ? null
                : currentConflict,
            )
          }
          projectId={projectVersionConflict.projectId}
        />
      ) : null}
    </QueryClientProvider>
  );
}
