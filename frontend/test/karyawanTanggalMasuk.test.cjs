const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('./helpers/frontendVm.cjs');
const ts = require('typescript');
const vue = require('vue');

// Execute the actual initialization/snapshot/reset block without API or DB requests.
function fixture(edit = false, privileged = false) {
  const source = fs.readFileSync(path.join(__dirname, '../src/views/master/KaryawanForm.vue'), 'utf8');
  const block = source.slice(source.indexOf('const values = reactive'), source.indexOf('const memuat = ref(false)'));
  let todayCalls = 0;
  const module = { exports: {} };
  const utils = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/utils/formSnapshot.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module: utils, exports: utils.exports });
  const globals = {
    ...vue, isEdit: vue.ref(edit), memuat: vue.ref(false), canChangeStatus: vue.ref(privileged),
    ...utils.exports,
    jadwalMenu: vue.ref(false), cariJadwal: vue.ref(''),
    todaySql: () => { todayCalls++; return '2026-10-12'; },
    window: { confirm: () => true }, module, exports: module.exports,
  };
  vm.runInNewContext(ts.transpileModule(block + '\nexport { values, resetSnapshot, captureForm, resetForm };',
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, globals);
  return { ...module.exports, calls: () => todayCalls };
}

test('Tambah Karyawan defaults Tanggal Masuk to local today and Reset restores that initial date', () => {
  const f = fixture();
  assert.equal(f.values.kar_tgl_masuk, '2026-10-12');
  assert.equal(f.values.kar_status_aktif, 0);
  assert.equal(f.calls(), 1);
  f.values.kar_tgl_masuk = '2026-09-01';
  f.values.kar_status_aktif = 1;
  assert.equal(f.values.kar_tgl_masuk, '2026-09-01');
  assert.equal(f.resetForm(), true);
  assert.equal(f.values.kar_status_aktif, 0);
  assert.equal(f.values.kar_tgl_masuk, '2026-10-12');
  assert.equal(f.calls(), 1);
});

test('HRD/super starts with an unselected status and Reset restores it', () => {
  const f = fixture(false, true);
  assert.equal(f.values.kar_status_aktif, null);
  f.values.kar_status_aktif = 1;
  assert.equal(f.resetForm(), true);
  assert.equal(f.values.kar_status_aktif, null);
});

test('Edit does not default date to today; existing and NULL dates remain unchanged on Reset', () => {
  for (const date of ['2020-01-15', null]) {
    const f = fixture(true);
    assert.equal(f.calls(), 0);
    assert.equal(f.values.kar_tgl_masuk, undefined);
    Object.assign(f.values, { kar_tgl_masuk: date });
    f.resetSnapshot.value = f.captureForm();
    f.values.kar_tgl_masuk = '2026-10-12';
    assert.equal(f.resetForm(), true);
    assert.equal(f.values.kar_tgl_masuk, date);
    assert.equal(f.calls(), 0);
  }
});
