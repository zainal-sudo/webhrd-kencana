const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('./helpers/frontendVm.cjs');
const ts = require('typescript');
const vue = require('vue');
const root = path.join(__dirname, '../src');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function compile(source, imports, globals = {}) {
  const module = { exports: {} };
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(output, { module, exports: module.exports, require: name => imports[name] || {}, ...globals });
  return module.exports;
}
const filter = compile(read('utils/columnFilter.ts'), {});
const key = filter.filterKey;
const params = (column, keys) => JSON.parse(JSON.stringify(filter.columnFilterParams(column, Array.from(keys))));
async function popup(overrides = {}) {
  const callbacks = [], events = [];
  const props = { selected: [], fetchValues: async () => [null, '', ' ', '0', 'null', 'Ani'], ...overrides };
  const source = read('components/ColumnFilterPopup.vue').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const result = compile(source + '\nexport { allValues, checked, filteredValues, searchText, clearAll, selectAll, toggleOne, onOk, displayLabel };', {
    vue: { ...vue, onMounted: fn => callbacks.push(fn), onUnmounted() {}, onDeactivated() {} },
    '@/utils/columnFilter': filter,
    '@/utils/format': { formatTanggal: value => value, formatTanggalWaktu: value => value },
  }, { defineProps: () => props, defineEmits: () => (...args) => events.push(args),
    document: { addEventListener() {} }, window: { addEventListener() {} }, cancelAnimationFrame() {} });
  for (const fn of callbacks) await fn();
  return { ...result, events };
}

test('Karyawan string popup has one Blank option, preserves literal values, and emits NULL + empty flags', async () => {
  const view = await popup({ combineBlankValues: true, filterValueType: 'string' });
  assert.deepEqual(Array.from(view.allValues.value), [null, ' ', '0', 'null', 'Ani'].map(key));
  assert.equal(view.displayLabel(key(null)), '(Blank)');
  assert.equal(view.displayLabel(key('null')), 'null');
  view.clearAll(); view.toggleOne(key(null)); view.onOk();
  assert.deepEqual(params('Email', view.events.at(-1)[1]), { filterNull_Email: '1', filterEmpty_Email: '1' });
  view.toggleOne(key('null')); view.onOk();
  assert.deepEqual(params('Email', view.events.at(-1)[1]), { filterSet_Email: ['null'], filterNull_Email: '1', filterEmpty_Email: '1' });
  view.searchText.value = 'blank';
  assert.deepEqual(Array.from(view.filteredValues.value), [key(null)]);
  view.clearAll(); view.selectAll(); view.onOk();
  assert.deepEqual(params('Email', view.events.at(-1)[1]), { filterNull_Email: '1', filterEmpty_Email: '1' });
  view.searchText.value = ''; view.selectAll(); view.onOk();
  assert.deepEqual(Array.from(view.events.at(-1)[1]), [], 'Selecting all removes the column filter');
});

for (const valueType of ['number', 'date']) test(`${valueType} Blank means only NULL, never zero or date conversion`, async () => {
  const values = valueType === 'number' ? [null, 0, 2] : [null, '0000-00-00', '2026-10-19'];
  const view = await popup({ combineBlankValues: true, filterValueType: valueType, fetchValues: async () => values });
  assert.deepEqual(Array.from(view.allValues.value), values.map(key));
  view.clearAll(); view.toggleOne(key(null)); view.onOk();
  assert.deepEqual(params('Value', view.events.at(-1)[1]), { filterNull_Value: '1' });
  view.toggleOne(key(values[1])); view.onOk();
  assert.deepEqual(params('Value', view.events.at(-1)[1]), { filterSet_Value: [String(values[1])], filterNull_Value: '1' });
});

test('Reopening combined selections deduplicates blank without incorrectly treating stale selections as all', async () => {
  const view = await popup({ combineBlankValues: true, selected: [key(null), key(''), key('old'), key('0'), key('null'), key('Ani')] });
  assert.equal(view.checked.value.filter(value => value === key(null)).length, 1);
  view.onOk();
  assert.ok(view.events.at(-1)[1].length > 0, 'The unselected whitespace option must keep this filter active');
  const reopened = await popup({ combineBlankValues: true, selected: Array.from(view.events.at(-1)[1]) });
  assert.ok(reopened.checked.value.includes(key(null)));
  assert.ok(!reopened.checked.value.includes(key('')));
});

test('Popup without the combined flag keeps NULL and empty separate; no synthetic blank appears when data has none', async () => {
  const legacy = await popup();
  assert.ok(legacy.allValues.value.includes(key(null)));
  assert.ok(legacy.allValues.value.includes(key('')));
  assert.equal(legacy.displayLabel(key(null)), '(NULL / tidak tersedia)');
  assert.equal(legacy.displayLabel(key('')), '(String kosong)');
  legacy.clearAll(); legacy.toggleOne(key('')); legacy.onOk();
  assert.deepEqual(params('Email', legacy.events.at(-1)[1]), { filterEmpty_Email: '1' });
  const noBlank = await popup({ combineBlankValues: true, fetchValues: async () => ['0', 'null', ' '] });
  assert.ok(!noBlank.allValues.value.includes(key(null)));
});

test('Karyawan wires explicit semantic types and every browse combines blank values by default', () => {
  const source = read('views/master/KaryawanView.vue');
  const types = compile(source.match(/const filterValueTypes:[\s\S]*?(?=\nconst barcodeTarget)/)[0] + '\nexport { columns };', {}).columns;
  assert.equal(types.length, 30);
  for (const column of types) {
    const expected = column.key === 'MasaKerja' ? 'number' : ['TglLahir', 'TglMasuk', 'TglKeluar', 'PKWT1', 'PKWT2'].includes(column.key) ? 'date' : 'string';
    assert.equal(column.filterValueType, expected, column.key);
  }
  // Blank handling is shared: BaseBrowse enables it for every browse view.
  assert.match(read('components/BaseBrowse.vue'), /combineBlankValues: true/);
  assert.match(read('components/BaseBrowse.vue'), /col\.type === 'date'.*'date'.*col\.type === 'number'.*'number'.*'string'/);
});
