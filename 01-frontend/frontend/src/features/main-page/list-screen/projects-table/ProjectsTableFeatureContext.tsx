import { createContext, useContext } from 'react';
import type { Project } from '../../data/schemas/project.schema';
import type { AnlageFilterValue } from './ProjectsTable.constants';
import type {
  FavoriteFilterValue,
  ZuordnungFilterValue,
} from './ProjectsTable.utils';
import type { ProjectsTableRouteState } from './useProjectsTableRouteState';

type TableOption<TValue extends string = string> = {
  label: string;
  value: TValue;
};

export type ProjectsTableFeatureContextValue = {
  routeState: ProjectsTableRouteState;
  favoriteIds: string[];
  canFavorite: boolean;
  onToggleFavorite: (projectId: string) => void;
  projects: Project[];
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
  retry: () => void;
  artOptions: TableOption[];
  anlageOptions: TableOption<AnlageFilterValue>[];
  statusOptions: TableOption[];
  favoriteOptions: TableOption<FavoriteFilterValue>[];
  zuordnungOptions: TableOption<ZuordnungFilterValue>[];
};

export const ProjectsTableFeatureContext =
  createContext<ProjectsTableFeatureContextValue | null>(null);

export const useProjectsTableFeatureContext = () => {
  const context = useContext(ProjectsTableFeatureContext);
  if (!context) {
    throw new Error(
      'useProjectsTableFeatureContext must be used within ProjectsTableFeature',
    );
  }
  return context;
};
