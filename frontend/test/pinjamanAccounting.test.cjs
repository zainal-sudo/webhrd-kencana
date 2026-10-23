const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('./helpers/frontendVm.cjs');
const ts = require('typescript');
const vue = require('vue');
const { parse, compileScript } = require('@vue/compiler-sfc');
const { renderToString } = require('@vue/server-renderer');
const read = file => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
function evaluate(source, require) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require });
  return module.exports;
}
test('Browse money cells separate Rp and amount, retain zero/negatives and omit Rp for missing values', async () => {
  const values = [500000, 0, -250000, '1234567890.25', null, '', '—'];
  const utility = evaluate(read('utils/pinjaman.ts'), () => ({}));
  const empty = { render: () => null };
  const browse = {
    setup(props, { slots }) {
      return () => vue.h('table', values.map(value => vue.h('tr',
        ['Pinjam', 'Bayar', 'SisaBayar'].map(key => vue.h('td', slots.cell({ row: { [key]: value }, column: { key } }))))));
    },
  };
  const dependencies = {
    vue, 'vue-toastification': { useToast: () => ({}) },
    '@/stores/authStore': { useAuthStore: () => ({ can: () => true }) },
    '@/utils/pinjaman': utility,
    '@/utils/pinjamanRefresh': { pinjamanRevision: vue.ref(0) },
    '@/components/BaseBrowse.vue': { default: browse },
  };
  const { descriptor } = parse(read('views/transaksi/PinjamanView.vue'));
  const component = evaluate(compileScript(descriptor, { id: 'accounting-test', inlineTemplate: true }).content,
    name => dependencies[name] || { default: empty }).default;
  const html = await renderToString(vue.createSSRApp(component));
  const rows = [...html.matchAll(/<tr>(.*?)<\/tr>/g)].map(match => match[1]);
  assert.equal(rows.length, values.length);
  for (let i = 0; i < values.length; i++) {
    const cells = [...rows[i].matchAll(/<td>(.*?)<\/td>/g)].map(match => match[1]);
    assert.equal(cells.length, 3);
    for (const cell of cells) {
      if (i < 4) {
        assert.match(cell, /class="loan-money-cell"/);
        assert.ok(cell.includes(`<span>Rp</span><span>${utility.rupiah(values[i]).slice(2)}</span>`));
      } else {
        assert.ok(!cell.includes('Rp'));
        assert.ok(cell.includes('—'));
      }
    }
  }
});
