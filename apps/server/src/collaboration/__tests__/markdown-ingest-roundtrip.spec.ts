/**
 * Regression coverage for the DfM markdown -> ProseMirror ingestion path used
 * by page create/update and the markdown importer
 * (`ImportService.processMarkdown` = `markdownToHtml` -> `htmlToJson`).
 *
 * Evidence: rebaseline/cli.md (ENG-2043 D4, ENG-2044 D5). Two defects were
 * reported against the DfM markdown ingestion converter:
 *
 *   D4 — every bulleted AND ordered list-item's TEXT was dropped on ingest
 *        (list items arrived as empty `listItem` nodes).
 *   D5 — a table cell was truncated at an un-escaped `|` even INSIDE an inline
 *        code span: the trailing cell text and the `code` mark were lost.
 *
 * These tests drive the real converter functions (no mocks) end-to-end and
 * assert on the stored ProseMirror JSON, exactly the shape a page write
 * persists.
 */
import { markdownToHtml } from '@docmost/editor-ext';
import { htmlToJson } from '../collaboration.util';

type PmNode = {
  type: string;
  text?: string;
  marks?: { type: string }[];
  content?: PmNode[];
};

async function markdownToPm(markdown: string): Promise<PmNode> {
  const html = await markdownToHtml(markdown);
  return htmlToJson(html) as PmNode;
}

/** Depth-first collect of every text run's `{ text, markTypes }`. */
function collectTextRuns(
  node: PmNode,
): { text: string; markTypes: string[] }[] {
  const runs: { text: string; markTypes: string[] }[] = [];
  const walk = (n: PmNode) => {
    if (n.type === 'text' && typeof n.text === 'string') {
      runs.push({
        text: n.text,
        markTypes: (n.marks ?? []).map((m) => m.type),
      });
    }
    for (const child of n.content ?? []) walk(child);
  };
  walk(node);
  return runs;
}

/** Find the first node of `type` in a depth-first traversal. */
function findNode(node: PmNode, type: string): PmNode | undefined {
  if (node.type === type) return node;
  for (const child of node.content ?? []) {
    const hit = findNode(child, type);
    if (hit) return hit;
  }
  return undefined;
}

describe('DfM markdown ingestion round-trip', () => {
  // D4 — bulleted list item text must survive ingestion.
  it('preserves every bulleted list-item text (ENG-2043 D4)', async () => {
    const doc = await markdownToPm('- apple\n- banana\n- cherry\n');

    const list = findNode(doc, 'bulletList');
    expect(list).toBeDefined();
    const items = (list!.content ?? []).filter((n) => n.type === 'listItem');
    expect(items).toHaveLength(3);

    const texts = items.map((item) =>
      collectTextRuns(item)
        .map((r) => r.text)
        .join(''),
    );
    expect(texts).toEqual(['apple', 'banana', 'cherry']);
  });

  // D4 — ordered list item text must survive ingestion.
  it('preserves every ordered list-item text (ENG-2043 D4)', async () => {
    const doc = await markdownToPm('1. first\n2. second\n3. third\n');

    const list = findNode(doc, 'orderedList');
    expect(list).toBeDefined();
    const items = (list!.content ?? []).filter((n) => n.type === 'listItem');
    expect(items).toHaveLength(3);

    const texts = items.map((item) =>
      collectTextRuns(item)
        .map((r) => r.text)
        .join(''),
    );
    expect(texts).toEqual(['first', 'second', 'third']);
  });

  // D5 — an un-escaped pipe inside a backtick code span in a table cell must
  // not truncate the cell, and the `code` mark must be retained.
  it('keeps a table cell with a backtick-wrapped {user|org} intact, code mark and all (ENG-2044 D5)', async () => {
    const md =
      '| key | val |\n' +
      '| --- | --- |\n' +
      '| a | value with a pipe `{user|org}` inside |\n';

    const doc = await markdownToPm(md);

    const table = findNode(doc, 'table');
    expect(table).toBeDefined();

    // The data cell is the 2nd cell of the 2nd row.
    const rows = (table!.content ?? []).filter((n) => n.type === 'tableRow');
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const dataRow = rows[1];
    const cells = (dataRow.content ?? []).filter(
      (n) => n.type === 'tableCell' || n.type === 'tableHeader',
    );
    expect(cells).toHaveLength(2);

    const valueCell = cells[1];
    const runs = collectTextRuns(valueCell);

    // Full cell text survives (not truncated at the pipe).
    const fullText = runs.map((r) => r.text).join('');
    expect(fullText).toBe('value with a pipe {user|org} inside');

    // The `{user|org}` fragment carries the `code` mark (backtick preserved).
    const codeRun = runs.find((r) => r.markTypes.includes('code'));
    expect(codeRun).toBeDefined();
    expect(codeRun!.text).toBe('{user|org}');
  });

  // Guard: a code span with a pipe in ordinary prose (NOT a table) must render
  // verbatim — the D5 fix is scoped to table rows only.
  it('does not alter a code-span pipe in non-table prose', async () => {
    const doc = await markdownToPm('Use `a|b` in prose.\n');
    const runs = collectTextRuns(doc);
    const codeRun = runs.find((r) => r.markTypes.includes('code'));
    expect(codeRun).toBeDefined();
    expect(codeRun!.text).toBe('a|b');
  });
});
