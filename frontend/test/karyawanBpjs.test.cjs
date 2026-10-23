const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('./helpers/frontendVm.cjs');
const ts = require('typescript');
const vue = require('vue');
const read = file => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
function compile(source, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require: name => dependencies[name] || {}, ...globals });
  return module.exports;
}
const config = compile(read('config/masterSimple.ts'));
const snapshots = compile(read('utils/formSnapshot.ts'));
const expected = new Map([[-1, 'Belum Ada'], [0, 'Belum Ada'], [1, 'Perusahaan'], [2, 'Mandiri'], [3, 'Jamkesmas'], [4, 'Perusahaan Lain'], [5, 'NonAktif Perusahaan']]);
const source = read('views/master/KaryawanForm.vue');
function fixture(status, edit = true) {
  const mounted = [], calls = [], errors = [];
  const loaded = { kar_Nik: '001251415', kar_nama: 'PUJI YANTO', kar_pab_kode: 'P01', kar_jab_kode: 'J01',
    kar_status_aktif: 1, kar_status_BPJS: status, kar_no_BPJS: '0001234567890' };
  const form = compile(source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1] + '\nexport { values, opsiBpjs, simpan, resetForm, formReady };', {
    vue: { ...vue, onMounted: fn => mounted.push(fn), onUnmounted() {} },
    'vue-router': { useRoute: () => ({ query: edit ? { id: loaded.kar_Nik } : {} }) },
    'vue-toastification': { useToast: () => ({ error: message => errors.push(message) }) },
    '@/stores/authStore': { useAuthStore: () => ({ user: { user_kode: 'STAFF' }, can: () => true }) },
    '@/config/masterSimple': config, '@/utils/formSnapshot': snapshots,
    '@/utils/format': { todaySql: () => '2026-10-16' },
    '@/composables/useLiveSearch': { useLiveSearch: () => ({ schedule() {}, run() {}, cancel() {} }) },
    '@/api/axios': { getErrorMessage: error => error.message, api: {
      async get(url) { return { data: { data: url.endsWith('/form-options') ? { bagian: [], atasan: [] } : { karyawan: loaded } } }; },
      async put(url, body) { calls.push({ url, body }); },
      async post(url, body) { calls.push({ url, body }); return { data: { data: { kar_Nik: 'NEW' } } }; },
    } },
  }, { window: { confirm: () => true } });
  return { ...form, calls, async mount() { for (const fn of mounted) await fn(); assert.deepEqual(errors, []); assert.equal(form.formReady.value, true); } };
}

test('Status BPJS binding uses the exact API key and normal options match Delphi', () => {
  assert.match(source, /v-model="values.kar_status_BPJS" label="Status BPJS" :options="opsiBpjs"/);
  assert.doesNotMatch(source, /values\.kar_status_bpjs/);
  assert.deepEqual(Array.from(config.OPSI_BPJS, option => [option.value, option.label]), [...expected].filter(([value]) => value !== -1));
});

test('All stored BPJS codes, as numbers or strings, load and survive save/reset with their number', async () => {
  for (const [code, label] of expected) for (const status of [code, String(code)]) {
    const f = fixture(status); await f.mount();
    const option = f.opsiBpjs.value.find(option => String(option.value) === String(f.values.kar_status_BPJS));
    assert.equal(option?.label, label);
    await f.simpan();
    assert.equal(f.calls[0].body.kar_status_BPJS, status);
    assert.equal(f.calls[0].body.kar_no_BPJS, '0001234567890');
    assert.equal(Object.hasOwn(f.calls[0].body, 'kar_status_bpjs'), false);
    f.values.kar_status_BPJS = code === 1 ? 2 : 1;
    f.values.kar_no_BPJS = 'changed';
    assert.equal(f.resetForm(), true);
    assert.equal(f.values.kar_status_BPJS, status);
    assert.equal(f.values.kar_no_BPJS, '0001234567890');
    await f.simpan();
    assert.equal(f.calls[1].body.kar_status_BPJS, status);
    assert.equal(f.calls[1].body.kar_no_BPJS, '0001234567890');
  }
});

test('PUJI YANTO code 4 displays Perusahaan Lain; legacy option is only present while retaining -1', async () => {
  const employee = fixture(4); await employee.mount();
  assert.equal(employee.opsiBpjs.value.find(option => option.value === 4).label, 'Perusahaan Lain');
  assert.equal(employee.opsiBpjs.value.some(option => option.value === -1), false);
  const legacy = fixture(-1); await legacy.mount();
  assert.equal(legacy.opsiBpjs.value[0].value, -1);
  legacy.values.kar_status_BPJS = 0;
  assert.equal(legacy.opsiBpjs.value.some(option => option.value === -1), false);
  assert.equal(legacy.resetForm(), true);
  assert.equal(legacy.opsiBpjs.value[0].value, -1);
  const added = fixture(undefined, false); await added.mount();
  assert.equal(added.opsiBpjs.value.some(option => option.value === -1), false);
});
