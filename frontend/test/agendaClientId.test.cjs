const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');
const KEY = 'kencana_agenda_client_id';

function utility(store = new Map(), { locks = false, fallback = false, blocked = false } = {}) {
  const module = { exports: {} }; let generated = 0, tail = Promise.resolve();
  const source = fs.readFileSync(path.join(__dirname, '../src/utils/agendaClientId.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module, exports: module.exports,
    localStorage: { getItem: key => { if (blocked) throw Error('Storage disabled'); return store.get(key) ?? null }, setItem: (key, value) => store.set(key, value) },
    crypto: { randomUUID: fallback ? undefined : () => { generated++; return 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, getRandomValues: bytes => webcrypto.getRandomValues(bytes) },
    navigator: { locks: locks ? { request: (_key, callback) => { const next = tail.then(callback); tail = next.catch(() => {}); return next } } : undefined },
  });
  return { get: module.exports.getAgendaClientId, generated: () => generated };
}

test('Browser ID is generated once and survives module reload/session changes; new profiles get their own key', async () => {
  const store = new Map(), first = utility(store);
  const id = await first.get(); assert.equal(store.get(KEY), id); assert.equal(first.generated(), 1);
  assert.equal(await first.get(), id); assert.equal(first.generated(), 1);
  const reloaded = utility(store); assert.equal(await reloaded.get(), id); assert.equal(reloaded.generated(), 0);
  assert.deepEqual([...store.keys()], [KEY]);
  const other = utility(new Map(), { fallback: true }); assert.notEqual(await other.get(), id);
  const auth = fs.readFileSync(path.join(__dirname, '../src/stores/authStore.ts'), 'utf8');
  assert.ok(!auth.includes('localStorage.clear(') && !auth.includes(`removeItem('${KEY}')`) && !auth.includes(`removeItem("${KEY}")`));
});

test('Concurrent initialization uses a shared Web Lock and reuses the saved ID', async () => {
  const u = utility(new Map(), { locks: true });
  const values = await Promise.all([u.get(), u.get(), u.get()]);
  assert.equal(new Set(values).size, 1); assert.equal(u.generated(), 1);
});

test('Crypto fallback persists random IDs, malformed storage is repaired, unavailable storage never creates an ephemeral ID', async () => {
  const store = new Map([[KEY, 'hrd']]);
  const u = utility(store, { fallback: true }); const id = await u.get();
  assert.match(id, /^[a-f0-9]{32}$/); assert.equal(await u.get(), id);
  await assert.rejects(utility(new Map(), { blocked: true }).get(), /Storage disabled/);
});
