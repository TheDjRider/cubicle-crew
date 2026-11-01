// Antigravity CLI в отделен процес: ANTIGRAVITY_DIR сочи временна папка, за да не четем истинския ~/.gemini.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-agy-'));
const brain = path.join(tmp, 'antigravity-cli', 'brain');
process.env.ANTIGRAVITY_DIR = brain;
const { agyLine, agyLiveList, pruneProviders } = await import('../providers.js');

const T0 = Date.parse('2026-11-01T09:09:34Z');
const conv = (id) => {
  const f = path.join(brain, id, '.system_generated', 'logs', 'transcript.jsonl');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  return f;
};
const write = (f, rows) => fs.writeFileSync(f, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
fs.mkdirSync(brain, { recursive: true });
fs.writeFileSync(path.join(tmp, 'antigravity-cli', 'history.jsonl'),
  JSON.stringify({ display: 'друго', timestamp: T0 - 600e3, workspace: 'C:\\work\\old-project' }) + '\n' +
  JSON.stringify({ display: 'здравей', timestamp: T0 + 352, workspace: 'C:\\work\\wp-block-theme' }) + '\n');

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('Antigravity: проект от history.jsonl, модел с точка, името не се мени от пипнати файлове', () => {
  const events = [], f = conv('11111111-1111-1111-1111-111111111111');
  const first = {
    step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', created_at: '2026-11-01T09:09:34Z',
    content: '<USER_REQUEST>\nздравей\n</USER_REQUEST>\n<USER_SETTINGS_CHANGE>\nThe user changed setting `Model Selection` from None to Gemini 3.8 Flash (Medium). No need to comment.\n</USER_SETTINGS_CHANGE>',
  };
  write(f, [first]);
  agyLine(f, JSON.stringify(first), (e) => events.push(e), () => {});
  const plan = { step_index: 1, source: 'MODEL', type: 'PLANNER_RESPONSE', tool_calls: [{ name: 'read_file', args: { Path: JSON.stringify('C:\\elsewhere\\other\\x.js') } }] };
  agyLine(f, JSON.stringify(plan), (e) => events.push(e), () => {});
  assert.ok(events.length >= 2);
  for (const e of events) assert.equal(e.label, 'wp-block-theme');
  assert.equal(events[0].model, 'Gemini 3.8 Flash (Medium)');
  assert.equal(events.find((e) => e.type === 'tool_start')?.tool, 'Read');
});

test('Antigravity: без пуснат agy никой не е жив; таванът пази най-заетите', () => {
  const ids = agyLiveList(Date.now(), null).map((x) => x.agent);
  assert.ok(ids.includes('agy:11111111-1111-1111-1111-111111111111'));
  assert.deepEqual(agyLiveList(Date.now(), 0), []);
  assert.deepEqual(agyLiveList(Date.now(), 'pending'), []);
  assert.equal(agyLiveList(Date.now(), 1).length, 1);
});

test('Antigravity: нов разговор от човек до 15 s след invoke_subagent не става под-агент', () => {
  const pf = conv('22222222-2222-2222-2222-222222222222'), noop = () => {};
  const start = { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', created_at: new Date().toISOString(), content: 'x' };
  write(pf, [start]);
  agyLine(pf, JSON.stringify(start), noop, noop);
  agyLine(pf, JSON.stringify({ step_index: 1, source: 'MODEL', type: 'PLANNER_RESPONSE', tool_calls: [{ name: 'invoke_subagent', args: { Role: '"researcher"' } }] }), noop, noop);

  // втори прозорец на agy – започнат от човек
  const human = conv('33333333-3333-3333-3333-333333333333'), ev = [];
  write(human, [start]);
  agyLine(human, JSON.stringify(start), (e) => ev.push(e), noop);
  assert.equal(ev[0].subagent, false);
  assert.equal(ev[0].parent, undefined);

  // истински под-агент – първият му ред не е от човек
  const sub = conv('44444444-4444-4444-4444-444444444444'), sev = [];
  const sstart = { step_index: 0, source: 'SYSTEM', type: 'USER_INPUT', content: 'task' };
  write(sub, [sstart]);
  agyLine(sub, JSON.stringify(sstart), (e) => sev.push(e), noop);
  assert.equal(sev[0].subagent, true);
  assert.equal(sev[0].parent, 'agy:22222222-2222-2222-2222-222222222222');
  for (const f of [pf, human, sub]) pruneProviders(f);
});

test('Antigravity: под-агент по sender= и conversationId – родителят делегира, докато под-агентът свърши', () => {
  const P = '55555555-5555-5555-5555-555555555555', C = '66666666-6666-6666-6666-666666666666';
  const pf = conv(P), cf = conv(C), ev = [], push = (e) => ev.push(e), noop = () => {};
  const line = (f, o) => { fs.appendFileSync(f, JSON.stringify(o) + '\n'); agyLine(f, JSON.stringify(o), push, noop); };
  line(pf, { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', created_at: new Date().toISOString(), content: 'x' });
  line(pf, { step_index: 1, source: 'MODEL', type: 'PLANNER_RESPONSE', tool_calls: [{ name: 'invoke_subagent', args: { Model: '"flash_lite"', Prompt: '"Ти си Alpha"' } }] });
  // под-агентът тръгва преди резултата на invoke_subagent – точна връзка по sender=
  line(cf, { step_index: 0, source: 'SYSTEM', type: 'SYSTEM_MESSAGE', content: `<SYSTEM_MESSAGE>\n[Message] timestamp=x sender=${P} priority=HIGH content=задача\n</SYSTEM_MESSAGE>` });
  line(pf, { step_index: 2, source: 'MODEL', type: 'GENERIC', status: 'DONE', content: `Created the following subagent: { "conversationId": "${C}" }` });
  line(cf, { step_index: 1, source: 'MODEL', type: 'PLANNER_RESPONSE', tool_calls: [{ name: 'view_file', args: { AbsolutePath: '"C:\\x\\a.js"' } }] });
  const start = ev.find((e) => e.agent === 'agy:' + P && e.tool === 'Agent');
  const sub = ev.find((e) => e.agent === 'agy:' + C);
  assert.equal(sub.parent, 'agy:' + P);
  assert.equal(sub.parent_tool_use_id, start.id);
  assert.equal(sub.model, 'flash_lite');
  assert.equal(sub.label, ev[0].label); // проектът на родителя
  assert.ok(!ev.some((e) => e.type === 'tool_end' && e.tool_use_id === start.id)); // invoke_subagent още е отворен
  const live = agyLiveList(Date.now(), 1);
  assert.equal(live.find((x) => x.agent === 'agy:' + P)?.status, 'busy');
  assert.ok(!live.some((x) => x.agent === 'agy:' + C)); // под-агентите не са в списъка на живите сесии
  line(cf, { step_index: 2, source: 'MODEL', type: 'GENERIC', status: 'DONE', content: 'ok' });
  line(cf, { step_index: 3, source: 'MODEL', type: 'PLANNER_RESPONSE', content: 'Готово.' });
  assert.ok(ev.some((e) => e.agent === 'agy:' + P && e.type === 'tool_end' && e.tool_use_id === start.id));
  for (const f of [pf, cf]) pruneProviders(f);
});
