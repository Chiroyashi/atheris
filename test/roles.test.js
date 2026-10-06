import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, CATALOG_PICK_ID, LIMIT, navId, nextPage, pageFromId, planToggle } from '../roles.js';

// Discord menolak SEBUTUH select kalau satu opsi invalid, jadi batasnya dijaga di sini.
test('CATALOG(): nama role, deskripsi opsi, dan field embed dalam batas Discord', () => {
  for (const c of CATALOG) {
    assert.ok(c.discord.length <= LIMIT.ROLE_NAME, `nama role >${LIMIT.ROLE_NAME}: ${c.discord} (${c.discord.length})`);
    assert.ok(c.duty.length <= LIMIT.OPTION_DESC, `deskripsi opsi >${LIMIT.OPTION_DESC}: ${c.discord}`);
    assert.ok(c.lore.length <= LIMIT.FIELD_VALUE, `lore >${LIMIT.FIELD_VALUE}: ${c.discord}`);
    assert.ok(c.discord.length <= 100, `label opsi >100: ${c.discord}`);
    assert.ok(!c.discord.includes('|'), `nama role mengandung |: ${c.discord}`);
  }
});

test('CATALOG(): nilai select unik dan muat dalam 25 opsi', () => {
  const values = CATALOG.map((c) => c.discord);
  assert.equal(new Set(values).size, values.length, 'nama role duplikat');
  assert.ok(values.length <= 25, `${values.length} opsi > 25`);
});

test('CATALOG(): embed muat 25 field (2 field per role)', () => {
  const fields = CATALOG.length * 2;
  assert.ok(fields <= 25, `${fields} field > 25`);
});

// Semua role katalog setara (tanpa kategori): pilih role yang sama -> lepas, pilih role
// lain -> yang lama dilepas dan yang baru dipasang.
test('planToggle melepas role yang sama (toggle)', () => {
  const a = CATALOG[0].discord;
  assert.deepEqual(planToggle([a], a), { remove: [a], add: null, swap: false });
});

test('planToggle mengganti role lama dengan role baru', () => {
  const [a, b] = CATALOG.slice(0, 2).map((c) => c.discord);
  const plan = planToggle([a], b);
  assert.deepEqual(plan.remove, [a]);
  assert.equal(plan.add, b);
  assert.equal(plan.swap, true);
});

test('planToggle melepas semua role lama walau user pegang beberapa', () => {
  const held = CATALOG.slice(0, 3).map((c) => c.discord);
  const plan = planToggle(held, CATALOG[5].discord);
  assert.deepEqual(plan.remove, held, 'semua role lama dilepas, bukan cuma satu');
  assert.equal(plan.add, CATALOG[5].discord);
});

test('planToggle menolak nilai di luar katalog', () => {
  assert.equal(planToggle([], 'Role Palsu'), null);
});

// Halaman katalog 1-per-role; index di-mentok/di-disable, tapi tetap dicek di sini biar
// customId yang basi nggak pernah menulis halaman di luar jangkauan.
test('nextPage gerak satu halaman dan null di ujung', () => {
  const last = CATALOG.length - 1;
  assert.equal(nextPage(0, 1), 1);
  assert.equal(nextPage(last, -1), last - 1);
  assert.equal(nextPage(0, -1), null, 'mentok di halaman pertama');
  assert.equal(nextPage(last, 1), null, 'mentok di halaman terakhir');
  assert.equal(nextPage(0, 0), 0, 'klik ulang halaman yang sama tidak apa-apa');
  assert.equal(nextPage(99, 1), null, 'index rusak tidak crash');
  assert.equal(nextPage('x', 1), null);
});

// customId tombol harus balik ke index yang benar untuk semua halaman & arah, dan
// customId lain (mis. tombol lama `ath:ok:...`) harus ditolak.
test('pageFromId membalik navId untuk semua halaman', () => {
  const last = CATALOG.length - 1;
  for (let i = 0; i <= last; i++) {
    assert.equal(pageFromId(navId(1, i)), i < last ? i + 1 : null, `next dari ${i}`);
    assert.equal(pageFromId(navId(-1, i)), i > 0 ? i - 1 : null, `prev dari ${i}`);
  }
  assert.equal(pageFromId(CATALOG_PICK_ID), null, 'select bukan navigasi');
  assert.equal(pageFromId('ath:ok:44d74dbb'), null, 'customId asing bukan navigasi');
  assert.equal(pageFromId('rr:next'), null, 'customId kepotong');
});
