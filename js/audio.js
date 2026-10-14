// Pronunciation: device text-to-speech (Swedish voice), native-speaker recordings from Wikimedia Commons
// when one exists, and small synthesized sound effects.
import { S } from './store.js';
import { speakText } from './data.js';

// ---------- text to speech ----------

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
let voices = [];
const voiceListeners = new Set();

function refreshVoices() {
  if (!synth) return;
  voices = synth.getVoices().filter((v) => /^sv([-_]|$)/i.test(v.lang));
  voiceListeners.forEach((fn) => fn(voices));
}
if (synth) {
  refreshVoices();
  synth.addEventListener?.('voiceschanged', refreshVoices);
  // Some browsers only populate the list after a delay.
  setTimeout(refreshVoices, 500);
  setTimeout(refreshVoices, 2000);
}

export const ttsSupported = () => !!synth && typeof SpeechSynthesisUtterance !== 'undefined';
export const swedishVoices = () => voices;
export const onVoices = (fn) => (voiceListeners.add(fn), () => voiceListeners.delete(fn));

function chooseVoice() {
  if (!voices.length) return null;
  return (
    voices.find((v) => v.voiceURI === S.settings.voice) ||
    voices.find((v) => /sv[-_]SE/i.test(v.lang) && /alva|klara|oskar|sofie|premium|enhanced|neural|natural/i.test(v.name)) ||
    voices.find((v) => /sv[-_]SE/i.test(v.lang)) ||
    voices[0]
  );
}

export function speak(text, { rate } = {}) {
  return new Promise((resolve) => {
    if (!ttsSupported()) return resolve(false);
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'sv-SE';
      const v = chooseVoice();
      if (v) u.voice = v;
      u.rate = rate ?? S.settings.rate;
      const t = setTimeout(() => resolve(true), 8000);
      u.onend = u.onerror = () => {
        clearTimeout(t);
        resolve(true);
      };
      synth.speak(u);
    } catch {
      resolve(false);
    }
  });
}

export const stopSpeaking = () => {
  try {
    synth && synth.cancel();
  } catch {}
};

// ---------- native recordings (Wiktionary / Lingua Libre on Wikimedia Commons) ----------

// v1 of this cache stored false "no recording" results (a broken Commons request), so it is discarded.
const CACHE_KEY = 'svenskaquest.audio.v2';
try {
  localStorage.removeItem('svenskaquest.audio');
} catch {}
const MISS_TTL = 21 * 86400000;
let cache = null;
const inflight = new Map();

function readCache() {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    cache = {};
  }
  return cache;
}
function writeCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

