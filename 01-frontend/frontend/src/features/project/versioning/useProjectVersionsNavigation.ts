import { getRouteApi } from '@tanstack/react-router';

const projectRoute = getRouteApi('/verfahren/$verfahrenId');

export const useProjectVersionsNavigation = (verfahrenId: string) => {
  const navigate = projectRoute.useNavigate();

  return () => {
    navigate({
      to: '/verfahren/$verfahrenId',
      params: { verfahrenId },
      resetScroll: false,
    });
  };
};
