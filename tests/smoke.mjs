// Smoke test: loads the app at phone size, visits every tab, plays a full lesson and checks progress persists.
//   node tests/smoke.mjs [baseUrl] [screenshotDir]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const { chromium, devices } = pw;

const base = process.argv[2] || 'http://localhost:8080/';
const shots = process.argv[3] || null;
const errors = [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
// External hosts (Wikimedia, GitHub) are unreachable in CI; only report errors from the app itself.
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push('console: ' + m.text()));
const shot = async (name) => shots && page.screenshot({ path: `${shots}/${name}.png` });

await page.goto(base);
await page.waitForSelector('.path .node');
await shot('01-learn');
for (const tab of ['practice', 'words', 'me', 'settings']) {
  await page.goto(base + '#' + tab);
  await page.waitForTimeout(300);
  await shot('02-' + tab);
}
await page.goto(base + '#learn');
await page.waitForSelector('.node.current');
await page.click('.node.current');
await page.waitForSelector('.unit-sheet');
await shot('03-unit');
await page.click('.unit-sheet .btn.wide');
await page.waitForSelector('.session');

// Drive the lesson: answer whatever is on screen until the summary appears.
const seenTypes = new Set();
for (let step = 0; step < 120; step++) {
  if (await page.$('.summary')) break;
  const cont = await page.$('#continue');
  if (cont) { await cont.click(); await page.waitForTimeout(120); continue; }
  const instr = await page.$eval('.instr', (e) => e.textContent).catch(() => '');
  seenTypes.add(instr);
  if (step < 25) await shot(`04-step-${String(step).padStart(2, '0')}`);
  const gotIt = await page.$('.s-foot .btn.wide:not(:disabled)');
  if (gotIt && (await gotIt.textContent()) === 'Got it') { await gotIt.click(); continue; }
  const opt = await page.$('.opt:not(:disabled)');
  if (opt) { await opt.click(); await page.waitForTimeout(100); continue; }
  const input = await page.$('input.answer:not(:disabled)');
  if (input) { await input.fill('hej'); await page.keyboard.press('Enter'); await page.waitForTimeout(100); continue; }
  const tiles = await page.$$('.ltile:not(:disabled)');
  if (tiles.length) { await tiles[0].click(); continue; }
  const cards = await page.$$('.match .col:first-child .mcard:not(.done)');
  if (cards.length) {
    await cards[0].click();
    const rights = await page.$$('.match .col:last-child .mcard:not(.done)');
    for (const r of rights) {
      await r.click();
      await page.waitForTimeout(60);
      if (!(await page.$('.match .mcard.sel'))) break;
    }
    continue;
  }
  const skip = await page.$('text=Can\'t speak now');
  if (skip) { await skip.click(); continue; }
  await page.waitForTimeout(200);
}
await shot('05-summary');
const summary = await page.$eval('.summary h1', (e) => e.textContent).catch(() => null);
await page.click('#continue');
await page.waitForTimeout(400);
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('svenskaquest.v1')));
await page.reload();
await page.waitForSelector('.path .node');
const xpAfterReload = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('svenskaquest.v1')).days).reduce((a, b) => a + b, 0));
await shot('06-after');

// Arcade games start, accept answers and can be quit.
for (const [name, sel] of [['Blitz', '.opt'], ['Gender Rush', '.gbtn'], ['Match Madness', '.mcard']]) {
  await page.goto(base + '#practice');
  await page.click(`.game:has-text("${name}")`);
  await page.waitForSelector(sel);
  for (let i = 0; i < 4; i++) {
    const b = await page.$(`${sel}:not(:disabled)`);
    if (b) await b.click().catch(() => {});
    await page.waitForTimeout(300);
  }
  await shot('07-' + name.replace(/ /g, '-'));
  await page.click('.s-top .icon-btn');
  await page.waitForSelector('#session', { state: 'hidden' });
}

console.log(JSON.stringify({
  summary,
  exerciseTypes: [...seenTypes],
  wordsLearned: Object.keys(saved.words).length,
  lessons: saved.units,
  xpAfterReload,
  errors,
}, null, 2));
await browser.close();
process.exit(errors.length || !summary || !xpAfterReload ? 1 : 0);
