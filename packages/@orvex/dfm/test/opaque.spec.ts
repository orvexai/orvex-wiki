import { describe, expect, it } from 'vitest';

import {
  pmToDfm,
  dfmToJson,
  reattachOpaqueRefs,
  DfmOpaqueUnknownRefError,
  DFM_OPAQUE_UNKNOWN_REF,
  OPAQUE_REF_TYPE,
} from '../src/index';
import type { PmDoc, PmNode } from '../src/index';

/**
 * ENG-2487 DoD gate — `TestDfmOpaqueRoundTripThrows`.
 *
 * Asserts observable behaviour through the package's exported functions
 * (`pmToDfm` / `dfmToJson` / `reattachOpaqueRefs`) ONLY — never through an
 * internal registry-lookup helper (CS §4.2), so it survives any internal
 * rename of the dispatch table or parse-state machine. The real package is
 * the test double for "the serializer" (CS §5, ❌#4 — no mock of its own
 * registry). Deterministic: fixed PM-JSON fixtures with fixed literal opaque
 * ids — no wall-clock or PRNG-derived value anywhere in the assertion path.
 */

/** Stable stringify (sorted keys, recursive) for byte-identity assertions. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return '{' + entries.map(([k, v]) => JSON.stringify(k) + ':' + stableStringify(v)).join(',') + '}';
  }
  return JSON.stringify(value);
}

/** Run `fn`, return the thrown value (fails the test if it does not throw). */
function capture(fn: () => unknown): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error('expected the function to throw, but it returned');
}

/** Fixed fixture: a doc containing one node of a type NO registry knows. */
const UNKNOWN_NODE: PmNode = {
  type: 'totallyUnknownWidget',
  attrs: { id: 'fixed-opaque-id-1', payload: 'unchanged' },
  content: [],
};

const BASE_DOC: PmDoc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'prose before' }] },
    UNKNOWN_NODE,
  ],
};

describe('TestDfmOpaqueRoundTripThrows', () => {
  it('AC2 — an unknown node type becomes a lossless :::dfm-opaque fence, byte-identical round trip', () => {
    // Forward: the unknown node is fenced — never dropped, never crashes the
    // write path (the fence IS the designed fallback).
    const dfm = pmToDfm(BASE_DOC);
    expect(dfm).toContain(
      ':::dfm-opaque type=totallyUnknownWidget id=fixed-opaque-id-1',
    );

    // Reverse + reattach: the fence body, run back through dfmToJson and
    // resolved against the base doc, reproduces the original PM node
    // byte-for-byte (stable-stringify equality).
    const parsed = dfmToJson(dfm);
    const restored = reattachOpaqueRefs(parsed, BASE_DOC);
    expect(stableStringify(restored)).toBe(stableStringify(BASE_DOC));

    // The restored unknown node specifically is byte-identical.
    const restoredNode = restored.content?.[1];
    expect(stableStringify(restoredNode)).toBe(stableStringify(UNKNOWN_NODE));
  });

  it('AC3 — reattachOpaqueRefs throws DFM_OPAQUE_UNKNOWN_REF on a missing base ref, never a partial doc', () => {
    const dfm = pmToDfm(BASE_DOC);
    const parsed = dfmToJson(dfm);

    // A base page that LACKS the referenced opaque body.
    const baseWithoutOpaque: PmDoc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'prose before' }] }],
    };

    const err = capture(() => reattachOpaqueRefs(parsed, baseWithoutOpaque));
    // Typed error CLASS (never a bare Error) — catchable by name at the
    // page.service.ts call site and surfaced as a typed 4xx, never an
    // unhandled 500 (CS §10 operability).
    expect(err).toBeInstanceOf(DfmOpaqueUnknownRefError);
    expect(err).toBeInstanceOf(Error);
    expect((err as DfmOpaqueUnknownRefError).code).toBe('DFM_OPAQUE_UNKNOWN_REF');
    expect((err as DfmOpaqueUnknownRefError).code).toBe(DFM_OPAQUE_UNKNOWN_REF);
    expect((err as DfmOpaqueUnknownRefError).ref).toBe('fixed-opaque-id-1');
    expect((err as DfmOpaqueUnknownRefError).nodeType).toBe('totallyUnknownWidget');
  });

  it('AC3 — the Map-shaped opaque-body lookup resolves and throws identically', () => {
    const dfm = pmToDfm(BASE_DOC);
    const parsed = dfmToJson(dfm);

    // Resolved via a caller-supplied opaque-body map (the shape the write
    // path's store round-trip produces) — typed PmNode values, never `any`.
    const bodies = new Map<string, PmNode>([['fixed-opaque-id-1', UNKNOWN_NODE]]);
    const restored = reattachOpaqueRefs(parsed, bodies);
    expect(stableStringify(restored)).toBe(stableStringify(BASE_DOC));

    // An empty map has no matching ref -> the same typed throw.
    const err = capture(() => reattachOpaqueRefs(parsed, new Map<string, PmNode>()));
    expect(err).toBeInstanceOf(DfmOpaqueUnknownRefError);
    expect((err as DfmOpaqueUnknownRefError).code).toBe(DFM_OPAQUE_UNKNOWN_REF);
  });
});

describe('TestUnknownNodeBecomesLosslessFence', () => {
  it('emits the reference-form fence (type + id, no inlined body) for the unknown node', () => {
    const dfm = pmToDfm(BASE_DOC);
    const fenceMatch = /^:::dfm-opaque type=(\S+) id=(\S+)$/m.exec(dfm);
    expect(fenceMatch).not.toBeNull();
    expect(fenceMatch![1]).toBe('totallyUnknownWidget');
    expect(fenceMatch![2]).toBe('fixed-opaque-id-1');
    // The fence closes on its own line.
    expect(dfm).toMatch(/^:::dfm-opaque type=\S+ id=\S+\n:::$/m);
  });

  it('parses the fence to the opaque reference node the reattach step resolves', () => {
    const dfm = pmToDfm(BASE_DOC);
    const parsed = dfmToJson(dfm);
    const refNode = parsed.content?.find((n) => n.type === OPAQUE_REF_TYPE);
    expect(refNode).toBeDefined();
    expect(refNode!.attrs).toEqual({
      nodeType: 'totallyUnknownWidget',
      id: 'fixed-opaque-id-1',
    });
  });

  it('never crashes pmToDfm on an unregistered node type (designed fallback, CS §10)', () => {
    expect(() => pmToDfm(BASE_DOC)).not.toThrow();
  });
});

describe('TestReattachOpaqueRefsThrowsOnMissingBase', () => {
  it('throws (never returns a partial/best-effort document) when the base lacks the ref', () => {
    const parsed: PmDoc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'kept text' }] },
        { type: OPAQUE_REF_TYPE, attrs: { nodeType: 'ghostWidget', id: 'dangling-id' } },
      ],
    };
    const base: PmDoc = { type: 'doc', content: [] };

    let returned: unknown = undefined;
    let threw = false;
    try {
      returned = reattachOpaqueRefs(parsed, base);
    } catch (err) {
      threw = true;
      expect(err).toBeInstanceOf(DfmOpaqueUnknownRefError);
      expect((err as DfmOpaqueUnknownRefError).ref).toBe('dangling-id');
    }
    expect(threw).toBe(true);
    // Nothing partial ever escaped.
    expect(returned).toBeUndefined();
  });
});
