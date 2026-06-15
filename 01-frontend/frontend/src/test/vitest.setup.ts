import { vi } from 'vitest';

// jsdom does not implement pointer capture APIs used by Radix UI primitives.
// Stub them globally so Radix Select and similar components work in the test environment.
window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
window.HTMLElement.prototype.setPointerCapture = vi.fn();
window.HTMLElement.prototype.releasePointerCapture = vi.fn();
window.HTMLElement.prototype.scrollIntoView = vi.fn();

globalThis.ResizeObserver = class ResizeObserver {
  disconnect() {}

  observe() {}

  unobserve() {}
};
