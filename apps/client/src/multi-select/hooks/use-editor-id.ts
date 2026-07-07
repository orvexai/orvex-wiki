import { useId } from 'react';

/**
 * Stable, per-mount editor identity for the multi-select primitive.
 *
 * Wraps React's `useId` so callers get a collision-safe id without having to
 * invent their own scheme; a caller with a real editor/document id should
 * pass that instead of using this hook.
 */
export function useEditorId(): string {
  return useId();
}
