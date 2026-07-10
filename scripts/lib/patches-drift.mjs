// patches-drift-ci subsystem — pure domain logic (no I/O beyond the injected
// upstreamResolver). Design: docs/design/patches-drift-ci-design.md (ENG-1649).
//
// Exported functions are the tested surface (CS §4.2: test through the
// exported interface). git/network access lives only in scripts/check-patches.mjs
// (the CLI shell) — never here.

const WINDOW = 5;

/** Normalize a line for whitespace-insensitive comparison (trim + collapse
 * internal whitespace runs to a single space). */
function normalize(line) {
  return line.trim().replace(/\s+/g, ' ');
}

function blockMatchesAt(upstreamLines, contextBlock, offset, { exact }) {
  if (offset < 0 || offset + contextBlock.length > upstreamLines.length) {
    return false;
  }
  for (let i = 0; i < contextBlock.length; i += 1) {
    const upstreamLine = upstreamLines[offset + i];
    const wantLine = contextBlock[i];
    if (exact) {
      if (upstreamLine !== wantLine) return false;
    } else if (normalize(upstreamLine) !== normalize(wantLine)) {
      return false;
    }
  }
  return true;
}

/**
 * matchContext — does `contextBlock` still appear in `upstreamLines`, at or
 * near `recordedOffset`?
 *
 * Returns { status: 'exact' | 'fuzzy' | 'drifted', offset?: number }.
 *
 * Rules (design §3):
 *   1. Try an exact match at the recorded offset first (cheap path).
 *   2. Else search a +/-5-line window around the recorded offset, ignoring
 *      whitespace-only differences ("fuzzy").
 *   3. Tie-break: smallest absolute distance from recordedOffset; ties broken
 *      by the earlier (smaller) offset.
 *   4. No match anywhere in the window -> 'drifted'.
 */
export function matchContext(upstreamLines, contextBlock, recordedOffset) {
  if (!contextBlock || contextBlock.length === 0) {
    return { status: 'drifted' };
  }

  if (blockMatchesAt(upstreamLines, contextBlock, recordedOffset, { exact: true })) {
    return { status: 'exact', offset: recordedOffset };
  }

  const candidates = [];
  for (let delta = -WINDOW; delta <= WINDOW; delta += 1) {
    const offset = recordedOffset + delta;
    if (blockMatchesAt(upstreamLines, contextBlock, offset, { exact: false })) {
      candidates.push({ offset, distance: Math.abs(delta) });
    }
  }

  if (candidates.length === 0) {
    return { status: 'drifted' };
  }

  candidates.sort((a, b) => a.distance - b.distance || a.offset - b.offset);
  return { status: 'fuzzy', offset: candidates[0].offset };
}

/**
 * matchEntry — does a single patch/inline-edit entry still anchor cleanly in
 * upstream? Returns { status: 'exact'|'fuzzy'|'drifted' }.
 *
 * The before- and after-context are anchored **separately**, exactly how
 * `patch`/`git apply` locate a hunk: the change region (the hunk's removed
 * lines for a patch, or the edited span for an inline anchor) sits *between*
 * the two context blocks in upstream, so they are NOT contiguous there. Only a
 * pure-insertion hunk has adjacent before/after. Fusing them into one
 * contiguous block (the pre-fix behaviour) reported every modification/deletion
 * hunk as drifted even when the patch still applied cleanly (ENG-1649 F1).
 *
 * `entry.changeSpan` = the number of upstream lines between the before- and
 * after-context (a patch hunk's removed-line count; 0 for a pure insertion).
 * It positions the after-anchor's expected offset precisely so exact matches
 * stay exact; the ±5 fuzzy window still absorbs upstream drift on top of it.
 * Absent (inline anchors that don't record it) it defaults to 0 and the fuzzy
 * window absorbs a small edited span.
 */
