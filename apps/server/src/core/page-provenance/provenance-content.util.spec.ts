import {
  markAiChangedBlocks,
  stripAiAuthoredMarks,
} from './provenance-content.util';

/**
 * Helpers to build small, deterministic ProseMirror JSON docs.
 */
function textNode(text: string, marks?: Array<{ type: string }>): any {
  const node: any = { type: 'text', text };
  if (marks) node.marks = marks;
  return node;
}

function paragraph(...textNodes: any[]): any {
  return { type: 'paragraph', content: textNodes };
}

function doc(...blocks: any[]): any {
  return { type: 'doc', content: blocks };
}

/**
 * Marks (as type-name string arrays) of every text node in a top-level block.
 */
function marksOfBlock(docJson: any, blockIndex: number): string[][] {
  const block = docJson.content[blockIndex];
  const inline = block.content ?? [];
  return inline.map((n: any) => (n.marks ?? []).map((m: any) => m.type));
}

function blockHasAiMark(docJson: any, blockIndex: number): boolean {
  return marksOfBlock(docJson, blockIndex).some((marks) =>
    marks.includes('aiAuthored'),
  );
}

function blockFullyAiMarked(docJson: any, blockIndex: number): boolean {
  const marksPerTextNode = marksOfBlock(docJson, blockIndex);
  return (
    marksPerTextNode.length > 0 &&
    marksPerTextNode.every((marks) => marks.includes('aiAuthored'))
  );
}

