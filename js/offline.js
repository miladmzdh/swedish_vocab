// "Download for offline": finds a native-speaker recording for every word in the course with a
// few batched Wikimedia requests, then saves the audio files in Cache Storage so 🎙️ works on a plane.
import { WORDS } from './data.js';
import {
  AUDIO_CACHE,
  LL,
  readCache,
  writeCache,
  getJson,
  playableUrls,
  fileTitle,
  creditFor,
  markDownloaded,
  isDownloaded,
  downloadedCount,
  clearDownloaded,
} from './audio.js';

const META_KEY = 'svenskaquest.offline';
const API = '/w/api.php?format=json&formatversion=2&origin=*&action=query';
const WIKT = {
  en: `https://en.wiktionary.org${API}&prop=images&imlimit=max`,
  sv: `https://sv.wiktionary.org${API}&prop=images&imlimit=max`,
};
const COMMONS = `https://commons.wikimedia.org${API}`;
const BATCH = 50;

export function offlineMeta() {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || 'null') || {};
  } catch {
    return {};
  }
}
function saveMeta(m) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {}
}

/** Single-word headwords: the only ones that can have a recording. */
export const recordableWords = () => [...new Set(WORDS.map((w) => w.sv).filter((sv) => !/\s/.test(sv)))];

const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const norm = (s) => s.toLowerCase().replace(/_/g, ' ');

/** The word a Swedish recording's file name says it is: "Sv-hund.ogg" → hund, "LL-Q9027 (swe)-Anna-hund.wav" → hund. */
export function wordOfFile(name) {
  const ll = name.match(LL);
  if (ll) return norm(ll[2]);
  const sv = name.match(/^Sv-(.+)\.(ogg|oga|mp3|wav|flac|opus)$/i);
  return sv ? norm(sv[1]) : null;
}

async function wiktionaryFiles(base, words, signal, onStep) {
  const found = new Map(); // word -> [file names]
  for (const batch of chunks(words, BATCH)) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    let cont = {};
    for (let guard = 0; guard < 25; guard++) {
      const q = new URLSearchParams({ titles: batch.join('|'), ...cont });
      const j = await getJson(`${base}&${q}`, 15000);
      const back = new Map((j?.query?.normalized || []).map((n) => [n.to, n.from]));
      for (const page of j?.query?.pages || []) {
        const word = back.get(page.title) || page.title;
        for (const im of page.images || []) {
          const name = String(im.title || '').replace(/^[^:]+:/, '');
          if (wordOfFile(name) === norm(word)) found.set(word, [...(found.get(word) || []), name]);
        }
      }
      if (!j?.continue) break;
      cont = j.continue;
    }
    onStep();
  }
  return found;
}

async function linguaLibreFiles(words, signal, onCount) {
  const wanted = new Set(words.map(norm));
  const found = new Map(); // normalised word -> [file names]
  let cont = {};
  let seen = 0;
  for (let guard = 0; guard < 400; guard++) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    const q = new URLSearchParams({ list: 'allpages', apnamespace: '6', apprefix: 'LL-Q9027 (swe)-', aplimit: 'max', ...cont });
    const j = await getJson(`${COMMONS}&${q}`, 15000);
    for (const p of j?.query?.allpages || []) {
      seen++;
      const name = String(p.title || '').replace(/^[^:]+:/, '');
      const w = wordOfFile(name);
      if (w && wanted.has(w)) found.set(w, [...(found.get(w) || []), name]);
    }
    onCount(seen);
    if (!j?.continue) break;
    cont = j.continue;
  }
  return found;
}

/**
 * Download recordings for every word. onProgress({phase, done, total, bytes, found}).
 * Resumable: words whose recording is already saved are skipped.
 */
