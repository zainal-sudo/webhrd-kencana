const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');
const pinia = require('pinia');
const root = path.join(__dirname, '../src');

function fixture(dashboardStatus) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(root, 'stores/karyawanBrowseStore.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module, exports: module.exports, require: () => pinia });
  const store = module.exports.useKaryawanBrowseStore(pinia.createPinia());
  if (dashboardStatus) store.setStatus(dashboardStatus, true);
  const view = fs.readFileSync(path.join(root, 'views/master/KaryawanView.vue'), 'utf8');
  const block = view.slice(view.indexOf('const statusMessage ='), view.indexOf('// Tutup tab'));
  const info = [], dismiss = [], scope = vue.effectScope();
  scope.run(() => vm.runInNewContext(block, { computed: vue.computed, watch: vue.watch, browseStore: store,
    toast: { dismiss: id => dismiss.push(id), info: message => info.push(message) } }));
  return { store, info, dismiss, dispose: () => scope.stop() };
}

test('Opening Master Karyawan normally and resetting/changing filters show no status toast', async () => {
  const f = fixture();
  try {
    assert.equal(f.info.length, 0);
    f.store.setStatus('all'); await vue.nextTick();
    f.store.setStatus('aktif'); await vue.nextTick();
    f.store.status = 'nonaktif'; await vue.nextTick();
    f.store.setStatus('all'); await vue.nextTick();
    assert.equal(f.info.length, 0);
    assert.equal(f.store.notifyStatus, false);
  } finally { f.dispose(); }
});

test('Dashboard status notice works before first mount and on cached view, exactly once per dashboard click', async () => {
  for (const status of ['all', 'aktif', 'nonaktif']) {
    const f = fixture(status);
    try {
      assert.equal(f.info.length, 1);
      assert.equal(f.store.notifyStatus, false);
      f.store.setStatus(status); await vue.nextTick();
      assert.equal(f.info.length, 1);
      f.store.setStatus(status, true); await vue.nextTick();
      assert.equal(f.info.length, 2);
      assert.equal(f.store.notifyStatus, false);
      f.store.setStatus('all'); await vue.nextTick();
      assert.equal(f.info.length, 2);
    } finally { f.dispose(); }
  }
  const dashboard = fs.readFileSync(path.join(root, 'views/dashboard/DashboardView.vue'), 'utf8');
  assert.match(dashboard, /karyawanBrowseStore\.setStatus\(status, true\)/);
});

test('Holiday overtime actions separate icons without widening the original column', () => {
  const source = fs.readFileSync(path.join(root, 'views/laporan/LemburHariLiburView.vue'), 'utf8');
  assert.doesNotMatch(source, /:deep\(\.action-col\)/);
  assert.match(source, /:deep\(\.row-actions\)[^}]*gap: 8px[^}]*flex-wrap: nowrap/);
  assert.match(source, /\.report-page \.row-btn\s*\{[^}]*flex: 0 0 16px[^}]*width: 16px[^}]*height: 24px/);
  for (const action of ['verify', 'unverify', 'edit']) assert.ok(source.includes(`class="row-btn ${action}"`));
  assert.match(source, /\.row-btn::before\s*\{[^}]*inset: 0 -4px[^}]*border-radius: 6px[^}]*pointer-events: none/);
  assert.match(source, /\.row-btn:not\(:disabled\):is\(:hover, :focus-visible\)::before/);
});
