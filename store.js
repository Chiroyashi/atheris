import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// ponytail: satu file JSON, ditulis penuh tiap kali berubah (atomik via tmp+rename).
// Cukup untuk 1 guild & 1 proses. Naik ke SQLite kalau nanti multi-guild atau multi-proses.
export function createStore(file) {
  const data = { requests: [] };
  try {
    Object.assign(data, JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    // file belum ada / rusak -> mulai kosong
  }
  if (!Array.isArray(data.requests)) data.requests = [];

  let timer = null;

  function now() {
    clearTimeout(timer);
    timer = null;
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2));
    renameSync(tmp, file);
  }

  return {
    data,
    flush: now,
    save() {
      clearTimeout(timer);
      timer = setTimeout(now, 200);
    },
    get(id) {
      return data.requests.find((r) => r.id === id);
    },
    add(request) {
      data.requests.push(request);
      this.save();
      return request;
    },
    byUser(userId, guildId) {
      return data.requests.filter((r) => r.userId === userId && (!guildId || r.guildId === guildId));
    },
    grantedRoles(userId, guildId) {
      return data.requests.filter((r) => r.userId === userId && r.guildId === guildId && r.status === 'granted' && r.roleId);
    },
    update(id, patch) {
      const req = this.get(id);
      if (!req) return null;
      Object.assign(req, patch);
      this.save();
      return req;
    },
    // Catat role katalog yang baru dipasang ke member, supaya /myrole remove
    // kenal role itu. Anti-dup: roleId yang sudah granted tidak dicatat dua kali
    // (user toggle katalog bolak-balik).
    grantCatalog({ guildId, userId, name, roleId }) {
      const dup = data.requests.find(
        (r) => r.guildId === guildId && r.userId === userId && r.roleId === roleId && r.status === 'granted',
      );
      if (dup) return dup;
      return this.add({
        id: crypto.randomUUID().slice(0, 8),
        guildId,
        userId,
        name,
        reason: '',
        status: 'granted',
        roleId,
        createdAt: Date.now(),
      });
    },
    // Tandai record granted dengan nama role (case-insensitive) sebagai removed.
    // Dipakai saat role dilepas/ditukar lewat select katalog.
    release(names, userId, guildId) {
      const want = new Set(names.map((n) => String(n).trim().toLowerCase()));
      const hits = data.requests.filter(
        (r) => r.status === 'granted' && r.userId === userId && r.guildId === guildId
          && want.has(String(r.name).trim().toLowerCase()),
      );
      for (const r of hits) Object.assign(r, { status: 'removed', removedAt: Date.now() });
      if (hits.length) this.save();
      return hits.length;
    },
  };
}
