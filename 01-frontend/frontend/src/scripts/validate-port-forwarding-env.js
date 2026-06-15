import { config } from 'dotenv';
import path from 'node:path';

const REQUIRED_PORT_FORWARDING_ENV_KEYS = [
  'VITE_LOCAL_USER_ID',
  'VITE_LOCAL_USER_EMAIL',
  'VITE_LOCAL_USER_FIRST_NAME',
  'VITE_LOCAL_USER_LAST_NAME',
];

config();
config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

const missingKeys = REQUIRED_PORT_FORWARDING_ENV_KEYS.filter((key) => {
  const value = process.env[key]?.trim();

  return !value;
});

if (missingKeys.length > 0) {
  const formattedKeys = missingKeys.map((key) => `- ${key}`).join('\n');

  throw new Error(
    `pnpm dev:port-forwarding requires these .env.local values:\n${formattedKeys}`,
  );
}
