const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');
const root = path.join(__dirname, '../src');

test('Successful loan saves invalidate an open browse, preserving filters and refreshing via the summary lifecycle', async () => {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(root, 'utils/pinjamanRefresh.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module, exports: module.exports, require: () => vue });
  const { pinjamanRevision, notifyPinjamanSaved } = module.exports;
  const view = fs.readFileSync(path.join(root, 'views/transaksi/PinjamanView.vue'), 'utf8');
  const watcher = view.match(/watch\(pinjamanRevision, [^;]+;/)[0];
  let refreshes = 0;
  const browse = vue.ref({ refresh: () => refreshes++ });
  const scope = vue.effectScope();
  scope.run(() => vm.runInNewContext(watcher, { watch: vue.watch, pinjamanRevision, browse }));
  try {
    assert.equal(refreshes, 0);
    notifyPinjamanSaved(); await vue.nextTick();
    assert.equal(refreshes, 1);
    notifyPinjamanSaved(); await vue.nextTick();
    assert.equal(refreshes, 2);
    assert.match(view, /@load-start="refreshSummary"/);
    assert.doesNotMatch(watcher, /periodQuery|appliedPeriod|exportStart|exportEnd/);
    const form = fs.readFileSync(path.join(root, 'views/transaksi/PinjamanForm.vue'), 'utf8');
    assert.ok(form.indexOf('notifyPinjamanSaved();') > form.indexOf('values.nomor = data.data.nomor; saved.value = true;'));
  } finally { scope.stop(); }
  notifyPinjamanSaved(); await vue.nextTick();
  assert.equal(refreshes, 2, 'Closed browse must unsubscribe');
});
