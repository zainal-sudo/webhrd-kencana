const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');
const { parse, compileScript } = require('@vue/compiler-sfc');
const { renderToString } = require('@vue/server-renderer');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '../src');
function compile(source, requireModule = require, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require: requireModule, Date, ...globals });
  return module.exports;
}
const source = fs.readFileSync(path.join(root, 'utils/format.ts'), 'utf8');
const format = compile(source);

test('Numeric display pads dates, validates leap days and preserves SQL/input values', () => {
  for (const [input, expected] of [['2026-01-09', '09/01/2026'], ['2024-02-29', '29/02/2024'],
    ['2026-10-13T23:40:00Z', '13/10/2026'], ['2026-10-13 08:01:02', '13/10/2026'],
    [null, ''], [undefined, ''], ['', ''], ['invalid', ''], ['2026-02-29', ''], ['2026-13-01', ''], ['2026-01-00', '']]) {
    assert.equal(format.formatTanggal(input), expected);
  }
  assert.equal(format.formatTanggal(new Date(2026, 0, 9)), '09/01/2026');
  assert.equal(format.formatTanggal(new Date(NaN)), '');
  assert.equal(format.formatTanggalWaktu('2026-10-13T23:40:00Z'), '13/10/2026 23:40');
  assert.equal(format.formatTanggalWaktu(new Date(2026, 0, 9, 8, 5)), '09/01/2026 08:05');
  assert.equal(format.formatTanggalOr(null), '-');
  assert.equal(format.formatDateInput(new Date(2026, 0, 9)), '2026-01-09');
  assert.equal(format.parseTanggalInput('09/01/2026'), '2026-01-09');
  assert.equal(format.parseTanggalInput(''), '');
  for (const invalid of ['29/02/2026', '9/1/2026', '2026-01-09', '01/13/2026']) assert.equal(format.parseTanggalInput(invalid), null);
});

test('Cut-off payroll defaults: 26 previous month until 25 current month, including December rollover', () => {
  for (const month of [0, 1, 10, 11]) {
    const DateCtor = class extends Date {
      constructor(...args) { super(...args); this.setMonth(month); this.setDate(1); }
    };
    const f = compile(source, null, { Date: DateCtor });
    const year = new Date(2026, month, 1).getFullYear();
    const awalYear = month === 0 ? year - 1 : year;
    assert.equal(f.awalCutoff(), `${awalYear}-${String(month || 12).padStart(2, '0')}-26`);
    assert.equal(f.akhirCutoff(), `${year}-${String(month + 1).padStart(2, '0')}-25`);
  }
});

test('Date-only and timestamp display does not shift days in different timezones', () => {
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  for (const TZ of ['UTC', 'Asia/Jakarta', 'America/Los_Angeles']) {
    const result = spawnSync(process.execPath, ['-e', `${code}\nif(exports.formatTanggal('2026-01-09T00:00:00Z') !== '09/01/2026') process.exit(1);`], { env: { ...process.env, TZ } });
    assert.equal(result.status, 0, TZ);
  }
});

test('Date input displays numeric text but emits ISO; invalid/range/empty values are handled without requests', async () => {
  const sfc = fs.readFileSync(path.join(root, 'components/fields/DateInput.vue'), 'utf8');
  const script = sfc.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const props = vue.reactive({ modelValue: '2026-01-09', min: '2026-01-01', max: '2026-12-31' });
  const events = [], validity = [];
  const state = compile(script + '\nexport { text, input, commit, pick };', name => name === 'vue' ? vue : format, {
    defineOptions() {}, defineProps: () => props, defineEmits: () => (...args) => events.push(args),
  });
  state.input.value = { setCustomValidity: value => validity.push(value), reportValidity() {} };
  assert.equal(state.text.value, '09/01/2026');
  state.text.value = '13/10/2026';
  state.commit({ type: 'change' });
  assert.equal(events[0][1], '2026-10-13');
  assert.equal(events[1][0], 'change');
  events.length = 0;
  state.text.value = '31/02/2026';
  state.commit({ type: 'change' });
  assert.equal(events[0][1], '');
  assert.equal(events.length, 1);
  assert.ok(validity.at(-1));
  state.text.value = '01/01/2027';
  state.commit({ type: 'change' });
  assert.equal(events.at(-1)[1], '');
  state.pick({ target: { value: '2026-05-02' } });
  assert.equal(state.text.value, '02/05/2026');
  assert.equal(events.at(-2)[1], '2026-05-02');
  props.modelValue = null;
  await vue.nextTick();
  assert.equal(state.text.value, '');
});

