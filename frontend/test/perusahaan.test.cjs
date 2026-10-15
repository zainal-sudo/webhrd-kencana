const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');
const source = fs.readFileSync(path.join(__dirname, '../src/views/master/PerusahaanView.vue'), 'utf8');

function fixture({ missing = false, failedLoad = false, failedSave = false, rights = { insert: true, edit: true }, pending } = {}) {
  const mounted = [], calls = [], notices = [];
  const loaded = { per_nama: 'PT Contoh', per_alamat: 'Alamat Lama', per_kota: 'Solo', per_npwp: '00123' };
  const auth = { can: (form, action) => form === 'frmPerusahaan' && !!rights[action] };
  const api = {
    async get(url) {
      calls.push({ method: 'get', url });
      if (missing) throw { response: { status: 404 } };
      if (failedLoad) throw Error('load error');
      return { data: { data: loaded } };
    },
    async put(url, body) { calls.push({ method: 'put', url, body }); if (pending) await pending; if (failedSave) throw Error('save error'); return { data: {} }; },
    async post(url, body) { calls.push({ method: 'post', url, body }); if (failedSave) throw Error('save error'); return { data: {} }; },
  };
  const dependencies = {
    vue: { ...vue, onMounted: fn => mounted.push(fn) },
    'vue-router': { useRouter: () => ({ back: () => calls.push({ back: true }) }) },
    'vue-toastification': { useToast: () => ({ success: (message, options) => notices.push({ success: message, options }), error: message => notices.push({ error: message }) }) },
    '@/stores/authStore': { useAuthStore: () => auth },
    '@/api/axios': { api, getErrorMessage: (_error, fallback) => fallback },
  };
  const module = { exports: {} };
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1] + '\nexport { values, sections, simpan, muat, canSave, siap, memuat, menyimpan, fieldsDisabled, dataBaru };';
  vm.runInNewContext(ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require: name => dependencies[name] || {} });
  return { ...module.exports, calls, notices, loaded, async mount() { for (const fn of mounted) await fn(); } };
}

test('Load existing company; grouped fields keep all 17 original database keys', async () => {
  const f = fixture(); await f.mount();
  assert.equal(f.siap.value, true); assert.equal(f.values.per_nama, 'PT Contoh'); assert.equal(f.dataBaru.value, false);
  const fields = f.sections.flatMap(section => section.fields);
  assert.equal(fields.length, 17); assert.equal(new Set(fields.map(field => field.key)).size, 17);
  for (const key of ['per_alamat', 'per_keterangan']) assert.equal(fields.find(field => field.key === key).size, 'full');
  assert.equal(f.values.per_npwp, '00123');
});

test('Save PUT displays success for five seconds, stays on page and preserves values', async () => {
  const f = fixture(); await f.mount(); f.values.per_alamat = 'Alamat Baru';
  await f.simpan();
  assert.equal(f.calls.at(-1).method, 'put'); assert.equal(f.calls.at(-1).url, '/master/perusahaan');
  assert.equal(f.calls.at(-1).body.per_alamat, 'Alamat Baru');
  assert.equal(f.notices[0].success, 'Identitas perusahaan berhasil disimpan.');
  assert.equal(f.notices[0].options.timeout, 5000); assert.equal(f.calls.some(call => call.back), false);
  assert.equal(f.menyimpan.value, false); assert.equal(f.values.per_alamat, 'Alamat Baru');
});

test('404 allows first company POST with Insert; later saves use PUT/Edit', async () => {
  const f = fixture({ missing: true }); await f.mount();
  assert.equal(f.dataBaru.value, true); assert.equal(f.siap.value, true);
  f.values.per_nama = 'Perusahaan Baru'; await f.simpan(); assert.equal(f.calls.at(-1).method, 'post');
  assert.equal(f.dataBaru.value, false); await f.simpan(); assert.equal(f.calls.at(-1).method, 'put');
});

test('Failed save shows error, keeps entered data, releases guard and permits retry', async () => {
  const f = fixture({ failedSave: true }); await f.mount(); f.values.per_nama = 'Belum Tersimpan';
  await f.simpan(); assert.equal(f.values.per_nama, 'Belum Tersimpan');
  assert.equal(f.notices[0].error, 'Gagal menyimpan identitas perusahaan.');
  assert.equal(f.notices.some(notice => notice.success), false); assert.equal(f.menyimpan.value, false);
  await f.simpan(); assert.equal(f.calls.filter(call => call.method === 'put').length, 2);
});

test('Missing name and failed initialization cannot save', async () => {
  const f = fixture(); await f.mount(); f.values.per_nama = '   '; await f.simpan();
  assert.equal(f.calls.length, 1); assert.equal(f.notices[0].error, 'Nama perusahaan wajib diisi.');
  const failed = fixture({ failedLoad: true }); await failed.mount(); await failed.simpan();
  assert.equal(failed.siap.value, false); assert.equal(failed.fieldsDisabled.value, true); assert.equal(failed.calls.length, 1);
});

test('Insert/Edit rights are separate and View-only cannot write', async () => {
  for (const missing of [false, true]) {
    const f = fixture({ missing, rights: {} }); await f.mount(); await f.simpan();
    assert.equal(f.canSave.value, false); assert.equal(f.calls.length, 1);
  }
  const insertOnly = fixture({ missing: true, rights: { insert: true } }); await insertOnly.mount();
  insertOnly.values.per_nama = 'New'; await insertOnly.simpan(); assert.equal(insertOnly.canSave.value, false);
});

test('Repeated clicks during save do not duplicate requests', async () => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const f = fixture({ pending }); await f.mount();
  const saving = f.simpan(); assert.equal(f.fieldsDisabled.value, true);
  await f.simpan(); assert.equal(f.calls.filter(call => call.method === 'put').length, 1);
  resolve(); await saving; assert.equal(f.fieldsDisabled.value, false);
});

test('Responsive theme-aware grouped form has scrolling body, fixed footer and accessible labels', () => {
  assert.match(source, /@submit.prevent="simpan"/);
  assert.match(source, /<footer class="company-footer">/);
  assert.match(source, /\.company-body \{[^}]*min-height: 0; overflow: auto/);
  assert.match(source, /\.company-footer \{[^}]*flex-shrink: 0/);
  assert.match(source, /@media \(max-width: 560px\)/);
  assert.match(source, /\.company-field \{[^}]*flex-direction: column/);
  assert.match(source, /v-if="canSave" type="submit"/);
  assert.match(source, /var\(--ds-surface/); assert.match(source, /var\(--ds-on-surface/);
  assert.match(source, /\.company-section \{[^}]*background: color-mix\(in srgb, var\(--ds-bg, #e8ecf1\) 94%, var\(--ds-on-surface, #12324f\) 6%\)/);
});
