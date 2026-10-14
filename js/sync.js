// Backups: download/upload a file, copy/paste a backup code, and optional sync to a private GitHub Gist.
import { S, save, merge, replaceState, dayKey } from './store.js';

const TOKEN_KEY = 'svenskaquest.gist-token';
const GIST_KEY = 'svenskaquest.gist-id';
const FILE = 'svenska-quest-progress.json';

export function snapshot() {
  return JSON.parse(JSON.stringify(S));
}

// ---------- file / code ----------

export function downloadBackup() {
  const blob = new Blob([JSON.stringify(snapshot())], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `svenska-quest-backup-${dayKey()}.json`;
  document.body.append(a);
  a.click();
  setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1000);
  S.lastBackup = Date.now();
  save();
}

function b64decode(b64) {
  const bin = atob(b64.replace(/\s+/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function backupCode() {
  const json = JSON.stringify(snapshot());
  // Chunked to avoid call-stack limits with String.fromCharCode on big inputs.
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return 'SQ1:' + btoa(bin);
}

export function parseBackup(text) {
  text = String(text || '').trim();
  let json = text;
  if (text.startsWith('SQ1:')) json = b64decode(text.slice(4));
  const data = JSON.parse(json);
  if (!data || data.v !== 1 || typeof data.words !== 'object') throw new Error('This does not look like a Svenska Quest backup.');
  return data;
}

/** mode: 'merge' keeps the best of both; 'replace' overwrites this device. */
export function importBackup(data, mode = 'merge') {
  if (mode === 'replace') replaceState(data);
  else replaceState(merge(S, data));
  S.lastBackup = Math.max(S.lastBackup, Date.now());
  save(true);
}

// ---------- GitHub Gist sync ----------

export const gistToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
};
export const gistId = () => {
  try {
    return localStorage.getItem(GIST_KEY) || '';
  } catch {
    return '';
  }
};

// Tokens pasted on phones often pick up spaces, line breaks or invisible characters.
export const cleanToken = (t) => String(t || '').replace(/[\s\u200B-\u200D\u2060\uFEFF]/g, '');

/** A human-readable problem with the token's format, or null if it looks like a GitHub token. */
export function tokenProblem(t) {
  if (!t) return 'Paste your GitHub token first.';
  if (/^(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|[0-9a-f]{40})$/.test(t)) return null;
  return `That doesn't look like a GitHub token (it has ${t.length} characters and starts with “${t.slice(0, 4)}…”). A classic token starts with “ghp_” and is 40 characters long. On GitHub, use the copy button next to the token, then paste it here.`;
}

export function setGist(token, id) {
  try {
    if (token != null) token ? localStorage.setItem(TOKEN_KEY, cleanToken(token)) : localStorage.removeItem(TOKEN_KEY);
    if (id != null) id ? localStorage.setItem(GIST_KEY, id.trim()) : localStorage.removeItem(GIST_KEY);
  } catch {}
}

const headers = (extra) => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${gistToken()}`,
  'X-GitHub-Api-Version': '2022-11-28',
  ...extra,
});

const INVALID =
  'GitHub says this token is not valid: it was mistyped, has expired, or was deleted (GitHub deletes tokens automatically if they are ever posted publicly). Create a new token and paste it with the copy button.';

async function gh(path, opts = {}) {
  const r = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: headers(opts.body ? { 'Content-Type': 'application/json' } : {}),
  });
  if (r.status === 401) throw new Error(INVALID);
  if (r.status === 403)
    throw new Error('This token is not allowed to use gists. Classic token: tick the “gist” scope. Fine-grained token: Account permissions → Gists → Read and write.');
  if (r.status === 404) throw new Error(path.startsWith('/gists/') ? 'Gist not found. It may have been deleted. Clear the Gist ID field and sync again to create a new one.' : 'GitHub could not find that (404). Check the token’s permissions.');
  if (!r.ok) throw new Error(`GitHub error ${r.status}. Try again in a minute.`);
  return r.json();
}

/** Check the token before syncing so the learner gets a precise message. */
export async function verifyToken() {
  const t = gistToken();
  const problem = tokenProblem(t);
  if (problem) throw new Error(problem);
  let r;
  try {
    r = await fetch('https://api.github.com/user', { headers: headers() });
  } catch {
    throw new Error('Could not reach GitHub. Check your internet connection.');
  }
  if (r.status === 401) throw new Error(INVALID);
  if (!r.ok) throw new Error(`GitHub error ${r.status}. Try again in a minute.`);
  // Classic tokens report their scopes; fine-grained tokens don't send this header.
  const scopes = r.headers.get('x-oauth-scopes');
  if (scopes != null && !scopes.split(',').map((x) => x.trim()).includes('gist'))
    throw new Error('The token works, but it is missing the “gist” scope. On GitHub, open the token, tick “gist”, and click Update token.');
  const user = await r.json().catch(() => ({}));
  return user.login || '';
}

async function findExisting() {
  // Look for a gist we created earlier (e.g. on another device) before making a new one.
  const list = await gh('/gists?per_page=100');
  const g = list.find((x) => x.files && x.files[FILE]);
  return g ? g.id : '';
}

/** Pull the gist, merge with local progress, push the result. Returns 'created' | 'synced'. */
export async function syncGist({ verify = false } = {}) {
  if (!gistToken()) throw new Error('Add a GitHub token first.');
  if (verify) await verifyToken();
  let id = gistId() || (await findExisting());
  const body = (state) => JSON.stringify({ files: { [FILE]: { content: JSON.stringify(state) } } });
  if (!id) {
    S.lastSync = Date.now();
    const g = await gh('/gists', {
      method: 'POST',
      body: JSON.stringify({ description: 'Svenska Quest progress (private backup)', public: false, files: { [FILE]: { content: JSON.stringify(snapshot()) } } }),
    });
    setGist(null, g.id);
    save(true);
    return 'created';
  }
  setGist(null, id);
  const g = await gh(`/gists/${id}`);
  const f = g.files && g.files[FILE];
  let remote = null;
  if (f) {
    let content = f.content;
    if (f.truncated && f.raw_url) content = await (await fetch(f.raw_url)).text();
    try {
      remote = parseBackup(content);
    } catch {}
  }
  const merged = remote ? merge(S, remote) : snapshot();
  merged.lastSync = Date.now();
  replaceState(merged);
  await gh(`/gists/${id}`, { method: 'PATCH', body: body(S) });
  return 'synced';
}

let syncing = null;
/** Fire-and-forget sync used after sessions; silent on failure. */
export function autoSync() {
  if (!gistToken() || syncing) return;
  syncing = syncGist()
    .catch(() => {})
    .finally(() => (syncing = null));
}
