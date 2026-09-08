// ENG-2818: deterministic citation index for open Linear stories.
const PATH_EXTENSION = /\.(?:ts|tsx|js|mjs|go|py|sh|ya?ml|json)$/i;
const PATH_TOKEN = /^[A-Za-z0-9_.@/-]+$/;
const SLUG_TOKEN = /^[A-Za-z0-9]{10}$/;
const ANCHORED_SLUG = /(?:canon|CS|SE-Arch|slug|Issue-Authoring|cells|URL scheme)\s*(?:[:=/#]\s*)?(?:§\s*\d+(?:\.\d+)?\s*)?([A-Za-z0-9]{10})(?![A-Za-z0-9])/gi;
function cleanPath(value) {
  if (typeof value !== 'string') return null;
  const candidate = value.trim().replace(/^\.\//, '');
  if (!candidate || candidate.includes('://') || candidate.includes('..') || !PATH_TOKEN.test(candidate)) return null;
  if (!PATH_EXTENSION.test(candidate) && !candidate.endsWith('/')) return null;
  return candidate.replace(/^\/+/, '');
}
export function extractPathCites(body = '') {
  const text = String(body); const found = new Set(); const add = (value) => { const clean = cleanPath(value); if (clean) found.add(clean); };
  for (const match of text.matchAll(/`([^`\n]+)`/g)) add(match[1]);
  for (const match of text.matchAll(/Existing code \(HEAD\):([\s\S]*?)(?=\n#{1,6}\s|$)/gi)) {
    for (const token of match[1].matchAll(/[A-Za-z0-9_.@/-]+\.(?:ts|tsx|js|mjs|go|py|sh|ya?ml|json)\b/gi)) add(token[0]);
    for (const token of match[1].matchAll(/[A-Za-z0-9_.@-]+(?:\/[A-Za-z0-9_.@-]+)+\/(?![A-Za-z0-9_.@/-])/g)) add(token[0]);
  }
  return [...found].sort();
}
function rosterValues(roster) { const values = roster instanceof Set ? [...roster] : Array.isArray(roster) ? roster : roster ? [roster] : []; return new Set(values.filter((value) => typeof value === 'string' && SLUG_TOKEN.test(value))); }
export function extractSlugCites(body = '', options = {}) {
  const text = String(body); const roster = rosterValues(options?.slugRoster ?? options?.roster ?? options); const found = new Set();
  for (const match of text.matchAll(ANCHORED_SLUG)) found.add(match[1]);
  if (roster.size) for (const match of text.matchAll(/\b[A-Za-z0-9]{10}\b/g)) if (roster.has(match[0])) found.add(match[0]);
  return [...found].sort();
}
function open(issue) { const state = String(issue?.state_type ?? issue?.stateType ?? '').toLowerCase(); return state !== 'completed' && state !== 'canceled' && state !== 'cancelled'; }
function add(map, cite, id) { if (!map.has(cite)) map.set(cite, new Set()); map.get(cite).add(id); }
export function buildIndex(corpus = [], options = {}) {
  const byPath = new Map(); const bySlug = new Map(); const citations = new Map();
  for (const issue of corpus) { const id = issue?.identifier ?? issue?.id; if (!id || !open(issue)) continue; const body = issue.description ?? issue.body ?? ''; const paths = extractPathCites(body); const slugs = extractSlugCites(body, options); for (const cite of paths) add(byPath, cite, id); for (const cite of slugs) add(bySlug, cite, id); citations.set(id, { paths, slugs }); }
  return { byPath, bySlug, citations };
}
function prefix(left, right) { const a = left.replace(/\/+$/, ''); const b = right.replace(/\/+$/, ''); return a !== b && (a.startsWith(`${b}/`) || b.startsWith(`${a}/`)); }
export function affectedByPaths(index, paths = []) {
  const matched = new Map(); const advisory = [];
  for (const raw of paths) { const value = String(raw).trim().replace(/^\.\//, ''); const exact = index.byPath.get(value) ?? new Set(); for (const id of exact) matched.set(`${id}\0${value}\0exact`, { id, cite: value, reason: 'exact-path' }); let found = false; for (const [cite, ids] of index.byPath) if (prefix(value, cite)) { found = true; for (const id of ids) matched.set(`${id}\0${cite}\0prefix`, { id, cite, reason: 'directory-prefix' }); } if (!exact.size && !found) advisory.push({ cite: value, reason: 'no-exact-or-directory-prefix-cite' }); }
  return { matched: [...matched.values()].sort((a, b) => a.id.localeCompare(b.id) || a.cite.localeCompare(b.cite) || a.reason.localeCompare(b.reason)), advisory };
}
export function affectedBySlugs(index, slugs = []) { const matched = new Map(); const advisory = []; for (const raw of slugs) { const value = String(raw).trim(); const ids = index.bySlug.get(value) ?? new Set(); for (const id of ids) matched.set(`${id}\0${value}`, { id, cite: value, reason: 'slug-cite' }); if (!ids.size) advisory.push({ cite: value, reason: 'no-slug-cite' }); } return { matched: [...matched.values()].sort((a, b) => a.id.localeCompare(b.id) || a.cite.localeCompare(b.cite)), advisory }; }
