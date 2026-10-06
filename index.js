import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ActionRowBuilder,
  ApplicationCommandOptionType as Opt,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  REST,
  Routes,
  StringSelectMenuBuilder,
} from 'discord.js';
import { CATALOG, CATALOG_PICK_ID, navId, nextPage, pageFromId, planToggle } from './roles.js';
import { first, sleep } from './net.js';
import { createStore } from './store.js';
import { encounterText, findByName, getDetail, list, loadCatalog, monsterView, pickRandom, spellView } from './dnd.js';

const {
  DISCORD_TOKEN: TOKEN,
  DISCORD_GUILD_ID: GUILD_ID,
  RULES_ROLES_CHANNEL_ID: RULES_CHANNEL_ID,
} = process.env;
for (const key of ['DISCORD_TOKEN', 'DISCORD_GUILD_ID', 'RULES_ROLES_CHANNEL_ID']) {
  if (!process.env[key]) {
    console.error(`[fatal] ${key} belum diisi di .env (lihat .env.example)`);
    process.exit(1);
  }
}

const DATA_FILE = process.env.DATA_FILE ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'data.json');
const PORT = Number(process.env.PORT ?? 3000);
const store = createStore(DATA_FILE);
const EPHEMERAL = { flags: MessageFlags.Ephemeral };
// Deadline balasan Discord cuma 3 detik. Handler yang kerja jaringan dulu WAJIB defer
// di awal (lihat `slow()`), karena setelah token mati Discord balas 10062 Unknown interaction.
// Chat command defer ephemeral reply; button & select defer update pesan katalog together.
// Semua respons pertama dibungkus `first()` — connect ke discord.com dari sini kadang
// nge-hang 10 detik, dan satu percobaan yang menggantung = "The application did not respond".
const slow = (i) => (i.isChatInputCommand()
  ? first(() => i.deferReply(EPHEMERAL), { label: 'deferReply' })
  : first(() => i.deferUpdate(), { label: 'deferUpdate' }));
// Kalau sudah di-defer, Balas harus lewat editReply; kalau belum, reply biasa.
const say = async (i, payload) => {
  const body = typeof payload === 'string' ? { content: payload } : payload;
  if (i.deferred || i.replied) return i.editReply(body);
  return first(() => i.reply({ ...body, ...EPHEMERAL }), { label: 'reply' });
};
// Setelah i.update() interaction sudah `replied` -> i.reply() melempar InteractionAlreadyReplied.
const notify = (i, content) => retry('followUp', () => i.followUp({ content, ...EPHEMERAL }));

const COMMANDS = [
  {
    name: 'myrole',
    description: 'Role milikmu sendiri dari katalog Aetheris',
    options: [
      { name: 'list', description: 'Role milikmu', type: Opt.Subcommand, options: [] },
      {
        name: 'remove',
        description: 'Lepas role yang diambil dari katalog Aetheris',
        type: Opt.Subcommand,
        options: [{ name: 'role', description: 'Role yang mau dilepas', type: Opt.Role, required: true }],
      },
    ],
  },
  { name: 'storyaetheris', description: 'Kisah Aetheris, sang Fallen Shield', options: [] },
  {
    name: 'monster',
    description: 'Kartu monster dari D&D 5e SRD (acak kalau nama dikosongkan)',
    options: [{ name: 'nama', description: 'Nama monster, contoh: aboleth', type: Opt.String, required: false }],
  },
  {
    name: 'spell',
    description: 'Kartu spell dari D&D 5e SRD (acak kalau nama dikosongkan)',
    options: [{ name: 'nama', description: 'Nama spell, contoh: fireball', type: Opt.String, required: false }],
  },
  { name: 'encounter', description: 'Susun encounter dari 3 monster acak', options: [] },
];

const STORY = `**Aetheris** adalah ksatria sejati penakluk Ender Dragon di The End Void. Kemenangan agungnya berubah menjadi tragedi saat ia dikhianati bangsawan rival: rumahnya dijarah, istrinya dibunuh, dan gelarnya dicuri demi politik. Dibiarkan tewas, sisa energi kehampaan membangkitkannya kembali sebagai *"The Fallen Shield"*, ksatria bayangan yang kini meminta entitas baru \`player\` untuk kembalikan dunianya.`;

