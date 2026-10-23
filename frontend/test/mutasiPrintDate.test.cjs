const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('./helpers/frontendVm.cjs');
const ts = require('typescript');
const root = path.join(__dirname, '../src');
const source = fs.readFileSync(path.join(root, 'views/transaksi/MutasiView.vue'), 'utf8');
function compile(source, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, ...globals });
  return module.exports;
}
const { formatTanggal } = compile(fs.readFileSync(path.join(root, 'utils/format.ts'), 'utf8'));
const declaration = source.slice(source.indexOf('function fmtSurat('), source.indexOf('/** Huruf besar'));
const { fmtSurat } = compile(declaration + '\nexport { fmtSurat };', { formatTanggal });

test('Mutasi surat uses Indonesian month names, without changing numeric browse dates', () => {
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  for (let month = 1; month <= 12; month++) {
    const input = `2026-${String(month).padStart(2, '0')}-12`;
    assert.equal(fmtSurat(input), `12 ${months[month - 1]} 2026`);
  }
  assert.equal(fmtSurat('2026-10-01'), '1 Oktober 2026');
  assert.equal(fmtSurat('2026-10-12T23:00:00Z'), '12 Oktober 2026');
  assert.equal(fmtSurat(null), '');
  assert.equal(fmtSurat('invalid'), '');
  assert.equal(formatTanggal('2026-10-12'), '12/10/2026');
});

test('Mutasi print HTML and preview use the same written date for Efektif Mulai and Boyolali', () => {
  let html;
  const printSource = source.slice(source.indexOf('function printSurat()'), source.indexOf('</script>'));
  const { printSurat } = compile(printSource + '\nexport { printSurat };', {
    surat: { value: { mut_nomor: 'SK.001', mut_tanggal: '2026-10-12' } }, fmtSurat,
    logoAbsolut: () => '/img/kp.jpg',
    window: { open: () => ({ document: { write: value => { html = value; }, close() {} } }) },
  });
  printSurat();
  assert.match(html, /Efektif Mulai<\/td><td>:<\/td><td>12 Oktober 2026<\/td>/);
  assert.match(html, /Boyolali, 12 Oktober 2026/);
  assert.doesNotMatch(html, /12\/10\/2026/);
  assert.match(source, /Efektif Mulai<\/td><td>:<\/td><td>\{\{ fmtSurat\(surat.mut_tanggal\) \}\}/);
  assert.match(source, /Boyolali, \{\{ fmtSurat\(surat.mut_tanggal\) \}\}/);
});