export async function downloadAll({ onProgress = () => {}, signal } = {}) {
  signal = signal || new AbortController().signal;
  const meta = offlineMeta();
  const cache = await caches.open(AUDIO_CACHE);
  const lookups = readCache();
  const words = recordableWords();
  const todo = words.filter((w) => !(lookups[w] && lookups[w].u && isDownloaded(lookups[w].u)));
  const report = (o) => onProgress({ done: 0, total: 0, bytes: meta.bytes || 0, ...o });
  if (!todo.length) {
    const summary = { ...meta, done: Date.now(), saved: downloadedCount(), words: words.length, failed: 0 };
    saveMeta(summary);
    return summary;
  }

  // 1. Which recordings exist? (Wiktionary pages in batches of 50, plus every Swedish Lingua Libre file.)
  const totalSteps = Math.ceil(todo.length / BATCH) * 2;
  let steps = 0;
  const step = () => report({ phase: 'Checking Wiktionary', done: ++steps, total: totalSteps });
  report({ phase: 'Checking Wiktionary', done: 0, total: totalSteps });
  const en = await wiktionaryFiles(WIKT.en, todo, signal, step);
  const sv = await wiktionaryFiles(WIKT.sv, todo, signal, step);
  const ll = await linguaLibreFiles(todo, signal, (n) => report({ phase: `Scanning Lingua Libre (${n.toLocaleString()} files)`, done: 0, total: 0 }));

  // 2. Best candidates per word, in the same priority as single lookups: Wiktionary, Sv-<word>.ogg, Lingua Libre.
  const cands = new Map();
  for (const w of todo) {
    const list = [...(en.get(w) || []).map((n) => [n, 'en']), ...(sv.get(w) || []).map((n) => [n, 'sv']), [`Sv-${w}.ogg`, 'guess'], ...(ll.get(norm(w)) || []).slice(0, 2).map((n) => [n, 'll'])];
    const seen = new Set();
    cands.set(w, list.filter(([n]) => !seen.has(fileTitle(n)) && seen.add(fileTitle(n))).slice(0, 4));
  }
  const allNames = [...new Set([...cands.values()].flat().map(([n]) => n))];
  const urls = new Map();
  const groups = chunks(allNames, BATCH);
  for (let i = 0; i < groups.length; i++) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    report({ phase: 'Finding the best recordings', done: i, total: groups.length });
    for (const [t, u] of await playableUrls(groups[i])) urls.set(t, u);
  }

  // 3. Download the chosen file for each word (4 at a time).
  const plan = [];
  for (const w of todo) {
    const best = cands.get(w).find(([n]) => urls.has(fileTitle(n)));
    if (best) {
      const t = fileTitle(best[0]);
      plan.push({ word: w, url: urls.get(t), credit: creditFor(best[0], best[1]), page: `https://commons.wikimedia.org/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}` });
    } else lookups[w] = { u: null, t: Date.now() };
  }
  writeCache();
  let bytes = meta.bytes || 0;
  let done = 0;
  let failed = 0;
  const queue = [...plan];
  const worker = async () => {
    while (queue.length) {
      if (signal.aborted) return;
      const it = queue.shift();
      try {
        const r = await fetch(it.url, { mode: 'cors', signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const blob = await r.blob();
        await cache.put(it.url, new Response(blob, { headers: { 'Content-Type': r.headers.get('Content-Type') || blob.type || 'audio/mpeg' } }));
        markDownloaded(it.url);
        bytes += blob.size;
        lookups[it.word] = { u: it.url, by: it.credit, p: it.page, t: Date.now() };
      } catch (e) {
        if (signal.aborted) return;
        failed++;
      }
      done++;
      if (done % 10 === 0) writeCache();
      report({ phase: 'Downloading recordings', done, total: plan.length, bytes });
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  writeCache();
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  const summary = { done: Date.now(), bytes, saved: downloadedCount(), words: words.length, failed };
  saveMeta(summary);
  return summary;
}

export async function deleteDownloads() {
  try {
    await caches.delete(AUDIO_CACHE);
  } catch {}
  clearDownloaded();
  saveMeta({});
}

/** Is the app itself (code + word list) saved for offline use? */
export async function appCached() {
  try {
    if (typeof caches === 'undefined') return false;
    return !!(await caches.match('data/vocab.json', { ignoreSearch: true }));
  } catch {
    return false;
  }
}