// Satu halaman = satu role. Select di baris atas, tombol next/previous di baris bawah
// (select harus sendirian satu baris).
function catalogPage(idx) {
  const c = CATALOG[idx];
  return new EmbedBuilder()
    .setTitle(c.full)
    .setColor(0xffffff)
    .addFields({ name: 'Lore', value: c.lore }, { name: '↳ Tugas', value: c.duty })
    .setFooter({ text: `Aetheris • ${idx + 1}/${CATALOG.length} • pilih role dari select di bawah` });
}

function catalogRows(idx) {
  const select = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(CATALOG_PICK_ID)
      .setPlaceholder(`Pilih role… (${idx + 1}/${CATALOG.length})`)
      .addOptions(CATALOG.map((c) => ({ label: c.discord, description: c.duty, value: c.discord }))),
  );
  const arrow = (dir, label, emoji) => new ButtonBuilder()
    .setCustomId(navId(dir, idx))
    .setLabel(label)
    .setStyle(ButtonStyle.Secondary)
    .setEmoji(emoji)
    .setDisabled(nextPage(idx, dir) === null);
  const nav = new ActionRowBuilder().addComponents(
    arrow(-1, 'Sebelumnya', '⬅️'),
    arrow(1, 'Berikutnya', '➡️'),
  );
  return [select, nav];
}

const catalogPayload = (idx) => ({ embeds: [catalogPage(idx)], components: catalogRows(idx) });

// Pesan panduan: menjelaskan buat apa role katalog dan buat apa /myrole remove,
// gaya cerita ringan tapi tetap jelas buat player baru.
function infoPayload() {
  const embed = new EmbedBuilder()
    .setTitle('📜 Panduan Katalog Role')
    .setColor(0x8b9dc3)
    .addFields(
      {
        name: 'Role di sini untuk apa?',
        value: 'Setiap role adalah **gelar kehormatan** yang menempel di namamu di daftar member (tampil menonjol, warna terang) — penanda peran yang kamu pilih sendiri: Builder, Miner, Farmer, dan lainnya. Pilih lewat select di bawah; **maksimal 1 gelar** — ambil yang baru, yang lama otomatis terlepas. Gelar ini terbuka: pemain lain boleh memakai gelar yang sama.',
      },
      {
        name: '`/myrole remove` untuk apa?',
        value: 'Untuk **melepas gelar dari dirimu sendiri** — meletakkan titel kembali ke rak, tanpa merusak milik orang lain. Role tidak dihapus dari server; pemain lain tetap memilikinya, dan kamu bisa mengambilnya lagi kapan saja.',
      },
    )
    .setFooter({ text: 'Aetheris • panduan' });
  return { embeds: [embed] };
}

// Kontrak role yang dibuat bot: hoist, tanpa permission, posisi 1 (tepat di atas
// @everyone). Posisi bawah supaya admin kecil mana pun (role di atas posisi 1)
// bisa menghapus/mengubah role ini — bukan cuma owner. Role tetap di bawah role
// bot, jadi bot masih bisa memberi/melepasnya.
async function createGuildRole(guild, name) {
  const role = await guild.roles.create({
    name,
    colors: { primaryColor: 0xffffff },
    hoist: true,
    permissions: 0n,
    mentionable: false,
    position: 1,
  });
  if (role.position > 1) {
    console.warn(`[warn] role "${name}" berada di position ${role.position}, bukan 1 — admin kecil mungkin tidak bisa menghapusnya. Cek posisi role bot di Server Settings → Roles.`);
  }
  return role;
}

const findRole = (guild, name) => guild.roles.cache.find((r) => r.name === name);

// Sekali kirim, start berikutnya edit-in-place — restart tidak spam. ID tidak disimpan
// di data.json (di Render file ini hilang tiap restart -> ID ikut hilang -> tiap deploy
// kirim pesan baru yang duplikat); pesan lama dicari lewat footer marker, jadi punya
// dari run sebelumnya pun ketemu & ke-edit. Ini pesan utama bot di channel: sekali
// gagal = channel kosong sampai restart, jadi percobaannya banyak.
async function publishOnce(chan, payload, isTarget) {
  const msgs = await chan.messages.fetch({ limit: 25 });
  const existing = msgs.find((m) => m.author.id === client.user.id && isTarget(m.embeds[0]?.footer?.text ?? ''));
  if (existing) return void (await existing.edit(payload));
  await chan.send(payload);
}