describe('provenance-content.util', () => {
  describe('markAiChangedBlocks', () => {
    it('marks only an inserted block (insert case)', () => {
      const oldDoc = doc(
        paragraph(textNode('First paragraph stays the same.')),
        paragraph(textNode('Second paragraph stays the same.')),
      );
      const newDoc = doc(
        paragraph(textNode('First paragraph stays the same.')),
        paragraph(textNode('Second paragraph stays the same.')),
        paragraph(textNode('Third paragraph is brand new.')),
      );

      const result = markAiChangedBlocks(oldDoc, newDoc);

      expect(result.content).toHaveLength(3);
      expect(blockHasAiMark(result, 0)).toBe(false);
      expect(blockHasAiMark(result, 1)).toBe(false);
      expect(blockFullyAiMarked(result, 2)).toBe(true);
    });

    it('marks only the block whose text changed (replace within a block)', () => {
      const oldDoc = doc(
        paragraph(textNode('Paragraph one untouched.')),
        paragraph(textNode('Paragraph two original text.')),
        paragraph(textNode('Paragraph three untouched.')),
      );
      const newDoc = doc(
        paragraph(textNode('Paragraph one untouched.')),
        paragraph(textNode('Paragraph two EDITED text.')),
        paragraph(textNode('Paragraph three untouched.')),
      );

      const result = markAiChangedBlocks(oldDoc, newDoc);

      expect(blockHasAiMark(result, 0)).toBe(false);
      expect(blockFullyAiMarked(result, 1)).toBe(true);
      expect(blockHasAiMark(result, 2)).toBe(false);
    });

    it('returns the doc unchanged for identical docs (no-op)', () => {
      const sameDoc = doc(
        paragraph(textNode('Nothing changes here.')),
        paragraph(textNode('Still nothing changes.')),
      );

      const result = markAiChangedBlocks(
        deepCopy(sameDoc),
        deepCopy(sameDoc),
      );

      expect(result).toEqual(sameDoc);
      expect(blockHasAiMark(result, 0)).toBe(false);
      expect(blockHasAiMark(result, 1)).toBe(false);
    });

    it('marks the WHOLE block for a one-word change (block-level, not word-level)', () => {
      const longText =
        'This is a fairly long paragraph that contains many words ' +
        'and several distinct phrases so we can prove block level marking ' +
        'rather than tight word range marking of the diff machinery.';
      const editedLongText = longText.replace('many words', 'numerous terms');

      const oldDoc = doc(
        paragraph(textNode('An untouched leading paragraph.')),
        paragraph(textNode(longText)),
      );
      const newDoc = doc(
        paragraph(textNode('An untouched leading paragraph.')),
        paragraph(textNode(editedLongText)),
      );

      const result = markAiChangedBlocks(oldDoc, newDoc);

      // The unchanged block is not marked.
      expect(blockHasAiMark(result, 0)).toBe(false);

      // The changed block is fully marked. After marking, prosemirror may split
      // the single text node into several runs, but EVERY run (first..last)
      // must carry the aiAuthored mark, proving block-level granularity.
      const marksPerTextNode = marksOfBlock(result, 1);
      expect(marksPerTextNode.length).toBeGreaterThan(0);
      // First and last text nodes both carry the mark.
      expect(marksPerTextNode[0]).toContain('aiAuthored');
      expect(marksPerTextNode[marksPerTextNode.length - 1]).toContain(
        'aiAuthored',
      );
      // And the entire block is uniformly marked.
      expect(blockFullyAiMarked(result, 1)).toBe(true);
    });

    it('treats the whole new doc as changed when oldDoc is null/empty', () => {
      const newDoc = doc(
        paragraph(textNode('Alpha paragraph.')),
        paragraph(textNode('Beta paragraph.')),
      );

      const fromNull = markAiChangedBlocks(null, newDoc);
      expect(blockFullyAiMarked(fromNull, 0)).toBe(true);
      expect(blockFullyAiMarked(fromNull, 1)).toBe(true);

      const emptyDoc = { type: 'doc', content: [] };
      const fromEmpty = markAiChangedBlocks(emptyDoc, newDoc);
      expect(blockFullyAiMarked(fromEmpty, 0)).toBe(true);
      expect(blockFullyAiMarked(fromEmpty, 1)).toBe(true);
    });

    it('does not mutate its inputs (purity)', () => {
      const oldDoc = doc(paragraph(textNode('original')));
      const newDoc = doc(
        paragraph(textNode('original')),
        paragraph(textNode('added')),
      );
      const oldSnapshot = deepCopy(oldDoc);
      const newSnapshot = deepCopy(newDoc);

      markAiChangedBlocks(oldDoc, newDoc);

      expect(oldDoc).toEqual(oldSnapshot);
      expect(newDoc).toEqual(newSnapshot);
    });
  });

  describe('stripAiAuthoredMarks', () => {
    it('removes every aiAuthored mark', () => {
      const input = doc(
        paragraph(textNode('marked', [{ type: 'aiAuthored' }])),
        paragraph(
          textNode('also marked', [{ type: 'aiAuthored' }]),
          textNode(' plain'),
        ),
      );

      const result = stripAiAuthoredMarks(input);

      const allMarks = result.content
        .flatMap((b: any) => b.content ?? [])
        .flatMap((n: any) => n.marks ?? [])
        .map((m: any) => m.type);
      expect(allMarks).not.toContain('aiAuthored');
    });

    it('preserves other marks (e.g. bold) and only strips aiAuthored', () => {
      const input = doc(
        paragraph(
          textNode('bold and ai', [
            { type: 'bold' },
            { type: 'aiAuthored' },
          ]),
          textNode('ai only', [{ type: 'aiAuthored' }]),
          textNode('bold only', [{ type: 'bold' }]),
        ),
      );

      const result = stripAiAuthoredMarks(input);

      const inline = result.content[0].content;
      // node 0: bold remains, aiAuthored gone
      expect(inline[0].marks.map((m: any) => m.type)).toEqual(['bold']);
      // node 1: aiAuthored gone -> empty marks array
      expect(inline[1].marks).toEqual([]);
      // node 2: bold preserved
      expect(inline[2].marks.map((m: any) => m.type)).toEqual(['bold']);
    });

    it('does not mutate its input (purity)', () => {
      const input = doc(
        paragraph(textNode('marked', [{ type: 'aiAuthored' }])),
      );
      const snapshot = deepCopy(input);

      stripAiAuthoredMarks(input);

      expect(input).toEqual(snapshot);
    });
  });
});

function deepCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
