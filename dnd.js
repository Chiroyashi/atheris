// D&D 5e SRD via dnd5eapi.co — API terbuka, tanpa auth, cuma GET.
// Sama kayak roles.js: logika murni, tanpa discord.js, biar bisa diuji tanpa network.

const BASE = 'https://www.dnd5eapi.co/api/2014';

const catalog = { monsters: [], spells: [] };
const details = new Map();

export const EMBED_LIMIT = 4096;

export async function loadCatalog() {
  for (const kind of ['monsters', 'spells']) {
    const res = await fetch(`${BASE}/${kind}`);
    if (!res.ok) throw new Error(`${kind}: HTTP ${res.status}`);
    catalog[kind] = (await res.json()).results ?? [];
  }
  return catalog;
}

export function list(kind) {
  return catalog[kind] ?? [];
}

export function pickRandom(items) {
  return items.length ? items[Math.floor(Math.random() * items.length)] : null;
}

export function findByName(items, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return null;
  return items.find((e) => e.name.toLowerCase() === q) ?? null;
}

export async function getDetail(url) {
  if (!details.has(url)) {
    const res = await fetch(BASE + url.slice('/api/2014'.length));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    details.set(url, await res.json());
  }
  return details.get(url);
}

export function clip(text, limit = EMBED_LIMIT) {
  const t = String(text ?? '');
  return t.length <= limit ? t : `${t.slice(0, limit - 1)}…`;
}

// SRD kirim armor_class sebagai array [{ type: 'natural', value: 17 }] — bukan angka.
export function armorClass(m) {
  const ac = m.armor_class ?? [];
  return ac.find((a) => a.type === 'natural')?.value ?? ac[0]?.value ?? '—';
}

// API ini kirim skor mentah (strength: 21), bukan { mod }. Modifikasi = floor((skor-10)/2).
export function abilityMod(score) {
  const n = Number(score);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const mod = Math.floor((n - 10) / 2);
  return mod >= 0 ? `+${mod}` : String(mod);
}

// Warna sidebar ikut CR: makin berbahaya, makin merah.
export function crColor(cr) {
  const n = Number(cr) || 0;
  if (n >= 10) return 0x992d22;
  if (n >= 5) return 0xd35400;
  if (n >= 1) return 0xb7950b;
  return 0x7f8c8d;
}

// Monster tidak punya field `desc` di SRD API — flavor-nya dari nama action.
export function monsterView(m) {
  const acts = [...(m.actions ?? []), ...(m.legendary_actions ?? [])].map((a) => a.name).filter(Boolean);
  return {
    title: m.name,
    color: crColor(m.challenge_rating),
    fields: [
      ['Tipe', [m.size, m.type].filter(Boolean).join(' ') || '—'],
      ['Challenge Rating', String(m.challenge_rating ?? '—')],
      ['Armor Class', String(armorClass(m))],
      ['Hit Points', String(m.hit_points ?? '—')],
      ['STR', abilityMod(m.strength)],
      ['Speed', [m.speed?.walk, m.speed?.swim && `swim ${m.speed.swim}`].filter(Boolean).join(', ') || '—'],
    ],
    text: acts.length ? `**Aksi:** ${acts.join(', ')}` : '',
  };
}

export function spellView(s) {
  return {
    title: s.name,
    color: Number(s.level) >= 4 ? 0x8e44ad : 0x2980b9,
    fields: [
      ['Level', String(s.level ?? '—')],
      ['School', s.school?.name ?? '—'],
      ['Casting Time', Array.isArray(s.casting_time) ? s.casting_time.join(' / ') : String(s.casting_time ?? '—')],
      ['Duration', Array.isArray(s.duration) ? s.duration.join(' / ') : String(s.duration ?? '—')],
      ['Components', Array.isArray(s.components) ? s.components.join(', ') : String(s.components ?? '—')],
      ['Classes', (s.classes ?? []).map((c) => c.name).join(', ') || '—'],
    ],
    text: clip((s.desc ?? []).join('\n\n'), 1200),
  };
}

export function encounterText(monsters, gap = '\n\n') {
  return clip(
    monsters
      .map((m) => `**${m.name}** — CR ${m.challenge_rating}, AC ${armorClass(m)}, HP ${m.hit_points}`)
      .join(gap),
  );
}
