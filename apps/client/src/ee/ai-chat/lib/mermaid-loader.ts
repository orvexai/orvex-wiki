// Module-level singleton loader for mermaid. `getMermaid()` lazily imports
// and initializes the library exactly once (subsequent calls reuse the same
// in-flight/resolved promise), and resolves to `null` on failure so callers
// can degrade gracefully (never a white screen). Ported from the pin's
// `lib/mermaid-loader.ts#L1-L30`.
import type { Mermaid } from "mermaid";

let mermaidPromise: Promise<Mermaid | null> | null = null;
let initialized = false;

export function getMermaid(): Promise<Mermaid | null> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid")
      .then((mod) => {
        const mermaid = mod.default;
        if (!initialized) {
          mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
          initialized = true;
        }
        return mermaid;
      })
      .catch(() => null);
  }
  return mermaidPromise;
}

// Test-only hook: reset the singleton between specs.
export function __resetMermaidLoaderForTests() {
  mermaidPromise = null;
  initialized = false;
}
