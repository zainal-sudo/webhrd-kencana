const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { pathToFileURL } = require('node:url');

test('Frontend and backend require CIMB 12 / BSI 10 ASCII digits, preserving leading zeros', async () => {
  const backend = await import(pathToFileURL(path.join(__dirname, '../../backend/src/helpers/pinjaman.js')).href);
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../src/utils/pinjaman.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module, exports: module.exports, require });
  for (const validate of [module.exports.validasiRekeningPinjaman, backend.validasiRekeningPinjaman]) {
    for (const [bank, length] of [['CIMB', 12], ['BSI', 10]]) {
      assert.doesNotThrow(() => validate(bank, '0' + '1'.repeat(length - 1)));
      for (const account of ['', null, 1234567890, '1'.repeat(length - 1), '1'.repeat(length + 1), 'A' + '1'.repeat(length - 1), '１'.repeat(length), ' ' + '1'.repeat(length - 1)]) {
        assert.throws(() => validate(bank, account), new RegExp(`${bank} harus tepat ${length} digit`));
      }
    }
    assert.doesNotThrow(() => validate('LEGACY', 'unchanged'));
  }
  const payload = { nik: '001', tanggal: '2026-10-14', pinjam: 400000, angsuran: 2, bank: 'CIMB', norek: '001234567890' };
  assert.equal(backend.validasiPinjaman(payload).norek, '001234567890');
  assert.throws(() => backend.validasiPinjaman({ ...payload, norek: '0012345678' }), /CIMB harus tepat 12 digit/);
  assert.throws(() => backend.validasiPinjaman({ ...payload, bank: 'BSI' }), /BSI harus tepat 10 digit/);
  const backendSource = fs.readFileSync(path.join(__dirname, '../../backend/src/helpers/pinjaman.js'), 'utf8');
  assert.match(backendSource.slice(backendSource.indexOf('export async function editPinjaman')), /validasiRekeningPinjaman\(data.bank, data.norek\)/);
  const form = fs.readFileSync(path.join(__dirname, '../src/views/transaksi/PinjamanForm.vue'), 'utf8');
  assert.match(form, /validasiRekeningPinjaman\(bank, norek\)/);
});
