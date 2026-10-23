const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('./helpers/frontendVm.cjs');
const ts = require('typescript');
const vue = require('vue');

function compile(source, requireModule, globals = {}) {
  const module = { exports: {} };
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(js, { module, exports: module.exports, require: requireModule, ...globals });
  return module.exports;
}
const jam = compile(fs.readFileSync(path.join(__dirname, '../src/utils/jam.ts'), 'utf8'), require);
function component(settings = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/components/fields/FTime.vue'), 'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const updates = [];
  const props = vue.reactive({ ...settings });
  const handlers = compile(source + '\nexport { input, beforeInput, paste, keydown, focus, blur, display, suffix, draft, error };',
    name => name === 'vue' ? vue : jam,
    { defineProps: () => props, withDefaults: (props, defaults) => { for (const [key, value] of Object.entries(defaults)) if (props[key] === undefined) props[key] = value; return props; },
      defineEmits: () => (event, value) => { updates.push(value); props.modelValue = value; } });
  return { ...handlers, updates, props };
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

test('Minute mode masks only HH:mm (tanpa detik), validates ranges, and defaults stay HH:mm:ss', () => {
  assert.equal(jam.maskClockMinute(''), ''); assert.equal(jam.maskClockMinute('093055'), '09:30');
  assert.equal(jam.maskClockMinute('09'), '09'); assert.equal(jam.maskClockMinute('9'), '9');
  for (const value of ['00:00', '09:30', '23:59', '', null, undefined]) assert.equal(jam.clockMinuteTimeError(value), '');
  assert.equal(jam.clockMinuteTimeError('', true), 'Jam wajib diisi.');
  for (const value of ['9:30', '09:3', '0930', '24:00', '12:60', '09:30:00', 'teks']) assert(jam.clockMinuteTimeError(value), value);
  const field = component({ seconds: false, modelValue: '' });
  field.focus({ target: target('') });
  field.input({ target: target('0930') });
  assert.equal(field.updates.at(-1), '09:30');
  field.input({ target: target('093055') });
  assert.equal(field.updates.at(-1), '09:30');
  field.blur(); assert.equal(field.display.value, '09:30'); assert.equal(field.error.value, '');
  assert.ok(component({ modelValue: '09:30' }).error.value);
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

test('Focus clears only the visible field; leaving without typing retains old value and emits nothing', () => {
  for (const value of ['08:30:15', '00:00:00', '', null]) {
    const field = component({ modelValue: value });
    const input = target(value || '');
    field.focus({ target: input });
    assert.equal(input.value, ''); assert.equal(field.display.value, '');
    assert.equal(field.props.modelValue, value); assert.equal(field.updates.length, 0);
    field.blur();
    assert.equal(field.display.value, value || ''); assert.equal(field.updates.length, 0);
  }
});

test('Hour shortcut emits full time immediately, ghost zeros stay out of editable draft, minutes/seconds extend naturally', async () => {
  const field = component({ modelValue: '16:30:00' });
  field.focus({ target: target('16:30:00') });
  for (const [raw, draft, value, suffix] of [
    ['0', '0', '0', ''], ['07', '07', '07:00:00', ':00:00'],
    ['073', '07:3', '07:30:00', '0:00'], ['07:30', '07:30', '07:30:00', ':00'],
    ['07:301', '07:30:1', '07:30:10', '0'], ['07:30:15', '07:30:15', '07:30:15', ''],
  ]) {
    const input = target(raw);
    field.input({ target: input }); await vue.nextTick();
    assert.equal(input.value, draft); assert.equal(field.display.value, draft);
    assert.equal(field.props.modelValue, value); assert.equal(field.suffix.value, suffix);
    assert.equal(input.selectionStart, draft.length);
  }
  field.blur(); assert.equal(field.display.value, '07:30:15'); assert.equal(field.error.value, '');
});

test('Blur completes a one-digit hour, explicit clear remains empty, invalid ranges are not silently corrected', () => {
  const field = component({ modelValue: '08:00:00', required: true });
  field.focus({ target: target('08:00:00') }); field.input({ target: target('7') }); field.blur();
  assert.equal(field.props.modelValue, '07:00:00');
  field.focus({ target: target('07:00:00') }); field.input({ target: target('') }); field.blur();
  assert.equal(field.props.modelValue, ''); assert.ok(field.error.value);
  for (const invalid of ['24', '2360', '235960']) {
    field.focus({ target: target('') }); field.input({ target: target(invalid) }); field.blur();
    assert.ok(field.error.value); assert.throws(() => jam.assertClockTime(field.props.modelValue, 'Jam'));
  }
});

test('Paste, selection replacement, deletion, and externally reset state remain usable during focus', async () => {
  const field = component({ modelValue: '08:00:00' });
  field.focus({ target: target('08:00:00') }); field.input({ target: target('0730') }); await vue.nextTick();
  assert.equal(field.display.value, '07:30'); assert.equal(field.props.modelValue, '07:30:00');
  field.input({ target: target('09') }); await vue.nextTick();
  assert.equal(field.props.modelValue, '09:00:00');
  field.input({ target: target('0') }); field.blur();
  assert.equal(field.props.modelValue, '00:00:00');
  field.focus({ target: target('00:00:00') }); field.input({ target: target('12') }); await vue.nextTick();
  field.props.modelValue = '10:45:00'; await vue.nextTick();
  field.blur(); assert.equal(field.display.value, '10:45:00'); assert.equal(field.updates.at(-1), '12:00:00');
});

test('Disabled time field cannot clear old data or emit updates', () => {
  const field = component({ modelValue: '08:30:00', disabled: true });
  const input = target('08:30:00'); field.focus({ target: input }); field.input({ target: target('07') }); field.blur();
  assert.equal(input.value, '08:30:00'); assert.equal(field.display.value, '08:30:00'); assert.equal(field.updates.length, 0);
});

test('Ghost guide is subtle and noninteractive, focusable input remains text/numeric in compact and normal fields', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/components/fields/FTime.vue'), 'utf8');
  assert.match(source, /:placeholder="editing \? focusPlaceholder : placeholder"/);
  assert.match(source, /class="time-guide" aria-hidden="true"/);
  assert.match(source, /pointer-events: none/); assert.match(source, /\.typed-guide \{ visibility: hidden/);
  assert.match(source, /\.compact \.time-guide/); assert.match(source, /input:focus-visible/);
  assert.match(source, /@focus="focus"/); assert.match(source, /@blur="blur"/);
});

test('Actual FTime render shows empty focus placeholder, ghost completion, and restores untouched time', async () => {
  const { parse, compileScript } = require('@vue/compiler-sfc');
  const { renderToString } = require('@vue/server-renderer');
  const source = fs.readFileSync(path.join(__dirname, '../src/components/fields/FTime.vue'), 'utf8')
    .replace('</script>', '\ncapture({ focus, input, blur });\n</script>');
  const { descriptor } = parse(source);
  const script = compileScript(descriptor, { id: 'time-test', inlineTemplate: true }).content;
  async function render(action, compact = false, modelValue = '08:30:15') {
    const Component = compile(script, name => name === 'vue' ? vue : jam, { capture: action }).default;
    return renderToString(vue.createSSRApp({ render: () => vue.h(Component, { modelValue, label: 'Jam Masuk', compact }) }));
  }
  for (const compact of [false, true]) {
    const focused = await render(state => state.focus({ target: target('08:30:15') }), compact);
    assert.match(focused, /\bvalue(?:=""|(?=\s))/); assert.match(focused, /placeholder="00:00:00"/);
    assert.match(focused, /Format 24 jam: HH:mm:ss/);
    assert.match(focused, /Enter untuk lanjut/);
    const typed = await render(state => { state.focus({ target: target('08:30:15') }); state.input({ target: target('07') }); }, compact);
    assert.match(typed, /value="07"/);
    assert.match(typed, /class="typed-guide">07<\/span>:00:00/);
    assert.match(typed, /aria-hidden="true"/);
    const restored = await render(state => { state.focus({ target: target('08:30:15') }); state.blur(); }, compact);
    assert.match(restored, /value="08:30:15"/); assert.ok(!restored.includes('class="time-guide"'));
    const invalid = await render(() => {}, compact, '24:00:00');
    assert.match(invalid, /role="alert"/);
    assert.match(invalid, /Jam harus 00–23/);
  }
});

function enterTarget(value, neighbors = []) {
  const input = target(value);
  const scope = { querySelectorAll: () => [input, ...neighbors] };
  input.closest = () => scope;
  return input;
}
function nextField(settings = {}) {
  return { tabIndex: settings.tabIndex ?? 0, focused: false,
    matches: () => !!(settings.disabled || settings.readonly || settings.hiddenType),
    closest: () => settings.hidden ? {} : null,
    getClientRects: () => settings.invisible ? [] : [{}], focus() { this.focused = true; } };
}
function enterEvent(input, extras = {}) {
  return { key: 'Enter', target: input, prevented: false, stopped: false,
    preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...extras };
}
test('Enter completes the hour, skips disabled/read-only/hidden fields and focuses next input without submitting', async () => {
  const field = component({ modelValue: '08:30:15' });
  const skipped = [{ disabled: true }, { readonly: true }, { hiddenType: true }, { hidden: true }, { invisible: true }, { tabIndex: -1 }].map(nextField);
  const next = nextField(); const input = enterTarget('08:30:15', [...skipped, next]);
  field.focus({ target: input }); input.value = '07'; field.input({ target: input });
  const event = enterEvent(input); await field.keydown(event);
  assert.equal(field.props.modelValue, '07:00:00'); assert.equal(input.value, '07:00:00');
  assert.ok(next.focused); assert.ok(skipped.every(item => !item.focused));
  assert.ok(event.prevented); assert.ok(event.stopped);
  const count = field.updates.length; field.blur(); assert.equal(field.updates.length, count);
});
test('Enter keeps invalid or required-empty clock in place, and untouched Enter retains old value', async () => {
  for (const value of ['25', '0760', '075960', '']) {
    const field = component({ modelValue: '08:00:00', required: true });
    const next = nextField(); const input = enterTarget('08:00:00', [next]);
    field.focus({ target: input }); input.value = value; field.input({ target: input });
    await field.keydown(enterEvent(input)); assert.ok(field.error.value); assert.equal(next.focused, false);
  }
  const field = component({ modelValue: '08:30:15' });
  const next = nextField(); const input = enterTarget('08:30:15', [next]);
  field.focus({ target: input }); await field.keydown(enterEvent(input));
  assert.equal(field.props.modelValue, '08:30:15'); assert.equal(field.updates.length, 0); assert.ok(next.focused);
});
test('Enter on the last time field completes without clicking Save; repeat/composition do not advance', async () => {
  const field = component({ modelValue: '08:00:00' }); const input = enterTarget('08:00:00');
  field.focus({ target: input }); input.value = '07'; field.input({ target: input });
  await field.keydown(enterEvent(input)); assert.equal(input.value, '07:00:00');
  for (const extra of [{ repeat: true }, { isComposing: true }]) {
    const next = nextField(); const input = enterTarget('07:00:00', [next]);
    field.focus({ target: input }); await field.keydown(enterEvent(input, extra)); assert.equal(next.focused, false);
  }
});
