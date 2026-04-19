import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Polyfill fetch for jsdom
if (typeof globalThis.fetch === 'undefined') {
  globalThis.fetch = vi.fn() as unknown as typeof fetch;
}
