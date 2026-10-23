const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('./helpers/frontendVm.cjs');
const ts = require('typescript');
const vue = require('vue');
const pinia = require('pinia');
const root = path.join(__dirname, '../src');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function compile(source, dependencies, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require: name => dependencies[name] || {}, ...globals });
  return module.exports;
}
const script = file => read(file).match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
const snapshotUtils = compile(read('utils/formSnapshot.ts'), {});

function formFixture({ edit = false, permitted = true, failLoad = false } = {}) {
  const calls = [], mounted = [], confirmations = [];
  const loaded = { sb_judul: 'Portal Lama', sb_username: 'LoadedUser', sb_password: '  LOad!  ' };
  const reset = compile(read('composables/useTransactionReset.ts'), { vue, '@/utils/formSnapshot': snapshotUtils },
    { window: { confirm(message) { confirmations.push(message); return true; } } });
  const route = { query: edit ? { id: '7' } : {} };
  const api = {
    async get(url) { calls.push({ method: 'get', url }); if (failLoad) throw Error('Failed'); return { data: { data: loaded } }; },
    async post(url, body) { calls.push({ method: 'post', url, body }); },
    async put(url, body) { calls.push({ method: 'put', url, body }); },
  };
  const dependencies = {
    vue: { ...vue, onMounted: fn => mounted.push(fn) },
    'vue-router': { useRoute: () => route },
    'vue-toastification': { useToast: () => ({ error() {} }) },
    '@/stores/authStore': { useAuthStore: () => ({ can: (_form, action) => permitted && (action === 'insert' || action === 'edit') }) },
    '@/composables/useTransactionReset': reset,
    '@/api/axios': { api, getErrorMessage: () => 'Failed' },
  };
  const form = compile(script('views/master/SandiBpjsForm.vue') + '\nexport { values, save, resetState, ready, canSave, id };', dependencies);
  return { ...form, calls, confirmations, route, loaded, async mount() { for (const fn of mounted) await fn(); } };
}

for (const edit of [false, true]) test(`${edit ? 'Edit' : 'Tambah'}: payload exact, reset snapshot dan tidak menyimpan metadata`, async () => {
  const f = formFixture({ edit }); await f.mount();
  const baseline = JSON.stringify(f.values);
  f.values.sb_judul = 'Portal Karyawan'; f.values.sb_username = 'CaSeUser'; f.values.sb_password = '  AbC! @# xYz  ';
  await f.save();
  const request = f.calls.at(-1);
  assert.equal(request.method, edit ? 'put' : 'post');
  assert.equal(request.body.sb_username, 'CaSeUser');
  assert.equal(request.body.sb_password, '  AbC! @# xYz  ');
  assert.equal(request.body.sb_judul, 'Portal Karyawan');
  assert.deepEqual(Object.keys(request.body).sort(), ['sb_judul', 'sb_password', 'sb_username']);
  assert.ok(!request.url.includes(request.body.sb_password));
  const count = f.calls.length;
  assert.equal(f.resetState.reset(), true); await vue.nextTick();
  assert.equal(JSON.stringify(f.values), baseline);
  assert.equal(f.calls.length, count);
  assert.equal(f.confirmations.length, 1);
  if (edit) {
    f.route.query.id = '99'; assert.equal(f.id, '7');
    assert.equal(f.values.sb_password, f.loaded.sb_password);
    assert.equal(f.values.sb_judul, f.loaded.sb_judul);
  } else assert.equal(f.values.sb_password, '');
});

test('Form validasi required/max, izin save dan gagal load', async () => {
  const f = formFixture(); await f.mount();
  await assert.rejects(f.save(), /Username wajib/);
  f.values.sb_username = 'x'.repeat(101); await assert.rejects(f.save(), /maksimal 100/);
  f.values.sb_username = 'ok'; await assert.rejects(f.save(), /Password wajib/);
  f.values.sb_password = 'x'.repeat(256); await assert.rejects(f.save(), /maksimal 255/);
  const denied = formFixture({ permitted: false }); await denied.mount();
  assert.equal(denied.canSave.value, false); await assert.rejects(denied.save(), /Tidak memiliki hak/);
  const failed = formFixture({ edit: true, failLoad: true }); await failed.mount();
  assert.equal(failed.ready.value, false); assert.equal(failed.resetState.disabled.value, true);
  await assert.rejects(failed.save(), /Form belum siap/);
});

