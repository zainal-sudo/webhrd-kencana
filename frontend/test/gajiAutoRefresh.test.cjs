const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('./helpers/frontendVm.cjs');
const ts = require('typescript');
const vue = require('vue');
const root = path.join(__dirname, '../src');

function fixture(name) {
  const hooks = { mounted: [], activated: [], deactivated: [], unmounted: [] };
  const calls = [], errors = [], confirmations = [];
  let confirmResult = true, response = async () => [{ nik: '001', nama: 'Latest', total: 100 }];
  const vueModule = { ...vue };
  for (const [hook, key] of Object.entries({ onMounted: 'mounted', onActivated: 'activated', onDeactivated: 'deactivated', onUnmounted: 'unmounted' })) vueModule[hook] = fn => hooks[key].push(fn);
  function evaluate(source, requireModule) {
    const module = { exports: {} };
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
      { module, exports: module.exports, require: requireModule, setTimeout, clearTimeout,
        window: { confirm: message => { confirmations.push(message); return confirmResult; } } });
    return module.exports;
  }
  const live = evaluate(fs.readFileSync(path.join(root, 'composables/useLiveSearch.ts'), 'utf8'), () => vueModule);
  const source = fs.readFileSync(path.join(root, `views/gaji/${name}View.vue`), 'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const scope = vue.effectScope();
  const state = scope.run(() => evaluate(source + '\nexport { muat, rows, pabrik, cari, edited, loading, menyimpan };' + (name === 'ProsesGaji' ? '\nexport { bulan, tahun, start, end, onUpdate, memproses, memuatPotongan };' : ''), id => {
    if (id === 'vue') return vueModule;
    if (id === 'vue-router') return { useRoute: () => ({ meta: {} }) };
    if (id === 'vue-toastification') return { useToast: () => ({ error: err => errors.push(err), success() {} }) };
    if (id === '@/stores/authStore') return { useAuthStore: () => ({ can: () => true }) };
    if (id === '@/stores/tabsStore') return { useTabsStore: () => ({}) };
    if (id === '@/composables/useLiveSearch') return live;
    if (id === '@/utils/format') return { todaySql: () => '2026-10-13', firstDayOfMonth: () => '2026-10-01' };
    if (id === '@/api') return { safeGet: async (url, config) => { calls.push({ method: 'get', url, config }); return response(); } };
    if (id === '@/api/axios') return { getErrorMessage: err => err.message, api: {
      get: async url => { calls.push({ method: 'get', url }); return { data: { data: [] } }; },
      post() { throw Error('Unexpected payroll process'); }, put() { throw Error('Unexpected save'); },
    } };
    return {};
  }));
  return { ...state, hooks, calls, errors, confirmations,
    confirm(value) { confirmResult = value; }, response(fn) { response = fn; },
    async lifecycle(key) { for (const fn of hooks[key]) await fn(); },
    dispose() { scope.stop(); for (const fn of hooks.unmounted) fn(); },
  };
}

for (const name of ['SettingGaji', 'ProsesGaji']) {
  test(`${name}: first activation does not duplicate initial load; return GET-refreshes and preserves filters`, async () => {
    const f = fixture(name);
    try {
      await f.lifecycle('mounted');
      const count = f.calls.length;
      await f.lifecycle('activated');
      assert.equal(f.calls.length, count);
      f.pabrik.value = 'P01'; f.cari.value = '001';
      if (name === 'ProsesGaji') { f.bulan.value = 9; f.tahun.value = 2026; f.start.value = '2026-09-01'; f.end.value = '2026-09-30'; }
      await f.lifecycle('deactivated'); await f.lifecycle('activated');
      assert.equal(f.calls.length, count + 1);
      assert.equal(f.rows.value[0].nama, 'Latest');
      assert.equal(f.pabrik.value, 'P01'); assert.equal(f.cari.value, '001');
      const params = f.calls.at(-1).config.params;
      if (name === 'SettingGaji') { assert.equal(params.pabrik, 'P01'); assert.equal(params.search, '001'); }
      else { assert.equal(params.periode, 9); assert.equal(params.start, '2026-09-01'); assert.equal(params.end, '2026-09-30'); }
      assert.ok(f.calls.every(call => call.method === 'get'));
    } finally { f.dispose(); }
  });

  test(`${name}: return preserves drafts without reloading; explicit reload failure preserves edits and busy save skips refresh`, async () => {
    const f = fixture(name);
    try {
      await f.lifecycle('mounted'); await f.lifecycle('activated');
      f.pabrik.value = 'P01'; f.rows.value = [{ nik: '001', total: 150, nama: 'Draft' }]; f.edited.value = true;
      f.confirm(false);
      const count = f.calls.length;
      await f.lifecycle('activated');
      assert.equal(f.calls.length, count); assert.equal(f.rows.value[0].nama, 'Draft'); assert.equal(f.edited.value, true);
      f.confirm(true); f.response(async () => { throw Error('network'); });
      await f.muat();
      assert.equal(f.rows.value[0].nama, 'Draft'); assert.equal(f.edited.value, true);
      f.menyimpan.value = true;
      const before = f.calls.length; await f.lifecycle('activated'); assert.equal(f.calls.length, before);
      f.menyimpan.value = false; f.response(async () => [{ nik: '001', nama: 'Saved' }]);
      await f.muat();
      assert.equal(f.rows.value[0].nama, 'Saved'); assert.equal(f.edited.value, false);
    } finally { f.dispose(); }
  });
}

test('Proses Gaji tracks actual cell updates and ignores a late pre-deactivation GET', async () => {
  const f = fixture('ProsesGaji');
  try {
    await f.lifecycle('mounted'); await f.lifecycle('activated');
    const row = { total: 100 };
    f.onUpdate({ row, col: { key: 'bonuslibur' }, oldValue: 0, newValue: 20 });
    assert.equal(f.edited.value, true); assert.equal(row.total, 120);
    f.edited.value = false;
    let resolve;
    f.response(() => new Promise(done => { resolve = done; }));
    const pending = f.muat();
    await f.lifecycle('deactivated');
    f.response(async () => [{ nama: 'Current' }]);
    await f.lifecycle('activated');
    resolve([{ nama: 'Stale' }]); await pending;
    assert.equal(f.rows.value[0].nama, 'Current');
    assert.equal(f.loading.value, false);
  } finally { f.dispose(); }
});
