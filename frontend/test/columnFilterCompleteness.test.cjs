const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');
const root = path.join(__dirname, '../src');
function compile(source, dependencies, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require: name => dependencies[name] || {}, ...globals });
  return module.exports;
}
test('Popup searches the full list beyond 1,000 values and applies the selected late-alphabet match', async () => {
  const callbacks = [], events = [];
  const filter = compile(fs.readFileSync(path.join(root, 'utils/columnFilter.ts'), 'utf8'), {});
  const names = [...Array.from({ length: 1200 }, (_, i) => `ANI ${i}`), 'ZAINAL ARIFIN', 'ZAHRA'];
  const source = fs.readFileSync(path.join(root, 'components/ColumnFilterPopup.vue'), 'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const popup = compile(source + '\nexport { allValues, checked, filteredValues, searchText, clearAll, selectAll, onOk };', {
    vue: { ...vue, onMounted: fn => callbacks.push(fn), onUnmounted() {}, onDeactivated() {} }, '@/utils/columnFilter': filter,
  }, { defineProps: () => ({ selected: [], fetchValues: async () => names }), defineEmits: () => (...args) => events.push(args),
    document: { addEventListener() {} }, window: { addEventListener() {} }, cancelAnimationFrame() {} });
  for (const fn of callbacks) await fn();
  assert.equal(popup.allValues.value.length, 1202);
  popup.searchText.value = ' zA ';
  assert.deepEqual(Array.from(popup.filteredValues.value), ['ZAINAL ARIFIN', 'ZAHRA'].map(filter.filterKey));
  popup.clearAll(); popup.selectAll(); popup.onOk();
  assert.deepEqual(Array.from(events[0][1]), ['ZAINAL ARIFIN', 'ZAHRA'].map(filter.filterKey));
  popup.searchText.value = ''; assert.equal(popup.filteredValues.value.length, 1202);
});