function viewFixture(rights = {}) {
  const calls = [];
  const dependencies = {
    vue,
    'vue-toastification': { useToast: () => ({ success: message => calls.push({ success: message }), error() {} }) },
    '@/stores/authStore': { useAuthStore: () => ({ can: (_form, action) => !!rights[action] }) },
    '@/api/axios': { api: { delete: async url => calls.push({ method: 'delete', url }) }, getErrorMessage: () => 'Failed' },
  };
  const view = compile(script('views/master/SandiBpjsView.vue') + '\nexport { canInsert, canEdit, canDelete, columns, confirmDelete, deleteTarget, remove, browse };', dependencies);
  view.browse.value = { refreshAfterDelete: () => calls.push({ refresh: true }) };
  return { ...view, calls };
}

test('Browse buttons mengikuti auth.can; confirmation hanya username; Delete refresh', async () => {
  const denied = viewFixture();
  for (const key of ['canInsert', 'canEdit', 'canDelete']) assert.equal(denied[key].value, false);
  denied.confirmDelete({ sb_id: 7, sb_username: 'User', sb_password: 'NeverInDialog' });
  assert.equal(denied.deleteTarget.value, null); await denied.remove(); assert.equal(denied.calls.length, 0);
  const f = viewFixture({ insert: true, edit: true, delete: true });
  f.confirmDelete({ sb_id: 7, sb_username: 'User', sb_password: 'NeverInDialog' });
  assert.deepEqual(Object.keys(f.deleteTarget.value).sort(), ['id', 'username']);
  await f.remove();
  assert.equal(f.calls[0].url, '/master/sandi-bpjs/7');
  assert.ok(f.calls.some(call => call.refresh)); assert.equal(f.deleteTarget.value, null);
  const source = read('views/master/SandiBpjsView.vue');
  assert.match(source, /Hapus akun dengan username \{\{ deleteTarget\?\.username \}\}\?/);
  assert.match(source, /:add-form-path="canInsert \? formPath : ''"/);
  assert.match(source, /:edit-form-path="canEdit \? formPath : ''"/);
  assert.match(source, /v-if="canDelete"/);
});