async function getJson(url, ms = 8000) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = setTimeout(() => ctl && ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl?.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

const API = '/w/api.php?format=json&origin=*';
const WIKT_EN = `https://en.wiktionary.org${API}&action=parse&prop=wikitext&redirects=1&page=`;
const WIKT_SV = `https://sv.wiktionary.org${API}&action=parse&prop=wikitext&redirects=1&page=`;
const COMMONS = `https://commons.wikimedia.org${API}&action=query`;

/** The wikitext of one language section ("==Swedish==" on en.wiktionary, "==Svenska==" on sv.wiktionary). */
export function langSection(wikitext, name) {
  const start = wikitext.search(new RegExp(`^==\\s*${name}\\s*==\\s*$`, 'm'));
  if (start < 0) return '';
  const rest = wikitext.slice(start + 2);
  const end = rest.search(/^==[^=].*==\s*$/m);
  return end < 0 ? rest : rest.slice(0, end);
}
export const swedishSection = (wikitext) => langSection(wikitext, 'Swedish');

const AUDIO_FILE = /^[^<>[\]{}|#\n]+\.(ogg|oga|mp3|wav|flac|opus)$/i;

/** Every audio file name used in a section's templates or file links, whatever the template is called. */
export function audioFilesIn(section) {
  const out = [];
  const consider = (raw) => {
    let v = raw.includes('=') ? raw.slice(raw.indexOf('=') + 1) : raw;
    v = v.trim().replace(/^(File|Fil|Image|Bild|Media):/i, '');
    if (AUDIO_FILE.test(v)) out.push(v);
  };
  for (const m of section.matchAll(/\{\{([^{}]*)\}\}/g)) m[1].split('|').forEach(consider);
  for (const m of section.matchAll(/\[\[([^\][]*)\]\]/g)) consider(m[1].split('|')[0]);
  return [...new Set(out)];
}

const LL = /^LL-Q9027 \(swe\)-(.+?)-(.+)\.(wav|ogg|mp3|flac)$/i;

export function linguaLibreMatches(titles, word) {
  const w = word.toLowerCase();
  const out = [];
  for (const t of titles) {
    const name = t.replace(/^File:/, '');
    const m = name.match(LL);
    if (m && m[2].toLowerCase() === w) out.push(name);
  }
  return out;
}
export const linguaLibreMatch = (titles, word) => {
  const name = linguaLibreMatches(titles, word)[0];
  return name ? { file: name, speaker: name.match(LL)[1] } : null;
};

const canOgg = () => {
  try {
    return !!new Audio().canPlayType('audio/ogg; codecs="vorbis"');
  } catch {
    return false;
  }
};

function creditFor(name, source) {
  const m = name.match(LL);
  if (m) return `Lingua Libre speaker ${m[1]} (CC BY-SA)`;
  return source === 'sv' ? 'Swedish Wiktionary / Wikimedia Commons' : source === 'en' ? 'Wiktionary / Wikimedia Commons' : 'Wikimedia Commons';
}

const fileTitle = (name) => 'File:' + name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' ');

/** Look up many Commons files in one request; returns Map(title -> playable URL) for the ones this device can play. */
async function playableUrls(names) {
  const out = new Map();
  if (!names.length) return out;
  const titles = names.map(fileTitle);
  const j = await getJson(`${COMMONS}&prop=videoinfo|imageinfo&viprop=url|derivatives&iiprop=url&titles=${encodeURIComponent(titles.join('|'))}`);
  const ogg = canOgg();
  for (const page of Object.values(j?.query?.pages || {})) {
    if (!page || page.missing !== undefined || !page.title) continue;
    const vi = page.videoinfo?.[0];
    const original = vi?.url || page.imageinfo?.[0]?.url;
    let url = null;
    if (/\.(ogg|oga|opus)$/i.test(page.title) && !ogg) {
      const mp3 = (vi?.derivatives || []).find((d) => /mpeg|mp3/i.test(d.type || '') || /\.mp3$/i.test(d.src || ''));
      url = mp3?.src || null;
    } else url = original || null;
    if (url) out.set(page.title, url);
  }
  return out;
}

export let lastNativeError = null;
/** Details of the most recent lookup, shown by the Settings check. */
export let lastNativeLookup = null;

/** 'found' | 'none' (Wikimedia has no recording) | 'unknown' (not looked up yet, or the lookup failed). */
export function nativeStatus(word) {
  const hit = readCache()[word];
  if (!hit) return 'unknown';
  if (hit.u) return 'found';
  return Date.now() - hit.t < MISS_TTL ? 'none' : 'unknown';
}

/**
 * Find a native recording for a single Swedish word. Resolves to {url, credit, page} or null.
 * Sources (asked in parallel): English Wiktionary, Swedish Wiktionary, the conventional "Sv-<word>.ogg"
 * file, and Lingua Libre. A miss is only remembered when every source answered, so being offline or a
 * flaky source never hides recordings.
 */
export function findNative(word, { force = false } = {}) {
  if (!word || /\s/.test(word) || typeof fetch === 'undefined') return Promise.resolve(null);
  const c = readCache();
  const hit = c[word];
  if (!force && hit && (hit.u || Date.now() - hit.t < MISS_TTL)) return Promise.resolve(hit.u ? { url: hit.u, credit: hit.by, page: hit.p } : null);
  if (inflight.has(word)) return inflight.get(word);
  const p = (async () => {
    const log = { word, sources: {}, candidates: 0, found: null };
    let failed = false;
    lastNativeError = null;
    const fromWikt = async (base, section, key) => {
      try {
        const j = await getJson(base + encodeURIComponent(word));
        const files = j && j.parse ? audioFilesIn(langSection(j.parse.wikitext?.['*'] || '', section)) : [];
        log.sources[key] = `ok, ${files.length} file${files.length === 1 ? '' : 's'}`;
        return files.map((f) => ({ name: f, src: key }));
      } catch (e) {
        failed = true;
        lastNativeError = e;
        log.sources[key] = `error: ${e.message || e.name}`;
        return [];
      }
    };
    const fromLinguaLibre = async () => {
      try {
        const q = `intitle:"LL-Q9027 (swe)" intitle:"${word}"`;
        const j = await getJson(`${COMMONS}&list=search&srnamespace=6&srlimit=50&srsearch=${encodeURIComponent(q)}`);
        const files = linguaLibreMatches((j?.query?.search || []).map((r) => r.title), word).slice(0, 3);
        log.sources.ll = `ok, ${files.length} file${files.length === 1 ? '' : 's'}`;
        return files.map((f) => ({ name: f, src: 'll' }));
      } catch (e) {
        failed = true;
        lastNativeError = e;
        log.sources.ll = `error: ${e.message || e.name}`;
        return [];
      }
    };
    const lists = await Promise.all([fromWikt(WIKT_EN, 'Swedish', 'en'), fromWikt(WIKT_SV, 'Svenska', 'sv'), fromLinguaLibre()]);
    const cands = [];
    const seen = new Set();
    for (const it of [...lists[0], ...lists[1], { name: `Sv-${word}.ogg`, src: 'guess' }, ...lists[2]]) {
      const t = fileTitle(it.name);
      if (!seen.has(t)) {
        seen.add(t);
        cands.push({ ...it, title: t });
      }
    }
    log.candidates = cands.length;
    let found = null;
    try {
      const urls = await playableUrls(cands.slice(0, 40).map((x) => x.name));
      log.sources.commons = `ok, ${urls.size} playable`;
      const best = cands.find((x) => urls.has(x.title));
      if (best) {
        found = { url: urls.get(best.title), credit: creditFor(best.name, best.src), page: `https://commons.wikimedia.org/wiki/${encodeURIComponent(best.title.replace(/ /g, '_'))}` };
        log.found = best.title;
      }
    } catch (e) {
      failed = true;
      lastNativeError = e;
      log.sources.commons = `error: ${e.message || e.name}`;
    }
    lastNativeLookup = log;
    if (found) c[word] = { u: found.url, by: found.credit, p: found.page, t: Date.now() };
    else if (!failed) c[word] = { u: null, t: Date.now() };
    writeCache();
    inflight.delete(word);
    return found;
  })();
  inflight.set(word, p);
  return p;
}

let current = null;
export function playUrl(url, { rate = 1 } = {}) {
  return new Promise((resolve) => {
    try {
      current && current.pause();
      const a = new Audio(url);
      current = a;
      // Slow playback keeps the speaker's pitch (time-stretching) instead of sounding deeper.
      a.preservesPitch = a.webkitPreservesPitch = a.mozPreservesPitch = true;
      a.playbackRate = rate;
      a.onended = () => resolve(true);
      a.onerror = () => resolve(false);
      a.play().catch(() => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

export function cachedNative(word) {
  const c = readCache()[word];
  return c && c.u ? { url: c.u, credit: c.by, page: c.p } : null;
}

/** Play the native-speaker recording at its original speed (resolves false if there is none). */
export async function playNative(w) {
  const n = cachedNative(w.sv) || (S.settings.native ? await findNative(w.sv) : null);
  return n ? playUrl(n.url) : false;
}

// Slow mode is half the learner's normal speed. On iPhone the browser maps speech rates below 1
// linearly onto the system voice, so halving gives a clearly slower, still natural voice.
export const slowRate = () => Math.max(0.3, S.settings.rate * 0.5);

/** Say a vocabulary entry: a native recording when enabled and already found, otherwise TTS (nouns with their article). */
export async function sayWord(w, { rate, native = true, slow = false } = {}) {
  if (native && S.settings.native) {
    const n = cachedNative(w.sv);
    if (n && (await playUrl(n.url, { rate: slow ? 0.6 : 1 }))) return 'native';
  }
  await speak(speakText(w), { rate: slow ? slowRate() : rate });
  return 'tts';
}

// ---------- sound effects ----------

let ctx = null;
function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// Call from a user gesture early on so iOS lets us play sounds later.
export function unlockAudio() {
  const c = ac();
  if (!c) return;
  const b = c.createBuffer(1, 1, 22050);
  const s = c.createBufferSource();
  s.buffer = b;
  s.connect(c.destination);
  s.start(0);
}

function tone(freq, start, dur, type = 'sine', vol = 0.15) {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime + start);
  g.gain.setValueAtTime(0.0001, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(vol, c.currentTime + start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + dur + 0.05);
}

const SFX = {
  correct: () => (tone(660, 0, 0.12, 'sine'), tone(990, 0.09, 0.2, 'sine')),
  wrong: () => (tone(220, 0, 0.18, 'square', 0.06), tone(180, 0.12, 0.25, 'square', 0.06)),
  tap: () => tone(520, 0, 0.05, 'triangle', 0.08),
  combo: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.06, 0.14, 'triangle', 0.1)),
  hit: () => (tone(140, 0, 0.12, 'sawtooth', 0.08), tone(90, 0.05, 0.2, 'sawtooth', 0.06)),
  win: () => [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.22, 'triangle', 0.12)),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, i * 0.16, 0.3, 'sine', 0.1)),
  tick: () => tone(1200, 0, 0.03, 'square', 0.03),
  coin: () => (tone(988, 0, 0.08, 'square', 0.05), tone(1319, 0.07, 0.2, 'square', 0.05)),
};

export function sfx(name) {
  if (!S.settings.sfx) return;
  try {
    SFX[name] && SFX[name]();
  } catch {}
}

export function buzz(pattern) {
  if (!S.settings.haptics) return;
  try {
    navigator.vibrate && navigator.vibrate(pattern);
  } catch {}
}

// ---------- speech recognition (pronunciation practice) ----------

const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
export const speechRecognitionSupported = () => !!SR;

/** Listen once in Swedish. Resolves to an array of transcripts (possibly empty), or rejects with an error code. */
export function listenOnce(ms = 6000) {
  return new Promise((resolve, reject) => {
    if (!SR) return reject(new Error('unsupported'));
    const r = new SR();
    r.lang = 'sv-SE';
    r.interimResults = false;
    r.maxAlternatives = 5;
    let done = false;
    const finish = (fn) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      try {
        r.stop();
      } catch {}
      fn();
    };
    const t = setTimeout(() => finish(() => resolve([])), ms);
    r.onresult = (e) => {
      const out = [];
      for (const res of e.results) for (const alt of res) out.push(alt.transcript);
      finish(() => resolve(out));
    };
    r.onerror = (e) => finish(() => (e.error === 'no-speech' ? resolve([]) : reject(new Error(e.error || 'error'))));
    r.onend = () => finish(() => resolve([]));
    try {
      r.start();
    } catch (e) {
      finish(() => reject(e));
    }
  });
}
