// Автоматични тестове за основните модули на Cubicle Crew (node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Earner, EARN } from '../public/rules.js';
import { buyItem, equipItem, setAvatar, setupOffice, giveTreat, grantAchievements, TREAT_PRICE } from '../public/catalog.js';
import { Model } from '../public/model.js';
import { danger, shortDetail, shortModel } from '../public/util.js';
import { External } from '../external.js';
import { Permissions } from '../permissions.js';
import { Lan } from '../lan.js';
import { unwrapShell, shellTool, agyLine, agyTouch, agyLiveList, pruneProviders, isAgyFile, AGY_ROOTS } from '../providers.js';

test('unwrapShell & shellTool: маха обвивката и водещо cd преди командата', () => {
  const longDir = '/very/long/path/to/some/deeply/nested/workspace/project/directory/structure';
  const raw = `powershell.exe -Command "cd '${longDir}' && git push origin main --force"`;
  const unwrapped = unwrapShell(raw);
  assert.equal(unwrapped, 'git push origin main --force');
  assert.equal(shellTool(raw), 'Bash');
  assert.equal(shellTool('bash -lc "rg foo src/"'), 'Grep');
  assert.equal(shellTool('Get-Content package.json'), 'Read');
  assert.equal(danger('Bash', unwrapped.slice(0, 60)), true);
  assert.equal(danger('Bash', 'git status'), false);
  assert.equal(danger('Read', 'rm -rf /'), false);
});

test('util: shortDetail и shortModel', () => {
  assert.equal(shortModel('claude-sonnet-4-5-20250514'), 'claude-sonnet-4-5');
  assert.ok(shortDetail('C:\\Users\\User\\WebstormProjects\\cubicle-crew\\server.js', 24).endsWith('server.js'));
});

test('Earner: дневен бонус, делегиране и натрупване от работа', () => {
  const earner = new Earner({ lastDaily: null });
  const b1 = earner.ingest({ agent: 'a1', type: 'tool_start', id: 't1', tool: 'Task' }, 1000);
  assert.ok(b1.some((b) => b.reason === 'daily' && b.amount === EARN.BONUS.daily));

  // под-агент се включва към задачата t1 и родителят приключва Task -> бонус за завършена задача
  earner.ingest({ agent: 'sub1', subagent: true, parent_tool_use_id: 't1', type: 'tool_start', id: 's1', tool: 'Read' }, 1500);
  const b2 = earner.ingest({ agent: 'a1', type: 'tool_end', tool_use_id: 't1' }, 2000);
  assert.ok(b2.some((b) => b.reason === 'task' && b.amount === EARN.BONUS.task));

  earner.ingest({ agent: 'a1', type: 'tool_start', id: 't2', tool: 'Edit' }, 2500);
  earner.step(2500);
  const step = earner.step(62500);
  assert.ok(step.total > 0);
  assert.ok(step.activeMs > 0);
});

test('catalog: начално обзавеждане, покупка, екипиране, лакомство и постижения', () => {
  const save = {
    version: 1, tokens: 200, lifetimeTokens: 200, lifetimeActiveSec: 36000, tasksDone: 12,
    owned: [], equipped: {}, lastDaily: null, daysActive: 7, achievements: {}, setup: null,
  };
  assert.equal(setupOffice(save, { pet: 'dog' }).ok, true);
  assert.equal(save.starter, 'dog');
  assert.ok(save.equipped.dog);

  const av = setAvatar(save, { body: 0, style: 1, top: 2, bottom: 1, skin: 2, hair: 1, glasses: true });
  assert.equal(av.ok, true);
  assert.equal(save.avatar.glasses, true);

  const b = buyItem(save, 'plants.cactus');
  assert.equal(b.ok, true);
  assert.equal(save.equipped.plants, 'plants.cactus');

  const eq = equipItem(save, 'plants', null);
  assert.equal(eq.ok, true);
  assert.equal(save.equipped.plants, 'plants.ficus');

  const before = save.tokens;
  assert.equal(giveTreat(save).ok, true);
  assert.equal(save.tokens, before - TREAT_PRICE);

  const unlocked = grantAchievements(save, '2026-11-01');
  assert.ok(unlocked.some((a) => a.id === 'tokens.100'));
  assert.ok(unlocked.some((a) => a.id === 'tasks.10'));
});

