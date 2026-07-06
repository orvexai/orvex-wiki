import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  createDefaultRegistry,
  dfmToJson,
  DfmNotImplementedError,
  DfmOpaqueUnknownRefError,
  DFM_NOT_IMPLEMENTED,
  DFM_OPAQUE_UNKNOWN_REF,
  NodeSerializerRegistry,
  pmToDfm,
  serializeOpaque,
} from '../src/index';
import type { PmDoc } from '../src/index';

/**
 * Validation gates for {@link @orvex/dfm}. Everything is exercised ONLY through
 * the package's exported surface (CS §4). The golden fixtures are the VENDORED
 * copies from orvex-studio-contracts (see test/fixtures/README.md) — parity is
 * proven against those bytes, never against hand-authored expectations.
 */

const paragraphDfmUrl = new URL('./fixtures/paragraph.dfm.md', import.meta.url);
const paragraphPmUrl = new URL('./fixtures/paragraph.pm.json', import.meta.url);

const paragraphDfm = readFileSync(paragraphDfmUrl, 'utf8');
const paragraphPm = JSON.parse(readFileSync(paragraphPmUrl, 'utf8')) as PmDoc;

/** Run `fn`, return the thrown value (fails the test if it does not throw). */
function capture(fn: () => unknown): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error('expected the function to throw, but it returned');
}

describe('golden round-trip (paragraph fixture)', () => {
  it('pmToDfm serializes the PM fixture to the DfM fixture bytes exactly', () => {
    // Byte-for-byte modulo the documented trailing-newline policy: exactly one
    // trailing "\n" terminates the document. The fixture file is
    // `The quick brown fox.\n`.
    expect(pmToDfm(paragraphPm)).toBe(paragraphDfm);
    expect(paragraphDfm.endsWith('\n')).toBe(true);
    expect(paragraphDfm.endsWith('\n\n')).toBe(false);
  });

  it('dfmToJson parses the DfM fixture back to the PM fixture (deep-equal)', () => {
    expect(dfmToJson(paragraphDfm)).toEqual(paragraphPm);
  });

  it('round-trips in both directions for the covered subset', () => {
    expect(dfmToJson(pmToDfm(paragraphPm))).toEqual(paragraphPm);
    expect(pmToDfm(dfmToJson(paragraphDfm))).toBe(paragraphDfm);
  });
});

describe('honesty contract — pmToDfm throws for uncovered node types', () => {
  it('throws DfmNotImplementedError carrying nodeType for an unknown block (table)', () => {
    const doc: PmDoc = {
      type: 'doc',
      content: [{ type: 'table', content: [] }],
    };
    const err = capture(() => pmToDfm(doc));
    expect(err).toBeInstanceOf(DfmNotImplementedError);
    expect((err as DfmNotImplementedError).nodeType).toBe('table');
    expect((err as DfmNotImplementedError).code).toBe(DFM_NOT_IMPLEMENTED);
  });

  it('throws for an unknown top-level node type (heading)', () => {
    const doc = { type: 'doc', content: [{ type: 'heading' }] } as unknown as PmDoc;
    const err = capture(() => pmToDfm(doc));
    expect(err).toBeInstanceOf(DfmNotImplementedError);
    expect((err as DfmNotImplementedError).nodeType).toBe('heading');
  });

  it('throws for a text node carrying a mark (marks are uncovered)', () => {
    const doc: PmDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'bold', marks: [{ type: 'strong' }] }],
        },
      ],
    };
    const err = capture(() => pmToDfm(doc));
    expect(err).toBeInstanceOf(DfmNotImplementedError);
    expect((err as DfmNotImplementedError).nodeType).toBe('strong');
  });
});

