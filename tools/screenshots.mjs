#!/usr/bin/env node
// Takes the README screenshots on a phone-sized screen with some sample progress.
//   npx http-server -p 8080 . &   then   node tools/screenshots.mjs [baseUrl] [outDir]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const { chromium, devices } = pw;
const base = process.argv[2] || 'http://localhost:8080/';
const out = process.argv[3] || 'docs/screenshots';
mkdirSync(out, { recursive: true });

const vocab = await (await fetch(base + 'data/vocab.json')).json();
const byUnit = (u) => vocab.filter((w) => w.u === u);
const now = Date.now();
const day = (n) => {
  const d = new Date(now - n * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const words = {};
const rec = (b) => ({ b, d: now + (b > 3 ? 5 : -1) * 86400000, c: 4 + b, w: 1, l: now - 86400000, i: now - 9 * 86400000 });
byUnit('basics').forEach((w) => (words[w.id] = rec(5)));
byUnit('pronouns').forEach((w, i) => (words[w.id] = rec(i % 3 ? 4 : 2)));
byUnit('numbers').slice(0, 20).forEach((w) => (words[w.id] = rec(2)));
const state = {
  v: 1, created: now - 20 * 86400000, updated: now, settingsUpdated: 0, name: '', avatar: '🦊',
  days: Object.fromEntries([[day(0), 35], [day(1), 80], [day(2), 55], [day(3), 120], [day(4), 60], [day(5), 45], [day(8), 30], [day(9), 70], [day(12), 25]]),
  coinsEarned: 380, coinsSpent: 50, freezes: 1, frozen: [], owned: ['🦊'], theme: 'blue', words,
  units: { basics: { lessons: 9, boss: 1 }, pronouns: { lessons: 11 }, numbers: { lessons: 4 } },
  ach: { first: now, lessons10: now, words25: now, words100: now, streak3: now, perfect: now, boss1: now, star3: now },
  best: { blitz: 21, survival: 17, gender: 26, match: 12 },
  counts: { lessons: 24, perfect: 6, bosses: 1, bestCombo: 14, answers: 420, correct: 371, typed: 64, goalDays: 4 },
  quests: null, settings: {}, lastBackup: now, lastSync: 0,
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2, serviceWorkers: 'block' });
await ctx.addInitScript((s) => {
  if (!localStorage.getItem('svenskaquest.v1')) localStorage.setItem('svenskaquest.v1', s);
  HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
}, JSON.stringify(state));
const page = await ctx.newPage();
// Generic stand-in for Wikimedia so the 🎙️ button appears (the sandbox has no internet access).
await page.route(/wiktionary\.org|wikimedia\.org/, (route) => {
  const u = new URL(route.request().url());
  const q = Object.fromEntries(u.searchParams);
  const json = (b) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify(b) });
  if (u.host === 'upload.wikimedia.org') return route.fulfill({ status: 200, body: '' });
  if (u.host === 'en.wiktionary.org') return json({ parse: { wikitext: { '*': `==Swedish==\n* {{audio|sv|Sv-${q.page}.ogg|Audio}}\n` } } });
  if (u.host === 'sv.wiktionary.org') return json({ error: { code: 'missingtitle' } });
  if (q.list === 'search') return json({ query: { search: [] } });
  const pages = {};
  (q.titles || '').split('|').forEach((t, i) => (pages[i + 1] = { title: t, videoinfo: [{ url: 'https://upload.wikimedia.org/x.ogg', derivatives: [] }] }));
  return json({ query: { pages } });
});
const snap = async (name) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('saved', name);
};

await page.goto(base + '#learn');
await page.waitForSelector('.node.current');
await page.evaluate(() => document.getElementById('main').scrollTo(0, 0));
await snap('1-path');

await page.click('.node-wrap:nth-of-type(2) .node');
await page.waitForSelector('.unit-sheet');
await snap('2-unit');
await page.evaluate(() => document.querySelector('.backdrop').click());
await page.waitForTimeout(400);

await page.click('.node.current');
await page.waitForSelector('.unit-sheet');
await page.click('.unit-sheet .btn.wide');
await page.waitForSelector('.ex.intro');
await page.waitForTimeout(800);
await snap('3-new-word');
for (let i = 0; i < 6 && !(await page.$('.opt')); i++) {
  const b = await page.$('.s-foot .btn.wide:not(:disabled)');
  if (b) await b.click();
  await page.waitForTimeout(400);
}
await snap('4-question');
await page.click('.s-top .icon-btn');
await page.waitForTimeout(300);
const quit = await page.$('.confirm .btn.danger');
if (quit) await quit.click();
await page.waitForTimeout(500);

await page.goto(base + '#learn');
await page.waitForSelector('.node');
await page.click('.node-wrap:nth-of-type(2) .node');
await page.waitForSelector('.unit-sheet .boss-btn');
await page.click('.unit-sheet .boss-btn');
await page.waitForSelector('.boss');
await snap('5-boss');
await page.click('.s-top .icon-btn');
await page.waitForTimeout(300);
const quit2 = await page.$('.confirm .btn.danger');
if (quit2) await quit2.click();
await page.waitForTimeout(500);

await page.goto(base + '#practice');
await page.waitForSelector('.games');
await snap('6-practice');
await page.goto(base + '#me');
await page.waitForSelector('.achs');
await snap('7-profile');
await browser.close();
