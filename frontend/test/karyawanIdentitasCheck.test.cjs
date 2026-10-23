const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('./helpers/frontendVm.cjs');
const ts = require('typescript');
const vue = require('vue');
const source = fs.readFileSync(path.join(__dirname, '../src/views/master/KaryawanForm.vue'), 'utf8');
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
const payload = ditemukan => ({ data: { data: { ditemukan } } });
function fixture({ original = '', edit = false, get = async () => payload([]) } = {}) {
  const values = vue.reactive({ kar_noidentitas: original });
  const timers = new Map(); let timerId = 0;
  const scope = vue.effectScope();
  const context = { ref: vue.ref, watch: vue.watch, onUnmounted() {}, values,
    isEdit: vue.ref(edit), nik: vue.ref(edit ? '001' : ''), api: { get },
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); } };
  const logic = source.slice(source.indexOf('interface PemakaiIdentitas'), source.indexOf('interface FormSnapshot'));
  const guard = source.slice(source.indexOf('  const identitasKini ='), source.indexOf('  const body: Record<string, any>'));
  const code = logic + '\nidentitasAwal.value = ' + JSON.stringify(original.trim()) + ';\n' +
    'globalThis.state = { cekIdentitasDuplikat, cekIdentitasJalan, jalankanCekIdentitas };\n' +
    'globalThis.guard = async function() { ' + guard + ' };';
  vm.createContext(context);
  scope.run(() => vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context));
  return { values, ...context.state, guard: context.guard, dispose: () => scope.stop(),
    async input(value) { values.kar_noidentitas = value; await vue.nextTick(); },
    async flush() { const callbacks = [...timers.values()]; timers.clear(); await Promise.all(callbacks.map(fn => fn())); },
  };
}
test('POST pre-check groups active and inactive users into one duplicate error state', async () => {
  let request;
  const f = fixture({ get: async (url, options) => { request = { url, ...options }; return payload([{ nik: '009', nama: 'Aktif', aktif: true }, { nik: '008', nama: 'Nonaktif', aktif: false }]); } });
  try {
    await f.input(' 123456 '); await f.flush();
    assert.equal(request.url, '/master/karyawan/cek-identitas');
    assert.equal(request.params.noidentitas, '123456');
    assert.equal(request.params.nik, undefined);
    assert.equal(f.cekIdentitasDuplikat.value.length, 2);
    await assert.rejects(f.guard, /sudah pernah digunakan oleh: 009 - Aktif/);
  } finally { f.dispose(); }
});
test('Inactive duplicate blocks save too, with no rehire warning', async () => {
  const f = fixture({ get: async () => payload([{ nik: '008', nama: 'Nonaktif', aktif: false }]) });
  try { await f.input('123456'); await assert.rejects(f.guard, /008 - Nonaktif/); }
  finally { f.dispose(); }
  assert.doesNotMatch(source, /peringatan_identitas|tampilkkanPeringatanIdentitas|data tetap dapat disimpan sebagai record baru/);
  assert.match(source, /v-if="cekIdentitasDuplikat.length" class="identitas-pesan error" role="alert"/);
});
test('PUT unchanged legacy identity skips pre-check and allows save', async () => {
  let calls = 0;
  const f = fixture({ original: '123456', edit: true, get: async () => { calls++; return payload([{ nik: '009' }]); } });
  try {
    await f.input(' 123456 '); await f.flush(); await f.guard();
    assert.equal(calls, 0); assert.equal(f.cekIdentitasDuplikat.value.length, 0);
  } finally { f.dispose(); }
});
test('PUT changed identity sends current NIK and rejects duplicate', async () => {
  let params;
  const f = fixture({ original: 'old', edit: true, get: async (_, options) => { params = options.params; return payload([{ nik: '009', nama: 'Existing' }]); } });
  try {
    await f.input('123456'); await assert.rejects(f.guard, /009 - Existing/);
    assert.equal(params.nik, '001'); assert.equal(params.noidentitas, '123456');
  } finally { f.dispose(); }
});
test('New full value with suffix passes unchanged; blank values do not request duplicates', async () => {
  const queries = [];
  const f = fixture({ get: async (_, options) => { queries.push(options.params.noidentitas); return payload([]); } });
  try {
    await f.input('123456(2)'); await f.guard();
    assert.equal(f.values.kar_noidentitas, '123456(2)'); assert.deepEqual(queries, ['123456(2)']);
    for (const value of [null, '', '   ']) { await f.input(value); await f.flush(); await f.guard(); }
    assert.equal(queries.length, 1);
  } finally { f.dispose(); }
});
for (const target of ['', 'original']) test(`Pending response cannot restore duplicate error after changing to ${JSON.stringify(target)}`, async () => {
  const pending = deferred();
  const f = fixture({ original: 'original', edit: true, get: () => pending.promise });
  try {
    await f.input('duplicate'); const running = f.flush();
    await f.input(target);
    pending.resolve(payload([{ nik: '009', nama: 'Stale' }])); await running;
    assert.equal(f.cekIdentitasDuplikat.value.length, 0);
    assert.equal(f.cekIdentitasJalan.value, false);
  } finally { f.dispose(); }
});
test('Changed value while Save pre-check is pending aborts that Save', async () => {
  const pending = deferred(), f = fixture({ get: () => pending.promise });
  try {
    await f.input('first'); const saving = f.guard(); await f.input('second');
    pending.resolve(payload([])); await assert.rejects(() => saving, /berubah saat diperiksa/);
  } finally { f.dispose(); }
});
test('Failed UX pre-check leaves final validation to the save endpoint', async () => {
  const f = fixture({ get: async () => { throw new Error('network'); } });
  try { await f.input('123456'); await f.guard(); assert.equal(f.cekIdentitasJalan.value, false); }
  finally { f.dispose(); }
});
