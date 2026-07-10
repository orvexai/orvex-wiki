// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { applyOpsBatch } from '../apply-ops-batch.util';
import { ApplyOpsError } from '../apply-ops.errors';

function paragraph(id: string, text: string) {
  return {
    type: 'paragraph',
    attrs: { id },
    content: [{ type: 'text', text }],
  };
}

function doc(...children: any[]) {
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
    expect(result.content!.map((n: any) => n.attrs.id)).toEqual([
      'a',
      'mid',
      'b',
    ]);
  });

  it('insert_before inserts immediately before the ref block', () => {
    const result = applyOpsBatch(doc(paragraph('a', '1'), paragraph('b', '2')), [
      { type: 'insert_before', refBlockId: 'b', node: paragraph('new', 'x') },
    ]);
    expect(result.content!.map((n: any) => n.attrs.id)).toEqual([
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
    expect(result.content!.map((n: any) => n.attrs.id)).toEqual([
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
    expect(result.content!.map((n: any) => n.attrs.id)).toEqual(['b', 'a']);
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

  it('rejects an unknown node type with UNKNOWN_BLOCK_TYPE', () => {
    try {
      applyOpsBatch(doc(paragraph('a', '1')), [
        { type: 'append', node: { type: 'totallyNotARealNodeType' } as any },
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
