import { describe, expect, it } from 'vitest';
import { getLegacyPlausibilityCheckRedirect } from './legacyPlausibilityCheckRoute';

describe('legacy plausibility check route', () => {
  it('redirects legacy PP links into the FVP plausibility tab', () => {
    expect(getLegacyPlausibilityCheckRedirect('project-1')).toEqual({
      to: '/verfahren/$verfahrenId/fvp/pp',
      params: { verfahrenId: 'project-1' },
      replace: true,
    });
  });
});
