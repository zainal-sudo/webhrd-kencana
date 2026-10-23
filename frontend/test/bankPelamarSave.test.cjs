const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('./helpers/frontendVm.cjs');
const ts = require('typescript');

function fixture(edit = false, fail = false) {
  const calls = [];
  const values = { nomor: 'PREVIEW', tanggal: '2026-10-23', nama: 'Pelamar Baru', identitas: '001234' };
  const scope = {
    values, isEdit: { value: edit }, nomorEdit: { value: edit ? 'SAVED' : '' },
    pengalaman: { value: [{ namaperusahaan: 'Perusahaan Lama' }] }, tes: { value: [{ id: 1, hasil: 'Baik' }] },
    api: Object.fromEntries(['post', 'put'].map(method => [method, async (url, body) => {
      calls.push({ method, url, body });
      if (fail) throw Error('Simpan gagal');
      return { data: { message: 'Berhasil simpan', data: { nomor: 'FINAL' } } };
    }])),
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/views/transaksi/BankPelamarForm.vue'), 'utf8');
  const save = source.slice(source.indexOf('async function simpan()'), source.indexOf('onMounted(async'));
  const compiled = ts.transpileModule(save, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled + '\nglobalThis.save = simpan;', scope);
  return { ...scope, calls };
}

test('Add Bank Pelamar POST omits preview number and keeps applicant details', async () => {
  const f = fixture();
  assert.equal(await f.save(), 'Berhasil simpan');
  const call = f.calls[0];
  assert.equal(call.method, 'post');
  assert.equal(call.url, '/transaksi/bank-pelamar');
  assert.equal(Object.hasOwn(call.body, 'nomor'), false);
  assert.equal(call.body.identitas, '001234');
  assert.equal(call.body.pengalaman, f.pengalaman.value);
  assert.equal(call.body.tes, f.tes.value);
  assert.equal(f.values.nomor, 'PREVIEW');
});

test('Edit Bank Pelamar PUT uses the original document number', async () => {
  const f = fixture(true);
  await f.save();
  assert.equal(f.calls[0].method, 'put');
  assert.equal(f.calls[0].body.nomor, 'SAVED');
});

test('Failed Bank Pelamar save preserves the draft and preview for retry', async () => {
  const f = fixture(false, true);
  const before = JSON.stringify(f.values);
  await assert.rejects(f.save(), /Simpan gagal/);
  assert.equal(JSON.stringify(f.values), before);
});
