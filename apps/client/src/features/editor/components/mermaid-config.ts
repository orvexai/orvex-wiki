import mermaid, { type MermaidConfig } from "mermaid";

/**
 * Pinned Mermaid configuration (ENG-1391 / DiagramRenderFidelity).
 *
 * `mermaid.initialize()` REPLACES the whole config, it never merges. Passing
 * a partial config (e.g. just `{ theme }` on a theme change) silently resets
 * every other key back to Mermaid's defaults — in particular `securityLevel`,
 * `flowchart.htmlLabels`, and `look`. Every call site MUST therefore pass the
 * WHOLE base config, spreading in only the bits that vary (theme).
 */
export const BASE_MERMAID_CONFIG = {
  startOnLoad: false,
  suppressErrorRendering: true,
  securityLevel: "loose",
  flowchart: { htmlLabels: true },
  look: "handDrawn",
} as const;

let configured = false;

/**
 * Applies the pinned base config exactly once (module-lifetime). Safe to
 * call from every consumer (mermaid-view, excalidraw seed, drawio seed) —
 * only the first call reaches `mermaid.initialize`.
 */
export function ensureMermaidConfig(): void {
  if (configured) return;
  mermaid.initialize({ ...BASE_MERMAID_CONFIG });
  configured = true;
}

/**
 * Re-asserts the WHOLE base config plus the theme on every theme change.
 * Never pass a partial config here — mermaid.initialize replaces, not merges.
 */
export function applyMermaidTheme(theme: MermaidConfig["theme"]): void {
  mermaid.initialize({ ...BASE_MERMAID_CONFIG, theme });
  configured = true;
}

let warmupPromise: Promise<void> | null = null;

/**
 * Closes the blank-first-render race: the very first Mermaid render in a
 * fresh page can land empty because required fonts have not finished
 * loading yet. We wait for `document.fonts.ready`, then perform one
 * throwaway render before any real (visible) render happens. Only ever
 * runs once per page lifetime.
 */
function ensureWarmup(): Promise<void> {
  if (!warmupPromise) {
    warmupPromise = (async () => {
      if (typeof document !== "undefined" && document.fonts?.ready) {
        await document.fonts.ready;
      }
      try {
        await mermaid.render(
          `mermaid-warmup-${Date.now()}`,
          "graph TD;a-->b;",
        );
      } catch {
        // Warm-up render failures must never block real rendering.
      }
    })();
  }
  return warmupPromise;
}

/** Test-only hook: resets pinned/warm-up module state between test cases. */
export function __resetMermaidConfigForTests(): void {
  configured = false;
  warmupPromise = null;
}

/** Normalizes literal `\n` escapes and real newlines to `<br/>` before Mermaid. */
export function normalizeMermaidLineBreaks(text: string): string {
  return text.replace(/\\n/g, "<br/>").replace(/\n/g, "<br/>");
}

/** Normalizes `<br/>`/`<br>` back to `\n` where the library round-trips text. */
export function denormalizeMermaidLineBreaks(text: string): string {
  return text.replace(/<br\s*\/?>/gi, "\n");
}

/**
 * Renders a Mermaid diagram, gated on the one-time warm-up so the first
 * visible diagram on a page never lands blank.
 *
 * IMPORTANT: `text` is the full code-block source, not a single label.
 * Mermaid source is line-oriented — real newlines are statement
 * separators in the grammar. `normalizeMermaidLineBreaks` must NEVER be
 * applied here (or anywhere else to the whole source): doing so turns
 * every multi-line diagram into unparseable text (regression, ENG-1391
 * review finding 1). Line-break normalization only applies to text
 * *inside* a label (e.g. the mermaid->excalidraw label seed path), never
 * to the source as a whole — callers that need that must scope the
 * normalization to the label substring themselves.
 */
export async function renderMermaid(
  id: string,
  text: string,
): Promise<{ svg: string }> {
  ensureMermaidConfig();
  await ensureWarmup();
  return mermaid.render(id, text);
}
