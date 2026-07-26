import { registerMark, registerNode } from './registry';
import {
  EMPTY_PARAGRAPH_MARKER,
  escapeBlockLeadingMarkers,
  escapeMarkdown,
} from './inline-serializer';
import type { PmNode, SerializerCtx } from './types';

/**
 * Registration of the covered block/leaf node types (15) and covered marks
 * (12) — folded in from the upstream clean-room reference serializer
 * (ENG-2487). Every entry is proven against a fixture-pair in the vendored
 * golden corpus (test/fixtures/dfm/**, byte-copies of
 * orvex-studio-contracts fixtures/dfm/**); registering a new type without a
 * corpus fixture-pair reds the conformance coverage gate.
 */

function textOf(node: PmNode | undefined): string {
  if (!node) return '';
  return node.content?.[0]?.text ?? '';
}

function joinBlocks(
  nodes: readonly PmNode[] | undefined,
  ctx: SerializerCtx,
): string {
  return (nodes ?? []).map((n) => ctx.serializeNode(n)).join('\n\n');
}

// ---- Leaf / root ------------------------------------------------------

registerNode('text', {
  toDfm: (node, ctx) => ctx.serializeInline([node]),
});

registerNode('doc', {
  // Trailing-newline policy (symmetric with `dfmToJson`): block nodes are
  // joined by a single blank line (the CommonMark block separator) and the
  // document is terminated by exactly ONE trailing `\n` (POSIX text-file
  // convention). For the golden `paragraph` fixture this yields the file
  // bytes `The quick brown fox.\n` exactly.
  toDfm: (node, ctx) => joinBlocks(node.content, ctx) + '\n',
});

registerNode('hardBreak', {
  toDfm: () => '\\\n',
});

// ---- Paragraph / heading -----------------------------------------------

registerNode('paragraph', {
  // Disarm a leading `- `/`> `/`#{1,6} `/`N. `/`| ` or exact `---` line so
  // the block lexer can't misread ordinary prose as a bulletList/blockquote/
  // heading/orderedList/table/horizontalRule on the reverse parse. A
  // paragraph with zero inline content emits the reserved
  // EMPTY_PARAGRAPH_MARKER instead of the empty string, so it survives as
  // its own non-blank line rather than being absorbed by the reverse block
  // lexer's blank-line skip (round-trip data loss otherwise).
  toDfm: (node, ctx) => {
    const inline = ctx.serializeInline(node.content);
    return inline === '' ? EMPTY_PARAGRAPH_MARKER : escapeBlockLeadingMarkers(inline);
  },
});

registerNode('heading', {
  toDfm: (node, ctx) => {
    const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)));
    return '#'.repeat(level) + ' ' + ctx.serializeInline(node.content);
  },
});

// ---- Lists ---------------------------------------------------------------

registerNode('listItem', {
  toDfm: (node, ctx) => joinBlocks(node.content, ctx),
});

registerNode('bulletList', {
  toDfm: (node, ctx) =>
    (node.content ?? [])
      .map((item) => '- ' + ctx.serializeNode(item).split('\n').join('\n  '))
      .join('\n'),
});

registerNode('orderedList', {
  toDfm: (node, ctx) =>
    (node.content ?? [])
      .map((item, i) => `${i + 1}. ` + ctx.serializeNode(item).split('\n').join('\n   '))
      .join('\n'),
});

// ---- Table -----------------------------------------------------------

registerNode('tableCell', {
  toDfm: (node, ctx) => ctx.serializeInline(node.content).replace(/\|/g, '\\|'),
});

registerNode('tableRow', {
  toDfm: (node, ctx) =>
    (node.content ?? []).map((cell) => ctx.serializeNode(cell)).join(' | '),
});

registerNode('table', {
  toDfm: (node, ctx) => {
    const rows = node.content ?? [];
    if (rows.length === 0) return '';
    const header = ctx.serializeNode(rows[0]);
    const colCount = rows[0].content?.length ?? 0;
    const sep = Array.from({ length: colCount }, () => '---').join(' | ');
    const body = rows.slice(1).map((r) => ctx.serializeNode(r));
    return ['| ' + header + ' |', '| ' + sep + ' |', ...body.map((b) => '| ' + b + ' |')].join('\n');
  },
});

// ---- Blockquote / callout / code / hr ------------------------------------

registerNode('blockquote', {
  toDfm: (node, ctx) =>
    joinBlocks(node.content, ctx)
      .split('\n')
      .map((line) => (line.length ? '> ' + line : '>'))
      .join('\n'),
});

