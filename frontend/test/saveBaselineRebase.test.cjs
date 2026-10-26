const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/utils/unsavedChanges.ts'), 'utf8');

function load() {
  const module = { exports: {} };
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(output, { module, exports: module.exports });
  return module.exports;
}

/** Alur BaseForm.doSave: begin → saveFn (boleh menempel nilai server) → finish(success). */
function doSave(u, id, form, mutateDuringSave, success) {
  const finish = u.beginDraftSave(id);
  if (mutateDuringSave) mutateDuringSave();
  form.calls.push('saved to server');
  finish(success);
}

test('Simpan sukses + rebaseline (nilai server ditempel saveFn): tab langsung bersih', () => {
  const u = load();
  const form = { calls: [], values: { masuk: '08:00:00', status: 1 } };
  const draft = u.registerDraft('tab-1', { title: 'absensi', dirty: () => false, state: () => ({ ...form.values }) });
  try {
    // Persis useTransactionReset.capture(): snapshot segar LALU rebase.
    doSave(u, 'tab-1', form, () => { form.values.masuk = '07:30:00'; form.values.status = 2; form.calls.push('tempel nilai server'); draft.rebase(); }, true);
    assert.equal(u.isTabDirty('tab-1'), false, 'tab harus bersih setelah sukses — BaseForm langsung bisa menutup');
  } finally { draft.dispose(); u.clearDrafts(); }
});

test('Isian user SAAT simpan (tanpa rebaseline) tetap menahan tab terbuka (proteksi jalan)', () => {
  const u = load();
  const form = { calls: [], values: { masuk: '08:00:00' } };
  const draft = u.registerDraft('tab-2', { title: 'form', dirty: () => false, state: () => ({ ...form.values }) });
  try {
    doSave(u, 'tab-2', form, () => { form.values.masuk = '09:00:00'; form.calls.push('ketik saat simpan'); }, true);
    assert.equal(u.isTabDirty('tab-2'), true, 'edit yang diketik selama simpan tidak ikut dibersihkan');
  } finally { draft.dispose(); u.clearDrafts(); }
});

test('Isian user SETELAH simpan sukses tetap terdeteksi dirty (proteksi jalan)', () => {
  const u = load();
  const form = { calls: [], values: { masuk: '08:00:00' } };
  const draft = u.registerDraft('tab-2', { title: 'absensi', dirty: () => false, state: () => ({ ...form.values }) });
  try {
    doSave(u, 'tab-2', form, null, true);
    form.values.masuk = '09:00:00';
    assert.equal(u.isTabDirty('tab-2'), true, 'isian baru setelah sukses tetap dianggap edit');
  } finally { draft.dispose(); u.clearDrafts(); }
});

function testGagal() {
  const u = load();
  const form = { calls: [], values: { masuk: '08:00:00' } };
  // Sesuai kenyataan (useTransactionReset): dirty() membandingkan snapshot yang diambil saat load.
  const baseline = JSON.stringify({ masuk: '08:00:00' });
  const draft = u.registerDraft('tab-3', { title: 'absensi', dirty: () => JSON.stringify({ masuk: form.values.masuk }) !== baseline, state: () => ({ ...form.values }) });
  try {
    doSave(u, 'tab-3', form, () => { form.values.masuk = '07:30:00'; form.calls.push('tempel'); }, false);
    assert.equal(u.isTabDirty('tab-3'), true, 'gagal simpan: isian tetap dianggap belum tersimpan');
  } finally { draft.dispose(); u.clearDrafts(); }
}

test('Simpan GAGAL tidak me-rebase baseline (tab tetap dirty, isian tidak hilang)', testGagal);
