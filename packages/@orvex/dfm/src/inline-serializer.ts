import { getMark, markLexOrder } from './registry';
import type { PmMark, PmNode, SerializerCtx } from './types';

/** Characters that could otherwise be misread as DfM mark/fence syntax on the
 * reverse parse. Escaped with a leading backslash. Order matters: `\\` must be
 * escaped FIRST so we don't double-escape the escapes we just inserted for the
 * other characters. `~` covers the `~~strike~~` delimiter (a literal `~~x~~`
 * run must not gain a spurious strike mark on the reverse parse). */
const ESCAPE_CHARS = ['\\', '`', '*', '_', '[', ']', '<', '=', '~', '⁣'];

/**
 * Superset of {@link ESCAPE_CHARS} recognized when STRIPPING a backslash
 * escape on the reverse parse. `-`, `>`, `#`, `.`, `|` are never
 * blanket-escaped forward by {@link escapeMarkdown} (that would mangle
 * ordinary prose — hyphens, quotes, headings, sentence-final periods
 * everywhere) but ARE produced, positionally, by
 * {@link escapeBlockLeadingMarker} to disarm a paragraph line that would
 * otherwise be misread as a bulletList/orderedList/blockquote/heading/hr/table
 * row by the block lexer. The reverse lexer must still recognize + strip them.
 */
const UNESCAPE_CHARS = [...ESCAPE_CHARS, '-', '>', '#', '.', '|'];

/** Escape delimiter-adjacent plaintext so it survives a round trip literally —
 * never produces a spurious mark on the reverse parse. */
export function escapeMarkdown(text: string): string {
  let out = text;
  for (const ch of ESCAPE_CHARS) {
    out = out.split(ch).join('\\' + ch);
  }
  return out;
}

/** Inverse of {@link escapeMarkdown} — strip a single escaping backslash off
 * any of the escaped characters (plus the {@link UNESCAPE_CHARS} superset
 * produced by {@link escapeBlockLeadingMarker}). Used by the reverse lexer on
 * plain runs. */
export function unescapeMarkdown(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    if (
      text[i] === '\\' &&
      i + 1 < text.length &&
      UNESCAPE_CHARS.includes(text[i + 1])
    ) {
      out += text[i + 1];
      i++;
    } else {
      out += text[i];
    }
  }
  return out;
}

/** Chars recognized (stripped) by the reverse lexer's own escape handling in
 * `dfm-to-json.ts` (`parseInline`) — re-exported so both files share one
 * source of truth instead of drifting duplicate lists. */
export { UNESCAPE_CHARS };

/**
 * Disarm a serialized paragraph line that would otherwise be misread by the
 * block lexer (`parseBlocks` in `dfm-to-json.ts`) as a different block type
 * (round-trip data loss on ordinary prose starting `- `, `> `, `# `, `N. `,
 * a leading `|`, or the exact line `---`). Escaping just the first
 * ambiguity-causing character is enough to fall through to `parseBlocks`'s
 * paragraph branch; `unescapeMarkdown`/`parseInline` then strip it back out
 * via {@link UNESCAPE_CHARS}. Applied per real line (both hardBreak-joined and
 * literal multi-line text), never globally — normal mid-line `-`, `>`, `#`,
 * `.`, `|` are left untouched.
 */
export function escapeBlockLeadingMarker(line: string): string {
  if (line === '---') return '\\' + line;
  if (/^-\s/.test(line)) return '\\' + line;
  if (line.startsWith('>')) return '\\' + line;
  if (line.startsWith('|')) return '\\' + line;
  if (/^#{1,6}\s/.test(line)) return '\\' + line;
  const ordered = /^(\d+)\.\s/.exec(line);
  if (ordered) {
    const digits = ordered[1];
    return digits + '\\.' + line.slice(digits.length + 1);
  }
  return line;
}

/** Apply {@link escapeBlockLeadingMarker} to every real line of an already
 * inline-escaped paragraph string. */
export function escapeBlockLeadingMarkers(text: string): string {
  return text.split('\n').map(escapeBlockLeadingMarker).join('\n');
}

/**
 * Sentinel emitted for a paragraph with zero inline content (a genuinely
 * empty paragraph would otherwise serialize to the empty string, which is
 * indistinguishable from the `\n\n` block separator and gets silently
 * absorbed by the reverse block lexer's blank-line skip). U+2063 (INVISIBLE
 * SEPARATOR) is not otherwise producible by this serializer since any real
 * occurrence of this exact character in user text is itself escaped by
 * {@link escapeMarkdown} (it is in {@link ESCAPE_CHARS}), so a bare,
 * unescaped occurrence on the wire can only ever mean "this paragraph is
 * empty".
 */
export const EMPTY_PARAGRAPH_MARKER = '⁣';

/** Apply a node's marks (in array order) to its already-escaped text. */
export function applyMarks(
  escapedText: string,
  marks: readonly PmMark[] | undefined,
): string {
  if (!marks || marks.length === 0) return escapedText;
  let out = escapedText;
  for (const mark of marks) {
    const entry = getMark(mark.type);
    if (!entry) {
      // Unregistered mark type: never silently drop it — fence the whole run
      // as an inline opaque atom carrying the original text + mark set.
      return encodeInlineOpaque({
        type: '__dfm_unregistered_mark_text__',
        attrs: { text: escapedText, marks },
      });
    }
    out = entry.wrapDfm(out, mark);
  }
  return out;
}

/** Base64-encode an unregistered inline atom node as `{dfm:BASE64}` — the
 * reference-form-but-inline fence. Inline atoms are small and self-contained
 * (unlike block opaques, which defer body resolution to the CAS base doc via
 * `reattachOpaqueRefs`), so the whole node round-trips through the fence body
 * directly. */
export function encodeInlineOpaque(node: PmNode): string {
  const payload = Buffer.from(JSON.stringify(node), 'utf8').toString('base64');
  return `{dfm:${payload}}`;
}

const INLINE_OPAQUE_RE = /^\{dfm:([A-Za-z0-9+/=]+)\}/;

/** Decode a `{dfm:BASE64}` token back to its original node. Returns
 * `undefined` if `str` does not start with a well-formed token. */
export function decodeInlineOpaque(
  str: string,
): { node: PmNode; matched: string } | undefined {
  const m = INLINE_OPAQUE_RE.exec(str);
  if (!m) return undefined;
  const json = Buffer.from(m[1], 'base64').toString('utf8');
  return { node: JSON.parse(json) as PmNode, matched: m[0] };
}

/** Forward: serialize an inline run (text/hardBreak/unregistered-atom nodes,
 * each possibly carrying marks) into a DfM inline string. */
export function serializeInline(
  nodes: readonly PmNode[] | undefined,
  ctx: SerializerCtx,
): string {
  if (!nodes || nodes.length === 0) return '';
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text') {
      out += applyMarks(escapeMarkdown(node.text ?? ''), node.marks);
    } else if (node.type === 'hardBreak') {
      out += '\\\n';
    } else {
      // Any other inline node with no dedicated block-level handling here is
      // an inline atom — never silently dropped.
      out += encodeInlineOpaque(node);
    }
  }
  return out;
}

/** Re-exported for the reverse lexer (dfm-to-json.ts) so it can walk mark
 * tokens longest-first without reaching into the registry module directly. */
export { markLexOrder };
