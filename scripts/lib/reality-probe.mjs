// Pre-claim reality probe — pure premise parsing and verdict logic (ENG-2817).
//
// Exported functions are the tested surface. Repository access lives only in
// scripts/reality-probe.mjs, so these rules can be tested with injected
// evidence and never need a checkout or a network connection.

const PREMISE_PREFIX = /^\s*(?:>\s*)?(?:\|\s*)?(?:\*\*)?Existing code\b/i;
const CLAIM_WORDS = /\b(absent|missing|does not exist|not present|stub|stubbed)\b/i;

function unquote(value) {
  return value
    .trim()
    .replace(/^['"`]+|['"`,.);:]+$/g, '')
    .trim();
}

function isPath(value) {
  return /(?:^|[/\\])[\w.@+-]+\.[a-z0-9]+$/i.test(value) || value.includes('/');
}

function extractDescriptor(line) {
  const ticks = [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim());
  let path;
  let symbol;

  if (ticks.length > 0 && isPath(ticks[0])) {
    path = unquote(ticks[0]);
    symbol = ticks[1];
  }

  if (!path) {
    const plain = line.match(/(?:^|[|:\s])((?:[\w.@+-]+[\\/])+[\w.@+-]+\.[a-z0-9]+)(?:\s*\(\s*([^)]*)\))?/i);
    if (plain) {
      path = unquote(plain[1]);
      symbol = symbol || plain[2];
    }
  }

  if (!symbol) {
    const pathOffset = path ? line.indexOf(path) + path.length : 0;
    const parenthesized = line.slice(pathOffset).match(/\(\s*`?([A-Za-z_$][\w$.:/-]*)`?\s*\)/);
    symbol = parenthesized?.[1];
  }

  if (!path || !symbol) return null;
  return { path, symbol: unquote(symbol) };
}

function claimKind(line) {
  if (/\bstub(?:bed)?\b/i.test(line)) return 'stub';
  if (/\b(?:absent|missing|does not exist|not present)\b/i.test(line)) return 'absent';
  return 'present';
}

function hasOnlyPrefix(line) {
  return PREMISE_PREFIX.test(line) && !line.replace(PREMISE_PREFIX, '').replace(/[:|*\s]/g, '');
}

/**
 * Parse Existing-code premise lines from an issue body.
 *
 * The corpus uses both prose and table rows, with qualifiers such as HEAD,
 * repo, verified live, carried, and typed model. The qualifier is deliberately
 * ignored: the `Existing code` prefix is the stable grammar boundary.
 * Unrecognised non-empty prefix lines are retained as unparseable premises so
 * a new format cannot silently become a zero-premise dispatch.
 */
export function parsePremises(body) {
  const lines = String(body ?? '').split(/\r?\n/);
  const premises = [];
  let pendingPrefix = null;

  for (const line of lines) {
    const isPrefix = PREMISE_PREFIX.test(line);
    const descriptor = extractDescriptor(line);
    const hasClaim = CLAIM_WORDS.test(line);

    if (isPrefix && descriptor) {
      premises.push({ kind: claimKind(line), ...descriptor, raw: line.trim() });
      pendingPrefix = null;
      continue;
    }

    // A common prose shape is a header followed by a markdown bullet. Keep the
    // header as context and parse the first following absent/stub/present row.
    if (isPrefix && !descriptor) {
      const remainder = line.replace(PREMISE_PREFIX, '').replace(/^\s*[:|]\s*/, '').trim();
      pendingPrefix = { raw: line.trim(), hasText: Boolean(remainder) };
      if (remainder && !hasOnlyPrefix(line)) {
        // A path without a symbol, or an entirely new shape, is not safe to
        // interpret. It is reported below unless a continuation supplies it.
        pendingPrefix.unparseable = true;
      }
      continue;
    }

    if (pendingPrefix && (descriptor || hasClaim)) {
      if (descriptor) {
        premises.push({ kind: claimKind(line), ...descriptor, raw: line.trim() });
        pendingPrefix = null;
        continue;
      }
      // A continuation with a claim but no path is still an unparseable
      // Existing-code premise; do not discard it.
      premises.push({ kind: 'unparseable', raw: `${pendingPrefix.raw} ${line.trim()}` });
      pendingPrefix = null;
      continue;
    }

    if (!isPrefix && hasClaim && descriptor) {
      premises.push({ kind: claimKind(line), ...descriptor, raw: line.trim() });
    }
  }

  if (pendingPrefix?.unparseable) {
    premises.push({ kind: 'unparseable', raw: pendingPrefix.raw });
  }

  const seen = new Set();
  return premises.filter((premise) => {
    const key = JSON.stringify([premise.kind, premise.path, premise.symbol, premise.raw]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isKnownBoolean(value) {
  return value === true || value === false;
}

function evidenceState(evidence) {
  if (!evidence || !isKnownBoolean(evidence.exists)) return 'indeterminate';
  if (!isKnownBoolean(evidence.defined)) return 'indeterminate';
  if (!Array.isArray(evidence.referencedBy)) return 'indeterminate';
  if (evidence.exists && evidence.defined && evidence.referencedBy.length > 0) return 'wired';
  return 'not-wired';
}

/**
 * Classify a premise against injected repository evidence.
 *
 * Present/stub claims require a wired symbol. Absent/stub claims are only
 * contradicted by a wired symbol; a merely present, unreferenced definition is
 * not enough to bounce a story. A missing evidence field is unknown and must
 * fail closed at the verdict layer.
 */
export function classifyPremise(premise, evidence) {
  if (!premise || !['present', 'absent', 'stub'].includes(premise.kind)) return 'indeterminate';
  const state = evidenceState(evidence);
  if (state === 'indeterminate') return 'indeterminate';

  if (premise.kind === 'absent' || premise.kind === 'stub') {
    return state === 'wired' ? 'mismatch' : 'match';
  }

  if (state === 'wired') return 'match';
  // A present-but-unwired claim can only be rebaselined safely when the
  // injected evidence identifies the definition location. Without a
  // file:line, fail closed rather than emitting an unverifiable mismatch.
  if (evidence.definition || (Array.isArray(evidence.definedAt) && evidence.definedAt.length > 0)) {
    return 'mismatch';
  }
  return 'indeterminate';
}

function evidenceLocations(evidence) {
  const locations = [];
  if (evidence?.definition) locations.push(evidence.definition);
  if (Array.isArray(evidence?.definedAt)) locations.push(...evidence.definedAt);
  if (Array.isArray(evidence?.referencedBy)) locations.push(...evidence.referencedBy);
  return [...new Set(locations.filter((location) => /:[0-9]+$/.test(location)))];
}

/**
 * Produce the only three dispositions the dispatcher understands.
 * Any indeterminate result, including an unparseable premise, escalates.
 */
export function verdict(results) {
  const list = Array.isArray(results) ? results : [];
  const indeterminate = list.filter((result) => result?.classification === 'indeterminate' || result?.premise?.kind === 'unparseable');
  if (indeterminate.length > 0) {
    return {
      disposition: 'escalate',
      comment: 'ESCALATE: pre-claim reality probe was indeterminate; no build was dispatched. Investigate the repository or Existing code premise format and re-run the probe.',
    };
  }

  const mismatches = list.filter((result) => result?.classification === 'mismatch');
  if (mismatches.length > 0) {
    const details = mismatches.map((result) => {
      const premise = result.premise || {};
      const locations = evidenceLocations(result.evidence);
      const where = locations.length > 0 ? ` (${locations.join(', ')})` : ' (location unavailable)';
      return `${premise.kind} premise for ${premise.path || '<unknown>'}${premise.symbol ? ` (${premise.symbol})` : ''} is stale${where}`;
    });
    return {
      disposition: 'rebaseline',
      comment: `REBASELINE: pre-claim Existing code premise mismatch; ${details.join('; ')}. Story remains unclaimed and must be re-grounded before dispatch.`,
    };
  }

  return {
    disposition: 'dispatch',
    comment: 'DISPATCH: pre-claim Existing code premises match wired repository evidence at HEAD.',
  };
}
