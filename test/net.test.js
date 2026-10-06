import { test } from 'node:test';
import assert from 'node:assert/strict';
import { first } from '../net.js';

const boom = (code, message = 'boom') => Object.assign(new Error(message), { code });

test('first mengembalikan hasil percobaan yang berhasil', async () => {
  let n = 0;
  const out = await first(async () => {
    if (++n < 3) throw boom(500);
    return 'ok';
  }, { backoffMs: 0 });
  assert.equal(out, 'ok');
  assert.equal(n, 3, 'dua kali gagal lalu lulus');
});

test('first tidak retry error token mati (10062)', async () => {
  let n = 0;
  await assert.rejects(
    first(async () => { n++; throw boom(10062, 'Unknown interaction'); }, { backoffMs: 0 }),
    /Unknown interaction/,
  );
  assert.equal(n, 1, '10062 di-throw langsung, tanpa percobaan kedua');
});

test('first menyerah begitu jendela 3 detik habis', async () => {
  let n = 0;
  await assert.rejects(
    first(async () => { n++; throw boom(0, 'connect timeout'); }, { budgetMs: 0, backoffMs: 0 }),
    /connect timeout/,
  );
  assert.equal(n, 1, 'tidak ada sisa waktu -> tidak ada retry');
});

test('first meneruskan error asli apa adanya kalau gagal terus', async () => {
  await assert.rejects(
    first(async () => { throw boom(0, 'dns gagal'); }, { budgetMs: 0, backoffMs: 0 }),
    (err) => err.message === 'dns gagal' && err.code === 0,
  );
});
