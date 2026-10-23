const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('./helpers/frontendVm.cjs');

test('SPL allows H through H+2; frontend and backend require authorization starting H+3', async () => {
  const frontend = fs.readFileSync(path.join(__dirname, '../src/views/transaksi/LemburForm.vue'), 'utf8');
  const backend = fs.readFileSync(path.join(__dirname, '../../backend/src/controllers/transaksi/lemburController.js'), 'utf8');
  const frontendExpression = frontend.match(/const perluOtorisasi = computed\(\(\) => ([^;]+)\);/)[1];
  const backendExpression = backend.match(/if \(\((await cekTanggal\(tanggal\))\) ([><=]+ \d+)\) \{/);
  assert.ok(backendExpression);
  for (const days of [0, 1, 2, 3, 4]) {
    const context = { values: { tanggal: '2026-10-12' }, tanggal: '2026-10-12', selisihHari: () => days, cekTanggal: async () => days };
    assert.equal(vm.runInNewContext(frontendExpression, context), days > 2, `frontend H+${days}`);
    assert.equal(await vm.runInNewContext(`(async () => (${backendExpression[1]}) ${backendExpression[2]})()`, context), days > 2, `backend H+${days}`);
  }
  // Preserve the existing backend holiday-aware count and authorization token check.
  assert.match(backend, /cekTanggal \} from '\.\/ijinController\.js'/);
  assert.match(backend, /atasan = userDariToken\(b\.otorisasi_token\)/);
});
