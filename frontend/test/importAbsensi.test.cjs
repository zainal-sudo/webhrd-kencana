const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('./helpers/frontendVm.cjs');
const ts = require('typescript');
const vue = require('vue');

function compile(source, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module, exports: module.exports, ...globals });
  return module.exports;
}

function fixture() {
  const source = fs.readFileSync(path.join(__dirname, '../src/views/absensi/ImportAbsensiView.vue'), 'utf8');
  const format = compile(fs.readFileSync(path.join(__dirname, '../src/utils/format.ts'), 'utf8'));
  const requests = [], errors = [], successes = [];
  let finish, fail;
  class FakeFormData {
    constructor() { this.values = new Map(); }
    append(key, value) { this.values.set(key, value); }
  }
  const state = compile(source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1] + '\nexport {periode,fileBody,namaFile,mengunggah,berkasMdb,unggah,pilihFile,pabrik};', {
    FormData: FakeFormData,
    require(name) {
      if (name === 'vue') return { ...vue, onMounted() {} };
      if (name === 'vue-toastification') return { useToast: () => ({ error: text => errors.push(text), success: text => successes.push(text) }) };
      if (name === '@/utils/format') return format;
      if (name === '@/api/axios') return { getErrorMessage: error => error.message, api: {
        get: async () => ({ data: { data: {} } }),
        post: (url, body, options) => { requests.push({ url, body, options }); return new Promise((resolve, reject) => { finish = resolve; fail = reject; }); },
      } };
      return {};
    },
  });
  return { source, state, requests, errors, successes, finish: () => finish({ data: { message: 'Selesai' } }), fail: () => fail(Error('Import gagal')) };
}

test('Import Absensi defaults both date fields to the same current day', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/views/absensi/ImportAbsensiView.vue'), 'utf8');
  const initialization = source.match(/const hariIni = todaySql\(\);\s*const periode = reactive\([^;]+\);/);
  assert.ok(initialization);
  for (const date of ['2026-10-13', '2026-11-01', '2027-01-01']) {
    let calls = 0;
    const scope = { todaySql: () => { calls++; return date; }, reactive: value => value };
    vm.runInNewContext(initialization[0] + '\nglobalThis.result = periode;', scope);
    assert.equal(scope.result.start, date);
    assert.equal(scope.result.end, date);
    assert.equal(calls, 1);
  }
  assert.doesNotMatch(source, /firstDayOfMonth/);
});

test('MDB: periode kosong, tanggal kalender invalid, dan periode terbalik tidak mengirim request', async () => {
  const f = fixture();
  f.state.fileBody.value = { name: 'scan.MDB' };
  for (const [start, end] of [['', '2026-10-23'], ['2026-02-30', '2026-03-01'], ['2026-10-24', '2026-10-23']]) {
    Object.assign(f.state.periode, { start, end });
    await f.state.unggah();
    assert.equal(f.state.mengunggah.value, false);
  }
  assert.equal(f.requests.length, 0);
  assert.equal(f.errors.length, 3);
});

test('MDB: satu klik memakai periode terpilih, klik ganda dan pergantian file ditolak selama import', async () => {
  const f = fixture();
  f.state.fileBody.value = { name: 'scan.mdb' };
  f.state.pabrik.value = [{ pilih: true, Path: 'mesin-p04' }];
  Object.assign(f.state.periode, { start: '2026-12-31', end: '2027-01-01' });
  const pending = f.state.unggah();
  assert.equal(f.state.mengunggah.value, true);
  assert.equal(f.state.berkasMdb.value, true);
  await f.state.unggah();
  f.state.pilihFile({ target: { files: [{ name: 'pengganti.csv' }] } });
  assert.equal(f.state.fileBody.value.name, 'scan.mdb');
  assert.equal(f.requests.length, 1);
  const request = f.requests[0];
  assert.equal(request.url, '/absensi/staging');
  assert.equal(request.body.values.get('start_date'), '2026-12-31');
  assert.equal(request.body.values.get('end_date'), '2027-01-01');
  assert.equal(request.body.values.get('path'), 'mesin-p04');
  assert.equal(request.options.timeout, 600000);
  f.finish(); await pending;
  assert.equal(f.state.mengunggah.value, false);
  assert.equal(f.state.fileBody.value, null);
  assert.equal(f.successes.length, 1);
  for (const name of ['periode.start', 'periode.end']) assert.ok(f.source.includes(`v-model="${name}" :disabled="mengunggah"`));
  assert.match(f.source, /type="file"[^>]*:disabled="mengunggah"/);
  assert.match(f.source, /Mengekstrak dan mengimpor\.\.\./);
});

test('Import gagal membuka kembali kontrol dan mempertahankan berkas untuk dicoba ulang', async () => {
  const f = fixture();
  f.state.fileBody.value = { name: 'scan.mdb' };
  const pending = f.state.unggah();
  f.fail(); await pending;
  assert.equal(f.state.mengunggah.value, false);
  assert.equal(f.state.fileBody.value.name, 'scan.mdb');
  assert.deepEqual(f.errors, ['Import gagal']);
});
