const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');

function compile(source, requireModule, globals = {}) {
  const module = { exports: {} };
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(js, { module, exports: module.exports, require: requireModule, ...globals });
  return module.exports;
}
const jam = compile(fs.readFileSync(path.join(__dirname, '../src/utils/jam.ts'), 'utf8'), require);
function component() {
  const source = fs.readFileSync(path.join(__dirname, '../src/components/fields/FTime.vue'), 'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const updates = [];
  const handlers = compile(source + '\nexport { input, beforeInput, paste, keydown };',
    name => name === 'vue' ? vue : jam,
    { defineProps: () => ({}), withDefaults: (props, defaults) => ({ ...defaults, ...props }), defineEmits: () => (event, value) => updates.push(value) });
  return { ...handlers, updates };
}
function target(value, caret = value.length) {
  return { value, selectionStart: caret, selectionEnd: caret, setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; } };
}

test('digits are masked without changing their numeric values', () => {
  for (const [input, expected] of [['', ''], ['0', '0'], ['08', '08'], ['080', '08:0'], ['0805', '08:05'], ['08050', '08:05:0'], ['080500', '08:05:00'], ['08:05:00', '08:05:00']]) {
    assert.equal(jam.maskClockTime(input), expected);
  }
});

test('valid clock boundaries and optional empty values retain existing defaults', () => {
  for (const value of ['00:00:00', '08:05:00', '23:59:59', '', null, undefined]) {
    assert.equal(jam.clockTimeError(value), '');
    assert.doesNotThrow(() => jam.assertClockTime(value, 'Scan Keluar'));
  }
  assert.equal(jam.normJam(''), '00:00:00');
  assert(jam.clockTimeError('', true));
});

test('letters, partial times and invalid ranges are blocked before save', () => {
  for (const value of ['00:00:00uuuuuS', 'teks', '08', '08:05', '08:05:0', '24:00:00', '12:60:00', '12:00:60', '-1:00:00', '123:00:00']) {
    assert(jam.clockTimeError(value), value);
    assert.throws(() => jam.assertClockTime(value, 'Scan Keluar'), /Scan Keluar:/);
  }
});

test('typing and pasting letters is rejected; clock paste and numeric edits work', () => {
  const field = component();
  let prevented = false;
  field.beforeInput({ data: 's', preventDefault() { prevented = true; } });
  assert(prevented);
  prevented = false;
  field.beforeInput({ data: '5', preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
  field.paste({ clipboardData: { getData: () => '08:05:00abc' }, preventDefault() { prevented = true; } });
  assert(prevented);
  prevented = false;
  field.paste({ clipboardData: { getData: () => '08:05:00' }, preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
  const input = target('080500');
  field.input({ target: input });
  assert.equal(input.value, '08:05:00');
  assert.equal(field.updates.at(-1), '08:05:00');
  assert.equal(input.selectionStart, 8);
});

test('backspace/delete skip auto-colons, selection and clearing remain usable', () => {
  const field = component();
  const input = target('08:05:00', 3);
  field.keydown({ key: 'Backspace', target: input });
  assert.equal(input.selectionStart, 2);
  input.setSelectionRange(2, 2);
  field.keydown({ key: 'Delete', target: input });
  assert.equal(input.selectionStart, 3);
  input.setSelectionRange(0, 8);
  field.keydown({ key: 'Backspace', target: input });
  assert.equal(input.selectionEnd, 8);
  field.input({ target: target('') });
  assert.equal(field.updates.at(-1), '');
});

test('all six form pages use time fields and pre-save validation', () => {
  for (const file of ['views/absensi/AbsensiForm.vue', 'views/transaksi/IjinForm.vue', 'views/transaksi/Ijin2Form.vue', 'views/transaksi/LemburForm.vue', 'views/transaksi/Lembur2Form.vue', 'components/MasterForm.vue']) {
    const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
    assert(source.includes('<FTime'), file);
    const save = source.match(/async function (?:simpan|save)\(\): Promise<string> \{([\s\S]*?)\n\}/)[1];
    assert(save.includes('assertClockTime'), file);
    const request = save.search(/await (?:api\.|cekDuplikat)/);
    if (request >= 0) assert(save.indexOf('assertClockTime') < request, file);
  }
  const config = fs.readFileSync(path.join(__dirname, '../src/config/masterSimple.ts'), 'utf8');
  for (const key of ['jd_jamawal', 'jd_jamakhir']) assert(config.includes(`key: "${key}", label: "${key === 'jd_jamawal' ? 'Jam Awal' : 'Jam Akhir'}", type: "time"`));
});
