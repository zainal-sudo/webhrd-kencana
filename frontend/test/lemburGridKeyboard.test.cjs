const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');
const source = fs.readFileSync(path.join(__dirname, '../src/views/transaksi/LemburForm.vue'), 'utf8');

function fixture(niks = ['TEST-01']) {
  const baris = vue.ref(niks.map(nik => ({ nik })));
  const focus = [], scrolled = [];
  class Input {
    constructor(row, column, options = {}) {
      Object.assign(this, { row, column, type: 'text', value: 'abc', selectionStart: 3, selectionEnd: 3, disabled: false, readOnly: false }, options);
    }
    closest(selector) {
      return { dataset: selector.includes('column') ? { gridColumn: String(this.column) } : { gridRow: String(this.row) } };
    }
    focus() { focus.push([this.row, this.column]); }
    select() { this.selectionStart = 0; this.selectionEnd = this.value.length; }
    scrollIntoView() { scrolled.push([this.row, this.column]); }
  }
  const table = { querySelector(selector) {
    const row = Number(/data-grid-row="(\d+)"/.exec(selector)[1]);
    const column = Number(/data-grid-column="(\d+)"/.exec(selector)[1]);
    return new Input(row, column);
  } };
  const module = { exports: {} };
  const code = source.slice(source.indexOf('function tambahBaris()'), source.indexOf('function hapusBaris('));
  vm.runInNewContext(ts.transpileModule(code + '\nexport { navigateEmployeeGrid, employeeGrid, editEmployeeGrid };', { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module, exports: module.exports, ref: vue.ref, nextTick: vue.nextTick, baris, HTMLInputElement: Input });
  module.exports.employeeGrid.value = table;
  async function key(row, column, key, options = {}, inputOptions = {}) {
    const event = { target: new Input(row, column, inputOptions), key, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, ...options };
    if (inputOptions.editing) module.exports.editEmployeeGrid({ target: event.target });
    await module.exports.navigateEmployeeGrid(event);
    return event;
  }
  return { baris, focus, scrolled, key, grid: module.exports.employeeGrid };
}

test('Tab traverses editable columns, skips Nama/actions; Enter appends one row in the same column', async () => {
  const f = fixture();
  for (let col = 0; col < 4; col++) {
    assert.equal((await f.key(0, col, 'Tab')).defaultPrevented, true);
    assert.deepEqual(f.focus.at(-1), [0, col + 1]);
  }
  await f.key(0, 4, 'Enter', {}, { type: 'checkbox' });
  assert.equal(f.baris.value.length, 2);
  assert.deepEqual(f.focus.at(-1), [1, 4]);
  assert.equal(f.baris.value[1].nik, '');
  assert.equal(f.baris.value[1].panggilan, false);
  await f.key(1, 4, 'Enter', {}, { type: 'checkbox' });
  assert.equal(f.baris.value.length, 2);
  assert.deepEqual(f.scrolled, f.focus);
});

test('Enter/Shift+Enter and vertical arrows preserve columns; Tab wraps existing rows', async () => {
  const f = fixture(['TEST-01', 'TEST-02']);
  await f.key(0, 4, 'Enter');
  assert.equal(f.baris.value.length, 2);
  assert.deepEqual(f.focus.at(-1), [1, 4]);
  await f.key(1, 4, 'Enter', { shiftKey: true });
  assert.deepEqual(f.focus.at(-1), [0, 4]);
  await f.key(0, 4, 'Tab');
  assert.deepEqual(f.focus.at(-1), [1, 0]);
  await f.key(1, 0, 'Tab', { shiftKey: true });
  assert.deepEqual(f.focus.at(-1), [0, 4]);
  await f.key(0, 2, 'ArrowDown');
  assert.deepEqual(f.focus.at(-1), [1, 2]);
  await f.key(1, 2, 'ArrowUp');
  assert.deepEqual(f.focus.at(-1), [0, 2]);
  const count = f.focus.length;
  await f.key(0, 0, 'Enter', { shiftKey: true });
  await f.key(0, 2, 'ArrowUp');
  await f.key(1, 2, 'ArrowDown');
  assert.equal(f.focus.length, count);
  assert.equal(f.baris.value.length, 2);
});

test('Horizontal arrows navigate in cell mode, but retain caret editing and Shift selection in edit mode', async () => {
  const f = fixture();
  assert.equal((await f.key(0, 2, 'ArrowRight', {}, { editing: true, selectionStart: 1, selectionEnd: 1 })).defaultPrevented, false);
  assert.equal((await f.key(0, 2, 'ArrowLeft', {}, { editing: true, selectionStart: 0, selectionEnd: 2 })).defaultPrevented, false);
  assert.equal((await f.key(0, 2, 'ArrowRight', { shiftKey: true })).defaultPrevented, false);
  assert.equal(f.focus.length, 0);
  await f.key(0, 2, 'ArrowRight');
  assert.deepEqual(f.focus.at(-1), [0, 3]);
  await f.key(0, 2, 'ArrowLeft', {}, { selectionStart: 0, selectionEnd: 0 });
  assert.deepEqual(f.focus.at(-1), [0, 1]);
  await f.key(0, 4, 'ArrowLeft', {}, { type: 'checkbox', selectionStart: null, selectionEnd: null });
  assert.deepEqual(f.focus.at(-1), [0, 3]);
});

test('Grid-edge Tab/Space, IME, modifiers, readonly/disabled controls and held Enter retain safe defaults', async () => {
  const f = fixture();
  for (const key of [' ', 'Backspace', 'Delete']) assert.equal((await f.key(0, 0, key)).defaultPrevented, false);
  assert.equal((await f.key(0, 0, 'Tab', { shiftKey: true })).defaultPrevented, false);
  assert.equal((await f.key(0, 4, 'Tab')).defaultPrevented, false);
  for (const option of ['isComposing', 'ctrlKey', 'altKey', 'metaKey', 'defaultPrevented']) {
    await f.key(0, 0, 'Enter', { [option]: true });
  }
  await f.key(0, 0, 'Enter', {}, { readOnly: true });
  await f.key(0, 0, 'Enter', {}, { disabled: true });
  await f.key(0, 4, 'Enter', { repeat: true });
  assert.equal(f.focus.length, 0);
  assert.equal(f.baris.value.length, 1);
  assert.match(source, /@keydown="navigateEmployeeGrid"/);
  assert.match(source, /v-model="b.nama"[^>]*readonly/);
  assert.equal((source.match(/data-grid-column="[0-4]"/g) || []).length, 5);
  assert.match(source, /\.panggil-cell:focus-within \.panggil-hint/);
  assert.match(source, /td\[data-grid-column\]:focus-within/);
});

test('Enter from any populated last-row column adds a row and stays in that column', async () => {
  for (let column = 0; column < 5; column++) {
    const f = fixture();
    await f.key(0, column, 'Enter');
    assert.equal(f.baris.value.length, 2);
    assert.deepEqual(f.focus.at(-1), [1, column]);
  }
});

test('SPL time inputs delegate Enter to the grid instead of swallowing it in FTime', async () => {
  const file = fs.readFileSync(path.join(__dirname, '../src/components/fields/FTime.vue'), 'utf8');
  const script = file.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const props = vue.reactive({ modelValue: '08:00:00', navigateOnEnter: false });
  const module = { exports: {} };
  const jamModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/utils/jam.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module: jamModule, exports: jamModule.exports });
  vm.runInNewContext(ts.transpileModule(script + '\nexport { keydown };', { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module, exports: module.exports, require: name => name === 'vue' ? vue : jamModule.exports,
      defineProps: () => props, withDefaults: value => value, defineEmits: () => () => {} });
  let prevented = false, stopped = false;
  await module.exports.keydown({ key: 'Enter', target: {}, preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
  assert.equal(prevented, false);
  assert.equal(stopped, false);
  assert.equal((source.match(/:navigate-on-enter="false"/g) || []).length, 2);
});
