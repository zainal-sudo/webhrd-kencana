const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('./helpers/frontendVm.cjs');
const ts = require('typescript');
const vue = require('vue');
const { parse, compileScript } = require('@vue/compiler-sfc');
const { renderToString } = require('@vue/server-renderer');
const root = path.join(__dirname, '../src');
function compile(source, dependencies, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require: name => dependencies[name] || require(name), ...globals });
  return module.exports;
}
const money = compile(fs.readFileSync(path.join(root, 'utils/pinjaman.ts'), 'utf8'), {});
async function render(settings = {}) {
  let state, browseProps;
  const Browse = vue.defineComponent({ props: ['moduleTitle', 'endpoint', 'primaryKey', 'columns', 'showActions', 'canDelete'],
    setup(props, { slots }) {
      browseProps = props;
      return () => vue.h('div', [slots['scroll-header']?.(), slots['toolbar-extra']?.(), slots.cell?.({ row: { SisaBayar: 300000 }, column: { key: 'SisaBayar' }, text: '300000' })]);
    } });
  let source = fs.readFileSync(path.join(root, 'views/transaksi/RekapHutangView.vue'), 'utf8');
  source = source.replace('</script>', '\ncapture({ balance, filtered, failed, loaded, clearSummary, loadError });\n</script>');
  const { descriptor } = parse(source);
  const component = compile(compileScript(descriptor, { id: 'rekap', inlineTemplate: true }).content,
    { vue, '@/components/BaseBrowse.vue': { default: Browse }, '@/utils/pinjaman': money },
    { capture(value) {
      state = value;
      if (settings.loaded) value.loaded({ saldo_saat_ini: { jumlah: 3, pinjam: 1100000, bayar: 300000, sisa: 800000,
        plafon: 30000000, sisa_plafon: 29200000, saldo_tidak_diketahui: 2 }, hasil_filter: { jumlah: 1, pinjam: 400000, bayar: 100000, sisa: 300000 } });
      if (settings.failed) value.loadError();
    } }).default;
  const html = await renderToString(vue.createSSRApp(component));
  return { html, state, browseProps };
}
test('Read-only report renders global and filtered current totals distinctly, without write controls', async () => {
  const { html, browseProps } = await render({ loaded: true });
  assert.ok(html.includes('Saldo saat ini — seluruh pinjaman aktif'));
  assert.ok(html.includes('800.000')); assert.ok(html.includes('29.200.000'));
  assert.ok(html.includes('Total hasil filter (seluruh halaman): 1 pinjaman'));
  assert.ok(html.includes('300.000')); assert.ok(html.includes('2 dokumen memiliki saldo tidak diketahui'));
  assert.equal(browseProps.endpoint, '/transaksi/pinjaman/rekap-hutang');
  assert.equal(browseProps.showActions, false); assert.equal(browseProps.canDelete, false);
  assert.equal(browseProps.primaryKey, 'Nomor'); assert.equal(browseProps.columns[0].key, 'Nomor');
  assert.equal(browseProps.columns.length, 9);
  assert.ok(!html.includes('<button'));
});
test('Failed/loading report clears stale summaries instead of presenting unknown as zero', async () => {
  const { html, state } = await render({ loaded: true, failed: true });
  assert.ok(html.includes('Saldo gagal dimuat')); assert.ok(!html.includes('800.000'));
  assert.equal(state.balance.value, null); assert.equal(state.filtered.value, null);
  state.loaded({ saldo_saat_ini: { sisa: 500000 }, hasil_filter: { sisa: 200000 } });
  state.clearSummary(); assert.equal(state.balance.value, null); assert.equal(state.filtered.value, null); assert.equal(state.failed.value, false);
});
test('Report inherits search/export/filter/pagination lifecycle and responsive light/dark tokens', () => {
  const source = fs.readFileSync(path.join(root, 'views/transaksi/RekapHutangView.vue'), 'utf8');
  assert.match(source, /@load-start="clearSummary" @loaded="loaded" @load-error="loadError"/);
  assert.match(source, /export-name="Rekap-Hutang"/);
  assert.match(source, /var\(--ds-surface-raised\)/); assert.match(source, /var\(--ds-text\)/);
  assert.match(source, /max-width: 420px/);
  assert.ok(!source.includes('add-form-path')); assert.ok(!source.includes('edit-form-path'));
});
test('Report summary scrolls away while toolbar, column headers and pagination stay visible', () => {
  const source = fs.readFileSync(path.join(root, 'views/transaksi/RekapHutangView.vue'), 'utf8');
  assert.match(source, /<BaseBrowse class="debt-browse"/);
  assert.match(source, /\.debt-report \{[^}]*height: 100%; min-height: 0;[^}]*overflow: hidden/);
  assert.match(source, /\.debt-browse \{ flex: 1; height: auto; min-height: 0;/);
  assert.match(source, /compact scrollable-header/);
  assert.match(source, /<template #scroll-header>[\s\S]*class="current-balance"/);
  assert.ok(!source.includes('max-height: 30%'));
  const browse = fs.readFileSync(path.join(root, 'components/BaseBrowse.vue'), 'utf8');
  assert.match(browse, /\.table-wrap \{\s*overflow: auto;\s*flex: 1;\s*min-height: 0;/);
  assert.match(browse, /\.toolbar \{\s*flex-shrink: 0;/);
  assert.match(browse, /\.browse-foot \{\s*flex-shrink: 0;/);
  assert.match(browse, /\.browse-table th \{[^}]*position: sticky;[^}]*top: 0;/);
  assert.match(browse, /scrollableHeader: false/);
  assert.match(browse, /\.scrollable-header \.browse-scroll-region \{[^}]*overflow: auto/);
  assert.match(browse, /\.scrollable-header \.toolbar \{ position: sticky; top: 0; left: 0;/);
  assert.match(browse, /\.scrollable-header \.browse-table th \{ top: var\(--browse-toolbar-height/);
  assert.match(browse, /new ResizeObserver\(measure\)/);
  assert.match(browse, /toolbarObserver\?\.disconnect\(\)/);
});
