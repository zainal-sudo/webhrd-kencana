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

async function popup(props) {
  const callbacks = [], events = [];
  const source = read('components/ColumnFilterPopup.vue').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const result = compile(source + '\nexport { allValues, checked, toggleOne, onOk };', {
    vue: { ...vue, onMounted: fn => callbacks.push(fn), onUnmounted() {}, onDeactivated() {} },
    '@/utils/columnFilter': filter,
    '@/utils/format': { formatTanggal: value => value, formatTanggalWaktu: value => value },
  }, { defineProps: () => props, defineEmits: () => (...args) => events.push(args),
    document: { addEventListener() {} }, window: { addEventListener() {} }, cancelAnimationFrame() {} });
  for (const fn of callbacks) await fn();
  return { ...result, events };
}

test('Exclude params send only hidden values, including one Blank flag pair', () => {
  const params = JSON.parse(JSON.stringify(filter.columnExcludeParams('Email',
    [null, '', '-'].map(key))));
  assert.deepEqual(params, {
    filterNotSet_Email: ['-'], filterNotNull_Email: '1', filterNotEmpty_Email: '1',
  });
  const onlyDash = JSON.parse(JSON.stringify(filter.columnExcludeParams('Size', [key('-')])));
  assert.deepEqual(onlyDash, { filterNotSet_Size: ['-'] });
  const malformed = JSON.parse(JSON.stringify(filter.columnFilterParams('Email', ['-'])));
  assert.deepEqual(malformed, { filterSet_Email: ['-'] });
});

test('Hiding Blank and dash on a long column emits a short exclusion instead of every other value', async () => {
  const values = [null, '-', ...Array.from({ length: 500 }, (_, i) => `ANI ${i}`)];
  const view = await popup({
    selected: [], excluded: [], combineBlankValues: true, filterValueType: 'string',
    fetchValues: async () => values,
  });
  assert.equal(view.allValues.value.length, 502);
  view.toggleOne(key(null)); // uncheck (Blank)
  view.toggleOne(key('-'));  // uncheck the literal dash as well
  view.onOk();
  const [, included, hidden] = view.events.at(-1);
  assert.equal(included.length, 500);
  // Blank expands to both NULL and empty-string flags on the wire.
  assert.equal(hidden.length, 3);
  const hiddenParams = JSON.parse(JSON.stringify(filter.columnExcludeParams('Email', hidden)));
  assert.deepEqual(hiddenParams, {
    filterNotSet_Email: ['-'], filterNotNull_Email: '1', filterNotEmpty_Email: '1',
  });
  assert.ok(JSON.stringify(hiddenParams).length < 100, 'Exclusion URL stays tiny');
});

test('Reopening an excluded filter restores every checkbox except the hidden ones', async () => {
  const values = [null, '-', 'Ani'];
  const hidden = [key(null), key('-')];
  const view = await popup({
    selected: [], excluded: hidden, combineBlankValues: true, filterValueType: 'string',
    fetchValues: async () => values,
  });
  assert.deepEqual(Array.from(view.checked.value), [key('Ani')]);
  view.onOk();
  assert.deepEqual(Array.from(view.events.at(-1)[2]), [key(null), key(''), key('-')]);
});

test('BaseBrowse sends exclusion params for list, distinct and export requests', () => {
  const source = read('components/BaseBrowse.vue');
  assert.match(source, /columnExcludeParams/);
  assert.match(source, /excludedSets/);
  assert.match(source, /:excluded="excludedSets\[col.key\] \|\| \[\]"/);
  assert.match(source, /@apply="\(vals, hidden\) => applyFilterSet\(col, vals, hidden\)"/);
});
