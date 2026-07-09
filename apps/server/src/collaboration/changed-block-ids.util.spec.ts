import { computeChangedBlockIds } from './changed-block-ids.util';

/**
 * ENG-1383 F5/AC5 fix-pass-2 — real content-delta computation. The collab
 * write path (`PersistenceExtension.onStoreDocument`) has BOTH the
 * before-write `page.content` (from the locked read) and the after-write
 * `tiptapJson` in hand; this util diffs them by stable block `id` (the
 * ENG-1397 `BLOCK_ID_TYPES` attr every block-level node already carries) so
 * `changedBlockIds` reflects an ACTUAL edit, never a fabricated value.
 */
describe('computeChangedBlockIds', () => {
  it('returns the id of a paragraph whose text content changed', () => {
    const before = {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { id: 'p1' }, content: [{ type: 'text', text: 'a' }] },
        { type: 'paragraph', attrs: { id: 'p2' }, content: [{ type: 'text', text: 'b' }] },
      ],
    };
    const after = {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { id: 'p1' }, content: [{ type: 'text', text: 'a-edited' }] },
        { type: 'paragraph', attrs: { id: 'p2' }, content: [{ type: 'text', text: 'b' }] },
      ],
    };

    expect(computeChangedBlockIds(before, after)).toEqual(['p1']);
  });

  it('returns the id of a newly-added block', () => {
    const before = {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { id: 'p1' }, content: [{ type: 'text', text: 'a' }] }],
    };
    const after = {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { id: 'p1' }, content: [{ type: 'text', text: 'a' }] },
        { type: 'paragraph', attrs: { id: 'p2' }, content: [{ type: 'text', text: 'new' }] },
      ],
    };

    expect(computeChangedBlockIds(before, after)).toEqual(['p2']);
  });

  it('returns the id of a removed block', () => {
    const before = {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { id: 'p1' }, content: [{ type: 'text', text: 'a' }] },
        { type: 'paragraph', attrs: { id: 'p2' }, content: [{ type: 'text', text: 'b' }] },
      ],
    };
    const after = {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { id: 'p1' }, content: [{ type: 'text', text: 'a' }] }],
    };

    expect(computeChangedBlockIds(before, after)).toEqual(['p2']);
  });

  it('returns an empty array for a byte-identical doc', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { id: 'p1' }, content: [{ type: 'text', text: 'a' }] }],
    };
    expect(computeChangedBlockIds(doc, JSON.parse(JSON.stringify(doc)))).toEqual([]);
  });

  it('is tolerant of null/undefined before (e.g. a brand-new page)', () => {
    const after = {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { id: 'p1' }, content: [{ type: 'text', text: 'a' }] }],
    };
    expect(computeChangedBlockIds(null, after)).toEqual(['p1']);
  });
});
