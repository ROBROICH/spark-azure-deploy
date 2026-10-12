import { describe, expect, it } from 'vitest';

// EWMS-only deployment mode must be configured before the product-mode
// snapshot is first read; the snapshot is cached per document.
window.__APP_CONFIG__ = {
  ...window.__APP_CONFIG__,
  VITE_PRODUCT_MODE: 'ewms',
};

// Dynamic import is required: the product-mode snapshot is cached on first
// read, so the module under test must load only after __APP_CONFIG__ is set.
const { isEwmsFeatureEnabled } = await import('./ewmsFeature');

describe('isEwmsFeatureEnabled in EWMS-only product mode', () => {
  it('enables the EWMS capability without the SPARK rollout flag', () => {
    expect(isEwmsFeatureEnabled()).toBe(true);
  });
});
