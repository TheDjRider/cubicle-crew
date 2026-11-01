// Тестове за любимците: екзотичните места и животни (фенек, капибара, вомбат) и общите правила (node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { buyItem, equipItem, unlocked, petCount, resolveDecor, ITEM, ITEMS, SLOTS, PET_SLOTS, MAX_PETS, owns } from '../public/catalog.js';
import { petName } from '../public/config.js';

const EXO = ['exotic', 'exotic2', 'exotic3'];
const ANIMALS = ITEMS.filter((it) => it.group === 'exotic');
const fresh = (over = {}) => ({ tokens: 10000, owned: [], equipped: {}, starter: 'cat', ...over });
const buySlots = (s, n = 3) => { for (let i = 1; i <= n; i++) assert.equal(buyItem(s, `exotic${i}.extra`).ok, true); };

test('екзотични места: три, подредени, всяко струва 1000 и не идва с готово животно', () => {
  assert.deepEqual(PET_SLOTS.filter((sl) => SLOTS[sl].pet === 'exotic'), EXO);
  for (const sl of EXO) {
    const it = ITEM[SLOTS[sl].need];
    assert.equal(it.price, 1000);
    assert.equal(it.slot, sl, `${sl}: предметът за отключване сочи към мястото`);
    assert.equal(it.gives, undefined, `${sl}: мястото е отделно от животното`);
  }
  assert.equal(MAX_PETS, 3);
});

test('екзотични места: второто е заключено, докато не се купи първото; купеното място е празно', () => {
  const s = fresh();
  assert.equal(buyItem(s, 'exotic2.extra').error, 'locked');
  assert.equal(buyItem(s, 'exotic1.extra').ok, true);
  assert.equal(s.tokens, 10000 - 1000);
  assert.equal(unlocked(s, 'exotic'), true);
  assert.equal(s.equipped.exotic, null, 'никое животно не се появява само');
  assert.equal(resolveDecor(s.equipped).exotic, null);
  assert.equal(petCount(s), 1, 'броят в офиса не се променя (само котката по подразбиране)');
  assert.equal(buyItem(s, 'exotic1.extra').error, 'owned');
  assert.equal(buyItem(fresh({ tokens: 999 }), 'exotic1.extra').error, 'funds');
});

test('екзотични места: място се купува и при пълен офис, а животното влиза, щом има къде', () => {
  const s = fresh({ equipped: { cat: 'cat.grey', cat2: 'cat.tabby', cat3: 'cat.tuxedo' }, owned: ['cat2.tabby', 'cat3.extra'] });
  assert.equal(petCount(s), 3);
  assert.equal(buyItem(s, 'exotic1.extra').ok, true, 'мястото се купува и при пълен офис');
  const r = equipItem(s, 'exotic', 'exotic.fennec');
  assert.equal(r.ok, false);
  assert.equal(r.error, 'pets');
  equipItem(s, 'cat3', null); // една котка си отива у дома
  assert.equal(equipItem(s, 'exotic', 'exotic.fennec').ok, true);
  assert.equal(petCount(s), 3);
});

test('екзотични животни: всяко стои на всяко място – и три еднакви; грешна група и заключено място се отказват', () => {
  const s = fresh();
  buySlots(s);
  equipItem(s, 'cat', null); // иначе с трите екзотични би станало 4 любимеца
  for (const it of ANIMALS) for (const sl of EXO) assert.equal(equipItem(s, sl, it.id).ok, true, `${it.id} на ${sl}`);
  for (const sl of EXO) assert.equal(equipItem(s, sl, 'exotic.capybara.red').ok, true);
  const d = resolveDecor(s.equipped);
  assert.deepEqual(EXO.map((sl) => d[sl].id), Array(3).fill('exotic.capybara.red'));
  assert.equal(petCount(s), 3);
  assert.equal(equipItem(s, 'exotic', 'cat.black').error, 'slot', 'котешка шарка не е за екзотично място');
  assert.equal(equipItem(fresh(), 'exotic', 'exotic.fennec').error, 'locked', 'мястото не е купено');
});

