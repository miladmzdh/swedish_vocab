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

const CACHE_KEY = 'svenskaquest.audio';
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

async function getJson(url, ms = 7000) {
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

const WIKT = 'https://en.wiktionary.org/w/api.php?format=json&origin=*';
const COMMONS = 'https://commons.wikimedia.org/w/api.php?format=json&origin=*';

export function swedishSection(wikitext) {
  const start = wikitext.search(/^==\s*Swedish\s*==\s*$/m);
  if (start < 0) return '';
  const rest = wikitext.slice(start + 2);
  const end = rest.search(/^==[^=].*==\s*$/m);
  return end < 0 ? rest : rest.slice(0, end);
}

export function audioFilesIn(section) {
  const out = [];
  for (const m of section.matchAll(/\{\{\s*audio\s*\|([^}]*)\}\}/gi)) {
    const parts = m[1].split('|').map((s) => s.trim());
    const file = parts.find((p) => /\.(ogg|oga|mp3|wav|flac|opus)$/i.test(p));
    if (file) out.push(file.replace(/^(File|Image):/i, ''));
  }
  return out;
}

export function linguaLibreMatch(titles, word) {
  const w = word.toLowerCase();
  for (const t of titles) {
    const m = t.replace(/^File:/, '').match(/^LL-Q9027 \(swe\)-(.+?)-(.+)\.(wav|ogg|mp3|flac)$/i);
    if (m && m[2].toLowerCase() === w) return { file: t.replace(/^File:/, ''), speaker: m[1] };
  }
  return null;
}

const canOgg = () => {
  try {
    return !!new Audio().canPlayType('audio/ogg; codecs="vorbis"');
  } catch {
    return false;
  }
};

async function fileUrl(name) {
  const j = await getJson(`${COMMONS}&prop=videoinfo|imageinfo&viprop=url|derivatives&iiprop=url&titles=${encodeURIComponent('File:' + name)}`);
  const page = Object.values(j?.query?.pages || {})[0];
  if (!page || page.missing !== undefined) return null;
  const vi = page.videoinfo?.[0];
  const ii = page.imageinfo?.[0];
  const original = vi?.url || ii?.url;
  const isOgg = /\.(ogg|oga|opus)$/i.test(name);
  if (!isOgg || canOgg()) return original || null;
  const mp3 = (vi?.derivatives || []).find((d) => /mpeg|mp3/i.test(d.type || '') || /\.mp3$/i.test(d.src || ''));
  return mp3?.src || null;
}

/** Find a native recording for a single Swedish word. Resolves to {url, credit, page} or null. */
export function findNative(word) {
  if (!word || /\s/.test(word) || typeof fetch === 'undefined') return Promise.resolve(null);
  const c = readCache();
  const hit = c[word];
  if (hit && (hit.u || Date.now() - hit.t < MISS_TTL)) return Promise.resolve(hit.u ? { url: hit.u, credit: hit.by, page: hit.p } : null);
  if (inflight.has(word)) return inflight.get(word);
  const p = (async () => {
    let found = null;
    try {
      const j = await getJson(`${WIKT}&action=parse&prop=wikitext&redirects=1&page=${encodeURIComponent(word)}`);
      const files = audioFilesIn(swedishSection(j?.parse?.wikitext?.['*'] || ''));
      for (const f of files) {
        const url = await fileUrl(f);
        if (url) {
          found = { url, credit: 'Wiktionary / Wikimedia Commons', page: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(f)}` };
          break;
        }
      }
    } catch {}
    if (!found) {
      try {
        const q = `intitle:"LL-Q9027 (swe)" intitle:"${word}"`;
        const j = await getJson(`${COMMONS}&action=query&list=search&srnamespace=6&srlimit=50&srsearch=${encodeURIComponent(q)}`);
        const m = linguaLibreMatch((j?.query?.search || []).map((r) => r.title), word);
        if (m) {
          const url = await fileUrl(m.file);
          if (url) found = { url, credit: `Lingua Libre speaker ${m.speaker} (CC BY-SA)`, page: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(m.file)}` };
        }
      } catch {}
    }
    c[word] = found ? { u: found.url, by: found.credit, p: found.page, t: Date.now() } : { u: null, t: Date.now() };
    writeCache();
    inflight.delete(word);
    return found;
  })();
  inflight.set(word, p);
  return p;
}

let current = null;
export function playUrl(url) {
  return new Promise((resolve) => {
    try {
      current && current.pause();
      const a = new Audio(url);
      current = a;
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

/** Say a vocabulary entry: a native recording when enabled and already found, otherwise TTS (nouns with their article). */
export async function sayWord(w, { rate, native = true } = {}) {
  if (native && S.settings.native) {
    const n = cachedNative(w.sv);
    if (n && (await playUrl(n.url))) return 'native';
  }
  await speak(speakText(w), { rate });
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