// Kedua pesan dikelola bot memakai awalan footer yang sama; panduan dibedakan suffix-nya.
const isKatalog = (t) => t.startsWith('Aetheris •') && !t.startsWith('Aetheris • panduan');
const isPanduan = (t) => t.startsWith('Aetheris • panduan');

const publishCatalog = (chan) => retry('publish katalog', () => publishOnce(chan, catalogPayload(0), isKatalog), 10);

// Select = ambil/lepas role, sekalian geser halaman ke role itu. Karena `slow()` di sini
// deferUpdate, `say()` akan menimpa pesan katalog dengan teks — makanya konfirmasinya
// lewat `notify()` (followUp ephemeral) dan `editReply()` cuma buat konten komponen.
async function pickCatalogRole(i) {
  const member = i.member;
  await slow(i);

  const held = CATALOG
    .map((c) => findRole(i.guild, c.discord))
    .filter((r) => r && member.roles.cache.has(r.id))
    .map((r) => r.name);

  const plan = planToggle(held, i.values[0]);
  if (!plan) return notify(i, 'Role itu tidak ada di daftar.');

  if (plan.remove.length) {
    await member.roles.remove(plan.remove.map((n) => findRole(i.guild, n)).filter(Boolean));
    store.release(plan.remove, i.user.id, i.guildId);
  }

  const entry = CATALOG.find((c) => c.discord === i.values[0]);
  const page = catalogPayload(CATALOG.indexOf(entry));
  const show = () => retry('edit katalog', () => i.editReply(page));
  if (!plan.add) {
    await show();
    return notify(i, `Role **${entry.full}** dilepas.`);
  }

  const role = findRole(i.guild, entry.discord) ?? await createGuildRole(i.guild, entry.discord);
  await member.roles.add(role, `${i.user.tag} ambil dari katalog rules-roles`);
  store.grantCatalog({ guildId: i.guildId, userId: i.user.id, name: entry.discord, roleId: role.id });
  const swap = plan.remove.length
    ? `\nRole ${plan.remove.map((n) => `**${n}**`).join(', ')} otomatis dilepas.`
    : '';
  await show();
  return notify(i, `Role **${entry.full}** sekarang menempel di server.${swap}\n*Maksimal 1 role — pilih role lain untuk berganti.*`);
}

// Tombol next/previous: satu panggilan `update`, nggak ada handler yang kerja jaringan.
// `update()` ini adalah respons pertama, jadi tetap dibungkus `first()`.
async function turnPage(i) {
  const idx = pageFromId(i.customId);
  if (idx === null) return;
  await first(() => i.update(catalogPayload(idx)), { label: 'page update' });
}

// Timeout 15 detik bawaan @discordjs/rest jauh melebihi deadline 3 detik, dan `retries: 3`
// miliknya cuma mengulang AbortError/ECONNRESET — bukan ConnectTimeoutError yang sering
// kena di sini. Dipotong jadi 2 detik + retries 0 supaya error-nya muncul sebelum jendela
// 3 detik habis, lalu `first()` yang mengulang dengan sisa waktu yang ada.
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  rest: { timeout: 2000, retries: 0 },
});

async function retry(label, fn, tries = 5) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= tries) throw err;
      console.warn(`[retry] ${label} gagal (${attempt}/${tries}), ulang ${attempt * 2}s: ${err.message}`);
      await sleep(attempt * 2000);
    }
  }
}

