const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');
const { parse, compileScript } = require('@vue/compiler-sfc');
const { renderToString } = require('@vue/server-renderer');
const root = path.join(__dirname, '../src');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function compile(source, requireModule, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require: requireModule, ...globals });
  return module.exports;
}
const view = read('views/laporan/AkhirTahunView.vue');
const script = view.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
const state = compile(script + '\nexport { columns, metrics, tahun, years };', name => name === 'vue' ? vue : {});

test('Annual view has 87 columns with 6 categories per month, numeric counts, matching totals, and no Cuti aliases/labels', async () => {
  assert.equal(state.columns.length, 87);
  const { AKHIR_TAHUN_COLUMNS } = await import('../../backend/src/helpers/akhirTahun.js');
  assert.deepEqual(JSON.parse(JSON.stringify(state.columns.map(({ key, label }) => ({ key, label })))), AKHIR_TAHUN_COLUMNS.map(({ key, label }) => ({ key, label })));
  assert.equal(state.columns.filter(column => column.type === 'number').length, 78);
  assert.ok(state.columns.filter(column => column.type === 'number').every(column => column.align === 'right'));
  assert.doesNotMatch(view, /cuti/i);
  assert.match(view, /primary-key="Nik"/);
  assert.match(view, /:show-actions="false"/);
  assert.match(view, /:can-delete="false"/);
  assert.doesNotMatch(view, /has-period|add-form-path|edit-form-path/);
});

test('Actual annual SFC renders year choice and forwards read-only browse/export scope; changing year resets pagination via keyed browse', async () => {
  let props;
  const Browse = vue.defineComponent({
    props: ['moduleTitle', 'columns', 'endpoint', 'primaryKey', 'extraQuery', 'showActions', 'canDelete', 'exportName'],
    setup(p, { slots }) {
      props = p;
      return () => vue.h('section', [vue.h('h1', p.moduleTitle), slots['toolbar-before-search']?.(),
        vue.h('table', [vue.h('thead', [vue.h('tr', p.columns.map(column => vue.h('th', column.label)))])])]);
    },
  });
  const { descriptor } = parse(view, { filename: 'AkhirTahunView.vue' });
  const code = compileScript(descriptor, { id: 'annual-test', inlineTemplate: true }).content;
  const Component = compile(code, name => name === 'vue' ? vue : { default: Browse }).default;
  let yearProps;
  const app = vue.createSSRApp(Component);
  app.component('v-select', vue.defineComponent({
    props: ['modelValue', 'items', 'menuIcon', 'menuProps', 'variant', 'density'],
    setup(p, { attrs }) {
      yearProps = p;
      return () => vue.h('div', attrs, String(p.modelValue));
    },
  }));
  const html = await renderToString(app);
  assert.match(html, /Tahun laporan/);
  assert.equal(yearProps.modelValue, new Date().getFullYear());
  assert.equal(yearProps.items[0], new Date().getFullYear() + 1);
  assert.equal(yearProps.menuIcon, 'mdi-chevron-down');
  assert.equal(yearProps.menuProps.contentClass, 'annual-year-menu');
  assert.equal(yearProps.menuProps.maxHeight, 280);
  assert.equal(yearProps.variant, 'outlined');
  assert.match(html, /Lain Lain 1<\/th>/);
  assert.match(html, /Lain Lain 12<\/th>/);
  assert.match(html, /Total Lain Lain<\/th>/);
  assert.equal(props.endpoint, '/laporan/akhir-tahun');
  assert.equal(props.extraQuery.tahun, new Date().getFullYear());
  assert.equal(props.showActions, false);
  assert.equal(props.canDelete, false);
  assert.match(view, /:key="tahun"/);
  assert.match(view, /v-model="tahun"/);
  assert.match(view, /:extra-query="\{ tahun \}"/);
});

test('Year picker uses a rounded themed control and custom compact dropdown instead of a native select', () => {
  assert.doesNotMatch(view, /<select\b|<option\b/);
  assert.match(view, /for="annual-report-year"/);
  assert.match(view, /id="annual-report-year"/);
  assert.match(view, /\.annual-year-select :deep\(\.v-field\)\s*\{[^}]*border-radius: 10px/);
  assert.match(view, /:global\(\.annual-year-menu \.v-list\)\s*\{[^}]*border-radius: 12px/);
});

test('Annual menu and route activate only the existing frmLapAkhirTahun permission', () => {
  assert.match(read('utils/menuMap.ts'), /frmLapAkhirTahun:[^\n]*path: "\/laporan\/akhir-tahun"[^\n]*ready: true/);
  assert.match(read('router/index.ts'), /path: "\/laporan\/akhir-tahun"[^\n]*AkhirTahunView.vue[^\n]*requiresAuth: true[^\n]*form: "frmLapAkhirTahun"/);
  assert.equal(state.tahun.value, new Date().getFullYear());
  assert.equal(state.years[0], new Date().getFullYear() + 1);
  assert.equal(state.years.at(-1), 1900);
});

test('Annual compact table keeps the neutral two-direction sort indicator visible', () => {
  assert.match(view, /class="annual-report"/);
  assert.match(view, /\.annual-report :deep\(th:not\(\.sorted\) \.th-sort\)\s*\{\s*display: inline-flex;/);
  const browse = read('components/BaseBrowse.vue');
  assert.match(browse, /if \(sortBy.value !== col.key \|\| !sortDir.value\) return "unfold_more"/);
});

test('Annual column widths follow unwrapped header and cell content instead of fixed widths', () => {
  assert.ok(state.columns.every(column => column.width === undefined));
  assert.match(view, /\.annual-report :deep\(\.browse-table\)\s*\{[^}]*width: max-content;[^}]*min-width: 100% !important;[^}]*table-layout: auto;/);
  assert.match(view, /\.annual-report :deep\(col\)\s*\{\s*width: auto !important;/);
  assert.match(view, /:deep\(\.browse-table td\)\s*\{\s*white-space: nowrap; overflow-wrap: normal;/);
});
