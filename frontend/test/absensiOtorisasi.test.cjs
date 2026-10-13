const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');

test('Absensi authorization uses backend holiday count, ignores stale responses, blocks save on failed check', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/views/absensi/AbsensiForm.vue'), 'utf8');
  const block = source.slice(source.indexOf('const usiaTanggal'), source.indexOf('function otorisasiOke'));
  const requests = [], errors = [];
  const values = vue.reactive({ tanggal: '2026-10-10' });
  const module = { exports: {} };
  const scope = vue.effectScope();
  const context = {
    ...vue, values, module, exports: module.exports,
    api: { get: (url, config) => new Promise((resolve, reject) => requests.push({ url, config, resolve, reject })) },
    toast: { error: message => errors.push(message) }, getErrorMessage: () => 'failed',
  };
  scope.run(() => vm.runInNewContext(ts.transpileModule(block + '\nexport { usiaTanggal, perluOtorisasi, cekTanggalReady, cekTanggalLoading };',
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context));
  const f = module.exports;
  try {
    assert.equal(requests[0].url, '/absensi/cek-otorisasi');
    assert.equal(f.cekTanggalReady.value, false);
    values.tanggal = '2026-10-12';
    requests[1].resolve({ data: { data: { hari: 1 } } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.perluOtorisasi.value, false);
    assert.equal(f.cekTanggalReady.value, true);
    requests[0].resolve({ data: { data: { hari: 10 } } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.usiaTanggal.value, 1);
    values.tanggal = '2026-10-09';
    requests[2].resolve({ data: { data: { hari: 2 } } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.perluOtorisasi.value, true);
    values.tanggal = '2026-10-08';
    requests[3].reject(new Error('network'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.cekTanggalReady.value, false);
    assert.equal(f.cekTanggalLoading.value, false);
    assert.equal(errors.length, 1);
    assert.match(source, /:save-disabled="cekTanggalLoading \|\| !cekTanggalReady"/);
    assert.match(source, /if \(cekTanggalLoading.value \|\| !cekTanggalReady.value\) throw/);
    assert.match(source, /:hari-tanpa-libur="usiaTanggal"/);
  } finally { scope.stop(); }
});
