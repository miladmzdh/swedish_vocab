// Native-recording flow against a strict mock of the Wiktionary / Wikimedia Commons APIs.
// The mock only answers well-formed requests (like the real API), simulates an iPhone that can't play
// Ogg, and checks that stale "no recording" results from the old cache are discarded.
//   node tests/native.mjs [baseUrl]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const { chromium, devices } = pw;
const base = process.argv[2] || 'http://localhost:8080/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
await ctx.addInitScript(() => {
  window.__played = [];
  window.__spoken = [];
  // Like an iPhone: no Ogg Vorbis playback.
  HTMLMediaElement.prototype.canPlayType = function (t) { return /ogg/.test(t) ? '' : 'maybe'; };
  HTMLMediaElement.prototype.play = function () { window.__played.push({ src: this.src, rate: this.playbackRate }); setTimeout(() => this.onended && this.onended(), 10); return Promise.resolve(); };
  SpeechSynthesis.prototype.speak = function (u) { window.__spoken.push({ text: u.text, rate: u.rate }); setTimeout(() => u.onend && u.onend(), 10); };
  // A stale miss left by the old (broken) cache must not hide the recording.
  if (!sessionStorage.getItem('seeded')) {
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('svenskaquest.audio', JSON.stringify({ hej: { u: null, t: Date.now() } }));
  }
});
const page = await ctx.newPage();
const errors = [];
const bad = [];
page.on('pageerror', (e) => errors.push(e.message));
let offline = false;
const FILES = {
  'File:Sv-hej.ogg': { url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Sv-hej.ogg', mp3: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/a/ab/Sv-hej.ogg/Sv-hej.ogg.mp3' },
  'File:Sv-katt.ogg': { url: 'https://upload.wikimedia.org/wikipedia/commons/c/cd/Sv-katt.ogg', mp3: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/c/cd/Sv-katt.ogg/Sv-katt.ogg.mp3' },
  'File:LL-Q9027 (swe)-Ninjastrikers-tack.wav': { url: 'https://upload.wikimedia.org/wikipedia/commons/1/12/LL-Q9027_(swe)-Ninjastrikers-tack.wav' },
};
const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
await page.route(/wiktionary\.org|wikimedia\.org/, (route) => {
  if (offline) return route.abort('internetdisconnected');
  const u = new URL(route.request().url());
  if (u.host === 'upload.wikimedia.org') return route.fulfill({ status: 200, headers: { 'content-type': 'audio/mpeg' }, body: '' });
  const q = Object.fromEntries(u.searchParams);
  const json = (b) => route.fulfill({ status: 200, headers: cors, body: JSON.stringify(b) });
  if (q.format !== 'json' || q.origin !== '*') bad.push(u.href);
  if (u.host.endsWith('wiktionary.org')) {
    if (q.action !== 'parse' || q.prop !== 'wikitext') return bad.push(u.href), json({ help: {} });
    if (u.host === 'en.wiktionary.org' && q.page === 'hej')
      return json({ parse: { title: 'hej', wikitext: { '*': '==English==\n{{audio|en|En-us-hey.ogg|Audio}}\n==Swedish==\n===Pronunciation===\n* {{IPA|sv|/hɛj/}}\n* {{audio|sv|Sv-hej.ogg|Audio}}\n===Interjection===\n==Tagalog==\n{{audio|tl|Tl-hej.ogg}}' } } });
    if (u.host === 'sv.wiktionary.org' && q.page === 'katt')
      return json({ parse: { title: 'katt', wikitext: { '*': '==Svenska==\n===Substantiv===\n{{uttal|sv|ipa=kat|ljud=Sv-katt.ogg}}\n==Danska==\n' } } });
    return json({ error: { code: 'missingtitle', info: "The page you specified doesn't exist." } });
  }
  // Commons: without action=query the real API returns its help page, not query results.
  if (q.action !== 'query') return bad.push(u.href), json({ help: { mime: 'text/html' } });
  if (q.list === 'search') {
    if (q.srnamespace !== '6') bad.push(u.href);
    if (/"tack"/.test(q.srsearch)) return json({ query: { search: [{ title: 'File:LL-Q9027 (swe)-Ninjastrikers-tacka.wav' }, { title: 'File:LL-Q9027 (swe)-Ninjastrikers-tack.wav' }] } });
    return json({ query: { search: [] } });
  }
  if (q.prop && q.titles) {
    const pages = {};
    q.titles.split('|').forEach((t, i) => {
      const f = FILES[t];
      pages[f ? 100 + i : -1 - i] = f
        ? { title: t, videoinfo: [{ url: f.url, derivatives: f.mp3 ? [{ src: f.url, type: 'audio/ogg; codecs="vorbis"' }, { src: f.mp3, type: 'audio/mpeg' }] : [] }] }
        : { title: t, missing: '' };
    });
    return json({ batchcomplete: '', query: { pages } });
  }
  bad.push(u.href);
  return json({});
});

const openWord = async (sv) => {
  await page.evaluate(() => document.querySelectorAll('.backdrop').forEach((b) => b.click()));
  await page.waitForTimeout(300);
  await page.goto(base + '#words');
  await page.fill('input.search', sv);
  await page.waitForTimeout(150);
  for (const r of await page.$$('.wrow')) { const t = await r.$eval('b', (b) => b.textContent); if (t === sv || t.endsWith(' ' + sv)) { await r.click(); break; } }
  await page.waitForSelector('.wordcard');
  await page.waitForTimeout(400);
};
const line = () => page.$eval('.wordcard .native-line', (e) => e.textContent);
const out = {};
await openWord('hej');
out.hejLine = await line();
out.oldCacheRemoved = await page.evaluate(() => localStorage.getItem('svenskaquest.audio') === null);
await page.evaluate(() => { window.__played = []; window.__spoken = []; });
await page.click('.wordcard .speaker.native');
await page.click('.wordcard .speaker >> nth=0');
await page.click('.wordcard .speaker >> nth=1');
await page.waitForTimeout(100);
out.hejAudio = await page.evaluate(() => ({ played: window.__played, spoken: window.__spoken }));
// The example sentence has its own normal and slow buttons.
await page.evaluate(() => { window.__spoken = []; });
await page.click('.wordcard .ex-btns .speaker >> nth=0');
await page.click('.wordcard .ex-btns .speaker >> nth=1');
await page.waitForTimeout(100);
out.exampleAudio = await page.evaluate(() => window.__spoken);
await openWord('tack');
out.tackLine = await line();
await openWord('katt');
out.kattLine = await line();
offline = true;
await openWord('nej');
out.nejCachedAfterOffline = await page.evaluate(() => 'nej' in JSON.parse(localStorage.getItem('svenskaquest.audio.v2') || '{}'));
offline = false;
await openWord('nej');
out.nejLine = await line();
out.nejNativeHidden = await page.$eval('.wordcard .speaker.native', (e) => e.hidden);
await page.goto(base + '#settings');
await page.click('button:has-text("🎙️ Test")');
await page.waitForFunction(() => {
  const el = [...document.querySelectorAll('.setting')].find((x) => /Native recordings check/.test(x.textContent));
  return el && /✅|⚠️|No recordings found/.test(el.textContent);
}, null, { timeout: 15000 });
out.settingsCheck = await page.evaluate(() => [...document.querySelectorAll('.setting')].find((s) => /Native recordings check/.test(s.textContent)).textContent);

console.log(JSON.stringify({ out, bad, errors }, null, 2));
const ok =
  /Wiktionary/.test(out.hejLine) && out.oldCacheRemoved &&
  out.hejAudio.played.length === 1 && out.hejAudio.played[0].rate === 1 && /Sv-hej\.ogg\.mp3$/.test(out.hejAudio.played[0].src) &&
  out.hejAudio.spoken.length === 2 && out.hejAudio.spoken[1].rate < out.hejAudio.spoken[0].rate &&
  out.exampleAudio.length === 2 && out.exampleAudio[0].text.split(' ').length > 1 && out.exampleAudio[0].text === out.exampleAudio[1].text && out.exampleAudio[1].rate < out.exampleAudio[0].rate &&
  /Lingua Libre speaker Ninjastrikers/.test(out.tackLine) &&
  /Swedish Wiktionary/.test(out.kattLine) &&
  !out.nejCachedAfterOffline && /No native recording/.test(out.nejLine) && out.nejNativeHidden &&
  /✅ Native recordings work/.test(out.settingsCheck) &&
  !bad.length && !errors.length;
await browser.close();
process.exit(ok ? 0 : 1);
