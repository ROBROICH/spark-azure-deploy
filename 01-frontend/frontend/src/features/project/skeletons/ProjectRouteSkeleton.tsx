import { useMatch } from '@tanstack/react-router';
import { ProjectRouteMvpOverviewSkeleton } from './ProjectRouteMvpOverviewSkeleton';
import { ProjectRouteSingleProjectSkeleton } from './ProjectRouteSingleProjectSkeleton';

export const ProjectRouteSkeleton = () => {
  const singleProjectMatch = useMatch({
    from: '/verfahren/$verfahrenId/',
    shouldThrow: false,
  });
  const mvpOverviewMatch = useMatch({
    from: '/verfahren/$verfahrenId/mvp/',
    shouldThrow: false,
  });

  if (singleProjectMatch) {
    return <ProjectRouteSingleProjectSkeleton />;
  }

  if (mvpOverviewMatch) {
    return <ProjectRouteMvpOverviewSkeleton />;
  }

  return <ProjectRouteSingleProjectSkeleton />;
};
