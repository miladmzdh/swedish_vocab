// YKI section: drives every task type with small fixture content (served in place of data/yki/*.json).
//   node tests/yki.mjs [baseUrl]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const { chromium, devices } = pw;
const base = process.argv[2] || 'http://localhost:8080/';

const phrases = [{ sv: 'Jag tycker att …', en: 'I think that …' }, { sv: 'Först …', en: 'First …' }, { sv: 'Sedan …', en: 'Then …' }, { sv: 'Till sist …', en: 'Finally …' }];
const FIX = {
  speaking: { tasks: [
    { id: 'acc-1', type: 'account', title: 'Din skoltid', titleEn: 'Your school days', prompt: 'Berätta om din skoltid.', promptEn: 'Tell about your school days.', prep: 2, speak: 2, structure: ['Start', 'Middle', 'End'], tips: ['Keep talking'], model: 'Jag gick i skolan i Vasa.', modelEn: 'I went to school in Vasa.', phrases },
    { id: 'sit-1', type: 'situation', title: 'Hälsostationen', titleEn: 'The health station', context: 'Du ringer till hälsostationen.', contextEn: 'You call the health station.', reply: 2, turns: [
      { them: 'Hälsostationen, hej.', themEn: 'Health station, hello.', you: 'Hej, jag vill boka en tid.', youEn: 'Hi, I want to book a time.', goal: 'Say why you call.' },
      { them: 'Vad gäller det?', themEn: 'What is it about?', you: 'Jag har ont i halsen.', youEn: 'I have a sore throat.', goal: 'Explain the problem.' },
      { them: 'Passar fredag?', themEn: 'Does Friday suit?', you: 'Ja, fredag passar bra.', youEn: 'Yes, Friday is fine.', goal: 'Accept the time.' },
    ], tips: ['Be polite'], phrases },
  ] },
  writing: { tasks: [
    { id: 'inf-1', type: 'informal', title: 'Till en vän', titleEn: 'To a friend', prompt: 'Skriv till din vän.', promptEn: 'Write to your friend.', points: ['Tacka', 'Föreslå en dag'], words: [5, 20], minutes: 1, model: 'Hej Anna! Tack för igår. Ses vi på lördag?', modelEn: 'Hi Anna! Thanks for yesterday. See you Saturday?', checklist: ['Greeting', 'Both points', 'Closing'], phrases },
  ] },
  reading: { items: [
    { id: 'r-1', kind: 'notice', title: 'Tvättstugan', titleEn: 'The laundry room', text: 'Tvättstugan är stängd på måndag.\n\nVälkommen tillbaka på tisdag.', textEn: 'The laundry room is closed on Monday. Welcome back on Tuesday.', glossary: [{ sv: 'tvättstuga', en: 'laundry room' }], questions: [
      { type: 'mc', q: 'När är tvättstugan stängd?', options: ['På måndag', 'På tisdag', 'På fredag'], answer: 0, explain: 'It says "stängd på måndag".' },
      { type: 'tf', q: 'Tvättstugan öppnar igen på tisdag.', answer: true, explain: '"Välkommen tillbaka på tisdag."' },
      { type: 'tf', q: 'Tvättstugan är stängd hela veckan.', answer: false, explain: 'Only Monday.' },
      { type: 'open', q: 'När öppnar tvättstugan igen?', answer: 'På tisdag.', explain: '"Välkommen tillbaka på tisdag."' },
    ] },
  ] },
  listening: { items: [
    { id: 'l-1', kind: 'dialogue', title: 'I butiken', titleEn: 'In the shop', plays: 2, script: [{ spk: 'A', text: 'Hej, kan jag hjälpa dig?' }, { spk: 'B', text: 'Ja, var finns mjölken?' }], scriptEn: 'Hi, can I help you? Yes, where is the milk?', questions: [
      { type: 'mc', q: 'Vad letar kunden efter?', options: ['Mjölk', 'Bröd', 'Ost'], answer: 0, explain: 'B asks for milk.' },
      { type: 'tf', q: 'Personalen frågar om de kan hjälpa.', answer: true, explain: '"kan jag hjälpa dig?"' },
      { type: 'tf', q: 'Kunden vill betala.', answer: false, explain: 'B asks where the milk is.' },
    ] },
  ] },
};

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block', permissions: ['microphone', 'clipboard-read', 'clipboard-write'] });
await ctx.addInitScript(() => {
  window.__spoken = [];
  SpeechSynthesis.prototype.speak = function (u) { window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 30); };
  HTMLMediaElement.prototype.play = function () { setTimeout(() => this.onended && this.onended(), 10); return Promise.resolve(); };
});
await ctx.route(/\/data\/yki\/(\w+)\.json/, (route) => {
  const part = route.request().url().match(/\/data\/yki\/(\w+)\.json/)[1];
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIX[part]) });
});
await ctx.route(/wiktionary\.org|wikimedia\.org|chatgpt\.com/, (r) => r.abort());
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const results = [];
const check = (n, ok, x) => results.push([n, !!ok, x]);
const wait = (ms = 300) => page.waitForTimeout(ms);
// The top-most screen's ‹ Back (screens stack: part list, then task).
const back = async () => {
  const btns = await page.$$('.y-screen .y-top .back-btn');
  await btns[btns.length - 1].click();
  await wait();
};
const yki = () => page.evaluate(() => JSON.parse(localStorage.getItem('svenskaquest.v1') || '{}').yki || {});