test('Shared date input renders the same outline SVG icon with accessible disabled state', async () => {
  const source = fs.readFileSync(path.join(root, 'components/fields/DateInput.vue'), 'utf8');
  const { descriptor } = parse(source, { filename: 'DateInput.vue' });
  const script = compileScript(descriptor, { id: 'date-icon-test', inlineTemplate: true });
  const component = compile(script.content, name => name === 'vue' ? vue : format).default;
  for (const disabled of [false, true]) {
    const html = await renderToString(vue.createSSRApp(component, { modelValue: '2026-10-13', disabled }));
    assert.match(html, /value="13\/10\/2026"/);
    assert.match(html, /aria-label="Pilih tanggal"/);
    assert.match(html, /<svg[^>]*class="calendar-icon"[^>]*stroke="currentColor"/);
    assert.match(html, /<svg[^>]*width="14" height="14"[^>]*stroke-width="1"/);
    assert.match(html, /aria-hidden="true" focusable="false"/);
    assert.equal(/class="calendar-button" disabled/.test(html), disabled);
    assert.doesNotMatch(html, /▦/);
  }
  assert.match(source, /\.calendar-button[^}]*align-items: center[^}]*justify-content: center/);
  assert.match(source, /\.calendar-button:focus-visible/);
  assert.match(source, /\.calendar-icon[^}]*width: 14px; height: 14px/);
});

test('Typed date filter labels/search are numeric while emitted keys keep raw ISO and NULL/empty distinct', () => {
  const filters = compile(fs.readFileSync(path.join(root, 'utils/columnFilter.ts'), 'utf8'));
  const script = fs.readFileSync(path.join(root, 'components/ColumnFilterPopup.vue'), 'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const props = { columnType: 'date', colKey: 'Tanggal', colLabel: 'Tanggal', values: ['2026-01-09', null, ''], selected: undefined };
  const state = compile(script + '\nexport { displayLabel, searchText, filteredValues, allValues };', name => {
    if (name === 'vue') return { ...vue, onMounted() {}, onUnmounted() {}, onDeactivated() {} };
    if (name === '@/utils/format') return format;
    if (name === '@/utils/columnFilter') return filters;
    return {};
  }, { defineProps: () => props, defineEmits: () => () => {}, window: {}, document: {} });
  const key = filters.filterKey('2026-01-09');
  state.allValues.value = props.values.map(filters.filterKey);
  assert.equal(state.displayLabel(key), '09/01/2026');
  assert.equal(JSON.parse(key), '2026-01-09');
  assert.notEqual(filters.filterKey(null), filters.filterKey(''));
  state.searchText.value = '09/01';
  assert.equal(state.filteredValues.value.length, 1);
  assert.equal(state.filteredValues.value[0], key);
});

test('Generic and Rekap Hutang Excel downloads format dates without changing identifier strings', async () => {
  const backend = path.join(__dirname, '../../backend');
  const ExcelJS = require(path.join(backend, 'node_modules/exceljs'));
  const { sendExcel } = await import(pathToFileURL(path.join(backend, 'src/helpers/excel.js')).href);
  const { sendRekapHutangExcel } = await import(pathToFileURL(path.join(backend, 'src/helpers/rekapHutangExcel.js')).href);
  let buffer;
  const res = { setHeader() {}, status() { return this; }, send(value) { buffer = value; }, end(value) { buffer = value; } };
  await sendExcel(res, 'Synthetic', ['Tanggal', 'Dibuat', 'Nomor', 'Nik'], [{ Tanggal: '2026-01-09', Dibuat: '2026-01-09 08:05:00', Nomor: '054/HRD/01/26', Nik: '000001' }]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  assert.equal(wb.worksheets[0].getCell('A2').value, '09/01/2026');
  assert.equal(wb.worksheets[0].getCell('B2').value, '09/01/2026 08:05:00');
  assert.equal(wb.worksheets[0].getCell('C2').value, '054/HRD/01/26');
  assert.equal(wb.worksheets[0].getCell('D2').value, '000001');
  await sendRekapHutangExcel(res, [{ Nomor: 'TEST', Tanggal: '2026-01-09', Nik: '000001', Pinjam: 0, Bayar: 0, SisaBayar: 0 }], {}, {});
  await wb.xlsx.load(buffer);
  assert.equal(wb.worksheets[0].getCell('C2').value, '09/01/2026');
});
