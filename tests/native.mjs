// Native-recording flow against mocked Wiktionary / Wikimedia Commons APIs.
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
  HTMLMediaElement.prototype.play = function () { window.__played.push({ src: this.src, rate: this.playbackRate }); setTimeout(() => this.onended && this.onended(), 10); return Promise.resolve(); };
  SpeechSynthesis.prototype.speak = function (u) { window.__spoken.push({ text: u.text, rate: u.rate }); setTimeout(() => u.onend && u.onend(), 10); };
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let offline = false;
const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
await page.route(/wiktionary\.org|wikimedia\.org/, (route) => {
  if (offline) return route.abort('internetdisconnected');
  const u = new URL(route.request().url());
  const q = Object.fromEntries(u.searchParams);
  const json = (b) => route.fulfill({ status: 200, headers: cors, body: JSON.stringify(b) });
  if (u.host === 'en.wiktionary.org') {
    if (q.page === 'hej') return json({ parse: { wikitext: { '*': '==English==\n{{audio|en|En-hey.ogg}}\n==Swedish==\n===Pronunciation===\n* {{IPA|sv|/hɛj/}}\n* {{audio|sv|Sv-hej.ogg|Audio}}\n===Interjection===\n' } } });
    return json({ error: { code: 'missingtitle' } });
  }
  if (q.list === 'search') {
    if (/tack/.test(q.srsearch)) return json({ query: { search: [{ title: 'File:LL-Q9027 (swe)-Ninjastrikers-tacka.wav' }, { title: 'File:LL-Q9027 (swe)-Ninjastrikers-tack.wav' }] } });
    return json({ query: { search: [] } });
  }
  if (q.prop) {
    const t = q.titles;
    return json({ query: { pages: { 1: { title: t, videoinfo: [{ url: `https://upload.wikimedia.org/x/${encodeURIComponent(t)}`, derivatives: [{ src: 'https://upload.wikimedia.org/x/derived.mp3', type: 'audio/mpeg' }] }] } } } });
  }
  return json({});
});

const openWord = async (sv) => {
  await page.evaluate(() => document.querySelectorAll('.backdrop').forEach((b) => b.click()));
  await page.waitForTimeout(300);
  await page.goto(base + '#words');
  await page.fill('input.search', sv);
  await page.waitForTimeout(150);
  const rows = await page.$$('.wrow');
  for (const r of rows) if ((await r.$eval('b', (b) => b.textContent)) === sv) { await r.click(); break; }
  await page.waitForSelector('.wordcard');
  await page.waitForTimeout(300);
};
const out = {};
await openWord('hej');
out.hejLine = await page.$eval('.wordcard .native-line', (e) => e.textContent);
out.hejNativeVisible = await page.$eval('.wordcard .speaker.native', (e) => !e.hidden);
await page.evaluate(() => { window.__played = []; window.__spoken = []; });
await page.click('.wordcard .speaker.native');
await page.click('.wordcard .speaker >> nth=0');
await page.click('.wordcard .speaker >> nth=1');
await page.waitForTimeout(100);
out.hejAudio = await page.evaluate(() => ({ played: window.__played, spoken: window.__spoken }));

await openWord('tack');
out.tackLine = await page.$eval('.wordcard .native-line', (e) => e.textContent);

offline = true;
await openWord('nej');
out.nejOfflineLine = await page.$eval('.wordcard .native-line', (e) => e.textContent);
out.nejCachedAfterOffline = await page.evaluate(() => 'nej' in JSON.parse(localStorage.getItem('svenskaquest.audio') || '{}'));
offline = false;
await openWord('nej');
out.nejLine = await page.$eval('.wordcard .native-line', (e) => e.textContent);
out.nejNativeHidden = await page.$eval('.wordcard .speaker.native', (e) => e.hidden);

console.log(JSON.stringify({ out, errors }, null, 2));
const ok =
  /Wiktionary/.test(out.hejLine) && out.hejNativeVisible &&
  out.hejAudio.played.length === 1 && out.hejAudio.played[0].rate === 1 && /Sv-hej/.test(out.hejAudio.played[0].src) &&
  out.hejAudio.spoken.length === 2 && out.hejAudio.spoken[1].rate < out.hejAudio.spoken[0].rate &&
  /Lingua Libre speaker Ninjastrikers/.test(out.tackLine) &&
  !out.nejCachedAfterOffline && /No native recording/.test(out.nejLine) && out.nejNativeHidden && !errors.length;
await browser.close();
process.exit(ok ? 0 : 1);
