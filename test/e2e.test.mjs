// Browser smoke tests: real index.html in headless Chromium served on 127.0.0.1 (secure context).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const html = readFileSync(new URL('../index.html', import.meta.url));
let server, browser, url;

before(async () => {
  server = createServer((_, res) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(html); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
});
after(async () => { await browser?.close(); server?.close(); });

async function openPage(init) {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  if (init) await page.addInitScript(init);
  await page.goto(url);
  return { page, errors, close: () => ctx.close() };
}

async function scribble(page) {
  const box = await page.locator('#pad').boundingBox();
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  for (let i = 0; i < 260; i++) {
    await page.mouse.move(box.x + 10 + (i * 37) % (box.width - 20), box.y + 10 + (i * 53) % (box.height - 20));
  }
  await page.mouse.up();
  await page.waitForFunction(() => !document.getElementById('drawBtn').disabled);
}

const ballTexts = page => page.locator('#balls .ball').allTextContents();

test('6/45: scribble → draw → 6 distinct numbers 01..45, history saved', async () => {
  const { page, errors, close } = await openPage();
  await page.click('.seg button[data-g="645"]');
  await scribble(page);
  await page.click('#drawBtn');
  await page.waitForFunction(() => !document.querySelector('#balls .ball.empty'));
  const nums = (await ballTexts(page)).map(Number);
  assert.equal(nums.length, 6);
  assert.equal(new Set(nums).size, 6);
  assert.ok(nums.every(n => n >= 1 && n <= 45), nums.join(','));
  assert.match(await page.textContent('#meta'), /seed [0-9a-f]{16}/);
  assert.match(await page.textContent('#hist'), /Mega 6\/45:/);
  assert.equal(await page.locator('#drawBtn').isDisabled(), true, 'pool reset after draw');
  assert.deepEqual(errors, []);
  await close();
});

test('every game renders the right number of cells and draws without errors', async () => {
  const { page, errors, close } = await openPage();
  const expect = { '645': 6, '655': 6, '535': 6, keno: 10, b18: 4, xsmb: 5 };
  for (const [g, cells] of Object.entries(expect)) {
    await page.click(`.seg button[data-g="${g}"]`);
    if (g === 'keno') await page.selectOption('#kenoK', '10');
    assert.equal((await ballTexts(page)).length, cells, `${g} empty cells`);
    await scribble(page);
    await page.click('#drawBtn');
    await page.waitForFunction(() => !document.querySelector('#balls .ball.empty'));
    const t = await ballTexts(page);
    assert.equal(t.length, cells, `${g} drawn cells`);
    if (g === 'xsmb') assert.ok(t.every(d => /^[0-9]$/.test(d)));
    if (g === 'b18') assert.equal(+t[3], +t[0] + +t[1] + +t[2]);
  }
  assert.deepEqual(errors, []);
  await close();
});

test('no Web Crypto (insecure http): shows message and does not lock the button', async () => {
  const { page, errors, close } = await openPage(() => {
    Object.defineProperty(window.crypto, 'subtle', { get: () => undefined });
  });
  await scribble(page);
  await page.click('#drawBtn');
  await page.waitForFunction(() => /Web Crypto/.test(document.getElementById('meta').textContent));
  await page.waitForFunction(() => !document.getElementById('drawBtn').disabled, null, { timeout: 2000 });
  assert.deepEqual(errors, []);
  await close();
});

test('pressing the sensor button twice keeps only one live mic stream', async () => {
  const { page, close } = await openPage(() => {
    window.__streams = [];
    const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async c => { const s = await gum(c); window.__streams.push(s); return s; };
  });
  await page.click('#sensorBtn');
  await page.waitForFunction(() => window.__streams.length === 1);
  await page.click('#sensorBtn');
  await page.waitForFunction(() => window.__streams.length === 2);
  await page.waitForTimeout(300);
  const live = await page.evaluate(() =>
    window.__streams.filter(s => s.getTracks().some(t => t.readyState === 'live')).length);
  assert.equal(live, 1);
  await close();
});

test('draw button stays disabled while a draw is in progress', async () => {
  const { page, close } = await openPage(() => {
    const d = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = async (...a) => { await new Promise(r => setTimeout(r, 50)); return d(...a); };
  });
  await scribble(page);
  await page.click('#drawBtn');
  const box = await page.locator('#pad').boundingBox();
  await page.mouse.move(box.x + 20, box.y + 20); await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 60); await page.mouse.up();
  await page.waitForTimeout(30);
  assert.equal(await page.locator('#drawBtn').isDisabled(), true);
  await page.waitForFunction(() => !document.querySelector('#balls .ball.empty'));
  assert.equal(await page.locator('#hist li').count(), 1);
  await close();
});

test('mic permission granted after a draw does not leave the mic running', async () => {
  const { page, close } = await openPage(() => {
    window.__streams = [];
    const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async c => {
      await new Promise(r => { window.__grant = r; }); // permission prompt still open
      const s = await gum(c); window.__streams.push(s); return s;
    };
  });
  await page.click('#sensorBtn');
  await scribble(page);
  await page.click('#drawBtn');
  await page.waitForFunction(() => !document.querySelector('#balls .ball.empty'));
  await page.evaluate(() => window.__grant());
  await page.waitForFunction(() => window.__streams.length === 1);
  await page.waitForTimeout(200);
  const live = await page.evaluate(() =>
    window.__streams.filter(s => s.getTracks().some(t => t.readyState === 'live')).length);
  assert.equal(live, 0);
  await close();
});
