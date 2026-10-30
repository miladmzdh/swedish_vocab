// Offline mode: download recordings (against a strict mock of the Wikimedia APIs), then go fully
// offline, reload, and check that the app, the words and the downloaded recordings still work.
//   node tests/offline.mjs [baseUrl]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const { chromium, devices } = pw;
const base = process.argv[2] || 'http://localhost:8080/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'allow' });
await ctx.addInitScript(() => {
  window.__played = [];
  HTMLMediaElement.prototype.canPlayType = function (t) { return /ogg/.test(t) ? '' : 'maybe'; }; // like an iPhone
  HTMLMediaElement.prototype.play = function () {
    if (!String(this.src).startsWith('data:')) window.__played.push(String(this.src));
    setTimeout(() => this.onended && this.onended(), 10);
    return Promise.resolve();
  };
});
const bad = [];
const errors = [];
const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
const FILES = {
  'File:Sv-hej.ogg': { url: 'https://upload.wikimedia.org/a/Sv-hej.ogg', mp3: 'https://upload.wikimedia.org/t/Sv-hej.ogg.mp3' },
  'File:Sv-katt.ogg': { url: 'https://upload.wikimedia.org/b/Sv-katt.ogg', mp3: 'https://upload.wikimedia.org/t/Sv-katt.ogg.mp3' },
  'File:LL-Q9027 (swe)-Ninjastrikers-tack.wav': { url: 'https://upload.wikimedia.org/c/LL-tack.wav' },
  'File:LL-Q9027 (swe)-Ninjastrikers-hund.wav': { url: 'https://upload.wikimedia.org/d/LL-hund.wav', mp3: 'https://upload.wikimedia.org/t/LL-hund.wav.mp3' },
};
let enCalls = 0;
await ctx.route(/wiktionary\.org|wikimedia\.org/, (route) => {
  const u = new URL(route.request().url());
  const q = Object.fromEntries(u.searchParams);
  const json = (b) => route.fulfill({ status: 200, headers: cors, body: JSON.stringify(b) });
  if (u.host === 'upload.wikimedia.org') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'audio/mpeg' }, body: 'x'.repeat(2048) });
  if (q.format !== 'json' || q.origin !== '*' || q.action !== 'query') return bad.push(u.href), json({ help: {} });
  const titles = (q.titles || '').split('|').filter(Boolean);
  if (u.host.endsWith('wiktionary.org')) {
    if (q.prop !== 'images' || q.formatversion !== '2' || titles.length > 50) bad.push(u.href);
    const lang = u.host.split('.')[0];
    // en.wiktionary answers the first batch in two parts, to exercise continuation.
    const first = lang === 'en' && !q.imcontinue && enCalls++ === 0;
    const pages = titles.map((t) => {
      const imgs = [];
      if (lang === 'en' && t === 'hej' && !first) imgs.push({ ns: 6, title: 'File:Sv-hej.ogg' }, { ns: 6, title: 'File:En-us-hey.ogg' });
      if (lang === 'sv' && t === 'katt') imgs.push({ ns: 6, title: 'Fil:Sv-katt.ogg' });
      return imgs.length ? { title: t, images: imgs } : { title: t };
    });
    return json({ query: { pages }, ...(first ? { continue: { imcontinue: '1|x', continue: '||' } } : {}) });
  }
  if (q.list === 'allpages') {
    if (q.apnamespace !== '6' || q.apprefix !== 'LL-Q9027 (swe)-') bad.push(u.href);
    if (!q.apcontinue) return json({ query: { allpages: [{ title: 'File:LL-Q9027 (swe)-Ninjastrikers-tack.wav' }, { title: 'File:LL-Q9027 (swe)-Ninjastrikers-tacka.wav' }] }, continue: { apcontinue: 'p2', continue: '-||' } });
    return json({ query: { allpages: [{ title: 'File:LL-Q9027 (swe)-Ninjastrikers-hund.wav' }] } });
  }
  if (q.prop && titles.length) {
    if (titles.length > 50) bad.push(u.href);
    const pages = {};
    titles.forEach((t, i) => {
      const f = FILES[t];
      pages[f ? 100 + i : -1 - i] = f ? { title: t, videoinfo: [{ url: f.url, derivatives: f.mp3 ? [{ src: f.mp3, type: 'audio/mpeg' }] : [] }] } : { title: t, missing: '' };
    });
    return json({ query: { pages } });
  }
  bad.push(u.href);
  return json({});
});

