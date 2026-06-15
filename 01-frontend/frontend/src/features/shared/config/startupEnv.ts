type LocalDevCurrentUserEnvKey =
  | 'VITE_LOCAL_USER_ID'
  | 'VITE_LOCAL_USER_EMAIL'
  | 'VITE_LOCAL_USER_FIRST_NAME'
  | 'VITE_LOCAL_USER_LAST_NAME';

function getRequiredTrimmedEnv(key: LocalDevCurrentUserEnvKey): string {
  const rawValue: string | undefined = import.meta.env[key];
  const value = rawValue?.trim();

  if (!value) {
    throw new Error(`${key} is required in local dev`);
  }

  return value;
}

export function getLocalDevCurrentUserEnv() {
  return {
    userId: getRequiredTrimmedEnv('VITE_LOCAL_USER_ID'),
    email: getRequiredTrimmedEnv('VITE_LOCAL_USER_EMAIL'),
    firstName: getRequiredTrimmedEnv('VITE_LOCAL_USER_FIRST_NAME'),
    lastName: getRequiredTrimmedEnv('VITE_LOCAL_USER_LAST_NAME'),
  };
}