test('Model: събития, обновяване на етикет, под-агенти и сбиване на контекста', () => {
  const m = new Model();
  m.sessions([{ agent: 'agy:12345678', label: 'antigravity', status: 'busy', provider: 'antigravity', model: 'gemini-2.5-pro', ctx: 50000, ctxMax: 1000000 }], 100);
  const a = m.agents.get('agy:12345678');
  assert.ok(a);
  assert.equal(a.provider, 'antigravity');
  assert.equal(a.ctx, 50000);

  // обновяване на етикета от общо име към реалния проект
  m.ingest({ agent: 'agy:12345678', label: 'cubicle-crew', provider: 'antigravity', type: 'tool_start', id: 'c1', tool: 'Edit', detail: 'server.js', ctx: 60000, ctxMax: 1000000 }, 200);
  assert.equal(a.label, 'cubicle-crew');
  assert.equal(m.stateOf(a, 250), 'typing');

  // под-агент се връзва към родителя
  m.ingest({ agent: 'agy:sub99999', label: 'cubicle-crew', subagent: true, parent: 'agy:12345678', parent_tool_use_id: 'c1', type: 'tool_start', id: 's1', tool: 'Read', detail: 'README.md' }, 300);
  assert.ok(a.children.has('agy:sub99999'));

  // рязък спад на контекста -> отчита compaction
  m.ingest({ agent: 'agy:12345678', label: 'cubicle-crew', type: 'say', ctx: 20000, ctxMax: 1000000 }, 400);
  assert.equal(a.compactedAt, 400);
});

test('External: вход за външни агенти и hook събития', () => {
  const events = [];
  let scans = 0;
  const ext = new External({ emit: (e) => events.push(e), changed: () => { scans++; } });

  const r1 = ext.ingest({ agent: 'my-bot', label: 'demo-proj', type: 'tool_start', tool: 'Bash', detail: 'npm test' });
  assert.equal(r1.ok, true);
  assert.equal(events.length, 1);
  assert.equal(events[0].tool, 'Bash');
  assert.ok(scans >= 1);
  assert.equal(ext.list().length, 1);

  const r2 = ext.ingest({ session_id: 'cur-1', cwd: '/work/app', hook_event_name: 'stop' }, 'cursor', '');
  assert.equal(r2.ok, true);
  assert.equal(r2.hook, true);
});

