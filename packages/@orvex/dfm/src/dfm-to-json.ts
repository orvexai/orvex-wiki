import { OPAQUE_REF_TYPE } from './reattach-opaque';
import { buildMark, markLexOrder } from './registry';
import {
  decodeInlineOpaque,
  EMPTY_PARAGRAPH_MARKER,
  UNESCAPE_CHARS as ESCAPE_CHARS,
} from './inline-serializer';
import type { Dfm, PmDoc, PmMark, PmNode } from './types';

/**
 * Clean-room reverse parser: DfM text -> ProseMirror JSON. A hand-rolled
 * line-based block splitter + inline lexer (never an HTML intermediate),
 * folded in from the upstream reference serializer (ENG-2487).
 *
 * `ESCAPE_CHARS` here is `inline-serializer.ts`'s `UNESCAPE_CHARS` re-bound
 * under its historical local name: the reverse lexer must strip the
 * positional `\-`/`\>`/`\#`/`\.`/`\|` escapes produced by
 * `escapeBlockLeadingMarker` in addition to the blanket-escaped set.
 */

// ---------------------------------------------------------------------------
// Inline lexing
// ---------------------------------------------------------------------------

/** Append `mark` onto every text-type node in `nodes` (marks only carry
 * meaning on leaf text runs). Used to layer an outer mark over a
 * recursively-parsed inner span so stacked marks (e.g. bold+italic,
 * bold+link, code+strike) survive the reverse parse instead of collapsing to
 * a single mark. Appending (not prepending) preserves the forward
 * `applyMarks` convention that `marks[0]` is innermost and
 * `marks[marks.length - 1]` is outermost: the recursive inner parse already
 * produced the innermost marks, and each successive outer wrap appends. */
function withMark(nodes: PmNode[], mark: PmMark): PmNode[] {
  return nodes.map((node) =>
    node.type === 'text' ? { ...node, marks: [...(node.marks ?? []), mark] } : node,
  );
}

/** Count the run of consecutive `ch` characters starting at index `i`. */
function countRun(str: string, i: number, ch: string): number {
  let n = 0;
  while (str[i + n] === ch) n += 1;
  return n;
}

/**
 * Scan forward from `start` for the first unescaped `close` character,
 * treating `\X` (any X) as an escaped literal to skip over rather than a
 * potential terminator. Returns -1 if `close` is never found unescaped.
 * (Replaces a `[^)]*`/`[^\]]*` regex shape that would stop at the FIRST
 * occurrence of the close character regardless of escaping, truncating a
 * link href containing `)` or corrupting a link label containing `]`.)
 */
function findUnescaped(str: string, start: number, close: string): number {
  let i = start;
  while (i < str.length) {
    if (str[i] === '\\' && i + 1 < str.length) {
      i += 2;
      continue;
    }
    if (str[i] === close) return i;
    i += 1;
  }
  return -1;
}

