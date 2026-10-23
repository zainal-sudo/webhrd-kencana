const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('./helpers/frontendVm.cjs');
const ts = require('typescript');

const root = path.join(__dirname, '../src');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function compile(source, dependencies = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, require: name => dependencies[name] || {} });
  return module.exports;
}

test('Rekap Absensi enables every data-column filter and formats all numeric columns to one decimal', () => {
  const source = read('views/laporan/AbsensiRekapView.vue');
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const state = compile(script + '\nexport { base, rinci, columns };', {
    vue: { ref: value => ({ value }) },
    '@/utils/format': { firstDayOfMonth: () => '2026-10-01' },
  });
  assert.equal(state.base.length, 21);
  assert.equal(state.rinci.length, 7);
  assert.ok(state.columns.every(column => column.filterable !== false), 'semua kolom data filterable');
  assert.ok(state.columns.every(column => column.sortable !== false), 'semua kolom data sortable');

  const numeric = state.base.filter(column => column.type === 'number');
  assert.equal(numeric.length, 14);
  assert.deepEqual(Array.from(numeric, column => column.key), [
    'Total_Hari', '2_Jam_Pertama', 'Lebih dari 2 Jam', 'Panggilan', 'TotalLembur',
    'Bonus_Malam_Libur', 'Bonus_Libur', 'terlambat', 'ST_HARI', 'sakit', 'Ijin',
    'Alpha', 'LainLain', 'Total',
  ]);
  assert.ok(!source.includes('filterable: false'));
  assert.ok(!source.includes('sortable: false'));
});

test('Shared browse and popup display number values with exactly one decimal', () => {
  const browse = read('components/BaseBrowse.vue');
  const popup = read('components/ColumnFilterPopup.vue');
  assert.match(browse, /if \(col\.type === "number"\) \{\s*const number = Number\(v\);\s*return Number\.isFinite\(number\) \? number\.toFixed\(1\) : String\(v\);\s*\}/);
  assert.equal((browse.match(/if \(col\.type === "number"\)/g) || []).length, 1);
  assert.match(popup, /if \(props\.columnType === "number"\) \{\s*const number = Number\(value\);\s*if \(Number\.isFinite\(number\)\) return number\.toFixed\(1\);\s*\}/);
});
