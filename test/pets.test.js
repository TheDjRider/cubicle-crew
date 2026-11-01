// Тестове за любимците: екзотичните места (фенек, капибара, вомбат) и общите правила (node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { buyItem, equipItem, unlocked, petCount, resolveDecor, ITEM, ITEMS, SLOTS, PET_SLOTS, MAX_PETS, owns } from '../public/catalog.js';
import { petName } from '../public/config.js';

const EXO = ['exotic', 'exotic2', 'exotic3'];
const SPECIES = ['exotic.fennec', 'exotic.capybara', 'exotic.wombat'];
const fresh = (over = {}) => ({ tokens: 10000, owned: [], equipped: {}, starter: 'cat', ...over });

test('екзотични места: три, подредени, цените растат със 350', () => {
  assert.deepEqual(PET_SLOTS.filter((sl) => SLOTS[sl].pet === 'exotic'), EXO);
  const prices = EXO.map((sl) => ITEM[SLOTS[sl].need].price);
  assert.deepEqual(prices, [500, 850, 1200]);
  EXO.forEach((sl, i) => assert.equal(ITEM[SLOTS[sl].need].slot, sl, `${sl}: предметът за отключване сочи към мястото`));
  assert.equal(MAX_PETS, 3);
});

test('екзотични места: второто е заключено, докато не се купи първото; всяко идва със свой вид', () => {
  const s = fresh();
  assert.equal(buyItem(s, 'exotic2.extra').error, 'locked');
  assert.equal(buyItem(s, 'exotic1.extra').ok, true);
  assert.equal(s.tokens, 10000 - 500);
  assert.equal(s.equipped.exotic, 'exotic.fennec');
  assert.equal(unlocked(s, 'exotic'), true);
  assert.equal(buyItem(s, 'exotic2.extra').ok, true);
  assert.equal(s.equipped.exotic2, 'exotic.capybara');
  assert.equal(owns(s, 'exotic.capybara'), true);
});

test('екзотични места: най-много 3 любимци общо (котката също се брои)', () => {
  const s = fresh();
  assert.equal(buyItem(s, 'exotic1.extra').ok, true);
  assert.equal(buyItem(s, 'exotic2.extra').ok, true);
  assert.equal(petCount(s), 3, 'котка + 2 екзотични');
  s.equipped.cat = 'cat.grey';
  const r = buyItem(s, 'exotic3.extra');
  assert.equal(r.ok, false);
  assert.equal(r.error, 'pets');
  assert.equal(s.tokens, 10000 - 500 - 850, 'нищо не се плаща при отказ');
  equipItem(s, 'cat', null); // котката се прибира у дома
  assert.equal(buyItem(s, 'exotic3.extra').ok, true);
  assert.equal(s.equipped.exotic3, 'exotic.wombat');
});

test('екзотични места: всеки вид стои на всяко отключено място; грешна група и заключено място се отказват', () => {
  const s = fresh();
  buyItem(s, 'exotic1.extra'); buyItem(s, 'exotic2.extra');
  for (const sp of SPECIES) for (const sl of ['exotic', 'exotic2']) assert.equal(equipItem(s, sl, sp).ok, true, `${sp} на ${sl}`);
  assert.equal(equipItem(s, 'exotic', 'cat.black').error, 'slot', 'котешка шарка не е за екзотично място');
  assert.equal(equipItem(s, 'exotic3', 'exotic.fennec').error, 'locked', 'третото място не е купено');
  // един и същи вид на две места е позволено (като шарките на котките)
  equipItem(s, 'exotic', 'exotic.wombat'); equipItem(s, 'exotic2', 'exotic.wombat');
  assert.equal(resolveDecor(s.equipped).exotic.id, resolveDecor(s.equipped).exotic2.id);
});

test('екзотични места: прибран любимец е null, а стар запис без екзотични ключове не се променя', () => {
  const s = fresh();
  buyItem(s, 'exotic1.extra');
  assert.equal(resolveDecor(s.equipped).exotic.id, 'exotic.fennec');
  assert.equal(equipItem(s, 'exotic', null).ok, true);
  assert.equal(resolveDecor(s.equipped).exotic, null);
  assert.equal(petCount(s), 1, 'остава само котката по подразбиране');

  const old = { equipped: { cat: 'cat.ginger', cat2: 'cat2.tabby' }, owned: ['cat2.tabby'], starter: 'cat' };
  const d = resolveDecor(old.equipped);
  assert.equal(d.cat.id, 'cat.ginger');
  assert.equal(d.cat2.id, 'cat.tabby', 'старият запис cat2.tabby се превежда');
  for (const sl of EXO) assert.equal(d[sl], null);
  assert.equal(petCount(old), 2);
});

test('екзотични видове: безплатни, с автор и известен вид; всичко „gives“ съществува', () => {
  const exo = ITEMS.filter((it) => it.group === 'exotic');
  assert.deepEqual(exo.map((it) => it.id), SPECIES);
  for (const it of exo) {
    assert.equal(it.price, 0);
    assert.equal(it.by, 'TheDjRider');
    assert.ok(['fennec', 'capybara', 'wombat'].includes(it.sp), `${it.id}: sp`);
    for (const k of ['c', 'hi', 'm', 'e', 'eye']) assert.match(it[k], /^#[0-9a-f]{6}$/i, `${it.id}.${k}`);
  }
  for (const it of ITEMS.filter((x) => x.slot)) assert.ok(ITEM[it.gives], `${it.id} дава несъществуващ ${it.gives}`);
});

test('имена и преводи: всеки вид има собствено име и в двата езика', () => {
  for (const id of SPECIES) assert.ok(petName('exotic', null, id) && petName('exotic', null, id) !== 'exotic');
  assert.equal(new Set(SPECIES.map((id) => petName('exotic', null, id))).size, 3, 'имената са различни');
  assert.equal(petName('exotic', { exotic: 'Пухчо' }, 'exotic.fennec'), 'Пухчо', 'прякорът има предимство');

  // config.js не излага T_BG/T_EN поотделно – проверяваме изходния текст: и двата езика имат всичко ново
  const src = fs.readFileSync(new URL('../public/config.js', import.meta.url), 'utf8');
  const breeds = [...src.matchAll(/breeds: \{([^}]*)\}/g)].map((m) => m[1]);
  assert.equal(breeds.length, 2, 'breeds в двата езика');
  for (const b of breeds) for (const id of SPECIES) assert.ok(b.includes(`'${id}'`), `breeds: ${id}`);
  for (const key of ['kinds:', 'about:', 'inOffice:', 'comesWith:', 'inSlot:', 'unlockExotic:']) {
    assert.equal(src.split(key).length - 1 >= 2, true, `${key} е и в двата езика`);
  }
  for (const id of [...SPECIES, 'exotic1.extra', 'exotic2.extra', 'exotic3.extra']) assert.ok(src.includes(`'${id}': '`), `T_EN.items: ${id}`);
});
