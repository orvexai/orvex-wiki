import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  pmToDfm,
  dfmToJson,
  registeredTypes,
  registeredMarkTypes,
  reattachOpaqueRefs,
  OPAQUE_REF_TYPE,
  DfmNotImplementedError,
  DfmOpaqueUnknownRefError,
  DFM_NOT_IMPLEMENTED,
  DFM_OPAQUE_UNKNOWN_REF,
  hasEntry,
} from '../src/index';
import type { PmDoc, PmNode } from '../src/index';

/**
 * The `@orvex/dfm` round-trip suite (ENG-2487 fold-in — ported from the
 * upstream reference serializer's own suite). Everything is exercised ONLY
 * through the package's exported surface (CS §4.2); the golden fixtures are
 * the VENDORED corpus copies (test/fixtures/README.md) — parity is proven
 * against those bytes, never against hand-authored expectations.
 */

function textNode(text: string, marks?: PmNode['marks']): PmNode {
  return marks ? { type: 'text', text, marks } : { type: 'text', text };
}

function paragraph(...content: PmNode[]): PmNode {
  return { type: 'paragraph', content };
}

function doc(...content: PmNode[]): PmDoc {
  return { type: 'doc', content };
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

// A representative fixture per registered node type, covering every mark too.
// Every one of `registeredTypes()` MUST have a key here — the DoD test below
// asserts the key-set equals `registeredTypes()` exactly so a
// newly-registered type with no fixture fails loudly instead of silently
// skipping the identity check.
const TABLE_FIXTURE_CONTENT: PmNode = {
  type: 'table',
  content: [
    { type: 'tableRow', content: [{ type: 'tableCell', content: [textNode('h1')] }, { type: 'tableCell', content: [textNode('h2')] }] },
    { type: 'tableRow', content: [{ type: 'tableCell', content: [textNode('a')] }, { type: 'tableCell', content: [textNode('b')] }] },
  ],
};
const BULLET_LIST_FIXTURE_CONTENT: PmNode = {
  type: 'bulletList',
  content: [{ type: 'listItem', content: [paragraph(textNode('one'))] }, { type: 'listItem', content: [paragraph(textNode('two'))] }],
};

const FIXTURES: Record<string, PmNode> = {
  // Leaf/root types — no dedicated top-level shape of their own, so they
  // ride along on a paragraph/list/table fixture that actually contains one.
  text: doc(paragraph(textNode('hello world'))),
  doc: doc(paragraph(textNode('hello world'))),
  paragraph: doc(paragraph(textNode('hello world'))),
  listItem: doc(BULLET_LIST_FIXTURE_CONTENT),
  tableRow: doc(TABLE_FIXTURE_CONTENT),
  tableCell: doc(TABLE_FIXTURE_CONTENT),
  heading: doc({ type: 'heading', attrs: { level: 2 }, content: [textNode('A heading')] }),
  bulletList: doc(BULLET_LIST_FIXTURE_CONTENT),
  orderedList: doc({
    type: 'orderedList',
    content: [{ type: 'listItem', content: [paragraph(textNode('first'))] }, { type: 'listItem', content: [paragraph(textNode('second'))] }],
  }),
  table: doc(TABLE_FIXTURE_CONTENT),
  blockquote: doc({ type: 'blockquote', content: [paragraph(textNode('quoted'))] }),
  codeBlock: doc({ type: 'codeBlock', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'const x = 1;' }] }),
  callout: doc({ type: 'callout', attrs: { calloutType: 'warning' }, content: [paragraph(textNode('careful'))] }),
  horizontalRule: doc(paragraph(textNode('above')), { type: 'horizontalRule' }, paragraph(textNode('below'))),
  hardBreak: doc(paragraph(textNode('line one'), { type: 'hardBreak' }, textNode('line two'))),
};