client.once(Events.ClientReady, async (c) => {
  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    const body = COMMANDS.map((cmd) => ({
      ...cmd,
      options: cmd.options.map((o) => ({ ...o, options: o.options ?? [] })),
    }));
    const registered = await retry('deploy command', () =>
      rest.put(Routes.applicationGuildCommands(c.user.id, GUILD_ID), { body }));
    console.log(`[deploy] ${registered.length} command terdaftar di guild ${GUILD_ID}`);
  } catch (err) {
    console.error(`[deploy GAGAL] command tidak terdaftar: ${err.message}`);
  }

  // Identitas global: tampilan bot di Discord harus "Atheris". Dicek dulu supaya tidak
  // nembak API tiap restart; gagal = log saja, restart tidak boleh batal karena kosmetik.
  try {
    if (c.user.globalName !== 'Atheris') {
      await c.user.setGlobalName('Atheris');
      console.log('[identity] display name -> Atheris');
    }
  } catch (err) {
    console.warn(`[identity] gagal set display name: ${err.message}`);
  }

  // Katalog D&D dimuat di background: kalau API-nya mati, role bot tetap harus jalan.
  loadCatalog()
    .then(() => console.log(`[dnd] katalog siap: ${list('monsters').length} monster, ${list('spells').length} spell`))
    .catch((err) => console.warn(`[dnd] gagal muat katalog: ${err.message}`));

  for (const guild of c.guilds.cache.values()) {
    // v14: `guild.me` tidak ada -> pakai `guild.members.me`. Tanpa ini ceknya diam-diam dilewati.
    const me = guild.members.me?.roles.highest;
    if (!me) continue;
    // Role dibuat di posisi 1, jadi role bot cuma perlu berada di atas posisi 1
    // supaya bot masih bisa memberi/melepas role ke member.
    if (me.position <= 1) {
      console.warn(`[warn] guild "${guild.name}": role bot "${me.name}" ada di posisi terendah — role baru tidak akan bisa diberikan ke member.`);
    }

    // Seragamkan gelar role bot: "Knight Aetheris" -> "Knight Atheris". Nama lain tidak
    // disentuh (bisa saja admin ganti nama role sendiri).
    if (me.name === 'Knight Aetheris') {
      try {
        await me.setName('Knight Atheris');
        console.log(`[identity] role bot "${guild.name}" -> Knight Atheris`);
      } catch (err) {
        console.warn(`[identity] gagal rename role: ${err.message}`);
      }
    } else if (me.name !== 'Knight Atheris') {
      console.warn(`[identity] role tertinggi "${me.name}" bukan varian Knight Aetheris/Atheris — tidak disentuh.`);
    }

    // rest.retries:0 mematikan retry bawaan @discordjs/rest, jadi di titik yang tidak
    // punya deadline 3 detik (startup, dan edit setelah interact) retry kita sendiri.
    const chan = await retry('fetch rules-roles', () => guild.channels.fetch(RULES_CHANNEL_ID))
      .catch(() => null);
    if (chan) {
      // Panduan dipublish duluan biar muncul di atas katalog — urutan hanya dijamin
      // saat pesan baru dibuat; kalau udah ada, masing-masing tetap di tempatnya.
      await retry('publish panduan', () => publishOnce(chan, infoPayload(), isPanduan), 10)
        .catch((err) => console.error(`[panduan GAGAL] ${err.message}`));
      await publishCatalog(chan).catch((err) => console.error(`[catalog GAGAL] ${err.message}`));
    } else console.warn(`[warn] channel rules-roles "${RULES_CHANNEL_ID}" tidak bisa diakses bot.`);
  }
  console.log(`[ready] Aetheris online sebagai ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (i) => {
  try {
    if (i.isChatInputCommand()) {
      if (!i.guild) return say(i, 'Perintah ini hanya bisa dipakai di dalam server.');
      if (i.commandName === 'storyaetheris') return tellStory(i);
      if (i.commandName === 'monster') return await showMonster(i);
      if (i.commandName === 'spell') return await showSpell(i);
      if (i.commandName === 'encounter') return await showEncounter(i);
      const sub = i.options.getSubcommand();
      if (sub === 'list') return await listRoles(i);
      if (sub === 'remove') return await removeRole(i);
    } else if (i.isStringSelectMenu() && i.customId === CATALOG_PICK_ID) {
      await pickCatalogRole(i);
    } else if (i.isButton() && i.customId.startsWith('rr:')) {
      await turnPage(i);
    }
  } catch (err) {
    console.error('[error]', err);
    const msg = err.code === 50013
      ? 'Role bot tidak bisa dipakai di sini. Pindahkan role bot **ke atas** role yang dibuat (Server Settings → Roles).'
      : 'Terjadi error di sisi bot. Cek log server.';
    // `notify` untuk interaksi katalog (sudah deferUpdate -> editReply akan menimpa pesan
    // katalog dengan teks), `say` untuk chat command. Dua-duanya penting:
    // `i.reply()` di sini lempar InteractionAlreadyReplied dan .catch()-nya menelan error,
    // jadi user cuma lihat "thinking..." selamanya.
    if (i.isRepliable()) await (i.isChatInputCommand() ? say(i, msg) : notify(i, msg)).catch(() => {});
  }
});

function tellStory(i) {
  return i.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle('⚔️ Aetheris — The Fallen Shield')
        .setDescription(STORY)
        .setColor(0x8b9dc3)
        .setFooter({ text: 'The End Void • kisahnya belum selesai' }),
    ],
  });
}

function dndEmbed(view) {
  const embed = new EmbedBuilder().setTitle(view.title).setColor(view.color);
  for (const [name, value] of view.fields) embed.addFields({ name, value, inline: true });
  if (view.text) embed.setDescription(view.text);
  return embed.setFooter({ text: 'D&D 5e SRD • dnd5eapi.co' });
}

async function showMonster(i) {
  const items = list('monsters');
  if (!items.length) return say(i, 'Katalog monster belum siap. Coba lagi sebentar.');

  const q = i.options.getString('nama');
  const entry = q ? findByName(items, q) : pickRandom(items);
  if (!entry) return say(i, `Monster **${q}** nggak ada di SRD. Kosongkan untuk dapat yang acak.`);

  await slow(i);
  await say(i, { embeds: [dndEmbed(monsterView(await getDetail(entry.url)))] });
}

async function showSpell(i) {
  const items = list('spells');
  if (!items.length) return say(i, 'Katalog spell belum siap. Coba lagi sebentar.');

  const q = i.options.getString('nama');
  const entry = q ? findByName(items, q) : pickRandom(items);
  if (!entry) return say(i, `Spell **${q}** nggak ada di SRD. Kosongkan untuk dapat yang acak.`);

  await slow(i);
  await say(i, { embeds: [dndEmbed(spellView(await getDetail(entry.url)))] });
}

async function showEncounter(i) {
  const items = list('monsters');
  if (!items.length) return say(i, 'Katalog monster belum siap. Coba lagi sebentar.');

  const picks = new Set();
  while (picks.size < 3 && picks.size < items.length) picks.add(pickRandom(items));
  await slow(i);
  const mobs = await Promise.all([...picks].map((p) => getDetail(p.url)));
  await say(i, {
    embeds: [
      new EmbedBuilder()
        .setTitle('⚔️ Encounter')
        .setDescription(encounterText(mobs))
        .setColor(0x8b9dc3)
        .setFooter({ text: 'D&D 5e SRD • dnd5eapi.co' }),
    ],
  });
}

async function listRoles(i) {
  const mine = store.byUser(i.user.id, i.guildId);
  const lines = [];
  if (mine.length === 0) return say(i, 'Kamu belum pernah ambil role dari Aetheris. Pilih role dari katalog di channel rules-roles.');

  for (const r of mine.slice(-10).reverse()) {
    const icon = r.status === 'granted' ? r.name : `⏳ ${r.name}`;
    lines.push(`${icon} — ${r.status}`);
  }
  await say(i, `**Riwayat role kamu:**\n${lines.join('\n')}`);
}

async function removeRole(i) {
  const role = i.options.getRole('role');
  const owned = store.grantedRoles(i.user.id, i.guildId).find((r) => r.roleId === role.id);
  // Role katalog juga boleh dilepas walau tidak ada record (dipilih sebelum
  // grantCatalog ada) — cukup namanya memang dari katalog Aetheris.
  const fromCatalog = CATALOG.some((c) => c.discord === role.name);
  if (!owned && !fromCatalog) return say(i, 'Role itu bukan dibuat lewat Aetheris, jadi aku tidak bisa melepaskannya.');

  // members.fetch + roles.remove = 2 request berturut-turut; tanpa defer ini lewat 3 detik.
  await slow(i);
  const member = await i.guild.members.fetch(i.user.id);
  if (!member.roles.cache.has(role.id)) return say(i, `Kamu tidak punya role **${role.name}**.`);

  await member.roles.remove(role);
  if (owned) store.update(owned.id, { status: 'removed', removedAt: Date.now() });
  await say(i, `Role **${role.name}** dilepas.`);
}

http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('ok');
}).listen(PORT, () => console.log(`[http] http://localhost:${PORT} (untuk UptimeRobot)`));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    store.flush();
    console.log(`\n[exit] ${sig} — data tersimpan`);
    process.exit(0);
  });
}

// Bot ini jalan sendirian. Tanpa guard, satu promise yang lepas liar = proses mati diam-diam.
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));

// 20 percobaan dengan jeda 2-40 detik = menahan outage sekitar 7 menit. Default 5 hanya
// bertahan ~20 detik, lalu `process.exit(1)` mematikan bot permanen padahal penyebabnya
// cuma jaringan — token-nya masih valid.
retry('login', () => client.login(TOKEN), 20).catch((err) => {
  console.error(`[fatal] gagal login: ${err.message}`);
  process.exit(1);
});
