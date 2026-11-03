// Unit tests for the draw core in index.html (pick, roll, C, GAMES odds).
// The code is extracted from the real page source, not copied, so tests break if the page changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('// Draw');
const end = html.indexOf('let game=');
assert.ok(start > 0 && end > start, 'core block markers not found in index.html');
const src = html.slice(start, end);
const core = new Function('$', src + '\nreturn {cat,u32,sha,pick,roll,C,GAMES};')(
  () => ({ value: '10' }) // stub for $('kenoK') used by Keno odds
);
const seed = Uint8Array.from({ length: 32 }, (_, i) => i);

test('pick: k distinct sorted numbers within 1..n', async () => {
  for (const [k, n] of [[6, 45], [6, 55], [5, 35], [1, 12], [10, 80]]) {
    for (let a = 0; a < 20; a++) {
      const r = await core.pick(seed, 1, a, k, n);
      assert.equal(r.length, k);
      assert.equal(new Set(r).size, k);
      assert.deepEqual(r, [...r].sort((x, y) => x - y));
      assert.ok(r.every(v => Number.isInteger(v) && v >= 1 && v <= n));
    }
  }
});

test('pick: deterministic per (seed, domain, attempt); differs across them', async () => {
  const a = await core.pick(seed, 1, 0, 6, 45);
  assert.deepEqual(await core.pick(seed, 1, 0, 6, 45), a);
  assert.notDeepEqual(await core.pick(seed, 1, 1, 6, 45), a);
  assert.notDeepEqual(await core.pick(seed, 2, 0, 6, 45), a);
});

test('pick: k === n returns full range', async () => {
  assert.deepEqual(await core.pick(seed, 1, 0, 6, 6), [1, 2, 3, 4, 5, 6]);
});

test('roll: k values 1..n, repeats allowed, deterministic', async () => {
  const r = await core.roll(seed, 4, 300, 6);
  assert.equal(r.length, 300);
  assert.ok(r.every(v => v >= 1 && v <= 6));
  assert.ok(new Set(r).size === 6, 'all faces should appear in 300 rolls');
  assert.deepEqual(await core.roll(seed, 4, 300, 6), r);
});

test('roll: roughly uniform (chi-square, 6 faces, 6000 rolls)', async () => {
  const r = await core.roll(seed, 4, 6000, 6);
  const cnt = Array(6).fill(0); r.forEach(v => cnt[v - 1]++);
  const chi = cnt.reduce((s, c) => s + (c - 1000) ** 2 / 1000, 0);
  assert.ok(chi < 20.5, `chi2=${chi} (df=5, p≈0.001 cutoff 20.5)`); // fixed seed → deterministic
});

test('pick: roughly uniform over 1..45 (chi-square, 2000 tickets)', async () => {
  const cnt = Array(45).fill(0);
  for (let a = 0; a < 2000; a++) (await core.pick(seed, 1, a, 6, 45)).forEach(v => cnt[v - 1]++);
  const e = 2000 * 6 / 45;
  const chi = cnt.reduce((s, c) => s + (c - e) ** 2 / e, 0);
  assert.ok(chi < 80, `chi2=${chi} (df=44, p≈0.001 cutoff ~78.7)`);
});

test('C: known binomial coefficients', () => {
  assert.equal(Math.round(core.C(45, 6)), 8145060);
  assert.equal(Math.round(core.C(55, 6)), 28989675);
  assert.equal(Math.round(core.C(35, 5)), 324632);
  assert.equal(Math.round(core.C(80, 20)), 3535316142212174320);
  assert.equal(core.C(10, 0), 1);
});

test('GAMES: odds strings contain correct numbers', () => {
  const digits = s => s.replace(/\D/g, '');
  assert.ok(digits(core.GAMES['645'].odds()).includes('8145060'));
  assert.ok(digits(core.GAMES['655'].odds()).includes('28989675'));
  assert.ok(digits(core.GAMES['535'].odds()).includes('3895584')); // 324632 * 12
  // Keno 10/10 with 20 of 80 drawn: C(80,20)/C(70,10) ≈ 8,911,711
  assert.ok(digits(core.GAMES.keno.odds()).includes('8911711'));
});
