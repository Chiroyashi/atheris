import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../store.js';

const newStore = () => createStore(join(mkdtempSync(join(tmpdir(), 'aetheris-')), 'data.json'));

test('grantCatalog mencatat role katalog supaya /myrole remove kenal', () => {
  const store = newStore();
  const rec = store.grantCatalog({ guildId: 'g1', userId: 'u1', name: '⚔️ Dungeon Knight (PvE/Hunter)', roleId: 'r1' });
  assert.equal(rec.status, 'granted');
  assert.equal(store.grantedRoles('u1', 'g1').length, 1);
  assert.equal(store.grantedRoles('u1', 'g2').length, 0, 'terisolasi per guild');
  assert.equal(store.grantedRoles('u2', 'g1').length, 0, 'terisolasi per user');
});

test('grantCatalog anti-dup: roleId granted tidak dicatat dua kali', () => {
  const store = newStore();
  const first = store.grantCatalog({ guildId: 'g1', userId: 'u1', name: 'A', roleId: 'r1' });
  const dup = store.grantCatalog({ guildId: 'g1', userId: 'u1', name: 'A', roleId: 'r1' });
  assert.equal(dup.id, first.id, 'balikin record lama');
  assert.equal(store.grantedRoles('u1', 'g1').length, 1);
});

test('release menandai removed, lalu grantCatalog boleh mencatat lagi', () => {
  const store = newStore();
  store.grantCatalog({ guildId: 'g1', userId: 'u1', name: '⛏️ Vein Delver (Miner)', roleId: 'r1' });
  const n = store.release(['⛏️ Vein Delver (Miner)'], 'u1', 'g1');
  assert.equal(n, 1);
  assert.equal(store.grantedRoles('u1', 'g1').length, 0);
  // record lama tidak ikut dihapus, /myrole list tetap menampilkan riwayat
  assert.equal(store.byUser('u1', 'g1')[0].status, 'removed');
  // role dipasang ulang -> record granted baru
  const again = store.grantCatalog({ guildId: 'g1', userId: 'u1', name: '⛏️ Vein Delver (Miner)', roleId: 'r1' });
  assert.notEqual(again.status, undefined);
  assert.equal(store.grantedRoles('u1', 'g1').length, 1);
});

test('release case-insensitive dan tidak menyentuh user/guild lain', () => {
  const store = newStore();
  store.grantCatalog({ guildId: 'g1', userId: 'u1', name: '  Guild A  ', roleId: 'r1' });
  store.grantCatalog({ guildId: 'g1', userId: 'u2', name: 'Guild A', roleId: 'r2' });
  store.grantCatalog({ guildId: 'g2', userId: 'u1', name: 'Guild A', roleId: 'r3' });
  const n = store.release(['guild a'], 'u1', 'g1');
  assert.equal(n, 1, 'hanya record u1@g1 yang dilepas');
  assert.equal(store.grantedRoles('u1', 'g1').length, 0);
  assert.equal(store.grantedRoles('u2', 'g1').length, 1, 'user lain aman');
  assert.equal(store.grantedRoles('u1', 'g2').length, 1, 'guild lain aman');
});
