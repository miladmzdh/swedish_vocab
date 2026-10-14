// Gist sync flow against a mocked GitHub API: bad token formats, revoked tokens, missing scope, create, then sync.
//   node tests/sync.mjs [baseUrl]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const { chromium, devices } = pw;
const base = process.argv[2] || 'http://localhost:8080/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const GOOD = 'ghp_' + 'a'.repeat(36);
let scopes = 'gist';
let gist = null;
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Authorization, Content-Type, Accept, X-GitHub-Api-Version', 'access-control-allow-methods': 'GET, POST, PATCH', 'access-control-expose-headers': 'X-OAuth-Scopes' };
await page.route('https://api.github.com/**', async (route) => {
  const req = route.request();
  const json = (status, body, extra = {}) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  if (req.headers()['authorization'] !== `Bearer ${GOOD}`) return json(401, { message: 'Bad credentials' });
  const url = new URL(req.url());
  if (url.pathname === '/user') return json(200, { login: 'tester' }, { 'x-oauth-scopes': scopes });
  if (url.pathname === '/gists' && req.method() === 'GET') return json(200, gist ? [gist] : []);
  if (url.pathname === '/gists' && req.method() === 'POST') {
    const b = JSON.parse(req.postData());
    gist = { id: 'g123', files: { 'svenska-quest-progress.json': { content: b.files['svenska-quest-progress.json'].content } } };
    return json(201, gist);
  }
  if (url.pathname === '/gists/g123' && req.method() === 'GET') return json(200, gist);
  if (url.pathname === '/gists/g123' && req.method() === 'PATCH') {
    gist.files['svenska-quest-progress.json'].content = JSON.parse(req.postData()).files['svenska-quest-progress.json'].content;
    return json(200, gist);
  }
  return json(404, {});
});

await page.goto(base + '#settings');
await page.waitForSelector('input.token');
const attempt = async (token) => {
  await page.fill('input.token', token);
  await page.click('button:has-text("Sync now")');
  await page.waitForFunction(() => !/Checking token|Syncing/.test(document.querySelector('input.token').closest('section').querySelector('.muted.small:last-child').textContent), null, { timeout: 8000 });
  return page.evaluate(() => document.querySelector('input.token').closest('section').querySelector('.muted.small:last-child').textContent);
};
const results = {};
results.garbage = await attempt('Xy7#kL2pQ9mN4vB8');
results.badToken = await attempt('ghp_' + 'b'.repeat(36));
scopes = 'repo';
results.noScope = await attempt(GOOD);
scopes = 'gist, repo';
results.withSpaces = await attempt(' ' + GOOD.slice(0, 20) + '\n' + GOOD.slice(20) + ' ');
results.second = await attempt(GOOD);
results.gistId = await page.inputValue('input[aria-label="Gist ID"]');
results.remoteHasProgress = !!(gist && JSON.parse(gist.files['svenska-quest-progress.json'].content).v === 1);
console.log(JSON.stringify({ results, errors }, null, 2));
const ok =
  /doesn't look like a GitHub token/.test(results.garbage) &&
  /not valid/.test(results.badToken) &&
  /missing the “gist” scope/.test(results.noScope) &&
  /Created a private gist|Last synced just now/.test(results.withSpaces) &&
  /Synced|Last synced just now/.test(results.second) &&
  results.gistId === 'g123' &&
  results.remoteHasProgress &&
  !errors.length;
await browser.close();
process.exit(ok ? 0 : 1);
