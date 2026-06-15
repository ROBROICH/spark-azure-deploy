import type { UserOidcRole } from '@/api-clients/identity-management-module/types.gen';
import { useLocalStorage } from '@/features/shared/browser-storage/useLocalStorage';
import { z } from 'zod';

export const CURRENT_USER_ROLE_MOCK_STORAGE_KEY = 'CURRENT_USER_ROLE_MOCK';

const currentUserRoleMockSchema = z
  .union([z.literal('admin'), z.literal('user')])
  .nullable();

export function useCurrentUserRoleMock() {
  return useLocalStorage<UserOidcRole | null, typeof currentUserRoleMockSchema>(
    {
      key: CURRENT_USER_ROLE_MOCK_STORAGE_KEY,
      initialValue: null,
      schema: currentUserRoleMockSchema,
    },
  );
}
