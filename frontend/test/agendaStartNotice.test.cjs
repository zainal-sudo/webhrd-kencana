const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');

const CLIENT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLIENT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function fixture(serverClaims = new Set(), clientId = CLIENT_A) {
  const mounted = [], unmounted = [], intervals = new Map(), events = new Map(), requests = [], timeouts = new Map();
  let sequence = 0;
  const identity = vue.ref('session1:hrd');
  const doc = { hidden: false, addEventListener: (key, fn) => events.set(key, fn), removeEventListener: key => events.delete(key) };
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../src/composables/useAgendaStartNotice.ts'), 'utf8');
  const api = { post: (url, body) => new Promise((resolve, reject) => requests.push({ url, body, resolve, reject, who: identity.value })) };
  const deps = {
    vue: { ...vue, onMounted: fn => mounted.push(fn), onUnmounted: fn => unmounted.push(fn) },
    '@/api/axios': { api },
    '@/utils/agendaClientId': { getAgendaClientId: () => Promise.resolve(clientId) },
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module, exports: module.exports, require: name => deps[name], document: doc,
    window: { addEventListener: (key, fn) => events.set(key, fn), removeEventListener: key => events.delete(key) },
    setInterval: (fn, delay) => { intervals.set(fn, delay); return fn }, clearInterval: fn => intervals.delete(fn),
    setTimeout: (fn, delay) => { timeouts.set(++sequence, { fn, delay }); return sequence }, clearTimeout: id => timeouts.delete(id),
  });
  const scope = vue.effectScope();
  const instance = scope.run(() => module.exports.useAgendaStartNotice(() => identity.value));
  mounted.forEach(fn => fn());
  const flush = async () => { await Promise.resolve(); await vue.nextTick(); await Promise.resolve() };
  const respond = async (index, notices) => {
    const request = requests[index];
    const user = request.who.split(':').at(-1);
    const fresh = notices.filter(notice => !serverClaims.has(`${user}:${request.body.client_id}:${notice.id}`));
    for (const notice of fresh) serverClaims.add(`${user}:${request.body.client_id}:${notice.id}`);
    request.resolve({ data: { data: fresh } }); await flush();
  };
  return { identity, doc, intervals, events, requests, get shown() { return instance.notices.value }, timeouts, flush, respond, instance,
    unmount() { unmounted.forEach(fn => fn()); scope.stop() } };
}
const notice = (id = 1) => ({ id, title: 'Rapat HRD', date: '2026-10-19', start_time: '09:00', end_time: '10:00', visibility: 'shared', kind: 'ongoing' });

test('Initial app/login checks catch-up; regular 60-second polling does not overlap requests', async () => {
  const f = fixture();
  await f.flush();
  assert.equal(f.requests[0].url, '/agenda/notifications/claim'); assert.equal(f.requests[0].body.catch_up, true);
  assert.equal(f.requests[0].body.client_id, CLIENT_A); assert.equal(f.requests[0].body.user_code, undefined);
  assert.deepEqual([...f.intervals.values()], [60000]);
  [...f.intervals.keys()][0](); f.events.get('focus')();
  assert.equal(f.requests.length, 1);
  await f.respond(0, [notice()]); assert.equal(f.shown.length, 1);
  assert.equal([...f.timeouts.values()][0].delay, 15000);
  [...f.intervals.keys()][0](); await f.flush(); assert.equal(f.requests[1].body.catch_up, false);
  await f.respond(1, [notice()]); assert.equal(f.shown.length, 1);
  f.unmount(); assert.equal(f.intervals.size, 0); assert.equal(f.events.size, 0); assert.equal(f.shown.length, 0); assert.equal(f.timeouts.size, 0);
});

test('Acknowledgement survives refresh/remount and logout/login; different users remain independent', async () => {
  const claims = new Set();
  const a = fixture(claims); await a.flush(); await a.respond(0, [notice()]); a.unmount();
  const b = fixture(claims); await b.flush(); await b.respond(0, [notice()]); assert.equal(b.shown.length, 0);
  b.identity.value = ''; await b.flush(); assert.equal(b.intervals.size, 0);
  b.identity.value = 'session2:hrd'; await b.flush(); await b.respond(1, [notice()]); assert.equal(b.shown.length, 0);
  b.identity.value = 'session3:p1'; await b.flush(); await b.respond(2, [notice()]); assert.equal(b.shown.length, 1);
  b.unmount();
  const c = fixture(claims, CLIENT_B); await c.flush(); await c.respond(0, [notice()]); assert.equal(c.shown.length, 1); c.unmount();
});

test('Hidden tabs pause checking, resume uses ongoing catch-up; failed requests recover quietly', async () => {
  const f = fixture(); await f.flush(); await f.respond(0, []);
  f.doc.hidden = true; [...f.intervals.keys()][0](); f.events.get('visibilitychange')(); assert.equal(f.requests.length, 1);
  f.doc.hidden = false; f.events.get('visibilitychange')(); await f.flush(); assert.equal(f.requests[1].body.catch_up, true);
  f.requests[1].reject(new Error('503 migration not installed')); await f.flush(); assert.equal(f.shown.length, 0);
  [...f.intervals.keys()][0](); await f.flush(); await f.respond(2, [notice()]); assert.equal(f.shown.length, 1);
  f.unmount();
});

test('Logout/account switch and unmount ignore responses from old sessions and clear only owned toasts', async () => {
  const f = fixture();
  await f.flush();
  f.identity.value = 'session2:p1'; await f.flush();
  await f.respond(0, [notice()]); assert.equal(f.shown.length, 0);
  await f.respond(1, [notice(2)]); assert.equal(f.shown.length, 1);
  f.identity.value = ''; await f.flush(); assert.equal(f.shown.length, 0); assert.equal(f.timeouts.size, 0);
  f.identity.value = 'session3:p2'; await f.flush(); f.unmount();
  await f.respond(2, [notice(3)]); assert.equal(f.shown.length, 0);
  assert.equal(f.intervals.size, 0); assert.equal(f.events.size, 0);
});