await page.goto(base + '#learn');
await page.waitForSelector('.node');
check('the tab bar has a YKI tab', await page.isVisible('.tab:has-text("YKI")'));
await page.click('.tab:has-text("YKI")');
await page.waitForSelector('.y-part');
await page.waitForFunction(() => /practised/.test(document.querySelector('.y-parts').textContent));
check('the YKI home lists the four parts with progress', (await page.$$('.y-part')).length === 4);

// Speaking: account
await page.click('.y-part:has-text("Speaking")');
await page.waitForSelector('.y-task');
await page.click('.y-task:has-text("Din skoltid")');
await page.waitForSelector('.y-clock');
await page.click('button:has-text("Start preparing")');
await page.waitForSelector('button:has-text("Stop")', { timeout: 6000 });
check('preparation time runs, then speaking starts by itself', true);
await page.waitForSelector('button:has-text("Try again")', { timeout: 6000 });
check('speaking ends when the time is up', true);
check('your own recording can be played back', await page.isVisible('button:has-text("Listen to yourself")'));
await page.click('.y-rate .chip:has-text("OK")');
await wait();
check('rating saves the task as practised', (await yki()).speaking?.['acc-1']?.done === 1);
const gptHref = async (sel) => {
  // Clicking builds the prompt, puts it in the link and copies it; the new tab itself is blocked above.
  const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 3000 }).catch(() => null), page.click(sel)]);
  const href = await page.$eval(sel, (a) => a.href);
  if (popup) await popup.close();
  return decodeURIComponent(href.split('?q=')[1] || '');
};
const sp = await gptHref('.y-gpt-open');
check('speaking opens ChatGPT with the task and the examiner instructions', /YKI/.test(sp) && sp.includes('Berätta om din skoltid.') && /voice dictation/.test(sp), sp.slice(0, 200));
const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
check('the prompt is also copied', copied.includes('Berätta om din skoltid.'));
await page.click('.y-tabs .chip:has-text("Model answer")');
check('the model answer tab shows the model', await page.isVisible('.y-model:has-text("Vasa")'));
await back();

// Speaking: situation
await page.click('.y-task:has-text("Hälsostationen")');
await page.waitForSelector('button:has-text("Start the conversation")');
await page.click('button:has-text("Start the conversation")');
for (let i = 0; i < 3; i++) {
  await page.waitForSelector('.y-goal', { timeout: 6000 });
  await page.click('.y-dock button:has-text("Done")');
  await page.waitForSelector('.y-dock button:has-text("Next"), .y-dock button:has-text("Finish")', { timeout: 6000 });
  await page.click('.y-dock .btn.wide');
}
await page.waitForSelector('.y-rate');
const bubbles = await page.$$eval('.y-bubble', (b) => b.length);
const spoken = await page.evaluate(() => window.__spoken);
check('a situation plays every line and shows a model reply for each turn', bubbles === 6 && spoken.includes('Passar fredag?'), { bubbles, spoken });
const sit = await gptHref('.y-gpt-open');
check('the situation role-play prompt lists every line with its goal', sit.includes('3. "Passar fredag?" (my reply should: Accept the time.)') && /send only line 1/.test(sit), sit.slice(0, 200));
await back();
await back();

// Writing
await page.click('.y-part:has-text("Writing")');
await page.click('.y-task:has-text("Till en vän")');
await page.waitForSelector('textarea.y-text');
await page.fill('textarea.y-text', 'Hej Anna, tack för igår. Kan vi ses på lördag?');
await wait(600);
check('the word counter turns green inside the range', await page.isVisible('.y-count.ok'));
const wr = await gptHref('.y-gpt-open');
await ctx.setOffline(true);
await page.click('.y-gpt-open');
await wait();
check('offline, the ChatGPT button copies the prompt instead of opening a dead page', (ctx.pages().length === 1) && /offline/.test(await page.$eval('#toasts', (t) => t.textContent)));
await ctx.setOffline(false);
check('writing sends the task, the points and your text to ChatGPT', wr.includes('Skriv till din vän.') && wr.includes('- Föreslå en dag') && wr.includes('Kan vi ses på lördag?') && /\(10 words\)/.test(wr), wr.slice(0, 300));
await page.click('button:has-text("Compare with the model")');
await page.waitForSelector('.y-model');
await page.click('button:has-text("Mark as done")');
await wait();
const w = (await yki()).writing?.['inf-1'];
check('writing saves the draft and marks it done', w?.done === 1 && /lördag/.test(w.text));
await back();
await page.click('.y-task:has-text("Till en vän")');
await page.waitForSelector('textarea.y-text');
check('the draft is still there when you come back', /lördag/.test(await page.inputValue('textarea.y-text')));
await back();
await back();

