import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abilityMod, armorClass, clip, crColor, EMBED_LIMIT, encounterText, findByName, monsterView, spellView } from '../dnd.js';

// Data bentuk asli dari dnd5eapi.co (dicek live).
const ABOLETH = {
  name: 'Aboleth',
  size: 'Large',
  type: 'aberration',
  armor_class: [{ type: 'natural', value: 17 }],
  hit_points: 135,
  challenge_rating: 10,
  strength: 21,
  speed: { walk: 10, swim: 10 },
  actions: [{ name: 'Multiattack' }, { name: 'Tentacle' }],
  legendary_actions: [{ name: 'Detect' }],
};

test('armorClass baca array SRD, bukan angka', () => {
  assert.equal(armorClass(ABOLETH), 17);
  assert.equal(armorClass({ armor_class: [{ type: 'natural', value: 13 }] }), 13);
  assert.equal(armorClass({ armor_class: [{ type: 'other', value: 11 }] }), 11, 'fallback ke entri pertama');
  assert.equal(armorClass({}), '—', 'tidak crash kalau field hilang');
  assert.equal(armorClass({ armor_class: [] }), '—');
});

test('abilityMod hitung dari skor mentah SRD', () => {
  assert.equal(abilityMod(21), '+5', 'Aboleth STR 21 -> +5');
  assert.equal(abilityMod(10), '+0');
  assert.equal(abilityMod(8), '-1');
  assert.equal(abilityMod(1), '-5', 'skor 1 bukan minus tak hingga');
  assert.equal(abilityMod(30), '+10');
  assert.equal(abilityMod(undefined), '—');
  assert.equal(abilityMod(0), '—', '0 bukan skor valid');
});

test('clip menjaga embed di bawah limit 4096', () => {
  assert.equal(clip('pendek'), 'pendek');
  const long = 'a'.repeat(EMBED_LIMIT + 500);
  const out = clip(long);
  assert.equal(out.length, EMBED_LIMIT, 'tepat di limit, tidak lewat');
  assert.ok(out.endsWith('…'));
});

test('monsterView tidak menampilkan "undefined"', () => {
  const v = monsterView(ABOLETH);
  const flat = JSON.stringify(v);
  assert.ok(!flat.includes('undefined'), `ada "undefined" di: ${flat}`);
  assert.equal(v.fields.length, 6);
  assert.match(v.text, /Multiattack, Tentacle, Detect/);
  assert.equal(v.fields.find(([n]) => n === 'STR')[1], '+5');
});

test('monsterView tahan monster tanpa actions', () => {
  const v = monsterView({ name: 'X', challenge_rating: 0 });
  assert.equal(v.text, '');
  assert.ok(!JSON.stringify(v).includes('undefined'));
});

test('spellView memotong deskripsi panjang', () => {
  const v = spellView({
    name: 'Fireball',
    level: 3,
    school: { name: 'Evocation' },
    casting_time: '1 action',
    duration: 'Instantaneous',
    components: ['V', 'S', 'M'],
    classes: [{ name: 'Wizard' }],
    desc: ['x'.repeat(5000)],
  });
  assert.ok(v.text.length <= 1200, 'desc dipotong, embed aman');
  assert.match(v.fields.find(([n]) => n === 'Classes')[1], /Wizard/);
});

test('crColor naik monoton', () => {
  assert.equal(crColor(0), crColor('abcah'));
  assert.notEqual(crColor(0), crColor(5));
  assert.notEqual(crColor(5), crColor(12));
});

test('encounterText dipotong ke limit embed', () => {
  const mobs = Array.from({ length: 400 }, (_, i) => ({ name: `Monster${i}`, challenge_rating: 20, armor_class: [{ type: 'natural', value: 19 }], hit_points: 999 }));
  const text = encounterText(mobs);
  assert.ok(text.length <= EMBED_LIMIT, `panjang ${text.length} > ${EMBED_LIMIT}`);
  assert.ok(text.endsWith('…'));
});

test('findByName case-insensitive, null kalau ga ketemu', () => {
  const items = [{ name: 'Aboleth' }, { name: 'Goblin' }];
  assert.equal(findByName(items, 'aboleth').name, 'Aboleth');
  assert.equal(findByName(items, '  GOBLIN ').name, 'Goblin');
  assert.equal(findByName(items, 'dragon'), null);
  assert.equal(findByName(items, ''), null, 'string kosong = acak, bukan lookup');
  assert.equal(findByName(items, null), null);
  assert.equal(findByName([], 'Aboleth'), null, 'catalog kosong tidak crash');
});
