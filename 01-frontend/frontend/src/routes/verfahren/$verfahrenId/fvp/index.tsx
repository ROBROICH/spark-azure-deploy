import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/verfahren/$verfahrenId/fvp/')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/verfahren/$verfahrenId/fvp/documents',
      params,
      replace: true,
    });
  },
});