const MARK_FIXTURES: Record<string, PmNode> = {
  bold: doc(paragraph(textNode('strong', [{ type: 'bold' }]))),
  italic: doc(paragraph(textNode('emph', [{ type: 'italic' }]))),
  underline: doc(paragraph(textNode('under', [{ type: 'underline' }]))),
  strike: doc(paragraph(textNode('gone', [{ type: 'strike' }]))),
  code: doc(paragraph(textNode('inline', [{ type: 'code' }]))),
  highlight: doc(paragraph(textNode('lit', [{ type: 'highlight' }]))),
  subscript: doc(paragraph(textNode('sub', [{ type: 'subscript' }]))),
  superscript: doc(paragraph(textNode('sup', [{ type: 'superscript' }]))),
  kbd: doc(paragraph(textNode('Ctrl', [{ type: 'kbd' }]))),
  small: doc(paragraph(textNode('fine print', [{ type: 'small' }]))),
  link: doc(paragraph(textNode('anchor', [{ type: 'link', attrs: { href: 'https://example.com' } }]))),
  // Provenance-load-bearing; must NOT be a transparent pass-through.
  aiAuthored: doc(paragraph(textNode('generated', [{ type: 'aiAuthored' }]))),
};

// ---------------------------------------------------------------------------
// The round-trip identity suite
// ---------------------------------------------------------------------------

describe('TestDfmRoundtripIdentity', () => {
  it('has a fixture for every registeredTypes()/registeredMarkTypes() entry (no silent skips)', () => {
    expect(Object.keys(FIXTURES).sort()).toEqual([...registeredTypes()].sort());
    expect(Object.keys(MARK_FIXTURES).sort()).toEqual([...registeredMarkTypes()].sort());
  });

  it('round-trips every type in registeredTypes() to a deep-equal reconstruction', () => {
    for (const type of registeredTypes()) {
      const fixture = FIXTURES[type];
      const dfm = pmToDfm(fixture);
      const back = dfmToJson(dfm);
      // Real identity, not substring type-presence: the whole doc must
      // reconstruct, not merely mention the type name somewhere.
      expect(back).toEqual(fixture);
    }
  });

  it('round-trips every type in registeredMarkTypes() to a deep-equal reconstruction', () => {
    for (const type of registeredMarkTypes()) {
      const fixture = MARK_FIXTURES[type];
      const dfm = pmToDfm(fixture);
      const back = dfmToJson(dfm);
      expect(back).toEqual(fixture);
    }
  });

  it('fences an un-registered node type and reattach restores it byte-for-byte', () => {
    const custom: PmNode = { type: 'excalidrawBlock', attrs: { id: 'ex-1' }, content: [] };
    const base = doc(custom);
    const dfm = pmToDfm(base);
    expect(dfm).toContain(':::dfm-opaque type=excalidrawBlock id=ex-1');
    const parsed = dfmToJson(dfm);
    const restored = reattachOpaqueRefs(parsed, base);
    expect(restored).toEqual(base);
  });
});

describe('TestPmToDfmForwardBlocks', () => {
  it('walks the tree via the registry and covers every listed block type', () => {
    const bigDoc = doc(
      paragraph(textNode('para')),
      { type: 'heading', attrs: { level: 1 }, content: [textNode('head')] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph(textNode('item'))] }] },
      {
        type: 'table',
        content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [textNode('c1')] }] }],
      },
      { type: 'callout', attrs: { calloutType: 'info' }, content: [paragraph(textNode('note'))] },
      { type: 'blockquote', content: [paragraph(textNode('quote'))] },
      { type: 'codeBlock', attrs: { language: '' }, content: [{ type: 'text', text: 'code()' }] },
    );
    const out = pmToDfm(bigDoc);
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain('# head');
    expect(out).toContain('- item');
    expect(out).toContain('> quote');
    expect(out).toContain('```');
    expect(out).toContain(':::callout type=info');
    expect(out).not.toContain(':::dfm-opaque');
  });
});

describe('TestDfmToJsonReverseBlocks', () => {
  it('reconstructs each covered node type from its own round trip', () => {
    for (const [type, fixture] of Object.entries(FIXTURES)) {
      const back = dfmToJson(pmToDfm(fixture));
      expect(JSON.stringify(back)).toContain(`"type":"${type}"`);
    }
  });
});

