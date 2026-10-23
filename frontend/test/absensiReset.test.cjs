const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('./helpers/frontendVm.cjs');
const ts = require('typescript');
const vue = require('vue');
const root = path.join(__dirname, '../src');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function compile(source, requireModule, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require: requireModule, ...globals });
  return module.exports;
}
const snapshotUtils = compile(read('utils/formSnapshot.ts'), require);
function fixture(edit, fail = false) {
  const scope = vue.effectScope(), mounted = [], calls = [], errors = [];
  let confirmed = true, cleared = 0, cancelled = 0;
  const { useTransactionReset } = compile(read('composables/useTransactionReset.ts'), name => name === 'vue' ? vue : snapshotUtils, { window: { confirm: () => confirmed } });
  const source = read('views/absensi/AbsensiForm.vue').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const api = { async get(url, config) {
    calls.push({ url, config });
    if (url.endsWith('cek-otorisasi')) return { data: { data: { hari: config.params.tanggal === '2026-10-13' ? 0 : 3 } } };
    if (fail) throw new Error('load failed');
    return { data: { data: { ada: true, masuk: '08:00:00', keluar: '16:30:00', scan1: '08:05:00', scan2: '17:00:00', status: 2, verifikasi: 1,
      karyawan: { kar_nama: 'Employee', kar_Nik: '0001', kar_bagian: 'HO' } } } };
  } };
  const result = scope.run(() => compile(source + '\nexport { values, info, adaRecord, usiaTanggal, cekTanggalReady, resetState, otorisasiToken, otorisasiDiterima, cariKaryawan, kataCariKaryawan, memuat, cariLoading, muatData };', name => {
    if (name === 'vue') return { ...vue, onMounted: fn => mounted.push(fn) };
    if (name === 'vue-router') return { useRoute: () => ({ query: edit ? { nik: 'ABC', tanggal: '2026-10-10' } : {} }), useRouter: () => ({}) };
    if (name === 'vue-toastification') return { useToast: () => ({ error: message => errors.push(message) }) };
    if (name === '@/composables/useTransactionReset') return { useTransactionReset };
    if (name === '@/composables/useKaryawanLookup') return { useKaryawanLookup: () => ({ loading: false, clear() { cleared++; }, invalidate() {} }) };
    if (name === '@/composables/useLiveSearch') return { useLiveSearch: () => ({ cancel() { cancelled++; } }) };
    if (name === '@/api/axios') return { api, getErrorMessage: e => e.message };
    if (name === '@/utils/format') return { todaySql: () => '2026-10-13' };
    return {};
  }, { window: { confirm: () => confirmed } }));
  return { ...result, calls, errors, async mount() { for (const fn of mounted) await fn(); },
    confirm(value) { confirmed = value; }, get cleared() { return cleared; }, get cancelled() { return cancelled; }, dispose() { scope.stop(); } };
}
const settle = async () => { await vue.nextTick(); await new Promise(resolve => setImmediate(resolve)); await vue.nextTick(); };
function snapshot(f) { return plain({ values: f.values, info: f.info, ada: f.adaRecord.value, hari: f.usiaTanggal.value, ready: f.cekTanggalReady.value }); }

for (const edit of [false, true]) {
  test(`Absensi ${edit ? 'Edit' : 'Tambah'} Reset confirms, restores baseline repeatedly, clears authorization/lookup, and makes no requests`, async () => {
    const f = fixture(edit);
    try {
      assert.equal(f.resetState.disabled.value, true);
      await f.mount();
      const initial = snapshot(f);
      assert.equal(f.resetState.disabled.value, true);
      assert.equal(initial.values.nik, edit ? 'ABC' : '');
      assert.equal(initial.ada, edit);
      for (let attempt = 0; attempt < 2; attempt++) {
        f.values.nik = 'OTHER'; f.values.tanggal = '2026-10-09';
        f.values.scan1 = '12:00:00'; f.values.verifikasi = 0;
        f.info.nama = 'Changed';
        await settle();
        const dirty = snapshot(f);
        f.confirm(false);
        assert.equal(f.resetState.reset(), false);
        assert.deepEqual(snapshot(f), dirty);
        f.confirm(true);
        f.otorisasiToken.value = 'token'; f.otorisasiDiterima.value = true;
        f.cariKaryawan.value = true; f.kataCariKaryawan.value = 'search';
        const count = f.calls.length;
        assert.equal(f.resetState.reset(), true);
        await settle();
        assert.deepEqual(snapshot(f), initial);
        assert.equal(f.resetState.disabled.value, true);
        assert.equal(f.calls.length, count);
        assert.equal(f.otorisasiToken.value, '');
        assert.equal(f.otorisasiDiterima.value, false);
        assert.equal(f.cariKaryawan.value, false);
        assert.equal(f.kataCariKaryawan.value, '');
      }
      assert.equal(f.cleared, 2);
      assert.equal(f.cancelled, 2);
      const source = read('views/absensi/AbsensiForm.vue');
      assert.match(source, /:reset-fn="resetState.reset"/);
      assert.match(source, /:reset-disabled="resetState.disabled.value"/);
    } finally { f.dispose(); }
  });
}

test('Absensi failed Edit load keeps Reset disabled; loading and lookup also block Reset', async () => {
  const failed = fixture(true, true);
  try {
    await failed.mount();
    assert.equal(failed.resetState.disabled.value, true);
    assert.equal(failed.resetState.reset(), false);
  } finally { failed.dispose(); }
  const f = fixture(false);
  try {
    await f.mount();
    f.values.scan1 = '12:00:00';
    for (const flag of [f.memuat, f.cariLoading]) {
      flag.value = true;
      assert.equal(f.resetState.reset(), false);
      flag.value = false;
    }
    assert.equal(f.resetState.disabled.value, false);
  } finally { f.dispose(); }
});
