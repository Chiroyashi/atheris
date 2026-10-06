// Logika murni (tanpa discord.js) supaya bisa diuji tanpa koneksi ke Discord.

// Katalog role untuk channel rules-roles. Semua role setara: tidak ada kategori, user
// hanya boleh punya 1. `discord` WAJIB <=32 unit (batas nama role Discord) dan harus
// unik; sisanya hanya untuk tampilan dan sudah dijaga batasnya oleh test.
export const CATALOG = [
  {
    full: '🏰 Grand Architect (Builder)',
    discord: '🏰 Grand Architect',
    lore: 'Maestro pemahat batu dan perancang struktur agung. Mengubah tanah liar yang tandus menjadi benteng megah, pemukiman terikat sihir, dan menara-menara pencakar langit yang mengintimidasi kegelapan.',
    duty: 'Fokus merancang dan membangun fasilitas serta mahakarya arsitektur server.',
  },
  {
    full: '⚙️ Arcane Redstoneer (Redstone Specialist)',
    discord: '⚙️ Arcane Redstoneer',
    lore: 'Peneliti rahasia Batu Merah—sisa-sisa urat sihir bumi yang mengalirkan energi tak terlihat. Mampu merancang sistem mekanis rumit, pintu rahasia, hingga mesin otomatis penopang kerajaan.',
    duty: 'Mengembangkan sistem mekanis, farm otomatis, dan kontrapsi redstone.',
  },
  {
    full: '🔨 Master Forger (Crafter & Blacksmith)',
    discord: '🔨 Master Forger (Smith)',
    lore: 'Penguasa tungku dan landasan tempa. Menempa bijih-bijih langka dari perut bumi menjadi zirah pelindung tangguh dan senjata tajam yang sanggup membelah bayang-bayang.',
    duty: 'Menyediakan perlatan, senjata, dan zirah terbaik bagi para petarung.',
  },
  {
    full: '⛏️ Vein Delver (Miner)',
    discord: '⛏️ Vein Delver (Miner)',
    lore: 'Penjelajah kedalaman gaib yang tidak takut pada kegelapan lorong bawah tanah. Berteman dengan batu bisu demi mengumpulkan permata dan logam berharga penyokong ekonomi Luminaea.',
    duty: 'Menambang pasokan material langka dan mengandalkan ketahanan di kedalaman tanah.',
  },
  {
    full: '🌾 Sylvan Harvester (Farmer & Herbalist)',
    discord: '🌾 Sylvan Harvester (Farmer)',
    lore: 'Penjaga kelestarian padang rumput dan ladang berkabut. Memahami rahasia tanah purba untuk menghasilkan bahan pangan melimpah serta tanaman herbal pemulih stamina para pengembara.',
    duty: 'Mengelola ketahanan pangan, bahan baku masakan, dan suplai bahan pembuat ramuan.',
  },
  {
    full: '⚔️ Dungeon Knight (PvE Specialist / Mob Hunter)',
    discord: '⚔️ Dungeon Knight (PvE/Hunter)',
    lore: 'Pelindung garis depan yang menantang binatang buas dan monster legendaris di sarang-sarang terkelam Luminaea. Senjatanya tak pernah haus darah, melainkan haus akan keadilan.',
    duty: 'Menguasai pertarungan melawan boss, penjelajah dungeon, dan pemburu material monster.',
  },
  {
    full: '🛡️ Arena Champion (PvP Specialist)',
    discord: '🛡️ Arena Champion (PvP)',
    lore: 'Ksatria bertangan dingin yang mengasah ketajaman pedang melalui duellist sejati. Menjadikan arena pertempuran sebagai panggung untuk menguji keahlian dan kehormatan.',
    duty: 'Mendominasi pertempuran antarpemain, kompetisi arena, dan perang antar-faksi/guild.',
  },
  {
    full: '🧭 Realm Cartographer (Explorer & Scout)',
    discord: '🧭 Realm Cartographer (Scout)',
    lore: 'Penembus kabut yang melangkah tanpa ragu ke wilayah tak bertuan. Merekam setiap lekuk sungai, puncak pegunungan, dan reruntuhan kuno sebelum orang lain sempat menginjakkan kaki.',
    duty: 'Menjelajahi peta, menemukan lokasi baru, dan membagikan rute aman bagi tim.',
  },
  {
    full: '🧪 High Alchemist (Brewer & Potion Master)',
    discord: '🧪 High Alchemist (Brewer)',
    lore: 'Racik misteri dalam kuali tembaga. Memadukan bahan-bahan gaib dari seluruh alam untuk menciptakan ramuan peningkat kekuatan, penyembuh luka fatal, hingga racun pemungkas.',
    duty: 'Meracik ramuan penyokong pertempuran dan memberikan buff bagi pengembara lain.',
  },
];

// Batas Discord: nama role 32 unit, deskripsi opsi 100, nilai field embed 1024.
export const LIMIT = { ROLE_NAME: 32, OPTION_DESC: 100, FIELD_VALUE: 1024 };

// Semua role katalog setara: user boleh punya maksimal 1. Pilih role yang sama -> lepas
// (toggle). Pilih role lain -> yang lama dilepas, yang baru dipasang.
export function planToggle(held, picked) {
  if (!CATALOG.some((c) => c.discord === picked)) return null;
  if (held.includes(picked)) return { remove: [picked], add: null, swap: false };
  return { remove: held, add: picked, swap: held.length > 0 };
}

// Halaman katalog untuk tombol Next/Previous. Null kalau sudah mentok di ujung, jadi
// caller bisa diam-diam membatalkan (tombolnya juga di-disable, ini cuma pengaman).
export function nextPage(current, dir) {
  const idx = current + dir;
  return Number.isInteger(idx) && idx >= 0 && idx < CATALOG.length ? idx : null;
}

// Tombol next/previous membawa index halaman sekarang di dalam customId, jadi nggak ada
// state yang perlu disimpan dan tombol tetap benar setelah bot restart.
export const CATALOG_PICK_ID = 'rr:toggle';
export const navId = (dir, idx) => `rr:${dir > 0 ? 'next' : 'prev'}:${idx}`;

// Kebalikan dari `navId`: customId -> index halaman tujuan, null kalau bukan tombol
// navigasi atau mentok di ujung.
export function pageFromId(customId) {
  const [ns, dir, current] = String(customId).split(':');
  if (ns !== 'rr' || (dir !== 'next' && dir !== 'prev')) return null;
  return nextPage(Number(current), dir === 'next' ? 1 : -1);
}
