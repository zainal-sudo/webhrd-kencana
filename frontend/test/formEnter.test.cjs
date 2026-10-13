const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');
const root = path.join(__dirname, '../src');
function compile(source, globals = {}, requireModule = require) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require: requireModule, ...globals });
  return module.exports;
}
const source = fs.readFileSync(path.join(root, 'utils/formEnter.ts'), 'utf8');
const { nextFormField } = compile(source, { Event }, name => name === 'vue' ? vue : {});
function field(options = {}) {
  return { tabIndex: options.tabIndex ?? 0, focused: false, reported: false, changed: false,
    matches(selector) {
      if (selector === 'input, select') return !options.textarea;
      return !!(options.disabled || options.readonly || options.hiddenType || options.button);
    },
    checkValidity: () => !options.invalid,
    reportValidity() { this.reported = true; },
    dispatchEvent(event) { assert.equal(event.type, 'change'); this.changed = true; options.onChange?.(options); },
    closest: () => options.hidden ? {} : null,
    getClientRects: () => options.invisible ? [] : [{}], focus() { this.focused = true; },
  };
}
function event(target, extras = {}) {
  return { key: 'Enter', target, prevented: false, preventDefault() { this.prevented = true; }, ...extras };
}
test('Form Enter commits fields, skips hidden/disabled/read-only targets, and supports Shift+Enter', async () => {
  const previous = field(), current = field(), next = field();
  const skipped = [{ disabled: true }, { readonly: true }, { hiddenType: true }, { invisible: true }, { hidden: true }, { tabIndex: -1 }, { button: true }].map(field);
  current.closest = selector => selector.includes('lookup-search') ? null : ({ querySelectorAll: () => [previous, current, ...skipped, next] });
  const e = event(current);
  await nextFormField(e);
  assert.equal(e.prevented, true);
  assert.equal(current.changed, true);
  assert.equal(next.focused, true);
  assert.ok(skipped.every(f => !f.focused));
  await nextFormField(event(current, { shiftKey: true }));
  assert.equal(previous.focused, true);
});
test('Invalid inputs remain focused; valid correction clears old custom validity before checking', async () => {
  const next = field(), current = field({ invalid: true });
  current.closest = selector => selector.includes('lookup-search') ? null : ({ querySelectorAll: () => [current, next] });
  await nextFormField(event(current));
  assert.equal(current.reported, true);
  assert.equal(next.focused, false);
  const corrected = field({ invalid: true, onChange: options => { options.invalid = false; } });
  corrected.closest = selector => selector.includes('lookup-search') ? null : ({ querySelectorAll: () => [corrected, next] });
  await nextFormField(event(corrected));
  assert.equal(next.focused, true);
});
test('Handled grid/time Enter, textarea newlines, IME, repeats and buttons are not intercepted', async () => {
  for (const settings of [{ defaultPrevented: true }, { isComposing: true }, { repeat: true }, { key: 'Tab' }]) {
    const e = event(field(), settings); await nextFormField(e); assert.equal(e.prevented, false);
  }
  for (const options of [{ textarea: true }, { button: true }]) {
    const e = event(field(options)); await nextFormField(e); assert.equal(e.prevented, false);
  }
  const search = field();
  search.closest = () => ({});
  const searchEvent = event(search);
  await nextFormField(searchEvent);
  assert.equal(searchEvent.prevented, false);
  const base = fs.readFileSync(path.join(root, 'components/BaseForm.vue'), 'utf8');
  assert.match(base, /class="form-panel" @keydown="nextFormField"/);
});

test('Ijin V2 Tidak Masuk hides time inputs and sends zero times even if previous time draft is invalid', async () => {
  const source = fs.readFileSync(path.join(root, 'views/transaksi/Ijin2Form.vue'), 'utf8');
  const jam = compile(fs.readFileSync(path.join(root, 'utils/jam.ts'), 'utf8'));
  const declarations = source.slice(source.indexOf('const PAKAI_JAM2'), source.indexOf('const terlaluLama'));
  const save = source.match(/async function simpan\(\): Promise<string> \{[\s\S]*?\n\}/)[0];
  const values = vue.reactive({ tanggal: '2026-10-13', jenis_id: '3', jam: 'invalid', jam2: 'invalid' });
  const posts = [];
  const f = compile(declarations + save + '\nexport { simpan, tidakMasuk, pakaiJam2 };', {
    ...vue, ...jam, values, baris: vue.ref([{ nik: '001' }]), terlaluLama: vue.ref(false),
    api: { async post(url, body) { posts.push({ url, body }); return { data: { message: 'OK' } }; } },
    muatNomor() {}, getErrorMessage: error => error.message,
  });
  assert.equal(f.tidakMasuk.value, true);
  assert.equal(f.pakaiJam2.value, false);
  await f.simpan();
  assert.equal(posts[0].body.jam, '00:00:00');
  assert.equal(posts[0].body.jam2, '00:00:00');
  values.jenis_id = '2';
  assert.equal(f.tidakMasuk.value, false);
  await assert.rejects(f.simpan(), /Jam:/);
  assert.equal(posts.length, 1);
  assert.match(source, /<FTime v-if="!tidakMasuk" v-model="values.jam"/);
  assert.match(source, /<FTime v-if="pakaiJam2" v-model="values.jam2"/);
});
