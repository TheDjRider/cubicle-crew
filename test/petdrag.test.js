// Тестове за влаченето на любимци (чиста логика в public/petdrag.js; рисуването и мишката се проверяват в браузъра).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { grabZone, ShakeDetector, nearestFree, surfaceAt, inRect } from '../public/petdrag.js';

test('grabZone: напред/горе е главата, назад е опашката, останалото е тялото', () => {
  assert.equal(grabZone(5, -3), 'head', 'предната част');
  assert.equal(grabZone(0, -10), 'head', 'високо над краката (седнал любимец)');
  assert.equal(grabZone(-5, -3), 'tail', 'задната част');
  assert.equal(grabZone(0, -3), 'body', 'средата');
  assert.equal(grabZone(3, -3), 'body', 'граничното място още е тяло');
  assert.equal(grabZone(-3, -3), 'body');
  assert.equal(grabZone(-6, -9), 'head', 'високо важи повече от задното');
});

test('ShakeDetector: разтърсването се познава, спокойното влачене – не', () => {
  const steady = new ShakeDetector();
  let hit = false;
  for (let i = 0; i < 40; i++) hit ||= steady.push(100 + i * 3, i * 30);
  assert.equal(hit, false, 'права линия');

  const small = new ShakeDetector();
  hit = false;
  for (let i = 0; i < 40; i++) hit ||= small.push(100 + (i % 2 ? 2 : -2), i * 30);
  assert.equal(hit, false, 'треперене под прага');

  const slow = new ShakeDetector();
  hit = false;
  for (let i = 0; i < 12; i++) hit ||= slow.push(100 + (i % 2 ? 14 : -14), i * 400);
  assert.equal(hit, false, 'бавно люлеене – смените са извън прозореца от 0.9 s');

  const fast = new ShakeDetector();
  let n = 0;
  for (let i = 0; i < 14; i++) if (fast.push(100 + (i % 2 ? 14 : -14), i * 55)) n++;
  assert.ok(n >= 1, 'бързо разклащане');
  fast.reset();
  assert.equal(fast.push(100, 0), false, 'след reset започва начисто');
});

const B = { x0: 6, x1: 300, y0: 60, y1: 220 };

test('nearestFree: свободна точка остава, извън границите се ограничава', () => {
  assert.deepEqual(nearestFree(100, 100, B), { x: 100, y: 100 });
  assert.deepEqual(nearestFree(-50, 400, B), { x: 6, y: 220 });
  assert.deepEqual(nearestFree(100.4, 99.6, B), { x: 100, y: 100 }, 'закръглява до цели пиксели');
});

test('nearestFree: точка в блокирано място се избутва навън, най-близо и в границите', () => {
  const desk = { x0: 80, y0: 90, x1: 140, y1: 130 };
  const blocked = (pt) => inRect(pt, desk);
  const p = nearestFree(110, 100, B, blocked);
  assert.equal(blocked(p), false, 'вън от бюрото');
  assert.ok(p.x >= B.x0 && p.x <= B.x1 && p.y >= B.y0 && p.y <= B.y1, 'вътре в пода');
  assert.ok(Math.hypot(p.x - 110, p.y - 100) <= 45, 'близо до мястото, където е пуснат');
  // всичко е блокирано -> връща ограничената точка (не зациклява)
  assert.deepEqual(nearestFree(110, 100, B, () => true), { x: 110, y: 100 });
});

test('surfaceAt: само свободна повърхност, която съдържа точката; заетите са под', () => {
  const desks = [
    { id: 'a', free: false, rect: { x0: 0, y0: 0, x1: 60, y1: 40 } },
    { id: 'b', free: true, rect: { x0: 70, y0: 0, x1: 130, y1: 40 } },
    { id: 'c', free: true, rect: { x0: 70, y0: 30, x1: 130, y1: 70 } },
  ];
  assert.equal(surfaceAt(30, 20, desks), null, 'бюрото е заето -> пада на пода');
  assert.equal(surfaceAt(100, 20, desks).id, 'b');
  assert.equal(surfaceAt(100, 35, desks).id, 'b', 'първата свободна, когато две се застъпват');
  assert.equal(surfaceAt(100, 60, desks).id, 'c');
  assert.equal(surfaceAt(200, 20, desks), null, 'извън всички');
  assert.equal(inRect({ x: 5, y: 5 }, desks[0].rect), true);
  assert.equal(inRect({ x: 61, y: 5 }, desks[0].rect), false);
});
