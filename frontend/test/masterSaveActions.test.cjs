const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('./helpers/frontendVm.cjs');
const ts = require('typescript');
const vue = require('vue');
const { parse, compileScript } = require('@vue/compiler-sfc');
const { renderToString } = require('@vue/server-renderer');
const root = path.join(__dirname, '../src');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function compile(script, dependencies, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require: name => dependencies[name] || {}, ...globals });
  return module.exports;
}
const snapshotUtils = compile(read('utils/formSnapshot.ts'), {});
function fixture(kind = 'simple', settings = {}) {
  const mounted = [], calls = [], navigations = [];
  const moduleName = kind === 'employee' ? 'frmKaryawan' : 'frmJabatan';
  const route = { path: kind === 'employee' ? '/master/karyawan/form' : '/master/jabatan/form',
    meta: { form: moduleName }, query: settings.edit ? { id: '001' } : {} };
  const auth = { can: (_module, action) => action === 'insert' ? settings.insert !== false : settings.editAllowed !== false };
  const tabs = { tabs: [{id:'source-form',closable:true,path:'/master/jabatan/form'}], activeTabId: 'source-form', closeTab: id => navigations.push(['close', id]) };
  const router = { push: target => { navigations.push(['push', target]); }, replace: async target => {
    navigations.push(['replace', target]); tabs.activeTabId = 'new-form';
  } };
  const api = { get: async url => {
    if (settings.loadFail) throw Error('Failed load');
    if (url.endsWith('/form-options')) return { data: { data: { bagian: [], atasan: [] } } };
    return { data: { data: kind === 'employee' ? { karyawan: { kar_nama: 'Ani', kar_status_aktif: 1, kar_pab_kode: 'P01', kar_jab_kode: 'J01' } }
      : { jab_kode: '001', jab_nama: 'Staff' } } };
  }, post: async (url, body) => write('post', url, body), put: async (url, body) => write('put', url, body) };
  async function write(method, url, body) {
    calls.push({ method, url, body }); if (settings.fail) throw Error('Failed save');
    if (settings.pending) await settings.pending;
    return { data: { data: { kar_Nik: 'NEW001' } } };
  }
  const formProps = { endpoint: '/master/jabatan', returnPath: '/master/jabatan', fields: [
    { key: 'jab_kode', label: 'Kode', required: true }, { key: 'jab_nama', label: 'Nama', required: true },
  ], moduleCrumb: { label: 'Master Jabatan', path: '/master/jabatan' }, title: 'Master Jabatan' };
  const dependencies = { vue: { ...vue, onMounted: fn => mounted.push(fn), onUnmounted() {} },
    'vue-router': { useRoute: () => route, useRouter: () => router },
    'vue-toastification': { useToast: () => ({ error() {}, success() {} }) },
    '@/api/axios': { api, getErrorMessage: err => err.message },
    '@/stores/authStore': { useAuthStore: () => auth }, '@/stores/tabsStore': { useTabsStore: () => tabs },
    '@/utils/jam': { assertClockTime() {} }, '@/utils/format': { todaySql: () => '2026-10-14' },
    '@/composables/useLiveSearch': { useLiveSearch: () => ({ schedule() {}, run() {}, cancel() {} }) },
    '@/config/masterSimple': {}, '@/utils/formSnapshot': snapshotUtils,
  };
  dependencies['@/composables/useTransactionReset'] = compile(read('composables/useTransactionReset.ts'), { vue, '@/utils/formSnapshot': snapshotUtils }, { window: { confirm: () => true } });
  const file = kind === 'employee' ? 'views/master/KaryawanForm.vue' : 'components/MasterForm.vue';
  const exports = kind === 'employee' ? 'values, canSave, formReady, memuat, simpan, anak, pendidikan, pengalaman, keahlian, jadwalTerpilih, pkwt, fotoBase64'
    : 'values, canSave, loading, ready, saving, save, permissionModule';
  const form = compile(read(file).match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1] + `\nexport { ${exports} };`, dependencies,
    { defineProps: () => formProps, withDefaults: (props, defaults) => ({ ...defaults, ...props }) });
  function actions() {
    const props = { title: 'Master', saveFn: kind === 'employee' ? form.simpan : form.save,
      showSave: form.canSave.value, saveDisabled: kind === 'employee' ? form.memuat.value || !form.formReady.value : form.loading.value || !form.ready.value,
      newFormPath: route.path, returnPath: route.path.replace('/form', ''), transactionModule: moduleName };
    return compile(read('components/BaseForm.vue').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1] + '\nexport { doSave, canSaveNew, saving };', dependencies,
      { defineProps: () => props, withDefaults: (props, defaults) => ({ ...defaults, ...props }) });
  }
  return { form, calls, navigations, tabs, actions, async mount() { for (const fn of mounted) await fn(); } };
}