describe('TestRegistryIsBidirectionalSSoT', () => {
  it('has >=15 node types, each exposing an entry', () => {
    const types = registeredTypes();
    expect(types.length).toBeGreaterThanOrEqual(15);
    for (const t of types) {
      expect(hasEntry(t)).toBe(true);
    }
  });
});

describe('TestOpaqueFenceIsReferenceForm', () => {
  it('emits type+id only, never a base64 body', () => {
    const custom: PmNode = { type: 'mysteryBlock', attrs: { id: 'm-1' } };
    const dfm = pmToDfm(doc(custom));
    expect(/^:::dfm-opaque type=\S+ id=\S+\n:::/m.test(dfm)).toBe(true);
    expect(dfm).not.toMatch(/[A-Za-z0-9+/]{20,}={0,2}/); // no long base64-looking body
  });
});

describe('TestReattachOpaqueRefsRestoresNode', () => {
  it('replaces the reference with the base node, deep-equal', () => {
    const original: PmNode = { type: 'drawioBlock', attrs: { id: 'd-42' }, content: [] };
    const base = doc(paragraph(textNode('before')), original);
    const parsed = dfmToJson(pmToDfm(base));
    const restored = reattachOpaqueRefs(parsed, base);
    expect(restored).toEqual(base);
  });
});

describe('TestReattachUnknownRefThrowsTyped', () => {
  it('throws DfmOpaqueUnknownRefError with the typed code', () => {
    const parsed: PmNode = {
      type: 'doc',
      content: [{ type: OPAQUE_REF_TYPE, attrs: { nodeType: 'ghost', id: 'missing' } }],
    };
    const base = doc(paragraph(textNode('nothing relevant')));
    const err = capture(() => reattachOpaqueRefs(parsed, base));
    expect(err).toBeInstanceOf(DfmOpaqueUnknownRefError);
    expect((err as DfmOpaqueUnknownRefError).code).toBe(DFM_OPAQUE_UNKNOWN_REF);
    expect((err as DfmOpaqueUnknownRefError).ref).toBe('missing');
    expect((err as DfmOpaqueUnknownRefError).nodeType).toBe('ghost');
  });
});

describe('TestInlineAtomOpaqueRoundtrip', () => {
  it('restores an unregistered inline atom via {dfm:BASE64}', () => {
    const atom: PmNode = { type: 'mention', attrs: { userId: 'u-1' } };
    const dfm = pmToDfm(doc(paragraph(textNode('hi '), atom)));
    expect(dfm).toMatch(/\{dfm:[A-Za-z0-9+/=]+\}/);
    const back = dfmToJson(dfm);
    expect(JSON.stringify(back)).toContain('"type":"mention"');
    expect(JSON.stringify(back)).toContain('"userId":"u-1"');
  });
});

