import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as ProjectVersioning from '@/features/project/versioning/projectVersioning';
import {
  resetProjectPermissionTestMocks,
  setProjectCanMutate,
} from '@/features/project/test/projectPermissionTestMocks';
import { useEwmsResponseExport } from './useEwmsResponseExport';

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  useProjectRouteVersion: vi.fn(() => 1),
}));

vi.mock(
  '@/features/project/versioning/projectVersioning',
  async (importOriginal) => ({
    ...(await importOriginal<typeof ProjectVersioning>()),
    useProjectRouteVersion: mocks.useProjectRouteVersion,
  }),
);

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({
    isPending: false,
    mutate: mocks.mutate,
  }),
}));

vi.mock('./exportErwiderungen', () => ({
  exportErwiderungen: vi.fn(),
  triggerErwiderungExportDownload: vi.fn(),
}));

vi.mock('@/features/ui/toast/Toast', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

afterEach(() => {
  resetProjectPermissionTestMocks();
  mocks.mutate.mockReset();
  mocks.useProjectRouteVersion.mockClear();
});

describe('useEwmsResponseExport permissions', () => {
  it('does not call the export mutation when project mutation is denied', () => {
    setProjectCanMutate(false);
    const { result } = renderHook(() => useEwmsResponseExport('project-1'));

    result.current.handleExportResponses();

    expect(mocks.mutate).not.toHaveBeenCalled();
  });
});
