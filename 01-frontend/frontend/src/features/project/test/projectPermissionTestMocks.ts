import { vi } from 'vitest';

const projectPermissionTestMocks = vi.hoisted(() => ({
  canMutateProject: true,
}));

export const setProjectCanMutate = (canMutateProject: boolean) => {
  projectPermissionTestMocks.canMutateProject = canMutateProject;
};

export const resetProjectPermissionTestMocks = () => {
  setProjectCanMutate(true);
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock(
  '@/features/access-control/project-permissions/useCanMutateProject',
  () => ({
    useCanMutateProject: () => ({
      canMutateProject: projectPermissionTestMocks.canMutateProject,
    }),
  }),
);
