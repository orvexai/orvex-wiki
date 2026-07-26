import { jsonToDfm } from '../collaboration.util';

/**
 * ENG-2487 — the collab layer's Yjs↔PM↔DfM projection (`jsonToDfm`), driven
 * through the REAL `@orvex/dfm` package (CS §5 ❌#4 — never mocked).
 */
describe('jsonToDfm (collaboration.util — ENG-2487 DfM projection)', () => {
  it('serializes a plain paragraph doc to DfM with the single-trailing-newline policy', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'collab snapshot' }],
        },
      ],
    };
    const dfm = jsonToDfm(doc);
    expect(dfm).toBe('collab snapshot\n');
  });

  it('fences a serializer-unknown block type losslessly instead of dropping it', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'before' }] },
        { type: 'excalidraw', attrs: { id: 'ex-fixed-7' }, content: [] },
      ],
    };
    const dfm = jsonToDfm(doc);
    expect(dfm).toContain(':::dfm-opaque type=excalidraw id=ex-fixed-7');
  });

  it('rejects a typeless document up front rather than fabricating an empty doc', () => {
    expect(() => jsonToDfm({} as any)).toThrow(
      /expected a ProseMirror JSON node/,
    );
  });
});