registerNode('codeBlock', {
  // A content line containing its own ``` (or longer) fence must not close
  // the block early (that would split codeBlock -> codeBlock+paragraph+empty
  // codeBlock on the reverse parse). Widen the fence to one backtick longer
  // than the longest backtick run actually present in the content (standard
  // CommonMark technique) so no line inside the body can ever match it.
  toDfm: (node) => {
    const lang = typeof node.attrs?.language === 'string' ? node.attrs.language : '';
    const raw = textOf(node);
    const runs: string[] = raw.match(/`+/g) ?? [];
    const longestRun = runs.reduce((max, run) => Math.max(max, run.length), 0);
    const fence = '`'.repeat(Math.max(3, longestRun + 1));
    return fence + lang + '\n' + raw + '\n' + fence;
  },
});

registerNode('callout', {
  toDfm: (node, ctx) => {
    const calloutType =
      typeof node.attrs?.calloutType === 'string' ? node.attrs.calloutType : 'info';
    return `:::callout type=${calloutType}\n` + joinBlocks(node.content, ctx) + '\n:::';
  },
});

registerNode('horizontalRule', {
  toDfm: () => '---',
});

// ============================================================================
// Marks (12) — each a co-located open/close delimiter + wrap/parse pair.
// ============================================================================

registerMark('code', {
  openToken: '`',
  closeToken: '`',
  wrapDfm: (text) => '`' + text + '`',
  markFromToken: () => ({ type: 'code' }),
});

registerMark('bold', {
  openToken: '**',
  closeToken: '**',
  wrapDfm: (text) => '**' + text + '**',
  markFromToken: () => ({ type: 'bold' }),
});

registerMark('underline', {
  openToken: '__',
  closeToken: '__',
  wrapDfm: (text) => '__' + text + '__',
  markFromToken: () => ({ type: 'underline' }),
});

registerMark('strike', {
  openToken: '~~',
  closeToken: '~~',
  wrapDfm: (text) => '~~' + text + '~~',
  markFromToken: () => ({ type: 'strike' }),
});

registerMark('highlight', {
  openToken: '==',
  closeToken: '==',
  wrapDfm: (text) => '==' + text + '==',
  markFromToken: () => ({ type: 'highlight' }),
});

registerMark('subscript', {
  openToken: '<sub>',
  closeToken: '</sub>',
  wrapDfm: (text) => '<sub>' + text + '</sub>',
  markFromToken: () => ({ type: 'subscript' }),
});

registerMark('superscript', {
  openToken: '<sup>',
  closeToken: '</sup>',
  wrapDfm: (text) => '<sup>' + text + '</sup>',
  markFromToken: () => ({ type: 'superscript' }),
});

registerMark('kbd', {
  openToken: '<kbd>',
  closeToken: '</kbd>',
  wrapDfm: (text) => '<kbd>' + text + '</kbd>',
  markFromToken: () => ({ type: 'kbd' }),
});

registerMark('small', {
  openToken: '<small>',
  closeToken: '</small>',
  wrapDfm: (text) => '<small>' + text + '</small>',
  markFromToken: () => ({ type: 'small' }),
});

// AI-provenance wire tag. Provenance-load-bearing: unlike `textStyle`/
// `comment` (transparent pass-throughs), `aiAuthored` MUST survive the round
// trip — it is the ONE pinned wire representation the engine stamp primitive
// and the client mark/badge both key off. Boolean-presence mark, no attrs
// (no speculative provenance schema — CS ❌#6).
registerMark('aiAuthored', {
  openToken: '<ai>',
  closeToken: '</ai>',
  wrapDfm: (text) => '<ai>' + text + '</ai>',
  markFromToken: () => ({ type: 'aiAuthored' }),
});

// `italic` is intentionally registered AFTER `bold` so markLexOrder's
// longest-token-first sort still prefers `**` at a shared `*` prefix.
registerMark('italic', {
  openToken: '*',
  closeToken: '*',
  wrapDfm: (text) => '*' + text + '*',
  markFromToken: () => ({ type: 'italic' }),
});

// `link` is special-cased by the reverse lexer (bracket+paren shape, not a
// symmetric delimiter) but registered here so `registeredMarkTypes()` and
// forward serialization both go through the same SSoT.
registerMark('link', {
  openToken: '[',
  closeToken: ')',
  // A raw `)` inside the href would prematurely close the reverse lexer's
  // `(...)` span, truncating the URL and spilling its tail into the
  // surrounding text. Escape it here; the reverse lexer (a hand-rolled
  // paren-depth scan, not a `[^)]*` regex) strips it back out.
  wrapDfm: (text, mark) => {
    const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : '';
    return `[${text}](${href.replace(/\)/g, '\\)')})`;
  },
  markFromToken: (_openMatch, innerCaptures) => ({
    type: 'link',
    attrs: { href: innerCaptures[0] ?? '' },
  }),
});

export { escapeMarkdown };
