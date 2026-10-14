// Navigation: ‹ Back buttons and the phone's back gesture close the top layer instead of leaving the app.
//   node tests/navigation.mjs [baseUrl]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const { chromium, devices } = pw;
const base = process.argv[2] || 'http://localhost:8080/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'block' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route(/wiktionary\.org|wikimedia\.org/, (r) => r.abort());
const results = [];
const check = (name, ok) => results.push([name, !!ok]);
const sheets = () => page.$$eval('.backdrop.show', (b) => b.length);
const hash = () => page.evaluate(() => location.hash);
const wait = (ms = 450) => page.waitForTimeout(ms);

await page.goto(base + '#learn');
await page.waitForSelector('.node');
await page.goto(base + '#words');
await page.waitForSelector('.wrow');

// 1. Word card: ‹ Back button
await page.click('.wrow');
await page.waitForSelector('.wordcard');
check('word card shows a Back button', await page.isVisible('.sheet .back-btn'));
await page.click('.sheet .back-btn');
await wait();
check('Back closes the word card', (await sheets()) === 0 && (await hash()) === '#words');

// 2. Word card: phone back gesture
await page.click('.wrow');
await page.waitForSelector('.wordcard');
await page.goBack();
await wait();
check('phone back closes the word card and stays in the app', (await sheets()) === 0 && (await hash()) === '#words' && (await page.isVisible('.wrow')));

// 3. Stacked: unit sheet → word card → back → back
await page.goto(base + '#learn');
await page.waitForSelector('.node');
await page.click('.node');
await page.waitForSelector('.unit-sheet');
await page.click('.unit-sheet .wrow');
await wait();
check('word card opens on top of the unit', (await sheets()) === 2);
await page.click('.backdrop.show:last-of-type .back-btn');
await wait();
check('Back returns to the unit', (await sheets()) === 1 && (await page.isVisible('.unit-sheet')));
await page.goBack();
await wait();
check('phone back then closes the unit', (await sheets()) === 0 && (await hash()) === '#learn');

// 4. Lesson: phone back asks before quitting
await page.click('.node.current');
await page.waitForSelector('.unit-sheet');
await page.click('.unit-sheet .btn.wide');
await page.waitForSelector('.session');
await wait(300);
// Skip the new-word cards, then answer one question so quitting needs confirmation.
for (let i = 0; i < 6 && !(await page.$('.opt')); i++) {
  await page.click('.s-foot .btn.wide');
  await wait(300);
}
await page.click('.opt');
await page.click('.s-foot .btn.wide'); // Check
await wait(200);
await page.goBack();
await page.waitForSelector('.confirm');
check('phone back in a lesson asks to quit', true);
await page.click('.confirm .btn.ghost'); // Cancel
await wait();
check('cancel keeps the lesson going', await page.isVisible('.session'));
await page.goBack();
await page.waitForSelector('.confirm');
await page.click('.confirm .btn.danger'); // Quit
await wait();
check('quit closes the lesson', !(await page.isVisible('#session')) && (await hash()) === '#learn');

// 4b. Answers: tapping only selects; you can change your mind before Check
await page.goto(base + '#learn');
await page.waitForSelector('.hero-btn');
await page.click('.hero-btn');
await page.waitForSelector('.session');
for (let i = 0; i < 8 && !(await page.$('.opt')); i++) {
  await page.click('.s-foot .btn.wide');
  await wait(300);
}
const checkDisabled = await page.$eval('.s-foot .btn.wide', (b) => b.disabled);
await page.click('.opt >> nth=0');
await page.click('.opt >> nth=1');
const state = await page.evaluate(() => ({
  selected: [...document.querySelectorAll('.opt')].map((b) => b.classList.contains('selected')),
  graded: !!document.querySelector('.opt.correct, .opt.wrong'),
  check: document.querySelector('.s-foot .btn.wide')?.textContent,
}));
check('Check is disabled until an answer is picked', checkDisabled);
check('tapping selects without grading, and the choice can change', !state.graded && state.selected[1] && !state.selected[0] && state.check === 'Check');
await page.click('.s-foot .btn.wide');
await wait(200);
check('Check grades the selected answer', !!(await page.$('.opt.correct')) && !!(await page.$('#continue')));
await page.click('.s-top .icon-btn');
await page.waitForSelector('.confirm');
await page.click('.confirm .btn.danger');
await wait();

// 4c. The "Instant answers" setting submits on tap
await page.evaluate(() => {
  const st = JSON.parse(localStorage.getItem('svenskaquest.v1')) || { v: 1 };
  st.settings = { ...(st.settings || {}), quickAnswer: true };
  localStorage.setItem('svenskaquest.v1', JSON.stringify(st));
});
await page.goto(base + '#learn');
await page.reload();
await page.waitForSelector('.hero-btn');
await page.click('.hero-btn');
await page.waitForSelector('.session');
for (let i = 0; i < 8 && !(await page.$('.opt')); i++) {
  await page.click('.s-foot .btn.wide');
  await wait(300);
}
await page.click('.opt >> nth=0');
await wait(200);
check('Instant answers grades on tap', !!(await page.$('.opt.correct')) && !!(await page.$('#continue')));
await page.click('.s-top .icon-btn');
await page.waitForSelector('.confirm');
await page.click('.confirm .btn.danger');
await wait();

// 5. Arcade game: phone back quits the game
await page.goto(base + '#practice');
await page.waitForSelector('.game');
await page.click('.game:has-text("Blitz")');
await page.waitForSelector('.opt');
await page.goBack();
await wait();
check('phone back quits Blitz', !(await page.isVisible('#session')) && (await hash()) === '#practice');
await wait(1500);
check('the game clock stopped (no score saved)', !(await page.evaluate(() => JSON.parse(localStorage.getItem('svenskaquest.v1') || '{}').best?.blitz >= 0)));

// 6. Settings: ‹ Back returns to the previous tab
await page.goto(base + '#words');
await page.waitForSelector('.wrow');
await page.click('.gear');
await page.waitForSelector('.settings');
await page.click('.view-head .back-btn');
await wait();
check('Settings Back returns to Words', (await hash()) === '#words');

console.log(results.map(([n, ok]) => `${ok ? '✓' : '✗'} ${n}`).join('\n'));
if (errors.length) console.log('errors:', errors);
await browser.close();
process.exit(results.every(([, ok]) => ok) && !errors.length ? 0 : 1);