export function matchEntry(upstreamLines, entry) {
  const before = entry.contextBefore || [];
  const after = entry.contextAfter || [];
  const baseOffset = entry.offset ?? 0;
  const changeSpan = entry.changeSpan ?? 0;

  if (before.length === 0 && after.length === 0) {
    return { status: 'drifted' }; // no context to anchor against
  }

  let worst = 'exact';
  let beforeOffset = baseOffset;

  if (before.length > 0) {
    const b = matchContext(upstreamLines, before, baseOffset);
    if (b.status === 'drifted') return { status: 'drifted' };
    beforeOffset = b.offset;
    if (b.status === 'fuzzy') worst = 'fuzzy';
  }

  if (after.length > 0) {
    // after-context sits past the before-context + the change region
    const expected = beforeOffset + before.length + changeSpan;
    const a = matchContext(upstreamLines, after, expected);
    if (a.status === 'drifted') return { status: 'drifted' };
    if (a.status === 'fuzzy') worst = 'fuzzy';
  }

  return { status: worst };
}

/**
 * checkDrift — orchestrates matchEntry across every allow-listed/patch
 * entry, resolving each entry's upstream file text via the injected
 * `upstreamResolver(path) -> string | null` (null == fetch failed -> infra
 * error, never conflated with a real drift finding; design §2/§7).
 */
export function checkDrift(entries, upstreamResolver) {
  const drifted = [];
  let infraError = false;

  for (const entry of entries) {
    const upstreamText = upstreamResolver(entry.path);
    if (upstreamText === null || upstreamText === undefined) {
      infraError = true;
      continue;
    }
    const upstreamLines = upstreamText.split('\n');
    const result = matchEntry(upstreamLines, entry);
    if (result.status === 'drifted') {
      drifted.push({
        path: entry.path,
        source: entry.source,
        reason: entry.reason,
      });
    }
  }

  return {
    drifted,
    undeclared: [],
    problemCount: drifted.length,
    infraError,
  };
}

/**
 * selectUndeclared — AC7 predicate (pure): of the paths that differ from their
 * pinned-upstream content (`changedPaths`), which are NOT in the frozen
 * allow-list set (`allowlistPaths`)? Those are undeclared inline edits to
 * upstream files. Extracted from the CLI's `findUndeclaredEdits` so the
 * enforcement rule is unit-testable without a real git diff (ENG-1649 F2).
 */
export function selectUndeclared(changedPaths, allowlistPaths) {
  const allowed = allowlistPaths instanceof Set ? allowlistPaths : new Set(allowlistPaths);
  return changedPaths.filter((p) => !allowed.has(p));
}

/** formatReport — the CI remediation-report shape (design §5). Never
 * fabricates content: only the exact path/reason strings carried on the
 * report are printed. */
export function formatReport(report) {
  const problems = report.problemCount + report.undeclared.length;
  if (problems === 0 && !report.infraError) {
    return `OK: patches-drift check — 0 drifted, 0 undeclared.`;
  }

  const lines = ['FAIL: patches-drift check', ''];

  if (report.drifted.length > 0) {
    lines.push('Drifted patches/inline edits (context no longer matches upstream):');
    for (const d of report.drifted) {
      lines.push(`  - ${d.path}`);
      if (d.reason) lines.push(`      declared reason: ${d.reason}`);
      lines.push(
        '      remediation: regenerate the patch/anchor against the current pinned SHA,',
      );
      lines.push(
        '        or re-pin PINNED_UPSTREAM_SHA if the fork is intentionally re-basing.',
      );
    }
    lines.push('');
  }

  if (report.undeclared.length > 0) {
    lines.push(
      'Undeclared inline edits to upstream files (not in patches/inline-edit-allowlist.json):',
    );
    for (const u of report.undeclared) {
      lines.push(`  - ${u.path}`);
      lines.push(
        '      remediation: revert the edit, move it to a patches/apps__*.patch,',
      );
      lines.push(
        '        or add a reviewed entry to patches/inline-edit-allowlist.json.',
      );
    }
    lines.push('');
  }

  if (report.infraError) {
    lines.push('INFRA-ERROR: could not resolve one or more upstream files (fetch failure).');
    lines.push('');
  }

  lines.push(`${problems} problem(s) found.`);
  return lines.join('\n');
}
