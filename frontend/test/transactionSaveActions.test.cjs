const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');
const root = path.join(__dirname, '../src');

function fixture(options = {}) {
  const events = [], saved = [];
  const tabs = { activeTabId: 'edit-doc', closeTab(id) { events.push(['close', id]); } };
  const router = {
    async replace(target) { events.push(['replace', target]); if (options.navigationFailure) return { type: 4 }; tabs.activeTabId = 'new-entry'; },
    push(target) { events.push(['push', target]); },
  };
  const props = {
    title: 'Transaction', newFormPath: '/transaksi/pinjaman/form', transactionModule: 'frmPinjam',
    returnPath: '/transaksi/pinjaman',
    saveFn: async () => { saved.push(1); if (options.fail) throw Error('save failed'); if (options.pending) await options.pending; return 'Saved'; },
    ...options.props,
  };
  const source = fs.readFileSync(path.join(root, 'components/BaseForm.vue'), 'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const module = { exports: {} };
  const context = {
    module, exports: module.exports,
    defineProps: () => props, withDefaults: (input, defaults) => ({ ...defaults, ...input }),
    require(id) {
      if (id === 'vue') return vue;
      if (id === 'vue-router') return { useRouter: () => router };
      if (id === 'vue-toastification') return { useToast: () => ({ success: msg => events.push(['success', msg]), error: msg => events.push(['error', msg]) }) };
      if (id === '@/stores/tabsStore') return { useTabsStore: () => tabs };
      if (id === '@/stores/authStore') return { useAuthStore: () => ({ can: () => options.insert !== false }) };
      if (id === '@/api/axios') return { getErrorMessage: err => err.message };
      return {};
    },
  };
  vm.runInNewContext(ts.transpileModule(source + '\nexport { doSave, saving, showSuccess, canSaveNew };',
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { ...module.exports, events, saved, tabs };
}

test('Save New saves once, mounts fresh route with no edit/prefill query and closes only source tab', async () => {
  const f = fixture();
  await f.doSave('new');
  assert.equal(f.saved.length, 1);
  const target = f.events.find(event => event[0] === 'replace')[1];
  assert.equal(target.path, '/transaksi/pinjaman/form');
  assert.deepEqual(Object.keys(target.query), ['_entry']);
  assert.ok(target.query._entry);
  assert.deepEqual(f.events.filter(event => event[0] === 'close'), [['close', 'edit-doc']]);
  assert.ok(!f.events.some(event => event[0] === 'push'));
  assert.equal(f.showSuccess.value, false);
});

test('Save Close saves once and returns to browse; legacy master keeps success dialog', async () => {
  const f = fixture();
  await f.doSave('close');
  assert.equal(f.saved.length, 1);
  assert.deepEqual(f.events.filter(event => ['close', 'push'].includes(event[0])), [['close', 'edit-doc'], ['push', '/transaksi/pinjaman']]);
  const legacy = fixture({ props: { newFormPath: '', transactionModule: '' } });
  await legacy.doSave();
  assert.equal(legacy.showSuccess.value, true);
  assert.ok(!legacy.events.some(event => ['push', 'replace', 'close'].includes(event[0])));
});

test('Failed save retains form; permissions/disabled/hidden actions cannot save', async () => {
  const failed = fixture({ fail: true });
  await failed.doSave('new');
  assert.equal(failed.saved.length, 1);
  assert.ok(!failed.events.some(event => ['replace', 'close', 'push'].includes(event[0])));
  for (const options of [{ insert: false }, { props: { saveDisabled: true } }, { props: { showSave: false } }]) {
    const f = fixture(options);
    await f.doSave('new');
    assert.equal(f.saved.length, 0);
  }
});

test('Pending save blocks repeated clicks and does not navigate another active draft', async () => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const f = fixture({ pending });
  const request = f.doSave('new');
  assert.equal(f.saving.value, true);
  await f.doSave('new'); await f.doSave('close');
  assert.equal(f.saved.length, 1);
  f.tabs.activeTabId = 'other-draft';
  resolve(); await request;
  assert.ok(!f.events.some(event => ['replace', 'close', 'push'].includes(event[0])));
  assert.equal(f.saving.value, false);
});

test('Failed navigation after successful save does not close source form', async () => {
  const f = fixture({ navigationFailure: true });
  await f.doSave('new');
  assert.equal(f.saved.length, 1);
  assert.ok(!f.events.some(event => event[0] === 'close'));
  assert.ok(f.events.some(event => event[0] === 'error' && event[1].includes('Jangan simpan ulang')));
});

test('All eleven transaction entry forms opt into shared Save New and Save Close', () => {
  const directory = path.join(root, 'views/transaksi');
  const files = fs.readdirSync(directory).filter(file => file.endsWith('Form.vue'));
  assert.equal(files.length, 11);
  for (const file of files) {
    const source = fs.readFileSync(path.join(directory, file), 'utf8');
    assert.match(source, /new-form-path="\/transaksi\/[^" ]+\/form" transaction-module="frm[^" ]+"/, file);
    assert.doesNotMatch(source, /#footer-actions/, file);
  }
});

test('Absensi opts into Save New/Close without removing holiday authorization guards', () => {
  const source = fs.readFileSync(path.join(root, 'views/absensi/AbsensiForm.vue'), 'utf8');
  assert.match(source, /new-form-path="\/absensi\/form" transaction-module="frmAbsensi"/);
  assert.match(source, /return-path="\/absensi\/browse"/);
  assert.match(source, /:save-disabled="cekTanggalLoading \|\| !cekTanggalReady"/);
  assert.match(source, /if \(!diformat.value\) throw/);
});

test('Ijin duplicate confirmation completes original save action; cancellation rejects without second write', async () => {
  const source = fs.readFileSync(path.join(root, 'views/transaksi/IjinForm.vue'), 'utf8');
  const block = source.slice(source.indexOf('async function simpan()'), source.indexOf('onMounted(async'));
  function duplicateFixture() {
    const writes = [];
    const module = { exports: {} };
    const context = {
      module, exports: module.exports, assertClockTime() {}, values: { jam: '08:00:00' }, pakaiJam2: vue.ref(false),
      dialogDuplikat: vue.ref(false), pesanDuplikat: vue.ref(''), getErrorMessage: err => err.message,
      duplikatResolve: undefined, duplikatReject: undefined,
      async kirim(confirmed) {
        writes.push(confirmed);
        if (!confirmed) throw { response: { status: 409, data: { message: 'Duplicate' } } };
        return 'Confirmed';
      },
    };
    vm.runInNewContext(ts.transpileModule(block + '\nexport { simpan, lanjutDuplikat, batalDuplikat };',
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
    return { ...module.exports, writes, dialog: context.dialogDuplikat };
  }
  const f = duplicateFixture();
  const pending = f.simpan();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.dialog.value, true);
  await f.lanjutDuplikat();
  assert.equal(await pending, 'Confirmed');
  assert.deepEqual(f.writes, [false, true]);
  const cancel = duplicateFixture();
  const result = assert.rejects(cancel.simpan(), /dibatalkan/);
  await new Promise(resolve => setImmediate(resolve));
  cancel.batalDuplikat();
  await result;
  assert.deepEqual(cancel.writes, [false]);
});
