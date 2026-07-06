import { DfmNotImplementedError } from './errors';
import type { Dfm, PmDoc, PmNode } from './types';

/**
 * DfM -> ProseMirror-JSON for the implemented (fixture-covered) subset:
 * plain-text paragraphs only (`doc` / `paragraph` / `text`, no marks).
 *
 * HONESTY CONTRACT: the covered subset is genuinely parsed and round-trips the
 * golden fixtures exactly. ANY construct outside it — a heading, list,
 * blockquote, code fence, table, opaque directive, inline mark, mention, or a
 * multi-line (soft/hard-break) paragraph — THROWS {@link DfmNotImplementedError}.
 * It NEVER falls back to a fabricated `{ type: 'doc', content: [] }` or a lossy
 * best-effort parse. Refusing is the correct behavior until the fixture for
 * that construct lands in orvex-studio-contracts.
 */

/** First-line block markers that denote a node type outside the covered subset. */
const BLOCK_REJECTIONS: ReadonlyArray<{ readonly test: RegExp; readonly nodeType: string }> = [
  { test: /^:{3}/, nodeType: 'dfm-opaque' }, // ::: opaque colon-directive fence
  { test: /^#{1,6}\s/, nodeType: 'heading' },
  { test: /^>\s?/, nodeType: 'blockquote' },
  { test: /^[-*+]\s/, nodeType: 'bullet_list' },
  { test: /^\d+[.)]\s/, nodeType: 'ordered_list' },
  { test: /^(?:```|~~~)/, nodeType: 'code_block' },
  { test: /^(?:-{3,}|\*{3,}|_{3,})\s*$/, nodeType: 'horizontal_rule' },
  { test: /^\|/, nodeType: 'table' },
];

/**
 * Inline markdown-significant characters/sequences. Their mere presence means
 * the block carries a mark, mention, link, inline code, or opaque handle — none
 * of which is fixture-covered — so we refuse rather than emit lossy text.
 * (This is intentionally conservative: a covered block is pure prose.)
 */
const INLINE_MARKER = /[*_`~[\]|<>]|:{3}|@[\w-]/;

const TERMINATOR = '\n';

function parseBlock(block: string): PmNode {
  const firstLine = block.split('\n', 1)[0];

  for (const { test, nodeType } of BLOCK_REJECTIONS) {
    if (test.test(firstLine)) {
      throw new DfmNotImplementedError(nodeType);
    }
  }

  if (block.includes('\n')) {
    // A single \n inside a block is a soft/hard break — not covered.
    throw new DfmNotImplementedError(
      'hard_break',
      `DfM multi-line paragraphs (soft/hard breaks) are not fixture-covered ` +
        `(${'DFM_NOT_IMPLEMENTED'}).`,
    );
  }

  if (INLINE_MARKER.test(block)) {
    throw new DfmNotImplementedError(
      'text-marks',
      `DfM inline marks/mentions/links are not fixture-covered ` +
        `(${'DFM_NOT_IMPLEMENTED'}); only unmarked paragraph text round-trips.`,
    );
  }

  return { type: 'paragraph', content: [{ type: 'text', text: block }] };
}

/**
 * Parse DfM into a ProseMirror document.
 *
 * Symmetric with {@link pmToDfm}'s trailing-newline policy: exactly one
 * trailing `\n` is stripped, then blocks are split on blank lines. An empty
 * document is NOT covered (returning an empty doc is the banned fabrication) —
 * it throws.
 */
export function dfmToJson(dfm: Dfm): PmDoc {
  const body = dfm.endsWith(TERMINATOR) ? dfm.slice(0, -TERMINATOR.length) : dfm;

  if (body.length === 0) {
    throw new DfmNotImplementedError(
      'doc-empty',
      `An empty DfM document is not fixture-covered (${'DFM_NOT_IMPLEMENTED'}); ` +
        `returning an empty doc would be a fabricated parse.`,
    );
  }

  const blocks = body.split(/\n{2,}/);
  const content: PmNode[] = blocks.map(parseBlock);
  return { type: 'doc', content };
}