for (const kind of ['simple', 'employee']) {
  test(`${kind} Master Save New saves payload then replaces with fresh Add query; Save Close returns to browse`, async () => {
    for (const mode of ['new', 'close']) {
      const f = fixture(kind, { edit: true }); await f.mount();
      if (kind === 'employee') { f.form.anak.value.push({ nama: 'Child' }); f.form.fotoBase64.value = 'image-data'; }
      await f.actions().doSave(mode);
      assert.equal(f.calls.length, 1); assert.equal(f.calls[0].method, 'put');
      assert.ok(f.calls[0].url.endsWith('/001'));
      if (kind === 'employee') {
        assert.equal(f.calls[0].body.kar_Nik, '001'); assert.equal(f.calls[0].body.anak[0].nama, 'Child');
        assert.equal(f.calls[0].body.kar_foto_base64, 'image-data');
      } else assert.equal(f.calls[0].body.jab_nama, 'Staff');
      if (mode === 'new') {
        const target = f.navigations.find(event => event[0] === 'replace')[1];
        assert.deepEqual(Object.keys(target.query), ['_entry']); assert.ok(target.query._entry);
      } else assert.ok(f.navigations.some(event => event[0] === 'push' && event[1] === (kind === 'employee' ? '/master/karyawan' : '/master/jabatan')));
      assert.deepEqual(f.navigations.filter(event => event[0] === 'close'), [['close', 'source-form']]);
    }
  });
  test(`${kind} Master enforces Insert/Edit permissions and preserves form on failed save/load`, async () => {
    const view = fixture(kind, { edit: true, editAllowed: false }); await view.mount();
    await view.actions().doSave('close'); assert.equal(view.calls.length, 0);
    const editOnly = fixture(kind, { edit: true, insert: false }); await editOnly.mount();
    assert.equal(editOnly.actions().canSaveNew.value, false);
    await editOnly.actions().doSave('new'); assert.equal(editOnly.calls.length, 0);
    await editOnly.actions().doSave('close'); assert.equal(editOnly.calls.length, 1);
    const failed = fixture(kind, { edit: true, fail: true }); await failed.mount();
    await failed.actions().doSave('new'); assert.equal(failed.calls.length, 1); assert.equal(failed.navigations.length, 0);
    const loading = fixture(kind, { edit: true, loadFail: true });
    await loading.actions().doSave('close'); await loading.mount(); await loading.actions().doSave('close');
    assert.equal(loading.calls.length, 0);
    const deniedAdd = fixture(kind, { insert: false }); await deniedAdd.mount();
    await deniedAdd.actions().doSave('close'); assert.equal(deniedAdd.calls.length, 0);
  });
  test(`${kind} Master cannot save twice while pending or close a different active draft`, async () => {
    let resolve; const pending = new Promise(done => { resolve = done; });
    const f = fixture(kind, { edit: true, pending }); await f.mount(); const actions = f.actions();
    const first = actions.doSave('new'); await actions.doSave('new'); await actions.doSave('close');
    assert.equal(f.calls.length, 1); f.tabs.activeTabId = 'other-draft'; resolve(); await first;
    assert.equal(f.navigations.length, 0);
  });
  test(`${kind} Master Add posts once, then a fresh instance restores empty/default state`, async () => {
    const f = fixture(kind); await f.mount();
    Object.assign(f.form.values, kind === 'employee'
      ? { kar_nama: 'New Employee', kar_status_aktif: 1, kar_pab_kode: 'P01', kar_jab_kode: 'J01' }
      : { jab_kode: '002', jab_nama: 'New Position' });
    await f.actions().doSave('new');
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].method, 'post');
    const next = fixture(kind); await next.mount();
    if (kind === 'employee') {
      assert.equal(next.form.values.kar_nama, undefined); assert.equal(next.form.values.kar_status_aktif, 0);
      assert.equal(next.form.values.kar_tgl_masuk, '2026-10-14'); assert.equal(next.form.fotoBase64.value, '');
      assert.equal(next.form.anak.value.length, 0); assert.equal(next.form.jadwalTerpilih.value.length, 0);
    } else { assert.equal(next.form.values.jab_kode, null); assert.equal(next.form.values.jab_nama, null); }
  });
}

