const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('Import Absensi defaults both date fields to the same current day', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/views/absensi/ImportAbsensiView.vue'), 'utf8');
  const initialization = source.match(/const hariIni = todaySql\(\);\s*const periode = reactive\([^;]+\);/);
  assert.ok(initialization);
  for (const date of ['2026-10-13', '2026-11-01', '2027-01-01']) {
    let calls = 0;
    const scope = { todaySql: () => { calls++; return date; }, reactive: value => value };
    vm.runInNewContext(initialization[0] + '\nglobalThis.result = periode;', scope);
    assert.equal(scope.result.start, date);
    assert.equal(scope.result.end, date);
    assert.equal(calls, 1);
  }
  assert.doesNotMatch(source, /firstDayOfMonth/);
});
