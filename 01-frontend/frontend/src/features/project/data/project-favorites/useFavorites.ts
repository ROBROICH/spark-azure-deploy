import { useCurrentUser } from '@/features/access-control/current-user/CurrentUserProvider';
import { useLocalStorage } from '@/features/shared/browser-storage/useLocalStorage';
import { z } from 'zod';

const favoritesSchema = z.object({
  projectIds: z.array(z.string()),
});

type Favorites = z.infer<typeof favoritesSchema>;

/** Maximum number of projects a user can mark as favorites. */
export const MAX_FAVORITES = 8;

const DEFAULT_STORAGE_KEY = 'dashboard-favorites';
const STORAGE_KEY_PREFIX = 'dashboard-favorites:';
const INITIAL_VALUE: Favorites = { projectIds: [] };

/**
 * Derives a stable, non-reversible token from the user id using a 32-bit
 * FNV-1a hash. Used only to scope the localStorage key per user without
 * persisting the raw user id as a plaintext key fragment (OWASP A02).
 *
 * Mitigation note: this only obfuscates the user-id portion of the storage
 * key. The favorite project ids are still persisted in clear text in this
 * browser because the feature reads them locally. A full fix moves favorites
 * to server-side user preferences; that backend work is deferred and out of
 * scope here.
 * @param userId - The authenticated user id to scope the key to.
 * @returns A short hex token derived from the user id.
 */
function deriveUserKeyToken(userId: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < userId.length; index += 1) {
    hash ^= userId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function makeStorageKey(userId: string | undefined): string {
  return userId
    ? `${STORAGE_KEY_PREFIX}${deriveUserKeyToken(userId)}`
    : DEFAULT_STORAGE_KEY;
}

/**
 * Manages per-user favorite project IDs backed by localStorage.
 *
 * The storage key is scoped to a derived token for the authenticated user's ID
 * so different users on the same browser do not share favorites without storing
 * the raw user ID in the key.
 */
export function useFavorites() {
  const { userId: resolvedUserId } = useCurrentUser();
  const storageKey = makeStorageKey(resolvedUserId);

  const [favorites, setFavorites] = useLocalStorage({
    key: storageKey,
    initialValue: INITIAL_VALUE,
    schema: favoritesSchema,
  });

  const toggle = (projectId: string) => {
    setFavorites((prev) => {
      const exists = prev.projectIds.includes(projectId);
      if (!exists && prev.projectIds.length >= MAX_FAVORITES) {
        return prev;
      }
      return {
        projectIds: exists
          ? prev.projectIds.filter((id) => id !== projectId)
          : [...prev.projectIds, projectId],
      };
    });
  };

  const remove = (projectId: string) => {
    setFavorites((prev) => ({
      projectIds: prev.projectIds.filter((id) => id !== projectId),
    }));
  };

  const isFavorite = (projectId: string) =>
    favorites.projectIds.includes(projectId);

  const canFavorite = favorites.projectIds.length < MAX_FAVORITES;

  return {
    favoriteIds: favorites.projectIds,
    toggle,
    remove,
    isFavorite,
    canFavorite,
  };
}
