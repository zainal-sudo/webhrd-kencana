const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');
const { parse, compileScript } = require('@vue/compiler-sfc');
const root = path.join(__dirname, '../src');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function evaluate(source, requireModule, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: requireModule, ...globals });
  return module.exports;
}
const { reportRowKey } = evaluate(read('utils/reportRowKey.ts'), require);
const filters = evaluate(read('utils/columnFilter.ts'), require);
const reports = [
  ['TidakMasukView', 'Nik', 'Jenis_Ijin', 'Sakit', 'Ijin'],
  ['KeterlambatanView', 'Nik', 'Alasan', 'Terlambat A', 'Terlambat B'],
  ['PulangDuluView', 'Nik', 'Jenis_Ijin', 'Pulang', 'Ijin'],
  ['TidakKeluarView', 'Nik', 'Jenis_Ijin', null, 'Terlambat'],
  ['LemburTanpaSplView', 'Nik', 'Scan2', '17:00:00', '18:00:00'],
  ['TanpaIjinView', 'Nik', 'Waktu', 3, 4],
  ['SetengahHariTanpaIjinView', 'Nik', 'Scan1', '08:00:00', '09:00:00'],
  ['DetailLemburView', 'Nik', 'Jenis_Kerja', 'Produksi', 'Packing'],
  ['LaporanLemburView', 'Nomor', 'Jadwal', '17:00:00', '18:00:00'],
];

// Render the REAL BaseBrowse into a small in-memory host. This exercises Vue
// keyed DOM reconciliation (not just SSR) without browser/DB dependencies.
function node(type, text = '') { return { type, text, children: [], parent: null, props: {} }; }
const host = {
  createElement: type => node(type), createText: text => node('#text', text), createComment: text => node('#comment', text),
  setText(n, text) { n.text = text; }, setComment(n, text) { n.text = text; },
  setElementText(n, text) { n.children.forEach(child => { child.parent = null; }); n.children = []; n.text = text; },
  patchProp(n, key, _previous, value) { n.props[key] = value; },
  insert(n, parent, anchor = null) {
    if (n.parent) host.remove(n);
    n.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    if (index < 0) parent.children.push(n); else parent.children.splice(index, 0, n);
  },
  remove(n) { if (!n.parent) return; const i = n.parent.children.indexOf(n); if (i >= 0) n.parent.children.splice(i, 1); n.parent = null; },
  parentNode: n => n.parent,
  nextSibling(n) { return n.parent?.children[n.parent.children.indexOf(n) + 1] ?? null; },
};
const text = n => n.type === '#comment' ? '' : n.text + n.children.map(text).join('');
function find(n, type) { if (n.type === type) return n; for (const child of n.children) { const match = find(child, type); if (match) return match; } }
const settle = async () => { await vue.nextTick(); await new Promise(resolve => setImmediate(resolve)); await vue.nextTick(); };
function fixture(primaryKey) {
  const requests = [], timers = new Map(), warnings = [];
  let state, timer = 0;
  let source = read('components/BaseBrowse.vue');
  source = source.replace('</script>', '\ncapture({ rows, renderRowKeys, search, onSearch, page, lastPage, goToPage, toggleSort, cols });\n</script>');
  const { descriptor } = parse(source, { filename: 'BaseBrowse.vue' });
  const script = compileScript(descriptor, { id: 'report-key-test', inlineTemplate: true });
  const empty = { render: () => null };
  const component = evaluate(script.content, name => {
    // Native v-model event wiring belongs to runtime-dom; input changes below
    // call the real onSearch handler, while keyed table updates use real Vue.
    if (name === 'vue') return { ...vue, vModelText: {} };
    if (name === 'vue-router') return { useRouter: () => ({ push() {} }) };
    if (name === 'vue-toastification') return { useToast: () => ({ error() {} }) };
    if (name === '@/stores/tabsStore') return { useTabsStore: () => ({}) };
    if (name === '@/api/axios') return { getErrorMessage: e => e.message, api: { get(url, config) {
      return new Promise(resolve => requests.push({ url, params: config.params, resolve }));
    } } };
    if (name === '@/utils/format') return { todaySql: () => '2026-10-12', formatDateInput: value => value };
    if (name === '@/utils/columnFilter') return filters;
    return { default: empty };
  }, { capture: value => { state = value; }, window: {
    setTimeout(fn) { timers.set(++timer, fn); return timer; }, clearTimeout(id) { timers.delete(id); },
  } }).default;
  const renderer = vue.createRenderer(host);
  const container = node('root');
  const props = { moduleTitle: 'Report', endpoint: '/laporan/test', primaryKey, rowKey: reportRowKey,
    canDelete: false, showActions: false, columns: ['Nomor', 'Nik', 'Tanggal', 'Nama', 'Jenis_Ijin', 'Alasan', 'Jenis_Kerja', 'Jadwal', 'Scan1', 'Scan2', 'Waktu'].map(key => ({ key, label: key })) };
  const app = renderer.createApp(component, props);
  app.config.warnHandler = warning => warnings.push(warning);
  for (const name of ['v-dialog', 'v-card', 'v-card-item', 'v-card-title', 'v-card-text', 'v-card-actions', 'v-spacer', 'v-btn']) app.component(name, empty);
  app.mount(container);
  return { state, requests, warnings,
    flush() { const queued = [...timers.values()]; timers.clear(); queued.forEach(fn => fn()); },
    async answer(rows, page = 1, total = rows.length) {
      requests.at(-1).resolve({ data: { data: rows, pagination: { page, total, per_page: 25, last_page: Math.max(1, Math.ceil(total / 25)) } } });
      await settle();
    },
    tableRows() { return find(container, 'tbody').children.filter(n => n.type === 'tr'); },
    unmount() { app.unmount(); },
  };
}