function parseInline(str: string): PmNode[] {
  const nodes: PmNode[] = [];
  let buf = '';
  let i = 0;

  const flush = (): void => {
    if (buf.length > 0) {
      nodes.push({ type: 'text', text: buf });
      buf = '';
    }
  };

  while (i < str.length) {
    // hardBreak: a literal backslash immediately followed by a real newline.
    if (str[i] === '\\' && str[i + 1] === '\n') {
      flush();
      nodes.push({ type: 'hardBreak' });
      i += 2;
      continue;
    }

    // Escaped literal char.
    if (str[i] === '\\' && ESCAPE_CHARS.includes(str[i + 1] ?? '')) {
      buf += str[i + 1];
      i += 2;
      continue;
    }

    // Inline opaque atom fence.
    if (str[i] === '{') {
      const decoded = decodeInlineOpaque(str.slice(i));
      if (decoded) {
        flush();
        nodes.push(decoded.node);
        i += decoded.matched.length;
        continue;
      }
    }

    // Link — special-cased (bracket+paren shape, not a symmetric delimiter).
    // The label is recursively parsed so a bold/italic/etc. link label
    // round-trips instead of collapsing to a bare link-marked run. Both the
    // label and href spans are found via `findUnescaped` rather than a
    // `[^\]]*`/`[^)]*` regex, so an escaped `\]` inside the label or `\)`
    // inside the href doesn't prematurely close the span.
    if (str[i] === '[') {
      const labelEnd = findUnescaped(str, i + 1, ']');
      if (labelEnd !== -1 && str[labelEnd + 1] === '(') {
        const hrefEnd = findUnescaped(str, labelEnd + 2, ')');
        if (hrefEnd !== -1) {
          flush();
          const rawLabel = str.slice(i + 1, labelEnd);
          const rawHref = str.slice(labelEnd + 2, hrefEnd).replace(/\\\)/g, ')');
          nodes.push(...withMark(parseInline(rawLabel), buildMark('link', '[', [rawHref])));
          i = hrefEnd + 1;
          continue;
        }
      }
    }

    // Star family (bold `**` / italic `*`): the two tokens share a delimiter
    // character, so a combined `***text***` open run must be disambiguated
    // by run-length rather than by the generic longest-open-token-first loop
    // below (that loop would always match `**` first and leave a stray `*`
    // behind, silently dropping the italic mark on bold+italic text).
    if (str[i] === '*') {
      const openRun = countRun(str, i, '*');
      const candidates = openRun >= 3 ? [3, 2, 1] : openRun === 2 ? [2, 1] : [1];
      let starHandled = false;
      for (const n of candidates) {
        const closeToken = '*'.repeat(n);
        const start = i + n;
        const closeIdx = str.indexOf(closeToken, start);
        if (closeIdx === -1 || closeIdx === start) continue; // no close, or empty span
        flush();
        const inner = str.slice(start, closeIdx);
        let innerNodes = parseInline(inner);
        if (n === 3) {
          // Combined open run: bold is innermost (marks[0]) then italic
          // outermost, matching applyMarks' marks=[bold, italic] convention.
          innerNodes = withMark(withMark(innerNodes, buildMark('bold', '**', [])), buildMark('italic', '*', []));
        } else if (n === 2) {
          innerNodes = withMark(innerNodes, buildMark('bold', '**', []));
        } else {
          innerNodes = withMark(innerNodes, buildMark('italic', '*', []));
        }
        nodes.push(...innerNodes);
        i = closeIdx + n;
        starHandled = true;
        break;
      }
      if (starHandled) continue;
    }

    // Generic symmetric-delimiter marks (everything but bold/italic, handled
    // above, and link, handled above), longest-token-first. Recurses into
    // the matched span so a nested mark inside this one — e.g. `**~~text~~**`
    // (bold wrapping strike) — round-trips both marks instead of only the
    // outer one.
    let matched = false;
    for (const { type, entry } of markLexOrder()) {
      if (type === 'bold' || type === 'italic') continue; // handled above
      if (entry.openToken === '[') continue; // link handled above
      if (!str.startsWith(entry.openToken, i)) continue;
      const start = i + entry.openToken.length;
      const closeIdx = str.indexOf(entry.closeToken, start);
      if (closeIdx === -1 || closeIdx === start) continue; // no close, or empty span
      flush();
      const inner = str.slice(start, closeIdx);
      nodes.push(...withMark(parseInline(inner), buildMark(type, entry.openToken, [])));
      i = closeIdx + entry.closeToken.length;
      matched = true;
      break;
    }
    if (matched) continue;

    buf += str[i];
    i += 1;
  }

  flush();
  return nodes;
}

// ---------------------------------------------------------------------------
// Block lexing
// ---------------------------------------------------------------------------