test('Permissions: инсталиране и премахване на hook в settings.json', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-perm-'));
  const settingsFile = path.join(tmp, 'settings.json');
  fs.writeFileSync(settingsFile, JSON.stringify({ theme: 'dark' }, null, 2));

  const perms = new Permissions({
    broadcast: () => {},
    settingsFile,
    clients: () => 1,
    statusOf: () => 'waiting',
    brief: () => '',
  });
  assert.equal(perms.status().installed, false);
  assert.equal(perms.install(true, 4317).installed, true);
  assert.ok(fs.existsSync(settingsFile.replace(/\.json$/, '') + '.cubicle-crew-backup.json'));

  const afterOn = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  assert.equal(afterOn.theme, 'dark');
  assert.ok(Array.isArray(afterOn.hooks?.PermissionRequest));

  assert.equal(perms.install(false, 4317).installed, false);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('Lan: филтрира чувствителните полета (detail, desc) за телефонния изглед', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-lan-'));
  const lan = new Lan({ home: tmp, publicDir: tmp, mime: { '.json': 'application/json' }, snapshot: () => [], save: () => ({}) });
  const filtered = lan.filter({ agent: 'a1', label: 'proj', type: 'tool_start', tool: 'Bash', detail: 'secret command', desc: 'secret task' });
  assert.equal(filtered.detail, undefined);
  assert.equal(filtered.desc, undefined);
  assert.equal(filtered.tool, 'Bash');

  const sess = lan.filter({ type: 'sessions', list: [{ agent: 'a1', label: 'proj', status: 'busy', provider: 'antigravity', ctx: 12000, ctxMax: 200000, waitingFor: 'secret' }] });
  assert.equal(sess.list[0].waitingFor, undefined);
  assert.equal(sess.list[0].provider, 'antigravity');
  assert.equal(sess.list[0].ctx, 12000);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('providers: Codex, Gemini и Antigravity транскрипти', () => {
  const events = [];
  const usages = [];
  const ctxs = [];
  const emit = (e) => events.push(e);
  const usage = (agent, label, sub, msg) => usages.push({ agent, label, sub, msg });
  const setCtx = (agent, c, m) => ctxs.push({ agent, c, m });

  const agyRoot = AGY_ROOTS[0];
  const fakeAgyFile = path.join(agyRoot, 'conv-test-1234', '.system_generated', 'logs', 'transcript.jsonl');
  assert.equal(isAgyFile(fakeAgyFile), true);

  agyTouch(fakeAgyFile, Date.now(), setCtx);
  assert.ok(agyLiveList().some((x) => x.agent === 'agy:conv-test-1234' && x.provider === 'antigravity'));
  // без пуснат agy.exe никой не седи в офиса; докато не сме броили – също; с един CLI – вътре е
  assert.ok(!agyLiveList(Date.now(), 0).some((x) => x.agent === 'agy:conv-test-1234'));
  assert.equal(agyLiveList(Date.now(), 'pending').length, 0);
  assert.ok(agyLiveList(Date.now(), 1).some((x) => x.agent === 'agy:conv-test-1234'));

  // потребителски промпт с <user_information> за автоматично разпознаване на проекта
  agyLine(fakeAgyFile, JSON.stringify({
    step_index: 0,
    type: 'USER_INPUT',
    content: '<user_information>\nCommand Working Directory: C:\\Users\\User\\WebstormProjects\\cubicle-crew\n</user_information>\nЗдравей!',
  }), emit, usage, setCtx);

  // отговор на планировчика с извикване на инструмент и токени
  agyLine(fakeAgyFile, JSON.stringify({
    step_index: 1,
    type: 'PLANNER_RESPONSE',
    thinking: 'Мисля...',
    content: 'Ще редактирам файла.',
    input_tokens: 15000,
    cache_read_tokens: 80000,
    output_tokens: 400,
    thinking_tokens: 100,
    tool_calls: [
      { id: 'tc-1', name: 'edit_file', args: { Path: JSON.stringify('C:\\Users\\User\\WebstormProjects\\cubicle-crew\\server.js') } },
    ],
  }), emit, usage, setCtx);

  // резултат от инструмента
  agyLine(fakeAgyFile, JSON.stringify({
    step_index: 2,
    type: 'GENERIC',
    status: 'DONE',
    content: 'Made 1 replacement',
  }), emit, usage, setCtx);

  assert.ok(events.some((e) => e.agent === 'agy:conv-test-1234' && e.type === 'user_prompt'));
  assert.ok(events.some((e) => e.agent === 'agy:conv-test-1234' && e.type === 'tool_start' && e.tool === 'Edit' && e.label === 'cubicle-crew'));
  assert.ok(events.some((e) => e.agent === 'agy:conv-test-1234' && e.type === 'tool_end' && e.tool_use_id === 'tc-1'));
  assert.equal(usages.length, 1);
  assert.ok(ctxs.some((x) => x.agent === 'agy:conv-test-1234' && x.c === 95000));

  pruneProviders(fakeAgyFile);
  assert.ok(!agyLiveList().some((x) => x.agent === 'agy:conv-test-1234'));
});
