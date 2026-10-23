const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('./helpers/frontendVm.cjs');
const ts = require('typescript');
const vue = require('vue');
const source = fs.readFileSync(path.join(__dirname, '../src/components/fields/FSelect.vue'), 'utf8');

function fixture(overrides = {}) {
  const props = vue.reactive({ label: 'Status BPJS', modelValue: 0, options: [{ label: 'Belum Ada', value: 0 }, { label: 'Perusahaan', value: 1 }], ...overrides });
  const events = [], module = { exports: {} };
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(ts.transpileModule(script + '\nexport { searchItems, searchValue, onAutocompleteChange };', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module, exports: module.exports,
    require: name => name === 'vue' ? { ...vue, getCurrentInstance: () => ({ uid: 42 }) } : {},
    defineProps: () => props, withDefaults: (value, defaults) => { for (const [key, item] of Object.entries(defaults)) if (!(key in value)) value[key] = item; return value; },
    defineEmits: () => (...event) => events.push(event),
  });
  return { ...module.exports, props, events };
}

test('Search mode preserves numeric zero and native string payload types', () => {
  const f = fixture({ searchable: true });
  assert.equal(f.searchValue.value, '0');
  assert.deepEqual(Array.from(f.searchItems.value, option => option.value), ['0', '1']);
  f.onAutocompleteChange('0'); f.onAutocompleteChange('1');
  assert.deepEqual(f.events, [['update:modelValue', '0'], ['update:modelValue', '1']]);
  f.props.modelValue = null;
  assert.equal(f.searchValue.value, null);
  f.props.modelValue = 1;
  assert.equal(f.searchValue.value, '1');
});

test('Free text, disabled changes and clearing a non-clearable field do not change selection', () => {
  const f = fixture({ searchable: true });
  f.onAutocompleteChange('free text'); f.onAutocompleteChange(null);
  assert.equal(f.events.length, 0);
  f.props.showClear = true;
  f.onAutocompleteChange(null);
  assert.deepEqual(f.events, [['update:modelValue', null]]);
  f.props.disabled = true;
  f.onAutocompleteChange('1'); f.onAutocompleteChange(null);
  assert.equal(f.events.length, 1);
});

test('Search is opt-in and enabled for every employee FSelect, including education', () => {
  assert.equal(fixture().props.searchable, false);
  const employee = fs.readFileSync(path.join(__dirname, '../src/views/master/KaryawanForm.vue'), 'utf8');
  const fields = employee.match(/<FSelect\b[^>]*>/g);
  assert.ok(fields.length > 15);
  assert.ok(fields.every(field => /\bsearchable\b/.test(field)));
  assert.ok(fields.some(field => /d.kard_jenjang/.test(field)));
  assert.match(employee, /atasan-menu .v-list-item-title\) \{ font-size: 11px/);
});
