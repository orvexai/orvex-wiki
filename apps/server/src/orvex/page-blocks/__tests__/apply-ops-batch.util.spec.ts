// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import type { JSONContent } from '@tiptap/core';
import { applyOpsBatch } from '../apply-ops-batch.util';
import { ApplyOpsError } from '../apply-ops.errors';

function paragraph(id: string, text: string): JSONContent {
  return {
    type: 'paragraph',
    attrs: { id },
    content: [{ type: 'text', text }],
  };
}

function doc(...children: JSONContent[]): JSONContent {
  return { type: 'doc', content: children };
}

describe('applyOpsBatch', () => {
  it('append adds a node at the end without mutating the input doc', () => {
    const input = doc(paragraph('a', 'first'));
    const result = applyOpsBatch(input, [
      { type: 'append', node: paragraph('b', 'second') },
    ]);

    expect(result.content).toHaveLength(2);
    expect(result.content![1].attrs.id).toBe('b');
    // Original untouched (working doc is a clone).
    expect(input.content).toHaveLength(1);
  });

  it('prepend adds a node at the start', () => {
    const result = applyOpsBatch(doc(paragraph('a', 'x')), [
      { type: 'prepend', node: paragraph('z', 'first') },
    ]);
    expect(result.content![0].attrs.id).toBe('z');
    expect(result.content![1].attrs.id).toBe('a');
  });

  it('insert-at inserts at the given index', () => {
    const result = applyOpsBatch(doc(paragraph('a', '1'), paragraph('b', '2')), [
      { type: 'insert-at', index: 1, node: paragraph('mid', 'inserted') },
    ]);
    expect(result.content!.map((n: JSONContent) => n.attrs!.id)).toEqual([
      'a',
      'mid',
      'b',
    ]);
  });

  it('insert_before inserts immediately before the ref block', () => {
    const result = applyOpsBatch(doc(paragraph('a', '1'), paragraph('b', '2')), [
      { type: 'insert_before', refBlockId: 'b', node: paragraph('new', 'x') },
    ]);
    expect(result.content!.map((n: JSONContent) => n.attrs!.id)).toEqual([
      'a',
      'new',
      'b',
    ]);
  });

  it('insert_before throws MISSING_REF_BLOCK_ID for an unknown ref', () => {
    expect(() =>
      applyOpsBatch(doc(paragraph('a', '1')), [
        { type: 'insert_before', refBlockId: 'nope', node: paragraph('n', 'x') },
      ]),
    ).toThrow(ApplyOpsError);
    try {
      applyOpsBatch(doc(paragraph('a', '1')), [
        { type: 'insert_before', refBlockId: 'nope', node: paragraph('n', 'x') },
      ]);
    } catch (err) {
      expect((err as ApplyOpsError).code).toBe('MISSING_REF_BLOCK_ID');
    }
  });

  it('replace-at swaps the target block for a new node', () => {
    const result = applyOpsBatch(doc(paragraph('a', 'old')), [
      { type: 'replace-at', blockId: 'a', node: paragraph('a', 'new') },
    ]);
    expect(result.content![0].content[0].text).toBe('new');
  });

  it('delete-by-id removes the target block', () => {
    const result = applyOpsBatch(
      doc(paragraph('a', '1'), paragraph('b', '2')),
      [{ type: 'delete-by-id', blockId: 'a' }],
    );
    expect(result.content).toHaveLength(1);
    expect(result.content![0].attrs.id).toBe('b');
  });

  it('delete-by-id throws MISSING_REF_BLOCK_ID for an unknown target', () => {
    try {
      applyOpsBatch(doc(paragraph('a', '1')), [
        { type: 'delete-by-id', blockId: 'ghost' },
      ]);
      fail('expected throw');
    } catch (err) {
      expect((err as ApplyOpsError).code).toBe('MISSING_REF_BLOCK_ID');
    }
  });

  it('patch-by-id merges attrs onto the existing target', () => {
    const result = applyOpsBatch(doc(paragraph('a', '1')), [
      { type: 'patch-by-id', blockId: 'a', patch: { textAlign: 'right' } },
    ]);
    expect(result.content![0].attrs).toEqual({ id: 'a', textAlign: 'right' });
  });

  it('move relocates a block relative to a ref block', () => {
    const result = applyOpsBatch(
      doc(paragraph('a', '1'), paragraph('b', '2'), paragraph('c', '3')),
      [{ type: 'move', blockId: 'c', refBlockId: 'a' }],
    );
    expect(result.content!.map((n: JSONContent) => n.attrs!.id)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('move with no refBlockId appends to the end', () => {
    const result = applyOpsBatch(
      doc(paragraph('a', '1'), paragraph('b', '2')),
      [{ type: 'move', blockId: 'a' }],
    );
    expect(result.content!.map((n: JSONContent) => n.attrs!.id)).toEqual(['b', 'a']);
  });

  it('move throws MOVE_SOURCE_MISSING when the source block does not exist', () => {
    try {
      applyOpsBatch(doc(paragraph('a', '1')), [
        { type: 'move', blockId: 'ghost', refBlockId: 'a' },
      ]);
      fail('expected throw');
    } catch (err) {
      expect((err as ApplyOpsError).code).toBe('MOVE_SOURCE_MISSING');
    }
  });

  it('patch-string replaces a matched substring in the target block', () => {
    const result = applyOpsBatch(doc(paragraph('a', 'hello world')), [
      { type: 'patch-string', blockId: 'a', find: 'world', replace: 'there' },
    ]);
    expect(result.content![0].content[0].text).toBe('hello there');
  });

  it('patch-string throws STRING_NOT_FOUND when the substring is absent', () => {
    try {
      applyOpsBatch(doc(paragraph('a', 'hello world')), [
        { type: 'patch-string', blockId: 'a', find: 'nope', replace: 'x' },
      ]);
      fail('expected throw');
    } catch (err) {
      expect((err as ApplyOpsError).code).toBe('STRING_NOT_FOUND');
    }
  });

  // amazing-MCP server-side block string-replace with the ambiguity guard —
  // the verified sibling of `patch-string` (which replace-firsts silently and
  // only throws STRING_NOT_FOUND). Block-scoped old→new that refuses to guess.
  it('string-replace replaces a unique substring in the target block', () => {
    const result = applyOpsBatch(doc(paragraph('a', 'hello world')), [
      { type: 'string-replace', blockId: 'a', find: 'world', replace: 'there' },
    ]);
    expect(result.content![0].content[0].text).toBe('hello there');
  });

  it('string-replace throws NO_REPLACEMENT when the substring is absent (0 matches)', () => {
    try {
      applyOpsBatch(doc(paragraph('a', 'hello world')), [
        { type: 'string-replace', blockId: 'a', find: 'nope', replace: 'x' },
      ]);
      fail('expected throw');
    } catch (err) {
      expect((err as ApplyOpsError).code).toBe('NO_REPLACEMENT');
    }
  });

  it('string-replace throws AMBIGUOUS_OLD on >1 match without replaceAll (no silent first-match)', () => {
    try {
      applyOpsBatch(doc(paragraph('a', 'na na na')), [
        { type: 'string-replace', blockId: 'a', find: 'na', replace: 'yo' },
      ]);
      fail('expected throw');
    } catch (err) {
      expect((err as ApplyOpsError).code).toBe('AMBIGUOUS_OLD');
    }
  });

  it('string-replace with replaceAll replaces every occurrence', () => {
    const result = applyOpsBatch(doc(paragraph('a', 'na na na')), [
      {
        type: 'string-replace',
        blockId: 'a',
        find: 'na',
        replace: 'yo',
        replaceAll: true,
      },
    ]);
    expect(result.content![0].content[0].text).toBe('yo yo yo');
  });

  it('string-replace is block-scoped — an unknown block throws MISSING_REF_BLOCK_ID (never a whole-page replace)', () => {
    try {
      applyOpsBatch(doc(paragraph('a', 'x')), [
        { type: 'string-replace', blockId: 'ghost', find: 'x', replace: 'y' },
      ]);
      fail('expected throw');
    } catch (err) {
      expect((err as ApplyOpsError).code).toBe('MISSING_REF_BLOCK_ID');
    }
  });

  it('string-replace does not touch OTHER blocks that also contain the substring', () => {
    const result = applyOpsBatch(
      doc(paragraph('a', 'match here'), paragraph('b', 'match there')),
      [{ type: 'string-replace', blockId: 'a', find: 'match', replace: 'HIT' }],
    );
    expect(result.content![0].content[0].text).toBe('HIT here');
    // Sibling with the same substring is untouched (block-scoped, not page-wide).
    expect(result.content![1].content[0].text).toBe('match there');
  });

  it('section-edit replaces the content of the target block', () => {
    const result = applyOpsBatch(doc(paragraph('a', 'old')), [
      {
        type: 'section-edit',
        blockId: 'a',
        node: { content: [{ type: 'text', text: 'new section' }] },
      },
    ]);
    expect(result.content![0].content[0].text).toBe('new section');
  });

  // 2026-07-13 PM content-corruption root-cause fix (residue closed): a
  // real caller (wiki-api's applySectionEdit) translates a doc-wrapped
  // edit body into `op.node.content` by taking the wrapper's own top-level
  // children — this is exactly right for a CONTAINER target, but when the
  // target is a leaf/inline-content node (`paragraph`) and the wrapper's
  // sole child re-states the target itself, splicing that block node in
  // as the paragraph's own content used to sail through unvalidated here
  // and crash uncaught, much later, inside `stampBlockIds`
  // (`TransformError: Invalid content for node paragraph`) — never
  // reaching this test file's own contract (AC2: fail loud BEFORE any
  // mutation, never a crash).
  it('section-edit unwraps a doc-wrapped same-type node instead of nesting it as invalid content', () => {
    const result = applyOpsBatch(doc(paragraph('a', 'old')), [
      {
        type: 'section-edit',
        blockId: 'a',
        node: {
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'edited via doc wrapper' }],
            },
          ],
        },
      },
    ]);
    // The target's own id/attrs are preserved (edited in place, not
    // replaced) and its content is the unwrapped grandchild — never a
    // paragraph nested inside a paragraph.
    expect(result.content![0].attrs.id).toBe('a');
    expect(result.content![0].type).toBe('paragraph');
    expect(result.content![0].content).toHaveLength(1);
    expect(result.content![0].content[0].type).toBe('text');
    expect(result.content![0].content[0].text).toBe('edited via doc wrapper');
  });

  it('section-edit still accepts container-valid children verbatim (multi-node case unaffected)', () => {
    const result = applyOpsBatch(doc(paragraph('a', 'old')), [
      {
        type: 'section-edit',
        blockId: 'a',
        node: {
          content: [
            { type: 'text', text: 'one ' },
            { type: 'text', text: 'two' },
          ],
        },
      },
    ]);
    expect(result.content![0].content.map((n: JSONContent) => n.text)).toEqual(
      ['one ', 'two'],
    );
  });

  it('section-edit rejects content that fits neither interpretation with INVALID_CONTENT_FORMAT (never a crash)', () => {
    try {
      applyOpsBatch(doc(paragraph('a', 'old')), [
        {
          type: 'section-edit',
          blockId: 'a',
          node: { content: [{ type: 'table' }] },
        },
      ]);
      fail('expected throw');
    } catch (err) {
      expect((err as ApplyOpsError).code).toBe('INVALID_CONTENT_FORMAT');
    }
  });

  it('rejects an unknown node type with UNKNOWN_BLOCK_TYPE', () => {
    try {
      applyOpsBatch(doc(paragraph('a', '1')), [
        { type: 'append', node: { type: 'totallyNotARealNodeType' } },
      ]);
      fail('expected throw');
    } catch (err) {
      expect((err as ApplyOpsError).code).toBe('UNKNOWN_BLOCK_TYPE');
    }
  });

  it('rejects an unsupported op type with UNSUPPORTED_OP', () => {
    try {
      applyOpsBatch(doc(paragraph('a', '1')), [{ type: 'not-a-real-op' }]);
      fail('expected throw');
    } catch (err) {
      expect((err as ApplyOpsError).code).toBe('UNSUPPORTED_OP');
    }
  });

  it('AC2 DoD core: a failing 2nd op in a 3-op batch never mutates op[0]s effect in the returned doc — the caller discards the whole working doc on throw', () => {
    const original = doc(paragraph('a', '1'), paragraph('b', '2'));
    let workingDocAfterFailure: unknown;
    try {
      applyOpsBatch(original, [
        { type: 'append', node: paragraph('new', 'x') },
        { type: 'delete-by-id', blockId: 'does-not-exist' },
        { type: 'append', node: paragraph('never', 'reached') },
      ]);
    } catch (err) {
      expect((err as ApplyOpsError).code).toBe('MISSING_REF_BLOCK_ID');
      workingDocAfterFailure = err;
    }
    expect(workingDocAfterFailure).toBeDefined();
    // The original doc passed in is never mutated regardless of how far the
    // batch got before failing.
    expect(original.content).toHaveLength(2);
  });
});