describe('honesty contract — dfmToJson refuses uncovered constructs (never fabricates)', () => {
  it.each([
    ['# Heading\n', 'heading'],
    ['> quoted\n', 'blockquote'],
    ['- item\n', 'bullet_list'],
    ['1. item\n', 'ordered_list'],
    ['```\ncode\n```\n', 'code_block'],
    ['---\n', 'horizontal_rule'],
    ['| a | b |\n', 'table'],
    [':::info\nx\n:::\n', 'dfm-opaque'],
  ])('throws for %j -> nodeType %j', (input, nodeType) => {
    const err = capture(() => dfmToJson(input));
    expect(err).toBeInstanceOf(DfmNotImplementedError);
    expect((err as DfmNotImplementedError).nodeType).toBe(nodeType);
  });

  it('throws text-marks for inline emphasis rather than emitting lossy text', () => {
    const err = capture(() => dfmToJson('This is **bold** text.\n'));
    expect(err).toBeInstanceOf(DfmNotImplementedError);
    expect((err as DfmNotImplementedError).nodeType).toBe('text-marks');
  });

  it('throws for a soft/hard-break multi-line paragraph', () => {
    const err = capture(() => dfmToJson('line one\nline two\n'));
    expect(err).toBeInstanceOf(DfmNotImplementedError);
    expect((err as DfmNotImplementedError).nodeType).toBe('hard_break');
  });

  it('throws doc-empty for empty input rather than returning {type:doc,content:[]}', () => {
    const err = capture(() => dfmToJson(''));
    expect(err).toBeInstanceOf(DfmNotImplementedError);
    expect((err as DfmNotImplementedError).nodeType).toBe('doc-empty');
  });
});

describe('serializeOpaque — typed signature that throws (not implemented)', () => {
  it('throws DfmNotImplementedError with the dfm-opaque sentinel', () => {
    const err = capture(() => serializeOpaque({ type: 'drawio' }));
    expect(err).toBeInstanceOf(DfmNotImplementedError);
    expect((err as DfmNotImplementedError).nodeType).toBe('dfm-opaque');
    expect((err as DfmNotImplementedError).code).toBe(DFM_NOT_IMPLEMENTED);
  });
});

describe('DfmOpaqueUnknownRefError — typed, greppable, not thrown by any live path', () => {
  it('constructs with the DFM_OPAQUE_UNKNOWN_REF code and the offending ref', () => {
    const err = new DfmOpaqueUnknownRefError('block_123');
    expect(err).toBeInstanceOf(DfmOpaqueUnknownRefError);
    expect(err.code).toBe(DFM_OPAQUE_UNKNOWN_REF);
    expect(err.ref).toBe('block_123');
  });
});

describe('NodeSerializerRegistry — real register/lookup behavior', () => {
  it('starts empty; register adds; lookup/has reflect it', () => {
    const registry = new NodeSerializerRegistry();
    expect(registry.size).toBe(0);
    expect(registry.has('paragraph')).toBe(false);
    expect(registry.lookup('paragraph')).toBeUndefined();

    const returned = registry.register('paragraph', (node) => node.text ?? '');
    expect(returned).toBe(registry); // chainable
    expect(registry.has('paragraph')).toBe(true);
    expect(typeof registry.lookup('paragraph')).toBe('function');
    expect(registry.size).toBe(1);
  });

  it('register replaces an existing serializer for the same type', () => {
    const registry = new NodeSerializerRegistry();
    registry.register('text', () => 'first');
    registry.register('text', () => 'second');
    const serializer = registry.lookup('text');
    expect(serializer?.({ type: 'text' }, () => '')).toBe('second');
    expect(registry.size).toBe(1);
  });

  it('createDefaultRegistry ships exactly the covered node set', () => {
    const registry = createDefaultRegistry();
    expect(new Set(registry.registeredTypes())).toEqual(
      new Set(['doc', 'paragraph', 'text']),
    );
    expect(registry.has('table')).toBe(false);
  });

  it('pmToDfm honors a caller-supplied registry', () => {
    const registry = createDefaultRegistry();
    // A block type only THIS registry knows about serializes; the default
    // registry would throw for it.
    registry.register('divider', () => '***');
    const doc: PmDoc = { type: 'doc', content: [{ type: 'divider' }] };
    expect(pmToDfm(doc, registry)).toBe('***\n');
    expect(() => pmToDfm(doc)).toThrow(DfmNotImplementedError);
  });
});
