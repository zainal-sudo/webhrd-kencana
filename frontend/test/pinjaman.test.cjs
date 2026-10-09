const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');
const root = path.join(__dirname, '../src');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function compile(source, requireModule, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require: requireModule, ...globals });
  return module.exports;
}
const utility = compile(read('utils/pinjaman.ts'), require);
const columnFilter = compile(read('utils/columnFilter.ts'), require);
// Vue nextTick flushes watchers, not all cross-VM Axios promise continuations.
const settle = async () => { await vue.nextTick(); await new Promise(resolve => setImmediate(resolve)); };
function fixture(kind, settings = {}) {
  const mounted = [], activated = [], stops = [], calls = [], events = [];
  let confirm = true, fail = false;
  const vueModule = { ...vue, onMounted: fn => mounted.push(fn), onActivated: fn => activated.push(fn),
    watch: (...args) => { const stop = vue.watch(...args); stops.push(stop); return stop; } };
  const api = {
    async get(url, config) {
      calls.push({ method: 'get', url, config });
      if (fail) throw Error('load failed');
      if (settings.failPreview && url.endsWith('/nomor')) throw Error('preview initialization failed');
      if (url.endsWith('/ringkasan') && settings.summaryResponse) return await settings.summaryResponse;
      if (url.endsWith('/options')) return { data: { data: { nominal: [200000, 300000, 400000, 500000], angsuran: [1, 2], bank: ['BSI', 'CIMB'] } } };
      if (url.endsWith('/nomor')) return { data: { data: { nomor: config.params.tanggal.startsWith('2026-11') ? 'PJ.2611.0001' : 'PJ.2610.0001' } } };
      if (url.endsWith('/karyawan-info')) return { data: { data: { Nik: '001', Nama: 'Nama', Pabrik: 'P01', Bagian: 'HRD', pinjaman_aktif: [] } } };
      if (url.endsWith('/ringkasan')) return { data: { data: { plafon: 30000000, outstanding: 400000, sisa_plafon: 29600000 } } };
      if (url.endsWith('/detail')) return { data: { data: settings.doc || { Nomor: 'PJ.2002.0022', Tanggal: '2020-03-21', Nik: '001', Pinjam: 600000, Bayar: 450000, SisaBayar: 150000, Status: 'Belum Lunas', Cicilan: 10, Bank: null, Norek: null, revision: 'revision-1' } } };
      return { data: { data: [], pagination: { page: 1, per_page: 50, total: 0, last_page: 1 } } };
    },
    async post(url, body) { calls.push({ method: 'post', url, body }); return { data: { data: { nomor: 'PJ.2610.0002', ...settings.savedDoc } } }; },
    async put(url, body) { calls.push({ method: 'put', url, body }); return { data: { data: { nomor: settings.id } } }; },
    async delete(url, config) { calls.push({ method: 'delete', url, config }); return { data: { data: {} } }; },
  };
  const resetModule = compile(read('composables/useTransactionReset.ts'), () => vueModule, { window: { confirm: () => confirm } });
  const lookupModule = compile(read('composables/useKaryawanLookup.ts'), name => name === 'vue' ? vueModule : { api });
  const files = { form: 'views/transaksi/PinjamanForm.vue', view: 'views/transaksi/PinjamanView.vue', browse: 'components/BaseBrowse.vue' };
  const extras = {
    form: 'values, info, original, potongan, isEdit, resetState, selectEmployee, simpan, saved, ready, previewNomor, cariOpen, keyword, lookup',
    view: 'columns, summary, summaryError, summaryLoading, refreshSummary, browseFailed, display, openDetail, detail, closeDetail, detailOpen, requestDelete, confirmPermanentDelete, deleteTarget, deleteVerification, deleteOpen, browse',
    browse: 'fetchData, refresh, props, tableMinWidth, filterSets, buildParams, fetchDistinct, toggleExpand, expandedKeys, columnCount, page, lastPage, goToPage, cols, toggleSort, applyFilterSet',
  };
  const source = read(files[kind]).match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const result = compile(source + `\nexport { ${extras[kind]} };`, name => {
    if (name === 'vue') return vueModule;
    if (name === 'vue-router') return { useRouter: () => ({}), useRoute: () => ({ query: settings.id ? { id: settings.id } : {} }) };
    if (name === 'vue-toastification') return { useToast: () => ({ error() {}, success() {} }) };
    if (name === '@/api/axios') return { api, getErrorMessage: () => 'error' };
    if (name === '@/stores/authStore') return { useAuthStore: () => ({ can: (_form, action) => settings.denied !== action }) };
    if (name === '@/stores/tabsStore') return { useTabsStore: () => ({}) };
    if (name === '@/utils/format') return { todaySql: () => '2026-10-09', formatDateInput: value => value };
    if (name === '@/utils/pinjaman') return utility;
    if (name === '@/utils/columnFilter') return columnFilter;
    if (name === '@/composables/useTransactionReset') return resetModule;
    if (name === '@/composables/useKaryawanLookup') return lookupModule;
    return {};
  }, {
    defineProps: () => ({ endpoint: '/transaksi/pinjaman', moduleTitle: 'Pinjaman', primaryKey: 'Nomor', ...settings.props }),
    withDefaults: (props, defaults) => ({ ...Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, typeof value === 'function' ? value() : value])), ...props }),
    defineEmits: () => (...args) => { events.push(args); settings.onEvent?.(...args); },
    defineExpose() {}, window: { confirm: () => confirm },
  });
  return { ...result, calls, events, async mount() { for (const fn of mounted) await fn(); },
    async activate() { for (const fn of activated) await fn(); }, cancel() { confirm = false; }, fail() { fail = true; }, recover() { fail = false; },
    dispose() { stops.forEach(stop => stop()); } };
}

