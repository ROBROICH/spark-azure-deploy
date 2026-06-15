import { SomethingWentWrongErrorState } from '@/features/shared/error-states/SomethingWentWrongErrorState';
import { isProjectNotFoundError } from '@/features/project/data/collections/projects.collection';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

const ProjectNotFoundErrorState = lazy(async () => {
  const module =
    await import('@/features/project/route/project-not-found-error-state/ProjectNotFoundErrorState');

  return { default: module.ProjectNotFoundErrorState };
});

export function ProjectRouteErrorFallback(props: ErrorComponentProps) {
  const { error } = props;
  if (isProjectNotFoundError(error)) {
    return (
      <Suspense fallback={null}>
        <ProjectNotFoundErrorState />
      </Suspense>
    );
  }

  return <SomethingWentWrongErrorState />;
}
