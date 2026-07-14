import { marked } from "marked";
import { calloutExtension } from "./callout.marked";
import { mathBlockExtension } from "./math-block.marked";
import { mathInlineExtension } from "./math-inline.marked";

marked.use({
  renderer: {
    list({ ordered, start, items }) {
      let body = "";
      for (const item of items) {
        body += this.listitem(item);
      }

      if (ordered) {
        const startAttr = start !== 1 ? ` start="${start}"` : "";
        return `<ol${startAttr}>\n${body}</ol>\n`;
      }

      const isTaskList = items.some((item) => item.task);
      const dataType = isTaskList ? ' data-type="taskList"' : "";
      return `<ul${dataType}>\n${body}</ul>\n`;
    },
    listitem({ tokens, task: isTask, checked: isChecked }) {
      const text = this.parser.parse(tokens);
      if (!isTask) {
        return `<li>${text}</li>\n`;
      }
      const checkedAttr = isChecked
        ? 'data-checked="true"'
        : 'data-checked="false"';
      return `<li data-type="taskItem" ${checkedAttr}>${text}</li>\n`;
    },
  },
});

marked.use({
  extensions: [calloutExtension, mathBlockExtension, mathInlineExtension],
});

marked.setOptions({ breaks: true });

/**
 * GFM splits a table row into cells on every UN-escaped `|`, and it does so
 * BEFORE any inline (code-span) parsing runs. A literal pipe inside an inline
 * code span — e.g. a cell `` `{user|org}` `` — is therefore treated as a cell
 * boundary: the cell is truncated at the first pipe, the trailing text is
 * dropped, and the now-unterminated backtick is rendered as a literal `` ` ``
 * so the `code` mark is lost too. GFM's own remedy is to author the pipe as
 * `\|`; marked's `splitCells` un-escapes `\|` back to `|` at the cell level,
 * after which the intact cell parses as `<code>{user|org}</code>`.
 *
 * `escapeTablePipesInCodeSpans` performs exactly that authoring normalization
 * automatically: it finds GFM table rows and escapes the un-escaped pipes that
 * fall INSIDE an inline code span, leaving every other pipe (cell delimiters,
 * pipes in prose) and every already-escaped `\|` untouched. Non-table lines
 * and fenced code blocks are never modified, so a normal `` `a|b` `` code span
 * in prose keeps rendering verbatim.
 */
const TABLE_DELIMITER_ROW = /^\s*\|?(?:\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/;
const FENCE_OPEN = /^\s*(```+|~~~+)/;

/** Escape un-escaped `|` that appear inside inline code spans on a single line. */
function escapePipesInCodeSpans(line: string): string {
  let out = "";
  let i = 0;
  const n = line.length;

  while (i < n) {
    const ch = line[i];

    // Preserve an escaped character pair (e.g. `\|`, `` \` ``) verbatim.
    if (ch === "\\" && i + 1 < n) {
      out += line[i] + line[i + 1];
      i += 2;
      continue;
    }

    if (ch === "`") {
      // Opening run of backticks (a code span is delimited by a run of the
      // same length, per CommonMark).
      let run = 0;
      while (i + run < n && line[i + run] === "`") run++;
      const fence = "`".repeat(run);
      const rest = line.slice(i + run);
      const close = new RegExp("(?<!`)`{" + run + "}(?!`)").exec(rest);

      if (close) {
        const inner = rest.slice(0, close.index);
        const escapedInner = inner.replace(/(?<!\\)\|/g, "\\|");
        out += fence + escapedInner + fence;
        i += run + close.index + run;
        continue;
      }

      // No matching closing run — not a code span; emit the backticks as-is.
      out += fence;
      i += run;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

function escapeTablePipesInCodeSpans(markdown: string): string {
  const lines = markdown.split("\n");
  let inFence = false;
  let fenceMarker = "";

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const fenceMatch = FENCE_OPEN.exec(line);

    if (inFence) {
      if (fenceMatch && line.trim().startsWith(fenceMarker)) {
        inFence = false;
      }
      continue;
    }
    if (fenceMatch) {
      inFence = true;
      fenceMarker = fenceMatch[1];
      continue;
    }

    // A GFM table begins with a header row that has a pipe, immediately
    // followed by a delimiter row. Escape code-span pipes in the header and in
    // every contiguous body row until a blank / non-row line ends the table.
    const next = lines[idx + 1];
    if (line.includes("|") && next !== undefined && TABLE_DELIMITER_ROW.test(next)) {
      lines[idx] = escapePipesInCodeSpans(line);
      let j = idx + 2;
      while (j < lines.length && lines[j].trim() !== "" && lines[j].includes("|")) {
        lines[j] = escapePipesInCodeSpans(lines[j]);
        j++;
      }
      idx = j - 1;
    }
  }

  return lines.join("\n");
}

export function markdownToHtml(
  markdownInput: string,
): string | Promise<string> {
  const YAML_FONT_MATTER_REGEX = /^\s*---[\s\S]*?---\s*/;

  const markdown = escapeTablePipesInCodeSpans(
    markdownInput.replace(YAML_FONT_MATTER_REGEX, "").trimStart(),
  );

  return marked.parse(markdown).toString();
}