test('Report signature is stable across property order and preserves identifiers, NULL/blank, detail fields and raw data', () => {
  const row = Object.freeze({ Nik: '000', Tanggal: '2026-10-12', Jenis_Kerja: 'Produksi', Alasan: null });
  const before = JSON.stringify(row);
  assert.equal(reportRowKey(row), reportRowKey({ Alasan: null, Jenis_Kerja: 'Produksi', Tanggal: '2026-10-12', Nik: '000' }));
  assert.notEqual(reportRowKey(row), reportRowKey({ ...row, Alasan: '' }));
  assert.notEqual(reportRowKey(row), reportRowKey({ ...row, Nik: '0' }));
  assert.notEqual(reportRowKey(row), reportRowKey({ ...row, Jenis_Kerja: 'Packing' }));
  assert.equal(JSON.stringify(row), before);
});

for (const [file, primaryKey, detailField, first, second] of reports) {
  test(`${file}: same employee/date or SPL, join variants and identical duplicates survive search/sort/pagination`, async () => {
    const source = read(`views/laporan/${file}.vue`);
    assert.match(source, /:row-key="reportRowKey"/);
    assert.ok(source.includes(`primary-key="${primaryKey}"`));
    const f = fixture(primaryKey);
    const common = { Nomor: 'SPL.2610.001', Nik: '000', Tanggal: '2026-10-12', Nama: 'First' };
    const rows = [
      Object.freeze({ ...common, [detailField]: first }),
      Object.freeze({ ...common, [detailField]: second }),
      Object.freeze({ ...common, [detailField]: second }),
      Object.freeze({ ...common, Tanggal: '2026-10-11', [detailField]: first }),
      Object.freeze({ ...common, Nik: '001', Nama: 'Other Employee', [detailField]: first }),
    ];
    const snapshot = JSON.stringify(rows);
    await f.answer(rows, 1, 75);
    assert.equal(f.tableRows().length, rows.length);
    const keys = [...f.state.renderRowKeys.value];
    assert.equal(new Set(keys).size, rows.length);
    f.state.search.value = 'Second'; f.state.onSearch();
    await settle();
    assert.equal(f.tableRows().length, 1); // Loading only, no old data rows.
    f.flush();
    assert.equal(f.requests.at(-1).params.search, 'Second');
    const replacement = [Object.freeze({ ...common, Nama: 'Second', [detailField]: first }), Object.freeze({ ...common, Nama: 'Second', [detailField]: second })];
    await f.answer(replacement, 1, 75);
    assert.equal(f.tableRows().length, 2);
    assert.ok(f.tableRows().every(n => text(n).includes('Second') && !text(n).includes('First')));
    const beforeSort = [...f.state.renderRowKeys.value];
    f.state.toggleSort(f.state.cols.value.find(col => col.key === 'Tanggal'));
    assert.equal(f.requests.at(-1).params.sort_by, 'Tanggal');
    await f.answer([...replacement].reverse(), 1, 75);
    assert.equal(f.tableRows().length, 2);
    assert.deepEqual([...f.state.renderRowKeys.value], beforeSort.reverse());
    f.state.goToPage(2);
    assert.equal(f.requests.at(-1).params.page, 2);
    assert.equal(f.requests.at(-1).params.search, 'Second');
    await f.answer([{ ...common, Tanggal: '2026-10-11', Nama: 'Second Page' }], 2, 75);
    assert.equal(f.tableRows().length, 1);
    assert.ok(text(f.tableRows()[0]).includes('Second Page'));
    f.state.search.value = ''; f.state.onSearch(); f.flush();
    assert.equal(f.requests.at(-1).params.search, undefined);
    assert.equal(f.requests.at(-1).params.page, 1);
    await f.answer(rows);
    assert.deepEqual([...f.state.renderRowKeys.value], keys);
    assert.equal(f.tableRows().length, rows.length);
    assert.equal(JSON.stringify(rows), snapshot);
    assert.equal(f.warnings.filter(warning => /duplicate keys/i.test(warning)).length, 0);
    f.unmount();
  });
}
