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
