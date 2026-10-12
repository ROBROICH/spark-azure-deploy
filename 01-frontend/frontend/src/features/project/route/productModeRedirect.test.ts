import { isRedirect } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';

// EWMS-only deployment mode must be configured before the product-mode
// snapshot is first read; the snapshot is cached per document.
window.__APP_CONFIG__ = {
  ...window.__APP_CONFIG__,
  VITE_PRODUCT_MODE: 'ewms',
};

// Dynamic imports are required: the product-mode snapshot is cached on first
// read, so the modules under test must load only after __APP_CONFIG__ is set.
const { redirectExcludedStepToEwms } = await import('./productModeRedirect');
const { getProductStepOptions, getProductSwitcherOptions } =
  await import('./routeStepMapping');

describe('EWMS-only product mode', () => {
  it('redirects an excluded step route to the same procedure EWMS page', () => {
    let thrown: unknown;
    try {
      redirectExcludedStepToEwms('project-7');
    } catch (error) {
      thrown = error;
    }

    expect(isRedirect(thrown)).toBe(true);
    if (!isRedirect(thrown)) {
      return;
    }
    expect(thrown.options.to).toBe('/verfahren/$verfahrenId/ewms');
    expect(thrown.options.params).toEqual({ verfahrenId: 'project-7' });
    expect(thrown.options.replace).toBe(true);
  });

  it('does not carry excluded-route query params into the EWMS redirect', () => {
    let thrown: unknown;
    try {
      redirectExcludedStepToEwms('project-7');
    } catch (error) {
      thrown = error;
    }

    expect(isRedirect(thrown)).toBe(true);
    if (!isRedirect(thrown)) {
      return;
    }
    // Canonical empty EWMS search: every defined value must be absent so
    // foreign search state (e.g. fvp/rpb params) cannot leak through.
    const search = thrown.options.search as unknown as Record<string, unknown>;
    for (const value of Object.values(search)) {
      expect(value).toBeUndefined();
    }
  });

  it('offers only the EWMS process step', () => {
    expect(getProductStepOptions('ewms').map((option) => option.value)).toEqual(
      ['ewms'],
    );
  });

  it('keeps the full SPARK step set in spark mode', () => {
    expect(
      getProductStepOptions('spark').map((option) => option.value),
    ).toEqual(['fvp', 'mvp', 'ewms', 'rpb']);
    expect(
      getProductSwitcherOptions('spark').map((option) => option.value),
    ).toEqual(['overview', 'fvp', 'mvp', 'ewms', 'rpb']);
  });
});