const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
const results = [];
const check = (name, ok, extra) => results.push([name, !!ok, extra]);
const wait = (ms = 400) => page.waitForTimeout(ms);

// First visit online installs the service worker; reload so it controls the page.
await page.goto(base + '#learn');
await page.waitForSelector('.node');
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();
await page.waitForSelector('.node');

await page.goto(base + '#settings');
await page.waitForSelector('.offline');
await page.waitForFunction(() => /Saved on this phone/.test(document.querySelector('.offline').textContent), null, { timeout: 10000 });
check('Settings shows the app is saved for offline', true);
await page.click('.offline .btn.wide');
await page.waitForFunction(() => /recordings saved/.test(document.querySelector('.offline').textContent), null, { timeout: 60000 });
const info = await page.$eval('.offline', (e) => e.textContent);
check('download saves the 4 available recordings', /4 recordings saved/.test(info), info.match(/\d+ recordings saved[^.]*/)?.[0]);
const cached = await page.evaluate(async () => (await (await caches.open('sq-audio-v1')).keys()).map((r) => r.url).sort());
check('recordings are in Cache Storage (MP3 copies preferred)', cached.length === 4 && cached.filter((u) => u.endsWith('.mp3')).length === 3, cached);

// ✈️ Airplane mode
await ctx.setOffline(true);
await page.goto(base + '#learn');
await page.reload();
await page.waitForSelector('.node', { timeout: 10000 });
check('the app starts with no network', true);
check('the header shows ✈️ Offline', await page.isVisible('.offline-chip'));

const openWord = async (sv) => {
  await page.evaluate(() => document.querySelectorAll('.backdrop').forEach((b) => b.click()));
  await wait(300);
  await page.goto(base + '#words');
  await page.waitForSelector('.wrow');
  await page.fill('input.search', sv);
  await wait(200);
  for (const r of await page.$$('.wrow')) {
    const t = await r.$eval('b', (b) => b.textContent);
    if (t === sv || t.endsWith(' ' + sv)) { await r.click(); break; }
  }
  await page.waitForSelector('.wordcard');
  await wait(300);
};
await openWord('tack');
const tackNative = await page.$eval('.wordcard .speaker.native', (b) => !b.hidden);
await page.evaluate(() => (window.__played = []));
await page.click('.wordcard .speaker.native');
await wait(300);
const played = await page.evaluate(() => window.__played);
check('a downloaded recording plays offline (from the phone, as a blob)', tackNative && played.length === 1 && played[0].startsWith('blob:'), played);
await openWord('nej');
check('words without a download fall back to the phone voice (no 🎙️)', await page.$eval('.wordcard .speaker.native', (b) => b.hidden));

await page.goto(base + '#practice');
await page.waitForSelector('.games');
const speaking = await page.$('.game:has-text("Speaking")');
check('speaking practice is disabled offline', !speaking || (await speaking.isDisabled()));

// Back online: the downloads survive an app update (the service worker only clears old app versions).
await ctx.setOffline(false);
const keep = await page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('sq-audio')).length);
check('recordings cache is separate from the app cache', keep === 1);

console.log(results.map(([n, ok, x]) => `${ok ? '✓' : '✗'} ${n}${!ok && x ? ` — ${JSON.stringify(x)}` : ''}`).join('\n'));
if (bad.length) console.log('malformed requests:', bad);
if (errors.length) console.log('errors:', errors);
await browser.close();
process.exit(results.every(([, ok]) => ok) && !bad.length && !errors.length ? 0 : 1);
