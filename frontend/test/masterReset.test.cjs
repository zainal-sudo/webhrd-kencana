const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');
const root = path.join(__dirname, '../src');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function compile(source, dependencies, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module, exports: module.exports, require: name => dependencies[name] || {}, ...globals });
  return module.exports;
}
const snapshotUtils = compile(read('utils/formSnapshot.ts'), {});
function fixture(settings = {}) {
  let confirmed = true;
  const calls = [], messages = [], mounted = [];
  const route = { path: '/master/jadwal/form', meta: { form: 'frmJadwal' }, query: settings.edit ? { id: '001' } : {} };
  const auth = { useAuthStore: () => ({ can: () => true }) };
  const reset = compile(read('composables/useTransactionReset.ts'), { vue, '@/utils/formSnapshot': snapshotUtils }, { window: { confirm(message) { messages.push(message); return confirmed; } } });
  const data = settings.doc || { code: '001', name: 'Loaded', time: '08:30:00', active: 0, nullable: null };
  const api = { get: async () => { calls.push('get'); if (settings.loadFail) throw Error('Failed load'); return { data: { data } }; },
    post: async () => { calls.push('post'); if (settings.pending) await settings.pending; },
    put: async () => { calls.push('put'); if (settings.pending) await settings.pending; } };
  const props = { endpoint: '/master/jadwal', fields: Object.keys(data).map(key => ({ key, label: key })) };
  const dependencies = { vue: { ...vue, onMounted: fn => mounted.push(fn) },
    'vue-router': { useRoute: () => route, useRouter: () => ({}) },
    'vue-toastification': { useToast: () => ({ error() {} }) }, '@/api/axios': { api, getErrorMessage: () => 'error' },
    '@/stores/authStore': auth, '@/stores/tabsStore': { useTabsStore: () => ({}) },
    '@/composables/useTransactionReset': reset, '@/utils/jam': { assertClockTime() {} } };
  const form = compile(read('components/MasterForm.vue').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1] +
    '\nexport { values, resetState, loading, ready, save };', dependencies,
    { defineProps: () => props, withDefaults: (props, defaults) => ({ ...defaults, ...props }) });
  const resetProps = { resetFn: form.resetState.reset, get resetDisabled() { return form.resetState.disabled.value; } };
  const footer = compile(read('components/BaseForm.vue').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1] + '\nexport { doReset };',
    { ...dependencies, vue }, { defineProps: () => resetProps, withDefaults: (props, defaults) => new Proxy(defaults, { get: (target, key) => key in props ? props[key] : target[key] }) });
  return { ...form, footer, data, calls, messages, cancel: () => { confirmed = false; }, confirm: () => { confirmed = true; },
    async mount() { for (const fn of mounted) await fn(); } };
}
for (const edit of [false, true]) test(`Master ${edit ? 'Edit' : 'Tambah'} Reset works through footer, supports cancel/repeated reset, and sends no requests`, async () => {
  const f = fixture({ edit });
  assert.equal(f.resetState.disabled.value, true); f.footer.doReset(); assert.equal(f.messages.length, 0);
  await f.mount(); assert.equal(f.resetState.disabled.value, true);
  const original = JSON.parse(JSON.stringify(f.values));
  Object.assign(f.values, { code: 'CHANGED', name: 'Unsaved', time: '07:00:00', extra: 'remove me' });
  assert.equal(f.resetState.disabled.value, false);
  const dirty = JSON.parse(JSON.stringify(f.values));
  f.cancel(); f.footer.doReset(); assert.deepEqual(JSON.parse(JSON.stringify(f.values)), dirty);
  f.confirm(); const count = f.calls.length;
  f.footer.doReset(); await vue.nextTick();
  assert.deepEqual(JSON.parse(JSON.stringify(f.values)), original); assert.equal(f.calls.length, count);
  assert.equal(f.values.extra, undefined);
  Object.assign(f.values, { name: 'Again' }); f.footer.doReset(); await vue.nextTick();
  assert.deepEqual(JSON.parse(JSON.stringify(f.values)), original); assert.equal(f.calls.length, count);
  if (edit) { assert.equal(f.values.code, '001'); assert.equal(f.values.active, 0); assert.equal(f.values.nullable, null); }
  else assert.ok(Object.values(f.values).every(value => value === null));
});
test('Failed Edit load never enables Reset or captures default values', async () => {
  const f = fixture({ edit: true, loadFail: true }); await f.mount();
  assert.equal(f.ready.value, false); assert.equal(f.resetState.disabled.value, true);
  f.footer.doReset(); assert.equal(f.messages.length, 0); assert.equal(f.calls.length, 1);
});
test('Reset is disabled during save and during restoration; save cannot run midway through reset', async () => {
  let resolve; const pending = new Promise(done => { resolve = done; });
  const f = fixture({ edit: true, pending }); await f.mount();
  const saving = f.save(); assert.equal(f.resetState.disabled.value, true);
  f.footer.doReset(); assert.equal(f.messages.length, 0);
  resolve(); await saving;
  f.values.name = 'Unsaved'; f.footer.doReset(); assert.equal(f.resetState.disabled.value, true);
  const before = f.calls.length; await assert.rejects(f.save(), /Form belum siap/); assert.equal(f.calls.length, before);
  await vue.nextTick(); assert.equal(f.resetState.disabled.value, true);
});
test('All ten simple Master forms share Reset wiring; employee snapshot reset remains installed', () => {
  const form = read('components/MasterForm.vue');
  assert.match(form, /:reset-fn="resetState.reset"/); assert.match(form, /:reset-disabled="resetState.disabled.value"/);
  assert.equal((form.match(/resetState.capture\(\)/g) || []).length, 2);
  const files = fs.readdirSync(path.join(root, 'views/master')).filter(file => file.endsWith('Form.vue') && !['KaryawanForm.vue', 'SandiBpjsForm.vue'].includes(file));
  assert.equal(files.length, 10); for (const file of files) assert.match(read(`views/master/${file}`), /<MasterForm/);
  const employee = read('views/master/KaryawanForm.vue');
  assert.match(employee, /:reset-fn="resetForm"/); assert.match(employee, /resetSnapshot.value = captureForm\(\)/);
});
