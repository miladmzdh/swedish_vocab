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

export function setGist(token, id) {
  try {
    if (token != null) token ? localStorage.setItem(TOKEN_KEY, token.trim()) : localStorage.removeItem(TOKEN_KEY);
    if (id != null) id ? localStorage.setItem(GIST_KEY, id.trim()) : localStorage.removeItem(GIST_KEY);
  } catch {}
}

async function gh(path, opts = {}) {
  const r = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${gistToken()}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (r.status === 401) throw new Error('GitHub rejected the token. Check that it is valid and has the "gist" scope.');
  if (r.status === 404) throw new Error('Gist not found. It may have been deleted. Clear the Gist ID to create a new one.');
  if (!r.ok) throw new Error(`GitHub error ${r.status}`);
  return r.json();
}

async function findExisting() {
  // Look for a gist we created earlier (e.g. on another device) before making a new one.
  const list = await gh('/gists?per_page=100');
  const g = list.find((x) => x.files && x.files[FILE]);
  return g ? g.id : '';
}

/** Pull the gist, merge with local progress, push the result. Returns 'created' | 'synced'. */
export async function syncGist() {
  if (!gistToken()) throw new Error('Add a GitHub token first.');
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