describe('TestStackedMarksRoundtrip (multi-mark data-loss regression)', () => {
  // A text run carrying 2+ marks must round-trip as ONE text node carrying
  // every mark, in original array order (marks[0] innermost .. marks[last]
  // outermost, matching applyMarks' convention).
  const cases: Array<[label: string, fixture: PmNode]> = [
    ['bold+italic (star-family collision)', doc(paragraph(textNode('x', [{ type: 'bold' }, { type: 'italic' }])))],
    // NB: `[italic, bold]` is intentionally not a case here — it serializes
    // to the exact same `***x***` string as `[bold, italic]` (nesting order
    // is unobservable once both delimiters coincide on the same char), so
    // the two mark-array orderings are indistinguishable on the wire; this
    // is a wire-format expressiveness limit, not a defect.
    ['bold+strike (non-colliding delimiters)', doc(paragraph(textNode('x', [{ type: 'strike' }, { type: 'bold' }])))],
    ['code+underline', doc(paragraph(textNode('x', [{ type: 'code' }, { type: 'underline' }])))],
    [
      'bold+link (link label carries a nested mark)',
      doc(paragraph(textNode('x', [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://example.com' } }]))),
    ],
    [
      'three marks stacked (bold+italic+strike)',
      doc(paragraph(textNode('x', [{ type: 'bold' }, { type: 'italic' }, { type: 'strike' }]))),
    ],
  ];

  it.each(cases)('round-trips %s to a deep-equal reconstruction', (_label, fixture) => {
    const dfm = pmToDfm(fixture);
    const back = dfmToJson(dfm);
    expect(back).toEqual(fixture);
  });
});

describe('TestMarkdownEscapingLossless', () => {
  it('preserves delimiter-adjacent plaintext with zero spurious marks', () => {
    const text = 'a == b <sub>x</sub>';
    const back = dfmToJson(pmToDfm(doc(paragraph(textNode(text)))));
    const para = back.content![0];
    expect(para.content!.length).toBe(1);
    expect(para.content![0].text).toBe(text);
    expect(para.content![0].marks ?? []).toHaveLength(0);
  });
});

describe('TestBlockLeadingMarkerEscaping', () => {
  // An ordinary paragraph beginning with a character the block lexer also
  // uses as a marker must NOT be silently reclassified into a different node
  // type on the reverse parse, and a literal `~~x~~` run must not gain a
  // spurious strike mark.
  const cases: Array<[label: string, text: string]> = [
    ['bullet-like', '- looks like a bullet'],
    ['blockquote-like', '> looks like a quote'],
    ['heading-like', '# looks like heading'],
    ['ordered-list-like', '1. looks like ordered'],
    ['multi-digit ordered-list-like', '12. also looks like ordered'],
    ['horizontal-rule-like', '---'],
    ['literal strike delimiters', 'strike ~~gone~~ here'],
  ];

  it.each(cases)('round-trips %s (%j) as a single unmarked paragraph', (_label, text) => {
    const fixture = doc(paragraph(textNode(text)));
    const back = dfmToJson(pmToDfm(fixture));
    expect(back).toEqual(fixture);
    const para = back.content![0];
    expect(para.type).toBe('paragraph');
    expect(para.content!.length).toBe(1);
    expect(para.content![0].text).toBe(text);
    expect(para.content![0].marks ?? []).toHaveLength(0);
  });
});

describe('TestSilentCorruptionRegressions', () => {
  // A paragraph beginning with `| ` must not be reverse-parsed as a table row.
  it('round-trips an ordinary paragraph starting with a pipe', () => {
    const text = '| looks like a table row';
    const fixture = doc(paragraph(textNode(text)));
    const back = dfmToJson(pmToDfm(fixture));
    expect(back).toEqual(fixture);
  });

  // An empty paragraph between two non-empty ones must not be silently
  // dropped (blank lines are structural separators in the block lexer).
  it('round-trips an empty paragraph sandwiched between two real ones', () => {
    const fixture = doc(paragraph(textNode('a')), paragraph(), paragraph(textNode('b')));
    const back = dfmToJson(pmToDfm(fixture));
    expect(back).toEqual(fixture);
  });

  // A codeBlock whose content contains its own ``` fence line must not be
  // split by the inner fence closing the block early.
  it('round-trips a codeBlock whose content contains a ``` line', () => {
    const fixture = doc({
      type: 'codeBlock',
      attrs: { language: 'md' },
      content: [{ type: 'text', text: 'before\n```\nafter' }],
    });
    const back = dfmToJson(pmToDfm(fixture));
    expect(back).toEqual(fixture);
  });

  // A link href containing `)` must not be truncated on the reverse parse.
  it('round-trips a link whose href contains a close-paren', () => {
    const fixture = doc(paragraph(textNode('anchor', [{ type: 'link', attrs: { href: 'https://x.com/a(b)c' } }])));
    const back = dfmToJson(pmToDfm(fixture));
    expect(back).toEqual(fixture);
  });

  // A link label containing `]` must not corrupt the run.
  it('round-trips a link whose label contains a close-bracket', () => {
    const fixture = doc(paragraph(textNode('a [b] c', [{ type: 'link', attrs: { href: 'https://example.com' } }])));
    const back = dfmToJson(pmToDfm(fixture));
    expect(back).toEqual(fixture);
  });
});

describe('TestLegacyOpaqueBlockFenceBackCompat', () => {
  // `dfmToJson` still accepts the legacy base64-body form of the opaque
  // block fence: the lexer scans to the closing fence (exactly like the
  // callout/code-fence handlers), so a 3-line LEGACY fence (header + base64
  // body + closing `:::`) leaves no spurious `:::` paragraph behind.
  it('accepts a legacy base64-body opaque block fence with NO spurious ::: paragraph', () => {
    const legacy = ':::dfm-opaque type=customWidget id=w1\neyJmb28iOiJiYXIifQ==\n:::';
    const back = dfmToJson(legacy);
    expect(back.content).toEqual([
      { type: OPAQUE_REF_TYPE, attrs: { nodeType: 'customWidget', id: 'w1' } },
    ]);
  });

  it('accepts a multi-line legacy body and still leaks no ::: content', () => {
    const legacy = ':::dfm-opaque type=chart id=c9\nline-one-of-body\nline-two-of-body\n:::';
    const back = dfmToJson(legacy);
    expect(back.content).toEqual([
      { type: OPAQUE_REF_TYPE, attrs: { nodeType: 'chart', id: 'c9' } },
    ]);
  });

  it('still round-trips the reference (no-body) form the forward path emits', () => {
    const widget: PmNode = { type: 'customWidget', attrs: { id: 'w9' }, content: [textNode('body')] };
    const base = doc(paragraph(textNode('x')), widget);
    const dfm = pmToDfm(base);
    // reference form only — no base64 body line in emitted DfM
    expect(dfm).not.toMatch(/[A-Za-z0-9+/]{20,}={0,2}/);
    const back = dfmToJson(dfm);
    const reattached = reattachOpaqueRefs(back, base);
    expect(reattached.content?.[1]).toEqual(widget);
  });
});

describe('TestSerializerDeterministic', () => {
  it('produces byte-equal output for identical input, twice', () => {
    const fixture = doc(
      paragraph(textNode('x')),
      { type: 'weirdAtom', content: [] },
      { type: 'weirdAtom', content: [] },
    );
    expect(pmToDfm(fixture)).toBe(pmToDfm(fixture));
  });

  it('never throws on a fuzz doc spanning every covered type', () => {
    const fuzz = doc(...Object.values(FIXTURES).flatMap((d) => [...(d.content ?? [])]));
    expect(() => pmToDfm(fuzz)).not.toThrow();
  });
});

describe('static determinism / linear-scrub gates', () => {
  it('registers no linear.* namespace node or mark type', () => {
    expect(registeredTypes().some((t) => t.toLowerCase().includes('linear'))).toBe(false);
    expect(registeredMarkTypes().some((t) => t.toLowerCase().includes('linear'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Golden fixture bytes (vendored corpus) + typed error taxonomy
// ---------------------------------------------------------------------------

describe('golden round-trip (vendored corpus paragraph fixture)', () => {
  const paragraphDfm = readFileSync(
    new URL('./fixtures/dfm/nodes/paragraph.dfm.md', import.meta.url),
    'utf8',
  );
  const paragraphPm = JSON.parse(
    readFileSync(new URL('./fixtures/dfm/nodes/paragraph.pm.json', import.meta.url), 'utf8'),
  ) as PmDoc;

  it('pmToDfm serializes the PM fixture to the DfM fixture bytes exactly', () => {
    // Byte-for-byte modulo the documented trailing-newline policy: exactly
    // one trailing "\n" terminates the document.
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

describe('typed error taxonomy — greppable sentinels', () => {
  it('DfmOpaqueUnknownRefError carries the DFM_OPAQUE_UNKNOWN_REF code, ref and nodeType', () => {
    const err = new DfmOpaqueUnknownRefError('drawio', 'block_123');
    expect(err).toBeInstanceOf(DfmOpaqueUnknownRefError);
    expect(err.code).toBe(DFM_OPAQUE_UNKNOWN_REF);
    expect(err.ref).toBe('block_123');
    expect(err.nodeType).toBe('drawio');
  });

  it('DfmNotImplementedError stays exported as the typed future-surface sentinel', () => {
    const err = new DfmNotImplementedError('someFutureSurface');
    expect(err).toBeInstanceOf(DfmNotImplementedError);
    expect(err.code).toBe(DFM_NOT_IMPLEMENTED);
    expect(err.nodeType).toBe('someFutureSurface');
  });
});