test('Compact Pinjaman keeps all columns, reduces width, and leaves other browse defaults unchanged', () => {
  const view = fixture('view');
  const compact = fixture('browse', { props: { compact: true, columns: view.columns } });
  const oldWidths = [145, 125, 120, 200, 150, 150, 80, 150, 260, 80, 170, 150, 120];
  const normal = fixture('browse', { props: { columns: oldWidths.map((width, i) => ({ key: String(i), width: `${width}px` })) } });
  try {
    assert.equal(view.columns.length, 10);
    assert.ok(parseInt(compact.tableMinWidth.value) < 1500);
    assert.equal(normal.props.compact, false);
    assert.equal(normal.tableMinWidth.value, '2334px');
    assert.ok(parseInt(compact.tableMinWidth.value) < parseInt(normal.tableMinWidth.value) * 0.65);
    assert.match(read('views/transaksi/PinjamanView.vue'), /refresh-on-activate compact/);
    const browseSource = read('components/BaseBrowse.vue');
    assert.match(browseSource, /\.compact \.browse-table \{ table-layout: auto;/);
    assert.match(browseSource, /\.compact \.browse-table th \{[^}]*white-space: nowrap/);
    assert.match(browseSource, /\.compact \.row-actions \{[^}]*flex-wrap: nowrap/);
  } finally { view.dispose(); compact.dispose(); normal.dispose(); }
});
test('Browse headers map payment and outstanding without changing semantics', () => {
  const f = fixture('view');
  try {
    assert.deepEqual(Array.from(f.columns, col => col.label), ['NIK', 'NAMA KARYAWAN', 'UNIT', 'BAGIAN', 'BANK', 'NO REK', 'PINJAMAN UANG KOPERASI', 'ANGSURAN', 'POTONGAN', 'SALDO POTONGAN']);
    assert.equal(f.columns.find(col => col.label === 'POTONGAN').key, 'Bayar');
    assert.equal(f.columns.find(col => col.label === 'SALDO POTONGAN').key, 'SisaBayar');
    assert.equal(f.columns.find(col => col.label === 'UNIT').key, 'Pabrik');
    assert.ok(!f.columns.some(col => col.key === 'Periode' || col.key === 'Nomor'));
  } finally { f.dispose(); }
});
test('Expand/collapse uses document keys, refresh/sort/filter/pagination clear expansion without extra detail requests', async () => {
  const f = fixture('browse', { props: { expandable: true, columns: [{ key: 'Nik', label: 'NIK' }] } });
  const row = { Nomor: 'PJ.2610.0001' };
  try {
    await f.mount();
    assert.equal(f.columnCount.value, 4);
    f.toggleExpand(row);
    assert.equal(f.expandedKeys.value.has(row.Nomor), true);
    f.toggleExpand(row);
    assert.equal(f.expandedKeys.value.size, 0);
    const calls = f.calls.length;
    for (const action of [() => f.refresh(), () => f.toggleSort(f.cols.value[0]), () => f.applyFilterSet(f.cols.value[0], ['001']), () => { f.lastPage.value = 2; f.goToPage(2); }]) {
      f.toggleExpand(row); action(); await settle();
      assert.equal(f.expandedKeys.value.size, 0);
    }
    assert.ok(f.calls.length > calls);
    assert.ok(!f.calls.some(call => call.url.endsWith('/detail')));
    await f.activate(); f.toggleExpand(row); await f.activate(); await settle();
    assert.equal(f.expandedKeys.value.size, 0);
  } finally { f.dispose(); }
});
test('Edit grid uses stored rows until schedule inputs change, Reset restores stored rows', async () => {
  const doc = { Nomor: 'PJ.2610.0001', Tanggal: '2026-10-09', Nik: '001', Pinjam: 400000, Bayar: 0,
    Cicilan: 2, Bank: 'BSI', Norek: '001234', revision: 'r',
    periode_potong1: 'Mei 2027', nilai_potong1: 123000, periode_potong2: 'Juni 2027', nilai_potong2: 277000,
    Potongan: [{ periode: 'Mei 2027', nominal: 123000 }, { periode: 'Juni 2027', nominal: 277000 }] };
  const f = fixture('form', { id: doc.Nomor, doc });
  try {
    await f.mount();
    assert.deepEqual(JSON.parse(JSON.stringify(f.potongan.value)), doc.Potongan);
    f.values.bank = 'CIMB';
    assert.equal(f.potongan.value[0].nominal, 123000);
    f.values.tanggal = '2026-12-25';
    assert.equal(f.potongan.value[0].periode, 'Januari 2027');
    assert.equal(f.potongan.value[1].nominal, 200000);
    f.values.angsuran = 1;
    assert.equal(f.potongan.value.length, 1);
    assert.equal(f.potongan.value[0].nominal, 400000);
    f.resetState.reset(); await settle();
    assert.equal(f.potongan.value[0].periode, 'Mei 2027');
    assert.equal(f.potongan.value[1].nominal, 277000);
  } finally { f.dispose(); }
});
test('After Save grid reflects authoritative backend fields, request sends no schedule fields', async () => {
  const f = fixture('form', { savedDoc: { periode_potong1: 'Mei 2027', nilai_potong1: 400000,
    periode_potong2: null, nilai_potong2: null } });
  try {
    await f.mount();
    Object.assign(f.values, { nik: '001', pinjam: 400000, angsuran: 1, bank: 'BSI', norek: '001234' });
    await f.simpan();
    assert.equal(f.potongan.value.length, 1);
    assert.equal(f.potongan.value[0].periode, 'Mei 2027');
    const post = f.calls.find(c => c.method === 'post');
    assert.ok(!('periode_potong1' in post.body));
    assert.ok(!('nilai_potong1' in post.body));
  } finally { f.dispose(); }
});
test('Calendar previews match backend including day 20/21, year rollover and legacy', async () => {
  const backend = await import('../../backend/src/helpers/pinjaman.js');
  for (const date of ['2026-10-18', '2026-10-20', '2026-10-21', '2026-12-25', '2024-02-29', '2026-02-29', ''])
    for (const count of [0, 1, 2, 6, 10]) assert.equal(utility.periodePinjaman(date, count), backend.periodePinjaman(date, count));
  assert.equal(utility.periodePinjaman('2026-12-25', 2), 'Januari 2027, Februari 2027');
  assert.equal(utility.rupiah(null), '—');
  assert.equal(utility.rupiah(400000), 'Rp400.000');
});
test('Form initial mount makes exactly one preview; date change updates preview', async () => {
  const f = fixture('form');
  try {
    await f.mount();
    assert.equal(f.calls.filter(c => c.url.endsWith('/nomor')).length, 1);
    f.values.tanggal = '2026-11-02';
    await settle();
    assert.equal(f.values.nomor, 'PJ.2611.0001');
  } finally { f.dispose(); }
});
test('Reset restores initial state, confirms, clears lookup, and sends zero requests', async () => {
  const f = fixture('form');
  try {
    await f.mount();
    const initial = JSON.stringify(f.values);
    await f.selectEmployee({ Nik: '001' });
    f.values.tanggal = '2026-11-02'; f.values.pinjam = '400000'; f.values.norek = '001234';
    await settle();
    const before = f.calls.length;
    f.cancel(); assert.equal(f.resetState.reset(), false); assert.equal(f.values.norek, '001234');
    // Fresh fixture for accepted confirmation; cancellation fixture remains dirty.
    const accepted = fixture('form');
    try {
      await accepted.mount(); await accepted.selectEmployee({ Nik: '001' });
      accepted.values.tanggal = '2026-11-02'; accepted.values.norek = '000123'; accepted.cariOpen.value = true;
      await settle();
      const count = accepted.calls.length;
      assert.equal(accepted.resetState.reset(), true);
      await settle();
      assert.equal(JSON.stringify(accepted.values), initial);
      assert.equal(accepted.calls.length, count);
      assert.equal(accepted.cariOpen.value, false);
      assert.equal(Object.keys(accepted.info.value).length, 0);
    } finally { accepted.dispose(); }
    assert.equal(f.calls.length, before);
  } finally { f.dispose(); }
});
test('POST payload excludes number/balance/calculations, keeps leading zero; final number replaces preview', async () => {
  const f = fixture('form');
  try {
    await f.mount(); await f.selectEmployee({ Nik: '001' });
    Object.assign(f.values, { pinjam: '400000', angsuran: '2', bank: 'BSI', norek: '001234' });
    await f.simpan();
    const call = f.calls.find(c => c.method === 'post');
    assert.deepEqual(JSON.parse(JSON.stringify(call.body)), { nik: '001', tanggal: '2026-10-09', pinjam: 400000, angsuran: 2, bank: 'BSI', norek: '001234' });
    assert.equal(f.values.nomor, 'PJ.2610.0002');
    assert.equal(f.saved.value, true);
    await assert.rejects(f.simpan());
    assert.equal(f.calls.filter(c => c.method === 'post').length, 1);
  } finally { f.dispose(); }
});
test('Failed form initialization cannot save or reset', async () => {
  const f = fixture('form');
  try { f.fail(); await f.mount(); assert.equal(f.ready.value, false); assert.equal(f.resetState.reset(), false); await assert.rejects(f.simpan()); }
  finally { f.dispose(); }
});
test('Failed initial number preview leaves form unready and cannot save/reset', async () => {
  const f = fixture('form', { failPreview: true });
  try {
    await f.mount();
    assert.equal(f.ready.value, false);
    assert.equal(f.resetState.reset(), false);
    await assert.rejects(f.simpan());
  } finally { f.dispose(); }
});
test('Actual BaseBrowse lifecycle: one initial GET, one each refresh/reactivation, summary event each time', async () => {
  const f = fixture('browse');
  try {
    await f.mount(); await f.activate(); await settle();
    assert.equal(f.calls.length, 1);
    assert.equal(f.events.filter(e => e[0] === 'loaded').length, 1);
    await f.activate(); await settle();
    assert.equal(f.calls.length, 2);
    f.refresh(); await settle();
    assert.equal(f.calls.length, 3);
    assert.equal(f.events.filter(e => e[0] === 'loaded').length, 3);
  } finally { f.dispose(); }
});
test('Browse summary is global; legacy read-only detail and NULL display safe', async () => {
  const f = fixture('view');
  try {
    await f.refreshSummary();
    assert.equal(f.summary.value.outstanding, 400000);
    assert.equal(f.calls[0].config, undefined);
    await f.openDetail({ Nomor: 'PJ.2002.0022' });
    assert.equal(f.detail.value.Cicilan, 10);
    assert.equal(f.display(f.detail.value, { key: 'Bank' }), '—');
    assert.equal(f.display(f.detail.value, { key: 'Norek' }), '—');
    assert.equal(f.display({ Norek: '001234' }, { key: 'Norek' }), '001234');
    f.closeDetail(); assert.equal(f.detailOpen.value, false);
    const template = read('views/transaksi/PinjamanView.vue');
    assert.match(template, /@load-start="refreshSummary"/);
    assert.match(template, /@load-error="browseFailed"/);
    assert.match(template, /:edit-form-path="auth\.can\('frmPinjam', 'edit'\)/);
    assert.match(template, /:can-delete="false"/);
    assert.match(template, /:add-form-path="auth\.can\('frmPinjam', 'insert'\)/);
  } finally { f.dispose(); }
});
test('Edit loads existing/legacy snapshot, preserves document number and balance, PUT contains no balance', async () => {
  const id = 'PJ.2002.0022';
  const f = fixture('form', { id });
  try {
    await f.mount();
    assert.equal(f.isEdit, true);
    assert.equal(f.values.angsuran, 10);
    assert.equal(f.calls.filter(c => c.url.endsWith('/nomor')).length, 0);
    f.values.tanggal = '2026-11-02';
    await settle();
    assert.equal(f.values.nomor, id);
    f.values.norek = '001234'; f.values.bank = 'BSI';
    await f.simpan();
    const put = f.calls.find(c => c.method === 'put');
    assert.equal(put.body.angsuran, 10);
    assert.equal(put.body.revision, 'revision-1');
    assert.ok(!('bayar' in put.body));
    assert.ok(!('nomor' in put.body));
    assert.equal(f.original.value.SisaBayar, 150000);
  } finally { f.dispose(); }
});
test('Edit reset restores loaded document; failed loads and missing edit permission cannot save', async () => {
  const id = 'PJ.2002.0022';
  const f = fixture('form', { id });
  try {
    await f.mount(); f.values.norek = 'dirty';
    assert.equal(f.resetState.reset(), true); await settle();
    assert.equal(f.values.norek, '');
    assert.equal(f.values.nomor, id);
  } finally { f.dispose(); }
  for (const settings of [{ id, denied: 'edit' }, { id }]) {
    const blocked = fixture('form', settings);
    try {
      if (!settings.denied) blocked.fail();
      await blocked.mount(); await assert.rejects(blocked.simpan());
      assert.equal(blocked.calls.filter(c => c.method === 'put').length, 0);
    } finally { blocked.dispose(); }
  }
});
test('Permanent delete requires typed number plus second confirmation, then refreshes Browse once', async () => {
  const f = fixture('view');
  let refreshes = 0;
  try {
    f.browse.value = { refreshAfterDelete: () => refreshes++ };
    await f.requestDelete({ Nomor: 'PJ.2002.0022' });
    await f.confirmPermanentDelete();
    assert.equal(f.calls.filter(c => c.method === 'delete').length, 0);
    f.deleteVerification.value = 'PJ.2002.0022'; f.cancel();
    await f.confirmPermanentDelete();
    assert.equal(f.calls.filter(c => c.method === 'delete').length, 0);
  } finally { f.dispose(); }
  const approved = fixture('view');
  try {
    approved.browse.value = { refreshAfterDelete: () => refreshes++ };
    await approved.requestDelete({ Nomor: 'PJ.2002.0022' });
    approved.deleteVerification.value = 'PJ.2002.0022';
    await approved.confirmPermanentDelete();
    const call = approved.calls.find(c => c.method === 'delete');
    assert.equal(call.config.data.konfirmasi, 'PJ.2002.0022');
    assert.equal(call.config.data.revision, 'revision-1');
    assert.equal(refreshes, 1);
    assert.equal(approved.deleteOpen.value, false);
  } finally { approved.dispose(); }
  const denied = fixture('view', { denied: 'delete' });
  try { await denied.requestDelete({ Nomor: 'PJ.2002.0022' }); assert.equal(denied.calls.length, 0); }
  finally { denied.dispose(); }
});
test('Browse events refresh summary once per load; failure clears stale summary and next refresh recovers', async () => {
  const view = fixture('view');
  const browse = fixture('browse', { onEvent: event => {
    if (event === 'load-start') void view.refreshSummary();
    if (event === 'load-error') view.browseFailed();
  } });
  try {
    await browse.mount(); await browse.activate(); await settle();
    assert.equal(browse.calls.length, 1);
    assert.equal(view.calls.filter(c => c.url.endsWith('/ringkasan')).length, 1);
    assert.equal(view.summary.value.outstanding, 400000);
    browse.fail();
    await browse.fetchData(); await settle();
    assert.equal(view.summary.value, null);
    assert.equal(view.summaryError.value, true);
    assert.equal(view.summaryLoading.value, false);
    browse.recover();
    await browse.activate(); await settle();
    assert.equal(view.summary.value.outstanding, 400000);
    assert.equal(view.summaryError.value, false);
    assert.equal(view.calls.filter(c => c.url.endsWith('/ringkasan')).length, 3);
    assert.equal(browse.calls.length, 3);
  } finally { view.dispose(); browse.dispose(); }
});
test('NULL/empty filter values have collision-free internal keys and keep old normal parameters', async () => {
  const values = [null, '', 'BSI', 'null', '"null"', '(String kosong)'];
  const keys = values.map(columnFilter.filterKey);
  assert.equal(new Set(keys).size, values.length);
  assert.equal(columnFilter.filterLabel(keys[0]), '(NULL / tidak tersedia)');
  assert.equal(columnFilter.filterLabel(keys[1]), '(String kosong)');
  assert.equal(columnFilter.filterLabel(keys[3]), 'null');
  const wire = JSON.parse(JSON.stringify(columnFilter.columnFilterParams('Bank', keys.slice(0, 4))));
  assert.deepEqual(wire, { filterSet_Bank: ['BSI', 'null'], filterNull_Bank: '1', filterEmpty_Bank: '1' });
  assert.deepEqual(JSON.parse(JSON.stringify(columnFilter.columnFilterParams('Bank', [keys[2]]))), { filterSet_Bank: ['BSI'] });
  const browse = fixture('browse');
  try {
    browse.filterSets.Bank = [keys[0], keys[2]];
    browse.filterSets.Norek = [keys[1]];
    const params = JSON.parse(JSON.stringify(browse.buildParams(false)));
    assert.deepEqual(params, { filterSet_Bank: ['BSI'], filterNull_Bank: '1', filterEmpty_Norek: '1' });
    await browse.fetchDistinct({ key: 'Status' });
    assert.equal(browse.calls[0].config.params.filterNull_Bank, '1');
    assert.equal(browse.calls[0].config.params.filterEmpty_Norek, '1');
  } finally { browse.dispose(); }
});
test('Summary response arriving after Browse failure cannot repopulate stale values', async () => {
  let resolve;
  const summaryResponse = new Promise(done => { resolve = done; });
  const view = fixture('view', { summaryResponse });
  try {
    const pending = view.refreshSummary();
    assert.equal(view.summaryLoading.value, true);
    view.browseFailed();
    resolve({ data: { data: { plafon: 30000000, outstanding: 400000, sisa_plafon: 29600000 } } });
    await pending;
    assert.equal(view.summary.value, null);
    assert.equal(view.summaryError.value, true);
    assert.equal(view.summaryLoading.value, false);
  } finally { view.dispose(); }
});
test('Actual ColumnFilterPopup retains NULL and empty choices, emits typed keys, and normal values keep labels', async () => {
  const mounted = [], stops = [], events = [];
  const props = { selected: [], fetchValues: async () => [null, '', 'BSI', 'null', 'CIMB', 'BSI'] };
  const source = read('components/ColumnFilterPopup.vue').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const popup = compile(source + '\nexport { allValues, checked, filteredValues, searchText, toggleOne, onOk };', name => {
    if (name === 'vue') return { ...vue, onMounted: fn => mounted.push(fn), onUnmounted: fn => stops.push(fn), onDeactivated() {} };
    if (name === '@/utils/columnFilter') return columnFilter;
    return {};
  }, {
    defineProps: () => props, defineEmits: () => (...args) => events.push(args),
    document: { addEventListener() {}, removeEventListener() {} }, window: { addEventListener() {}, removeEventListener() {} },
    cancelAnimationFrame() {},
  });
  for (const mount of mounted) await mount();
  assert.deepEqual(Array.from(popup.allValues.value), [null, '', 'BSI', 'null', 'CIMB'].map(columnFilter.filterKey));
  popup.checked.value = [columnFilter.filterKey(null), columnFilter.filterKey('BSI')];
  popup.onOk();
  assert.deepEqual(Array.from(events[0][1]), [columnFilter.filterKey(null), columnFilter.filterKey('BSI')]);
  popup.searchText.value = 'BSI';
  assert.deepEqual(Array.from(popup.filteredValues.value), [columnFilter.filterKey('BSI')]);
  for (const stop of stops) stop();
});
test('Pinjaman and Pelunasan reuse separate legacy permissions; saldo report remains disabled', () => {
  const menu = compile(read('utils/menuMap.ts'), require);
  assert.equal(menu.definisiMenu('frmPinjam').grup, 'transaksi');
  assert.equal(menu.MENU_DIABAIKAN.includes('frmPinjam'), false);
  assert.equal(menu.MENU_DIABAIKAN.includes('frmBayar'), false);
  assert.equal(menu.definisiMenu('frmBayar').label, 'Proses Pelunasan Pinjaman');
  assert.equal(menu.MENU_DIABAIKAN.includes('frmLapSaldo'), true);
  const routes = read('router/index.ts').split('\n').filter(line => line.includes('path: "/transaksi/pinjaman'));
  assert.equal(routes.length, 3);
  assert.ok(routes.filter(line => !line.includes('/pelunasan')).every(line => line.includes('form: "frmPinjam"')));
  assert.ok(routes.find(line => line.includes('/pelunasan')).includes('form: "frmBayar"'));
  assert.match(read('stores/permissionStore.ts'), /if \(key === "frmSP"\) return transactionOrder\.length \+ 1/);
});
