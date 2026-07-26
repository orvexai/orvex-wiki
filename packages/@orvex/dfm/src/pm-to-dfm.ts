import { getEntry } from './registry';
import { serializeInline } from './inline-serializer';
import type { Dfm, PmNode, SerializerCtx } from './types';

/**
 * The reference-form opaque fence (ENG-2487 — the real lossless path that
 * replaced the seed's throwing stub) — carries only `type` + `id`, NEVER an
 * inlined body/base64 payload. A full round trip depends on
 * {@link reattachOpaqueRefs} resolving the reference against a base document
 * (or opaque-body map) that still holds the real node — the write-path CAS
 * pattern. An unresolvable reference throws the typed
 * `DfmOpaqueUnknownRefError` (`DFM_OPAQUE_UNKNOWN_REF`), never a silent drop.
 */
export function opaqueToken(node: PmNode, ctx: SerializerCtx): string {
  const id =
    typeof node.attrs?.id === 'string' && node.attrs.id.length > 0
      ? node.attrs.id
      : ctx.nextOpaqueId();
  return `:::dfm-opaque type=${node.type} id=${id}\n:::`;
}

function makeCtx(): SerializerCtx {
  let counter = 0;
  const ctx: SerializerCtx = {
    serializeNode(node: PmNode): string {
      const entry = getEntry(node.type);
      if (entry) return entry.toDfm(node, ctx);
      // Unregistered node type: never fabricate output, never drop it —
      // fence it as a reference the write path resolves from the base doc.
      return opaqueToken(node, ctx);
    },
    serializeInline(nodes: readonly PmNode[] | undefined): string {
      return serializeInline(nodes, ctx);
    },
    // Deterministic PER CALL: a fresh counter every `pmToDfm` invocation,
    // never module-global mutable state (and never wall-clock/random — CS
    // ❌#9) that would make two calls on the same doc diverge.
    nextOpaqueId(): string {
      counter += 1;
      return counter.toString(36);
    },
  };
  return ctx;
}

/**
 * Forward serialization: ProseMirror JSON -> DfM text. Walks the tree
 * exclusively via `getEntry(type).toDfm` — never via an HTML/turndown
 * intermediate representation. Total over ProseMirror JSON: an unregistered
 * block type becomes a lossless `:::dfm-opaque` reference fence (see
 * {@link opaqueToken}); nothing is silently skipped and no fabricated output
 * is emitted.
 */
export function pmToDfm(doc: PmNode): Dfm {
  const ctx = makeCtx();
  return ctx.serializeNode(doc);
}