const OPAQUE_FENCE_RE = /^:::dfm-opaque type=(\S+) id=(\S+)\s*$/;
const HEADING_RE = /^(#{1,6})\s(.*)$/;
const BULLET_ITEM_RE = /^-\s(.*)$/;
const ORDERED_ITEM_RE = /^\d+\.\s(.*)$/;

function dedent(line: string): string {
  return line.startsWith('  ') ? line.slice(2) : line.startsWith(' ') ? line.slice(1) : line;
}

function parseBlocks(lines: string[]): PmNode[] {
  const blocks: PmNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    // Opaque reference fence. The forward path (pmToDfm) only ever emits the
    // REFERENCE form (`:::dfm-opaque type=X id=Y` + closing `:::`, 2 lines, no
    // body). Back-compat: a LEGACY block fence may carry a base64 body
    // between the header and the closing `:::`; consume every body line up to
    // and including the closing fence so no stray `:::` paragraph is emitted
    // (mirrors the callout/code-fence scan below). The reference id is the
    // only content the WRITE path needs — reattachOpaqueRefs restores the node
    // from the base doc — so the legacy body is intentionally discarded, never
    // turned into spurious document content.
    const opaqueMatch = OPAQUE_FENCE_RE.exec(line);
    if (opaqueMatch) {
      blocks.push({ type: OPAQUE_REF_TYPE, attrs: { nodeType: opaqueMatch[1], id: opaqueMatch[2] } });
      i += 1; // consume the fence header line
      while (i < lines.length && lines[i].trim() !== ':::') {
        i += 1; // skip any legacy base64-body line(s)
      }
      i += 1; // consume the closing ':::'
      continue;
    }

    // Callout fence.
    if (line.startsWith(':::callout')) {
      const typeMatch = /type=(\S+)/.exec(line);
      const inner: string[] = [];
      i += 1;
      while (i < lines.length && lines[i].trim() !== ':::') {
        inner.push(lines[i]);
        i += 1;
      }
      i += 1; // consume closing ':::'
      blocks.push({
        type: 'callout',
        attrs: { calloutType: typeMatch ? typeMatch[1] : 'info' },
        content: parseBlocks(inner),
      });
      continue;
    }

    // Fenced code block. The fence is a run of 3+ backticks (the forward
    // serializer widens it past the longest backtick run actually present in
    // the content), so the close must match that SAME run length, not a
    // hardcoded literal '```' that an inner ``` content line could
    // prematurely satisfy.
    const fenceOpen = /^(`{3,})(.*)$/.exec(line);
    if (fenceOpen) {
      const fence = fenceOpen[1];
      const lang = fenceOpen[2].trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && lines[i] !== fence) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1; // consume closing fence
      blocks.push({
        type: 'codeBlock',
        attrs: { language: lang },
        content: [{ type: 'text', text: codeLines.join('\n') }],
      });
      continue;
    }

    // Blockquote.
    if (line.startsWith('>')) {
      const inner: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        const stripped = lines[i].slice(1);
        inner.push(stripped.startsWith(' ') ? stripped.slice(1) : stripped);
        i += 1;
      }
      blocks.push({ type: 'blockquote', content: parseBlocks(inner) });
      continue;
    }

    // Heading.
    const headingMatch = HEADING_RE.exec(line);
    if (headingMatch) {
      blocks.push({ type: 'heading', attrs: { level: headingMatch[1].length }, content: parseInline(headingMatch[2]) });
      i += 1;
      continue;
    }

    // Horizontal rule.
    if (line === '---') {
      blocks.push({ type: 'horizontalRule' });
      i += 1;
      continue;
    }

    // Table (leading '|').
    if (line.startsWith('|')) {
      const rowLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        rowLines.push(lines[i]);
        i += 1;
      }
      const toCells = (rowLine: string): PmNode[] => {
        const trimmed = rowLine.replace(/^\|\s?/, '').replace(/\s?\|$/, '');
        return trimmed.split(' | ').map((cell) => ({
          type: 'tableCell',
          content: parseInline(cell.replace(/\\\|/g, '|')),
        }));
      };
      const dataRows = [rowLines[0], ...rowLines.slice(2)]; // skip the '---' separator row
      const tableRows: PmNode[] = dataRows.map((r) => ({ type: 'tableRow', content: toCells(r) }));
      blocks.push({ type: 'table', content: tableRows });
      continue;
    }

    // Ordered list.
    if (ORDERED_ITEM_RE.test(line)) {
      const items: PmNode[] = [];
      while (i < lines.length && ORDERED_ITEM_RE.test(lines[i])) {
        const first = ORDERED_ITEM_RE.exec(lines[i])![1];
        const itemLines = [first];
        i += 1;
        while (i < lines.length && lines[i].startsWith('   ') && !ORDERED_ITEM_RE.test(lines[i]) && !BULLET_ITEM_RE.test(lines[i])) {
          itemLines.push(dedent(dedent(dedent(lines[i]))));
          i += 1;
        }
        items.push({ type: 'listItem', content: parseBlocks(itemLines) });
      }
      blocks.push({ type: 'orderedList', content: items });
      continue;
    }

    // Bullet list.
    if (BULLET_ITEM_RE.test(line)) {
      const items: PmNode[] = [];
      while (i < lines.length && BULLET_ITEM_RE.test(lines[i])) {
        const first = BULLET_ITEM_RE.exec(lines[i])![1];
        const itemLines = [first];
        i += 1;
        while (i < lines.length && lines[i].startsWith('  ') && !BULLET_ITEM_RE.test(lines[i]) && !ORDERED_ITEM_RE.test(lines[i])) {
          itemLines.push(dedent(lines[i]));
          i += 1;
        }
        items.push({ type: 'listItem', content: parseBlocks(itemLines) });
      }
      blocks.push({ type: 'bulletList', content: items });
      continue;
    }

    // Paragraph: consume until a blank line or a new block marker.
    const paraLines: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !OPAQUE_FENCE_RE.test(lines[i]) &&
      !lines[i].startsWith(':::') &&
      !lines[i].startsWith('```') &&
      !lines[i].startsWith('>') &&
      !HEADING_RE.test(lines[i]) &&
      lines[i] !== '---' &&
      !lines[i].startsWith('|') &&
      !BULLET_ITEM_RE.test(lines[i]) &&
      !ORDERED_ITEM_RE.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i += 1;
    }
    // A paragraph whose entire (single-line) body is exactly the reserved
    // EMPTY_PARAGRAPH_MARKER sentinel is a genuinely empty paragraph, not
    // literal text — restore it as an empty content array rather than a
    // one-character text node.
    const joined = paraLines.join('\n');
    blocks.push({ type: 'paragraph', content: joined === EMPTY_PARAGRAPH_MARKER ? [] : parseInline(joined) });
  }

  return blocks;
}

/**
 * Reverse serialization: DfM text -> ProseMirror JSON `doc` node. Symmetric
 * with `pmToDfm`'s trailing-newline policy: exactly one trailing `\n` is
 * stripped, then blocks are lexed line-wise. Back-compat: legacy inline
 * base64-body opaque fences are still accepted via {@link decodeInlineOpaque}.
 */
export function dfmToJson(dfm: Dfm): PmDoc {
  const lines = dfm.replace(/\n$/, '').split('\n');
  return { type: 'doc', content: parseBlocks(lines) };
}