test('Browse plaintext/date-time, tidak ada filter/search password atau export/persistence', () => {
  const f = viewFixture();
  const password = f.columns.find(col => col.key === 'sb_password');
  assert.equal(password.sortable, false); assert.equal(password.filterable, false);
  assert.equal(f.columns.find(col => col.key === 'sb_updated_at').type, 'datetime');
  const source = read('views/master/SandiBpjsView.vue');
  assert.match(source, /class="password-text">\{\{ text \}\}/);
  assert.match(source, /:exportable="false"/);
  assert.equal(f.columns[0].key, 'sb_judul');
  assert.equal(f.columns[1].key, 'sb_username');
  assert.match(source, /search-placeholder="Cari judul \/ username \/ oleh/);
  for (const file of ['views/master/SandiBpjsView.vue', 'views/master/SandiBpjsForm.vue']) {
    assert.doesNotMatch(read(file), /localStorage|sessionStorage|console\.|v-model\.trim|sb_password\.trim\(/);
  }
});

test('Font mengikuti Master lain dan kolom Aksi ringkas, hanya pada Sandi', () => {
  const source = read('views/master/SandiBpjsView.vue');
  assert.match(source, /class="sandi-bpjs-browse"/);
  assert.match(source, /\.sandi-bpjs-browse :deep\(\.browse-table\) \{ font-size: 12px; \}/);
  assert.match(source, /\.sandi-bpjs-browse.compact :deep\(\.action-col\) \{ width: 80px; min-width: 80px; max-width: 80px;/);
  assert.match(source, /:deep\(\.row-actions\) \{ justify-content: center; align-items: center; gap: 12px;/);
  assert.match(source, /:action-width="80"/);
  assert.match(source, /\.sandi-bpjs-browse\.compact :deep\(th:not\(\.sorted\) \.th-sort\) \{ display: inline-flex; \}/);
  assert.match(source, /\.delete-btn\s*\{[^}]*border-radius: 6px/);
  assert.match(source, /class="row-btn del delete-btn"/);
  assert.doesNotMatch(source, /\.delete-btn:hover/);
  assert.match(source, /name="delete" :size="16"/);
  assert.match(source, /label: "Username", width: "auto"/);
  assert.match(source, /\.password-text \{[^}]*font: inherit;/);
});

test('Copy hanya saat klik, mempertahankan spasi dan memberi feedback tanpa menampilkan credential', async () => {
  for (const [value, successMessage] of [['CaseUser', 'Username disalin'], ['  AbC!@#  ', 'Password disalin']]) {
    const written = [], messages = [];
    const props = { value, successMessage, iconOnly: true };
    const copy = compile(script('components/CopyCodeButton.vue') + '\nexport { copy };', {
      vue, 'vue-toastification': { useToast: () => ({ success: message => messages.push(message), error: message => messages.push(message) }) },
    }, {
      defineProps: () => props, withDefaults: (props, defaults) => ({ ...defaults, ...props }),
      navigator: { clipboard: { writeText: async value => written.push(value) } },
    });
    assert.equal(written.length, 0);
    await copy.copy();
    assert.deepEqual(written, [value]);
    assert.deepEqual(messages, [successMessage]);
  }
});

test('Auto-refresh shared browse dan navigasi kembali setelah save tetap terpasang', () => {
  assert.match(read('views/master/SandiBpjsView.vue'), /:refresh-on-activate="true"/);
  assert.match(read('components/BaseBrowse.vue'), /onActivated\([\s\S]*props.refreshOnActivate\) fetchData\(\)/);
  assert.match(read('views/master/SandiBpjsForm.vue'), /return-path="\/master\/sandi-bpjs"/);
  assert.match(read('views/master/SandiBpjsForm.vue'), /:new-form-path="formPath"/);
  assert.match(read('components/BaseForm.vue'), /else await closeTab\(\)/);
});

test('Sidebar mengikuti row menu; tidak ada hardcoded username', () => {
  pinia.setActivePinia(pinia.createPinia());
  const menuMap = compile(read('utils/menuMap.ts'), {});
  assert.equal(menuMap.definisiMenu('frmSandiBPJS').label, 'Sandi');
  const auth = { menus: [] };
  const storeModule = compile(read('stores/permissionStore.ts'), {
    pinia, '@/utils/menuMap': menuMap, '@/stores/authStore': { useAuthStore: () => auth },
  });
  const store = storeModule.usePermissionStore();
  store.build(); assert.equal(store.allowedRoutes.includes('/master/sandi-bpjs'), false);
  auth.menus = [{ men_nama: 'frmSandiBPJS', can_insert: true, can_edit: true, can_delete: true }];
  store.build(); assert.equal(store.allowedRoutes.includes('/master/sandi-bpjs'), true);
  assert.equal(store.menuTree[0].key, 'master');
  for (const file of ['views/master/SandiBpjsView.vue', 'views/master/SandiBpjsForm.vue']) {
    assert.doesNotMatch(read(file), /["'](?:HRD|P1|P2|P4|super)["']/);
  }
});

test('Router BPJS fail-closed ketika menu kosong atau profil gagal; route lain tetap existing', async () => {
  let guard, fail = false, allowed = false;
  const auth = { isAuthenticated: true, menus: [], refreshProfile: async () => { if (fail) throw Error('Failed'); }, can: () => allowed };
  compile(read('router/index.ts'), {
    'vue-router': { createWebHistory() {}, createRouter: () => ({ beforeEach: fn => { guard = fn; }, afterEach() {} }) },
    '@/stores/authStore': { useAuthStore: () => auth },
    '@/stores/permissionStore': { usePermissionStore: () => ({ build() {} }) },
    '@/stores/tabsStore': { useTabsStore: () => ({canOpenTab:()=>true,generateTabId:path=>path}) },
  });
  const target = { path: '/master/sandi-bpjs', meta: { form: 'frmSandiBPJS', requiresAuth: true }, query: {} };
  assert.equal((await guard(target,{path:'/dashboard',query:{},meta:{},fullPath:'/dashboard'})).path, '/403');
  allowed = true; assert.equal(await guard(target,{path:'/dashboard',query:{},meta:{},fullPath:'/dashboard'}), true);
  fail = true; assert.equal((await guard(target,{path:'/dashboard',query:{},meta:{},fullPath:'/dashboard'})).path, '/403');
});

test('Actual Browse render: password plaintext, date-time, aksi menurut permission, tanpa Excel', async () => {
  const { parse, compileScript } = require('@vue/compiler-sfc');
  const { renderToString } = require('@vue/server-renderer');
  const format = compile(read('utils/format.ts'), {});
  const filterUtils = compile(read('utils/columnFilter.ts'), {});
  for (const rights of [{}, { insert: true, edit: true, delete: true }]) {
    const icon = vue.defineComponent({ setup: () => () => vue.h('i') });
    const deps = {
      vue, 'vue-router': { useRouter: () => ({}) },
      'vue-toastification': { useToast: () => ({}) },
      '@/stores/authStore': { useAuthStore: () => ({ can: (_form, action) => !!rights[action] }) },
      '@/stores/tabsStore': { useTabsStore: () => ({}) },
      '@/api/axios': { api: {}, getErrorMessage: () => 'Failed' },
      '@/utils/format': format, '@/utils/columnFilter': filterUtils, '@/utils/foto': { fotoUrl: () => '' },
      '@/components/MsIcon.vue': { default: icon },
      '@/components/fields/DateInput.vue': { default: icon },
      '@/components/ColumnFilterPopup.vue': { default: icon },
    };
    function component(file, capture) {
      let source = read(file);
      if (capture) source = source.replace('</script>', '\ncapture({ rows });\n</script>');
      const { descriptor } = parse(source);
      return compile(compileScript(descriptor, { id: file, inlineTemplate: true }).content, deps, {
        capture({ rows }) { rows.value = [{ sb_id: 1, sb_judul: 'Portal Karyawan', sb_username: 'BPJSUser', sb_password: '  AbC! Secret  ', sb_updated_at: '2026-10-14 09:15:00', sb_updated_by: 'EDITOR' }]; },
      }).default;
    }
    deps['@/components/BaseBrowse.vue'] = { default: component('components/BaseBrowse.vue', true) };
    deps['@/components/CopyCodeButton.vue'] = { default: component('components/CopyCodeButton.vue') };
    const app = vue.createSSRApp(component('views/master/SandiBpjsView.vue'));
    for (const tag of ['v-dialog', 'v-card', 'v-card-item', 'v-card-title', 'v-card-text', 'v-card-actions', 'v-spacer', 'v-btn']) app.component(tag, vue.defineComponent({ setup: () => () => null }));
    const html = await renderToString(app);
    assert.ok(html.includes('  AbC! Secret  '));
    assert.ok(html.includes('Portal Karyawan'));
    assert.ok(html.indexOf('>Judul<') < html.indexOf('>Username<'));
    assert.ok(html.includes('BPJSUser')); assert.ok(html.includes('EDITOR')); assert.ok(html.includes('09:15'));
    assert.ok(html.includes('aria-label="Salin Password"')); assert.ok(html.includes('aria-label="Salin Username"'));
    if (rights.edit || rights.delete) {
      assert.match(html, /<col style="width:80px;"/);
      assert.match(html, /<col style="width:auto;"/);
    }
    assert.ok(!html.includes('••••')); assert.ok(!html.includes('>Excel<'));
    assert.equal(html.includes('title="Edit"'), !!rights.edit);
    assert.equal(html.includes('title="Hapus"'), !!rights.delete);
    assert.equal(html.includes('Tambah Akun'), !!rights.insert);
  }
});


test('Duplicate username forms still POST new accounts and deletion targets sb_id', async () => {
  const a = formFixture(), b = formFixture(), edited = formFixture({ edit: true });
  for (const f of [a, b, edited]) {
    await f.mount();
    f.values.sb_judul = 'Same title'; f.values.sb_username = 'test'; f.values.sb_password = 'Fictional';
    await f.save();
  }
  assert.equal(a.calls.at(-1).method, 'post');
  assert.equal(b.calls.at(-1).method, 'post');
  assert.equal(edited.calls.at(-1).method, 'put');
  assert.equal(edited.calls.at(-1).url, '/master/sandi-bpjs/7');
  assert.deepEqual({ ...a.calls.at(-1).body }, { ...b.calls.at(-1).body });
  const view = viewFixture({ delete: true });
  view.confirmDelete({ sb_id: 7, sb_username: 'test' }); await view.remove();
  view.confirmDelete({ sb_id: 8, sb_username: 'test' }); await view.remove();
  assert.deepEqual(view.calls.filter(call => call.method === 'delete').map(call => call.url), ['/master/sandi-bpjs/7', '/master/sandi-bpjs/8']);
  assert.match(read('views/master/SandiBpjsView.vue'), /primary-key="sb_id"/);
});
