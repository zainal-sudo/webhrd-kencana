const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');
const source = fs.readFileSync(path.join(__dirname, '../src/views/master/KaryawanForm.vue'), 'utf8');

function fixture(user, edit, original = null) {
  const calls = [];
  const module = { exports: {} };
  const getter = source.slice(source.indexOf('const canChangeStatus ='), source.indexOf('const values = reactive'));
  const save = source.slice(source.indexOf('async function simpan()'), source.indexOf('/**', source.indexOf('async function simpan()')));
  const peringatanFn = source.match(/function tampilkkanPeringatanIdentitas\([\s\S]*?\n\}/)[0];
  const values = { kar_status_aktif: original, kar_nama: 'Employee', kar_pab_kode: 'P01', kar_jab_kode: 'STAFF' };
  const globals = { ...vue, module, exports: module.exports, auth: { user: { user_kode: user } }, values,
    canSave: vue.ref(true), isEdit: vue.ref(edit), nik: vue.ref('001'), memuat: vue.ref(false), formReady: vue.ref(true),
    resetSnapshot: vue.ref({ values: { kar_status_aktif: original } }), anak: vue.ref([]), pendidikan: vue.ref([]), pengalaman: vue.ref([]),
    keahlian: vue.ref([]), jadwalTerpilih: vue.ref([]), pkwt: vue.ref([]), fotoBase64: vue.ref(''),
    api: { async put(url, body) { calls.push(body); return { data: { data: {} } }; }, async post(url, body) { calls.push(body); return { data: { data: { kar_Nik: '001' } } }; } } };
  vm.runInNewContext(ts.transpileModule(getter + save + peringatanFn + '\nexport { canChangeStatus, simpan };', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, globals);
  return { ...module.exports, values, calls };
}

test('Only HRD/super can choose status and must choose it on create', async () => {
  for (const user of ['HRD', 'hrd', 'super', 'SuPeR']) {
    const f = fixture(user, false);
    assert.equal(f.canChangeStatus.value, true);
    await assert.rejects(f.simpan(), /Status Aktif wajib/);
    f.values.kar_status_aktif = 1;
    await f.simpan();
    assert.equal(f.calls[0].kar_status_aktif, 1);
    await fixture(user, true, 1).simpan();
    await assert.rejects(fixture(user, true, null).simpan(), /Status Aktif wajib/);
  }
});

test('Other accounts submit inactive status on create and omit status when editing', async () => {
  for (const edit of [false, true]) for (const original of [null, 0, 1]) {
    const f = fixture('STAFF', edit, original);
    assert.equal(f.canChangeStatus.value, false);
    await f.simpan();
    if (edit) assert.equal(Object.hasOwn(f.calls[0], 'kar_status_aktif'), false);
    else assert.equal(f.calls[0].kar_status_aktif, 0);
  }
});

test('Status control is locked with the exact notice; browse retains active/inactive filters', () => {
  assert.match(source, /:disabled="!canChangeStatus \|\| !canSave \|\| memuat \|\| !formReady"/);
  assert.match(source, /Status aktif\/non aktif hanya dapat diubah oleh HRD/);
  const browse = fs.readFileSync(path.join(__dirname, '../src/views/master/KaryawanView.vue'), 'utf8');
  assert.match(browse, /Status: \["Aktif", "Non Aktif"\]/);
  assert.doesNotMatch(browse, /Belum Ditentukan/);
});

test('Employee exit date is omitted from add/edit payload; work history dates remain', async () => {
  for (const edit of [false, true]) {
    const f = fixture('HRD', edit, 1);
    f.values.kar_tgl_keluar = '2026-10-15';
    await f.simpan();
    assert.equal(Object.hasOwn(f.calls[0], 'kar_tgl_keluar'), false);
    assert.equal(f.values.kar_tgl_keluar, '2026-10-15');
  }
  assert.doesNotMatch(source, /v-model="values.kar_tgl_keluar"/);
  assert.match(source, /karp_tglkeluar/);
  const browse = fs.readFileSync(path.join(__dirname, '../src/views/master/KaryawanView.vue'), 'utf8');
  assert.match(browse, /key: "TglMasuk"[^\n]*\n\s*\{ key: "TglKeluar", label: "Tgl Keluar", type: "date"/);
});