test('екзотични места: прибрано животно е null, а стар запис без екзотични ключове не се променя', () => {
  const s = fresh();
  buySlots(s, 1);
  equipItem(s, 'exotic', 'exotic.wombat.black');
  assert.equal(resolveDecor(s.equipped).exotic.id, 'exotic.wombat.black');
  assert.equal(equipItem(s, 'exotic', null).ok, true);
  assert.equal(resolveDecor(s.equipped).exotic, null);

  // запис от по-ранната версия: мястото идваше с готов фенек
  const early = fresh({ owned: ['exotic1.extra'], equipped: { exotic: 'exotic.fennec' } });
  assert.equal(resolveDecor(early.equipped).exotic.id, 'exotic.fennec');
  assert.equal(unlocked(early, 'exotic'), true);

  const old = { equipped: { cat: 'cat.ginger', cat2: 'cat2.tabby' }, owned: ['cat2.tabby'], starter: 'cat' };
  const d = resolveDecor(old.equipped);
  assert.equal(d.cat.id, 'cat.ginger');
  assert.equal(d.cat2.id, 'cat.tabby', 'старият запис cat2.tabby се превежда');
  for (const sl of EXO) assert.equal(d[sl], null);
  assert.equal(petCount(old), 2);
});

test('екзотични животни: 12 цвята (3 / 4 / 5), безплатни, с автор, с валидни цветове', () => {
  assert.equal(ANIMALS.length, 12);
  const per = (sp) => ANIMALS.filter((it) => it.sp === sp).map((it) => it.id);
  assert.equal(per('fennec').length, 3);
  assert.equal(per('capybara').length, 4);
  assert.equal(per('wombat').length, 5);
  assert.deepEqual([per('fennec')[0], per('capybara')[0], per('wombat')[0]], ['exotic.fennec', 'exotic.capybara', 'exotic.wombat'], 'първите са старите id-та');
  assert.equal(new Set(ANIMALS.map((it) => it.id)).size, 12);
  for (const it of ANIMALS) {
    assert.equal(it.price, 0);
    assert.equal(it.by, 'TheDjRider');
    assert.equal(owns(fresh(), it.id), true, `${it.id} е безплатно`);
    for (const k of ['c', 'hi', 'm', 'e', 'eye', 'p']) assert.match(it[k], /^#[0-9a-f]{6}$/i, `${it.id}.${k}`);
    if (it.nose) assert.match(it.nose, /^#[0-9a-f]{6}$/i);
  }
  assert.equal(new Set(ANIMALS.filter((it) => it.sp === 'capybara').map((it) => it.c)).size, 4, 'различни цветове');
  for (const it of ITEMS.filter((x) => x.gives)) assert.ok(ITEM[it.gives], `${it.id} дава несъществуващ ${it.gives}`);
});

test('имена и преводи: всяко животно има собствено име и в двата езика', () => {
  const names = ANIMALS.map((it) => petName('exotic', null, it.id));
  assert.ok(names.every((n) => n && n !== 'exotic'));
  assert.equal(new Set(names).size, 12, 'имената са различни');
  assert.equal(petName('exotic', { exotic: 'Пухчо' }, 'exotic.fennec'), 'Пухчо', 'прякорът има предимство');

  // config.js не излага T_BG/T_EN поотделно – проверяваме изходния текст: и двата езика имат всичко ново
  const src = fs.readFileSync(new URL('../public/config.js', import.meta.url), 'utf8');
  const breeds = [...src.matchAll(/breeds: \{([^}]*)\}/g)].map((m) => m[1]);
  assert.equal(breeds.length, 2, 'breeds в двата езика');
  for (const b of breeds) for (const it of ANIMALS) assert.ok(b.includes(`'${it.id}'`), `breeds: ${it.id}`);
  for (const key of ['kinds:', 'about:', 'inOffice:', 'species:', 'colours:', 'pickOne:', 'inSlot:', 'unlockExotic:']) {
    assert.equal(src.split(key).length - 1 >= 2, true, `${key} е и в двата езика`);
  }
  for (const id of [...ANIMALS.map((it) => it.id), 'exotic1.extra', 'exotic2.extra', 'exotic3.extra']) assert.ok(src.includes(`'${id}': '`), `T_EN.items: ${id}`);
});
