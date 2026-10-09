const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');
const root = path.join(__dirname, '../src');
const clone = value => JSON.parse(JSON.stringify(value));
function compile(source, requireModule, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module, exports: module.exports, require: requireModule, ...globals });
  return module.exports;
}

function fixture(name, edit = false, fail = false) {
  const callbacks = [], stops = [], calls = [];
  let confirmed = true;
  const vueModule = { ...vue, onMounted: fn => callbacks.push(fn), watch: (...args) => {
    const stop = vue.watch(...args); stops.push(stop); return stop;
  } };
  const resetModule = compile(fs.readFileSync(path.join(root, 'composables/useTransactionReset.ts'), 'utf8'), () => vueModule,
    { window: { confirm: () => confirmed } });
  const jam = compile(fs.readFileSync(path.join(root, 'utils/jam.ts'), 'utf8'), require);
  const lookupModule = compile(fs.readFileSync(path.join(root, 'composables/useKaryawanLookup.ts'), 'utf8'),
    module => module === 'vue' ? vueModule : { api: { get: async () => { throw Error('unexpected lookup request'); } } });
  const doc = {
    nomor: 'DOC-001', tanggal: '2026-10-09', tanggal2: '2026-10-09', nik: '001', peminta: '001', peminta_nama: 'Peminta',
    jenis_id: 3, jam: '08:00:00', jam2: '09:00:00', alasan: 'Penggantian', keterangan: name === 'Permintaan' ? ['A', 'B'] : 'Keterangan',
    nama: 'Karyawan', jabatan: 'Staff', pabrik: 'P01', bagian: 'HRD', jab_kode: 'J01', jabatan_kode: 'J01',
    pabrik_baru: 'P02', jabatan_baru: 'J02', bagian_baru: 'Gudang', departemen: 'D01', pabrik_lama: 'P01',
    jabatan_lama: 'J01', jabatan_lama_nama: 'Staff', bagian_lama: 'HRD', status_lama: 1, status_baru: 2,
    tgl_awal: '2026-10-09', tgl_akhir: '2027-10-09', periode1: '2026-10-09', periode2: '2027-10-09',
    periode: 1, periode2: name === 'Penilaian' ? 3 : '2027-10-09', tahun: 2026, jumlah: 2, tgl_butuh: '2026-10-10',
    spesifikasi: ['Spec'], detail: [{ nik: '001', nama: 'Karyawan', jam_mulai: '08:00:00', jam_akhir: '09:00:00', nilai: 40 }],
  };
  const api = { async get(url, config) {
    calls.push({ url, config });
    if (url.endsWith('/form')) { if (fail) throw Error('failed load'); return { data: { data: clone(doc) } }; }
    if (url.endsWith('/nomor')) return { data: { data: { nomor: 'PREVIEW' } } };
    if (url.endsWith('/karyawan-info')) return { data: { data: clone(doc) } };
    if (url.endsWith('/lookup')) return { data: { data: { pabrik: [], jabatan: [], departemen: [] } } };
    return { data: { data: [] } };
  } };
  const source = fs.readFileSync(path.join(root, `views/transaksi/${name}Form.vue`), 'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const targetNames = source.match(/useTransactionReset\(\{([^}]+)\}/)[1].trim();
  const extras = ['otorisasi', 'otorisasiToken', 'otorisasiDiterima', 'cariOpen', 'kataCari', 'karyawanLookup'].filter(key => source.includes(`const ${key} =`));
  const result = compile(source + `\nexport const targets = { ${targetNames} };\nexport const extras = { ${extras.join(',')} };\nexport { resetState };`, module => {
    if (module === 'vue') return vueModule;
    if (module === 'vue-router') return { useRoute: () => ({ query: edit ? { id: 'DOC-001' } : {} }), useRouter: () => ({}) };
    if (module === 'vue-toastification') return { useToast: () => ({ error() {}, success() {} }) };
    if (module === '@/api/axios') return { api, getErrorMessage: () => 'error' };
    if (module === '@/utils/format') return { todaySql: () => '2026-10-09' };
    if (module === '@/utils/jam') return jam;
    if (module === '@/composables/useTransactionReset') return resetModule;
    if (module === '@/composables/useKaryawanLookup') return lookupModule;
    if (module === '@/stores/authStore') return { useAuthStore: () => ({ can: () => true }) };
    if (module === '@/stores/tabsStore') return { useTabsStore: () => ({}) };
    return {};
  });
  return { ...result, calls, async mount() { for (const fn of callbacks) await fn(); },
    cancel() { confirmed = false; }, confirm() { confirmed = true; }, dispose() { stops.forEach(stop => stop()); } };
}
function readTargets(targets) {
  return clone(Object.fromEntries(Object.entries(targets).map(([key, value]) => [key, vue.unref(value)])));
}
function dirty(targets) {
  for (const [key, target] of Object.entries(targets)) {
    if (vue.isRef(target)) {
      if (Array.isArray(target.value)) target.value.push({ dirty: true });
      else target.value = typeof target.value === 'boolean' ? !target.value : 'dirty';
    } else if (key === 'values') {
      target.nomor = 'DIRTY';
      if ('tanggal' in target) target.tanggal = '2026-10-01';
      if ('nik' in target) target.nik = '999';
      if (Array.isArray(target.keterangan)) target.keterangan[0] = 'dirty';
      if (Array.isArray(target.spesifikasi)) target.spesifikasi[0] = 'dirty';
    } else target.nama = 'dirty';
  }
}

const forms = ['Ijin', 'Ijin2', 'Keluar', 'Lembur', 'Lembur2', 'Mutasi', 'Penilaian', 'Permintaan', 'PerubahanStatus', 'SP'];
const editForms = forms.filter(name => !['Ijin2', 'Lembur2'].includes(name));
for (const name of forms) for (const edit of [false, ...(editForms.includes(name) ? [true] : [])]) {
  test(`${name} ${edit ? 'Edit' : 'Tambah'}: cancel, repeated reset, arrays, and no reset requests`, async () => {
    const form = fixture(name, edit);
    try {
      assert.equal(form.resetState.disabled.value, true);
      await form.mount();
      assert.equal(form.resetState.disabled.value, false);
      const initial = readTargets(form.targets);
      if (edit) assert.equal(initial.values.nomor, 'DOC-001');
      dirty(form.targets);
      // Drain all normal field-change watchers before clicking Reset.
      await vue.nextTick();
      for (let i = 0; i < 12; i++) await Promise.resolve();
      await vue.nextTick();
      const changed = readTargets(form.targets);
      form.cancel();
      assert.equal(form.resetState.reset(), false);
      assert.deepEqual(readTargets(form.targets), changed);
      form.confirm();
      const requests = form.calls.length;
      if (form.extras.otorisasiToken) form.extras.otorisasiToken.value = 'token';
      if (form.extras.otorisasi) form.extras.otorisasi.user_password = 'secret';
      assert.equal(form.resetState.reset(), true);
      await vue.nextTick();
      assert.deepEqual(readTargets(form.targets), initial);
      assert.equal(form.calls.length, requests);
      assert.equal(form.extras.cariOpen.value, false);
      assert.equal(form.extras.kataCari.value, '');
      if (form.extras.otorisasiToken) assert.equal(form.extras.otorisasiToken.value, '');
      if (form.extras.otorisasi) assert.equal(form.extras.otorisasi.user_password, '');
      dirty(form.targets);
      // Reset in the same tick is guarded against subsequent queued watchers.
      assert.equal(form.resetState.reset(), true);
      await vue.nextTick();
      assert.deepEqual(readTargets(form.targets), initial);
      assert.equal(form.calls.length, requests);
    } finally { form.dispose(); }
  });
}
for (const name of editForms) test(`${name}: failed Edit load leaves Reset disabled`, async () => {
  const form = fixture(name, true, true);
  try {
    await form.mount();
    assert.equal(form.resetState.disabled.value, true);
    assert.equal(form.resetState.reset(), false);
  } finally { form.dispose(); }
});

test('pending requests block Reset until completion; proxy preserves API parameters', async () => {
  const resetModule = compile(fs.readFileSync(path.join(root, 'composables/useTransactionReset.ts'), 'utf8'), () => vue, { window: { confirm: () => true } });
  const values = vue.reactive({ nik: '' });
  const reset = resetModule.useTransactionReset({ values }, { afterRestore() {} });
  await reset.initialize();
  let resolve;
  const api = reset.trackApi({ get(url, config) { assert.equal(url, '/info'); assert.equal(config.params.nik, '001'); return new Promise(r => { resolve = r; }); } });
  const pending = api.get('/info', { params: { nik: '001' } });
  assert.equal(reset.disabled.value, true);
  assert.equal(reset.reset(), false);
  resolve({ data: {} });
  await pending;
  assert.equal(reset.disabled.value, false);
});