test('All 12 Add/Edit Master forms use shared actions; singleton/read-only pages are unchanged', () => {
  const files = fs.readdirSync(path.join(root, 'views/master')).filter(file => file.endsWith('Form.vue'));
  assert.equal(files.length, 12);
  for (const file of files.filter(file => !['KaryawanForm.vue', 'SandiBpjsForm.vue'].includes(file))) assert.match(read(`views/master/${file}`), /<MasterForm/);
  assert.match(read('views/master/SandiBpjsForm.vue'), /<BaseForm/);
  assert.match(read('views/master/SandiBpjsForm.vue'), /:new-form-path="formPath"/);
  assert.match(read('views/master/SandiBpjsForm.vue'), /transaction-module="frmSandiBPJS"/);
  assert.match(read('components/MasterForm.vue'), /:new-form-path="route.path"/);
  assert.match(read('components/MasterForm.vue'), /:transaction-module="permissionModule"/);
  assert.match(read('components/MasterForm.vue'), /route.meta.form/);
  assert.match(read('views/master/KaryawanForm.vue'), /new-form-path="\/master\/karyawan\/form"/);
  assert.match(read('views/master/KaryawanForm.vue'), /transaction-module="frmKaryawan"/);
});

test('Actual shared Master form renders both footer actions, respecting Edit-only and View-only rights', async () => {
  for (const settings of [{}, { edit: true, insert: false }, { edit: true, editAllowed: false }]) {
    const route = { path: '/master/jabatan/form', meta: { form: 'frmJabatan' }, query: settings.edit ? { id: '001' } : {} };
    const cache = new Map();
    const dependencies = { vue, 'vue-router': { useRoute: () => route, useRouter: () => ({}) },
      'vue-toastification': { useToast: () => ({}) }, '@/stores/tabsStore': { useTabsStore: () => ({}) },
      '@/stores/authStore': { useAuthStore: () => ({ can: (_module, action) => action === 'insert' ? settings.insert !== false : settings.editAllowed !== false }) },
      '@/api/axios': {}, '@/utils/formEnter': { nextFormField() {} },
    };
    dependencies['@/composables/useTransactionReset'] = compile(read('composables/useTransactionReset.ts'), { vue, '@/utils/formSnapshot': snapshotUtils }, { window: { confirm: () => true } });
    dependencies['@/components/MsIcon.vue'] = { default: vue.defineComponent({ setup: () => () => vue.h('i') }) };
    function component(file) {
      if (cache.has(file)) return cache.get(file);
      let source = read(file);
      if (file.endsWith('MasterForm.vue')) source = source.replace('</script>', '\ncapture({ ready, loading });\n</script>');
      const { descriptor } = parse(source);
      const compiled = compile(compileScript(descriptor, { id: file, inlineTemplate: true }).content, dependencies,
        { capture(state) { state.ready.value = true; state.loading.value = false; } }).default;
      cache.set(file, compiled); return compiled;
    }
    dependencies['@/components/BaseForm.vue'] = { default: component('components/BaseForm.vue') };
    for (const name of ['FText', 'FTime', 'FSelect', 'FDate', 'FNumber', 'FTextarea']) dependencies[`@/components/fields/${name}.vue`] = dependencies['@/components/MsIcon.vue'];
    const app = vue.createSSRApp(component('components/MasterForm.vue'), { title: 'Master Jabatan', endpoint: '/master/jabatan', returnPath: '/master/jabatan', moduleCrumb: { label: 'Jabatan', path: '/master/jabatan' }, fields: [] });
    for (const tag of ['v-dialog', 'v-card', 'v-card-item', 'v-card-title', 'v-card-text', 'v-card-actions', 'v-spacer', 'v-btn']) app.component(tag, vue.defineComponent({ setup: () => () => null }));
    const html = await renderToString(app);
    assert.equal(html.includes('Simpan Baru'), settings.insert !== false && settings.editAllowed !== false);
    assert.equal(html.includes('Simpan Tutup'), settings.editAllowed !== false);
  }
});
