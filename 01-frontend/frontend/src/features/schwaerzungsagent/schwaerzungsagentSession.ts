import { useLocalStorage } from '@/features/shared/browser-storage/useLocalStorage';
import { z } from 'zod';
import { getRedactedFilename } from './schwaerzungsagentUtils';

export const SCHWAERZUNGSAGENT_SESSION_STORAGE_KEY =
  'schwaerzungsagent.session';

const SESSION_SCHEMA_VERSION = 1;

const schwaerzungsagentSessionSchema = z.object({
  version: z.literal(SESSION_SCHEMA_VERSION),
  requestId: z.string().min(1),
  originalFilename: z.string().min(1),
  redactedFilename: z.string().min(1),
  fileSize: z.number().int().nonnegative(),
  startedAt: z.number().int().positive(),
  estimatedDurationMs: z.number().int().positive(),
  resultAvailableAt: z.number().int().positive().optional(),
});

export type SchwaerzungsagentSession = z.infer<
  typeof schwaerzungsagentSessionSchema
>;

const storedSessionSchema = schwaerzungsagentSessionSchema.nullable();

const getRequestId = () => {
  return globalThis.crypto.randomUUID();
};

const isSessionForFile = (
  session: SchwaerzungsagentSession | null,
  file: File,
): session is SchwaerzungsagentSession =>
  session?.originalFilename === file.name && session.fileSize === file.size;

const createSession = (
  file: File,
  estimatedDurationMs: number,
  redactedFilenameSuffix: string,
): SchwaerzungsagentSession => ({
  version: SESSION_SCHEMA_VERSION,
  requestId: getRequestId(),
  originalFilename: file.name,
  redactedFilename: getRedactedFilename({
    filename: file.name,
    redactedFilenameSuffix,
  }),
  fileSize: file.size,
  startedAt: Date.now(),
  estimatedDurationMs,
});

/**
 * Owns resumable workflow metadata persistence while keeping PDF blobs outside
 * browser storage.
 */
export const useSchwaerzungsagentSession = () => {
  const [session, setSession] = useLocalStorage({
    key: SCHWAERZUNGSAGENT_SESSION_STORAGE_KEY,
    storage: 'session',
    initialValue: null as SchwaerzungsagentSession | null,
    schema: storedSessionSchema,
  });

  const startOrResumeSession = (
    file: File,
    estimatedDurationMs: number,
    redactedFilenameSuffix: string,
  ) => {
    if (isSessionForFile(session, file)) {
      const resumedSession = {
        ...session,
        estimatedDurationMs,
        redactedFilename: getRedactedFilename({
          filename: file.name,
          redactedFilenameSuffix,
        }),
      };
      setSession(resumedSession);
      return false;
    }

    const nextSession = createSession(
      file,
      estimatedDurationMs,
      redactedFilenameSuffix,
    );
    setSession(nextSession);
    return true;
  };

  const markSessionCompleted = (requestId: string) => {
    setSession((currentSession) => {
      if (!currentSession || currentSession.requestId !== requestId) {
        return currentSession;
      }

      return {
        ...currentSession,
        resultAvailableAt: Date.now(),
      };
    });
  };

  const clearSession = () => {
    setSession(null);
  };

  return {
    clearSession,
    markSessionCompleted,
    session,
    startOrResumeSession,
  };
};
