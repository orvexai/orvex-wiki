import { vi } from "vitest";

// Tests commonly replace the global fetch with an SSE-specific mock. The real
// i18next-http-backend is initialized by the shared i18n singleton and can
// otherwise issue delayed locale requests against whichever fetch mock happens
// to be active. Keep test translation loads local and deterministic.
vi.mock("i18next-http-backend", () => {
  class NoopI18nextBackend {
    static type = "backend";
    type = "backend";

    init() {}

    read(
      _language: string,
      _namespace: string,
      callback: (error: null, resources: Record<string, string>) => void,
    ) {
      callback(null, {});
    }
  }

  return { default: NoopI18nextBackend };
});

// jsdom does not implement matchMedia; @mantine/core's color-scheme hooks
// call it unconditionally on mount. Provide a minimal, spec-shaped stub so
// component tests that render Mantine providers don't crash.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
}

// jsdom does not implement ResizeObserver; @mantine/core's ScrollArea
// observes size on mount. Provide a minimal no-op stub.
if (typeof window !== "undefined" && !window.ResizeObserver) {
  class NoopResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = NoopResizeObserver as unknown as typeof ResizeObserver;
  globalThis.ResizeObserver = NoopResizeObserver as unknown as typeof ResizeObserver;
}

// jsdom does not implement IntersectionObserver; components with
// infinite-scroll sentinels (e.g. PagePermissionList) observe on mount.
// Provide a minimal no-op stub so those components don't throw in tests.
if (typeof window !== "undefined" && !window.IntersectionObserver) {
  class NoopIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  window.IntersectionObserver =
    NoopIntersectionObserver as unknown as typeof IntersectionObserver;
  globalThis.IntersectionObserver =
    NoopIntersectionObserver as unknown as typeof IntersectionObserver;
}
