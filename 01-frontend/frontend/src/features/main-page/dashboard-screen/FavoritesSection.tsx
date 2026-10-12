import { Button } from '@/features/ui/button/Button';
import { skeletonListProps } from '@/features/ui/skeleton/Skeleton';
import { getRouteApi } from '@tanstack/react-router';
import { ChevronDown, ChevronUp, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Project } from '@/features/main-page/data/schemas/project.schema';
import { FavoriteCard } from './favorite-card/FavoriteCard';
import { FavoriteCardSkeleton } from './favorite-card/FavoriteCardSkeleton';

const rootRoute = getRouteApi('/');

/** Number of favorite cards shown before the show-all toggle reveals the rest. */
const MAX_VISIBLE_FAVORITES = 4;

type FavoritesSectionProps = {
  isLoading: boolean;
  favoriteIds: string[];
  favoriteProjects: Project[];
};

/**
 * Renders the dashboard favorites grid, its loading announcement, and the
 * show-all/show-less toggle. The owner passes in the resolved favorite project
 * list; this section owns the show-all URL state and the visible-slice/overflow
 * derivation.
 */
export const FavoritesSection = (props: FavoritesSectionProps) => {
  const { isLoading, favoriteIds, favoriteProjects } = props;
  const { t } = useTranslation('Dashboard');
  const navigate = rootRoute.useNavigate();
  const showAll = rootRoute.useSearch({
    select: (search) => search.showAllFavorites === 'true',
  });

  const hasOverflow = favoriteProjects.length > MAX_VISIBLE_FAVORITES;
  const visibleFavorites = showAll
    ? favoriteProjects
    : favoriteProjects.slice(0, MAX_VISIBLE_FAVORITES);

  const toggleShowAll = () => {
    navigate({
      search: (prev) => ({
        ...prev,
        showAllFavorites: showAll ? undefined : 'true',
      }),
      // Same-screen refinement: do not push a Back-button history entry.
      replace: true,
      resetScroll: false,
    });
  };

  const hasContent = isLoading
    ? favoriteIds.length > 0
    : favoriteProjects.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="rounded-lg bg-bg-quaternary p-2">
          <Star className="size-4" aria-hidden="true" />
        </span>
        <h2 className="flex-1 text-base font-medium tracking-tight text-text-primary">
          {t('myFavorites')}
        </h2>
      </div>
      {hasContent ? (
        <>
          <div
            className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(190px,calc(25%-12px)))]"
            {...(isLoading
              ? {
                  ...skeletonListProps,
                  role: 'status',
                  'aria-live': 'polite',
                  'aria-label': t('loadingFavorites'),
                }
              : {})}
          >
            {isLoading
              ? favoriteIds
                  .slice(0, MAX_VISIBLE_FAVORITES)
                  .map((id) => <FavoriteCardSkeleton key={id} />)
              : visibleFavorites.map((project) => (
                  <FavoriteCard
                    key={project.id}
                    project={project}
                    progressStep={1}
                  />
                ))}
          </div>
          {hasOverflow && (
            <Button
              variant="secondary"
              size="sm"
              withIcon
              type="button"
              className="self-end"
              onClick={toggleShowAll}
            >
              {showAll ? (
                <>
                  <ChevronUp aria-hidden="true" />
                  {t('showLessFavorites')}
                </>
              ) : (
                <>
                  <ChevronDown aria-hidden="true" />
                  {t('showAllFavorites', {
                    count: favoriteProjects.length,
                  })}
                </>
              )}
            </Button>
          )}
        </>
      ) : (
        <p className="text-text-secondary">{t('noFavorites')}</p>
      )}
    </div>
  );
};