// Reading
await page.click('.y-part:has-text("Reading")');
await page.click('.y-task:has-text("Tvättstugan")');
await page.waitForSelector('.y-q');
const qs = await page.$$('.y-q');
await (await qs[0].$$('.opt'))[0].click();
await (await qs[1].$$('.opt'))[0].click();
await (await qs[2].$$('.opt'))[0].click(); // wrong on purpose (it's false)
await page.click('button:has-text("Check answers")');
await wait();
check('a written answer is required before checking', (await page.isVisible('button:has-text("Check answers")')) && !(await yki()).reading?.['r-1']);
await qs[3].$eval('textarea.y-open', (el) => el.focus());
await page.keyboard.type('Den öppnar på tisdag');
await page.click('button:has-text("Check answers")');
await wait();
let banner = await page.$eval('.banner', (b) => b.textContent);
check('reading scores the answers, explains them and shows the expected written answer', /2 \/ 4/.test(banner) && /mark your written answer/.test(banner) && (await page.$$('.y-explain:not([hidden])')).length === 4 && (await page.isVisible('.y-explain:has-text("På tisdag.")')), banner);
check('the attempt is saved right away, an unmarked written answer counting as wrong', (await yki()).reading?.['r-1']?.score === 2);
const rd = await gptHref('.y-gpt-open');
check('ChatGPT gets the text, the question, your answer and the expected answer', rd.includes('Tvättstugan är stängd på måndag.') && rd.includes('My answer: Den öppnar på tisdag') && rd.includes('Expected: På tisdag.'), rd.slice(0, 300));
await page.click('.y-mark .chip:has-text("Yes")');
await wait();
banner = await page.$eval('.banner', (b) => b.textContent);
check('marking it right updates the score and saves the best', /3 \/ 4/.test(banner) && !/mark your/.test(banner) && (await yki()).reading?.['r-1']?.score === 3, banner);
await page.click('.y-mark .chip:has-text("No")');
await wait();
check('changing your mind about a mark changes the saved score too', (await yki()).reading?.['r-1']?.score === 2 && (await page.getAttribute('.y-mark .chip:has-text("No")', 'aria-pressed')) === 'true');
await page.click('.y-mark .chip:has-text("Yes")');
await wait();
await back();
check('the part list shows the best score', /3\/4/.test(await page.$eval('.y-task:has-text("Tvättstugan") .y-badge', (b) => b.textContent)));
await page.click('.y-task:has-text("Tvättstugan")');
await page.waitForSelector('.y-q');
const qs2 = await page.$$('.y-q');
await (await qs2[0].$$('.opt'))[1].click();
await (await qs2[1].$$('.opt'))[1].click();
await (await qs2[2].$$('.opt'))[0].click();
await qs2[3].$eval('textarea.y-open', (el) => (el.value = 'Vet inte', el.dispatchEvent(new Event('input'))));
await page.click('button:has-text("Check answers")');
await wait();
await page.click('.y-mark .chip:has-text("No")');
await wait();
check('a worse attempt keeps your best score', (await yki()).reading?.['r-1']?.score === 3 && /0 \/ 4/.test(await page.$eval('.banner', (b) => b.textContent)));
await back();
await back();

// Listening
await page.click('.y-part:has-text("Listening")');
await page.click('.y-task:has-text("I butiken")');
await page.waitForSelector('.y-prompt .btn.wide');
await page.click('.y-prompt .btn.wide');
await wait(900);
await page.click('.y-prompt .btn.wide');
await wait(900);
const playLabel = await page.$eval('.y-prompt .btn.wide', (b) => [b.textContent, b.disabled]);
check('listening allows two plays before you answer', playLabel[1] === true && /No listens left/.test(playLabel[0]), playLabel);
const lq = await page.$$('.y-q');
await (await lq[0].$$('.opt'))[0].click();
await (await lq[1].$$('.opt'))[0].click();
await (await lq[2].$$('.opt'))[1].click();
await page.click('button:has-text("Check answers")');
await wait();
check('after checking, the transcript appears and replay is allowed', (await page.isVisible('.y-line')) && !(await page.$eval('.y-prompt .btn.wide', (b) => b.disabled)));

// Phone back gesture closes YKI screens one at a time
await page.goBack();
await wait();
check('phone back closes the task first', !(await page.isVisible('.y-q')) && (await page.isVisible('.y-task')));
await page.goBack();
await wait();
check('then the part list, back on the YKI tab', !(await page.isVisible('.y-screen')) && (await page.isVisible('.y-part')));

console.log(results.map(([n, ok, x]) => `${ok ? '✓' : '✗'} ${n}${!ok && x ? ` — ${JSON.stringify(x)}` : ''}`).join('\n'));
if (errors.length) console.log('errors:', errors);
await browser.close();
process.exit(results.every(([, ok]) => ok) && !errors.length ? 0 : 1);
