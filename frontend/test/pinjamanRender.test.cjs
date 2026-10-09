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

// Compile the REAL SFC script + template, including BaseForm and field components.
// No DOM/test-framework dependency and no API/database requests.
function renderer(settings = {}) {
  const cache = new Map();
  const empty = { render: () => null };
  const lookup = vue.reactive({ rows: [], loading: false, error: '', pagination: { page: 1, last_page: 1, per_page: 25, total: 0 }, sortBy: '', sortDir: 'asc' });
  const noRequest = () => { throw Error('Rendering must not make API requests'); };
  const api = { get: noRequest, post: noRequest };
  const requireModule = name => {
    if (name === 'vue') return vue;
    if (name === 'vue-router') return { useRouter: () => ({ push() {} }), useRoute: () => ({ query: settings.edit ? { id: 'PJ.2002.0022' } : {} }) };
    if (name === 'vue-toastification') return { useToast: () => ({ error() {} }) };
    if (name === '@/stores/authStore') return { useAuthStore: () => ({ can: (_form, action) => action === 'edit' ? settings.editAllowed !== false : settings.insert !== false }) };
    if (name === '@/stores/tabsStore') return { useTabsStore: () => ({}) };
    if (name === '@/api/axios') return { api, getErrorMessage: e => e.message };
    if (name === '@/utils/format') return { todaySql: () => '2026-10-09', formatDateInput: value => value ?? '' };
    if (name === '@/composables/useKaryawanLookup') return { useKaryawanLookup: () => lookup };
    if (name === '@/composables/useTransactionReset') return { useTransactionReset: () => ({
      disabled: vue.ref(false), restoring: vue.ref(false), reset() {}, trackApi: value => value, initialize() {},
    }) };
    if (name === '@/components/MsIcon.vue') return { default: empty };
    if (name.startsWith('@/')) {
      const file = name.slice(2);
      if (file.endsWith('.vue')) return { default: component(file) };
      return evaluate(fs.readFileSync(path.join(root, `${file}.ts`), 'utf8'));
    }
    return require(name);
  };
  const capture = state => {
    state.loading.value = !!settings.loading;
    state.ready.value = !settings.loading && !settings.error;
    state.saving.value = !!settings.saving;
    state.saved.value = !!settings.saved;
    state.cariOpen.value = !!settings.lookupOpen;
    state.options.value = { nominal: [200000, 300000, 400000, 500000], angsuran: [1, 2], bank: ['BSI', 'CIMB'] };
    Object.assign(state.values, { pinjam: 400000, angsuran: 2, bank: 'BSI', norek: '001234', nik: '001' });
    state.info.value = { Nama: 'Karyawan Test', Pabrik: 'P01', Bagian: 'HRD' };
    if (settings.edit) {
      state.original.value = { Nomor: 'PJ.2002.0022', Tanggal: '2020-03-21', Nik: '001', Pinjam: 600000,
         Cicilan: 10, Bank: null, Norek: null, Bayar: 150000, SisaBayar: 450000, Status: 'Belum Lunas', revision: 'revision-1' };
      Object.assign(state.values, { nomor: 'PJ.2002.0022', tanggal: '2020-03-21', pinjam: 600000, angsuran: 10, bank: '', norek: '' });
      if (settings.stored) state.original.value.Potongan = [{ periode: 'Mei 2027', nominal: 123000 }, { periode: 'Juni 2027', nominal: 477000 }];
      if (settings.processed) state.original.value.potong1_diproses_pada = '2026-11-09 10:00:00';
    }
  };
  const captureBrowse = state => {
    state.loading.value = false;
    state.rows.value = settings.browseRows || [];
    state.expandedKeys.value = new Set(settings.expanded || []);
  };
  function evaluate(source) {
    const module = { exports: {} };
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, require: requireModule, capture, captureBrowse });
    return module.exports;
  }
  function component(file) {
    if (cache.has(file)) return cache.get(file);
    let source = fs.readFileSync(path.join(root, file), 'utf8');
    if (file.endsWith('PinjamanForm.vue')) source = source.replace('</script>', '\ncapture({ loading, ready, saving, saved, cariOpen, options, values, info, original });\n</script>');
    if (file.endsWith('BaseBrowse.vue')) source = source.replace('</script>', '\ncaptureBrowse({ loading, rows, expandedKeys });\n</script>');
    const { descriptor } = parse(source, { filename: file });
    const script = compileScript(descriptor, { id: file, inlineTemplate: true });
    const result = evaluate(script.content).default;
    cache.set(file, result);
    return result;
  }
  return async (file = 'views/transaksi/PinjamanForm.vue', props = {}, slots) => {
    if (file === 'components/BaseBrowse.vue') slots = { ...slots, 'expanded-row': ({ row }) => vue.h(component('components/PinjamanSchedule.vue'), { rows: row.Potongan || [] }) };
    const app = vue.createSSRApp({ render: () => vue.h(component(file), props, slots) });
    for (const name of ['v-dialog', 'v-card', 'v-card-item', 'v-card-title', 'v-card-text', 'v-card-actions', 'v-spacer', 'v-btn']) app.component(name, empty);
    const context = {};
    const html = await renderToString(app, context);
    return { html, teleports: context.teleports || {} };
  };
}

test('Actual PinjamanForm + BaseForm render all fields through form-content slot', async () => {
  const { html } = await renderer()();
  assert.match(html, /<input[^>]*type="date"/);
  assert.match(html, /Cari Karyawan Aktif/);
  for (const label of ['Nama', 'Pabrik', 'Bagian', 'Nominal Pinjaman', 'Jumlah Cicilan', 'Bank', 'No. Rekening',
    'Periode Potongan', 'Bayar', 'Sisa Pinjaman', 'Status']) assert.ok(html.includes(label), label);
  assert.equal((html.match(/<select\b/g) || []).length, 3);
  assert.match(html, /<input[^>]*type="text"[^>]*maxlength="50"/);
  assert.ok(html.includes('001234'));
  assert.ok(html.includes('Rp200.000'));
   assert.ok(html.includes('<td>Oktober 2026</td>'));
   assert.ok(html.includes('<td>November 2026</td>'));
   assert.ok(html.includes('Rp0'));
  assert.ok(html.includes('Belum Lunas'));
});
test('Compact Form field order and responsive/theme styles, footer stays outside scroll body', async () => {
  for (const edit of [false, true]) {
    const { html } = await renderer({ edit })();
    const labels = ['Nomor Pinjaman', 'Tanggal Pinjaman', 'Cari Karyawan Aktif', 'NIK', 'Pabrik', 'Nama', 'Bagian', 'Nominal Pinjaman', 'Bank', 'Jumlah Cicilan', 'No. Rekening', 'Rencana Potongan', 'Bayar', 'Status', 'Sisa Pinjaman'];
    let previous = -1;
    for (const label of labels) {
      const position = html.indexOf(label, previous + 1);
      assert.ok(position > previous, label); previous = position;
    }
  }
  const source = fs.readFileSync(path.join(root, 'views/transaksi/PinjamanForm.vue'), 'utf8');
  assert.match(source, /gap: 8px 16px/);
  assert.match(source, /max-width: 600px[^}]*\.loan-fields \{ grid-template-columns: 1fr/);
  assert.match(source, /\.picker \{ grid-column: 1 \/ -1/);
  assert.match(source, /background: var\(--ds-surface-raised\)/);
  const base = fs.readFileSync(path.join(root, 'components/BaseForm.vue'), 'utf8');
  assert.match(base, /\.form-body \{[^}]*overflow: auto/);
  assert.match(base, /\.form-footer \{[^}]*flex-shrink: 0/);
});
test('Actual Browse renders leftmost accessible expand controls and inline schedule for 1x/2x/unknown', async () => {
  const props = { moduleTitle: 'Pinjaman', endpoint: '/transaksi/pinjaman', primaryKey: 'Nomor', expandable: true,
    compact: true, rowNumberLabel: 'NO', canDelete: false, showActions: false, columns: [{ key: 'Nik', label: 'NIK' }] };
  for (const rows of [[{ periode: 'Oktober 2026', nominal: 400000 }],
    [{ periode: 'Oktober 2026', nominal: 200000 }, { periode: 'November 2026', nominal: 200000 }], []]) {
    const browseRows = [{ Nomor: 'PJ.2610.0001', Nik: '001', Potongan: rows }, { Nomor: 'PJ.2610.0002', Nik: '002', Potongan: [] }];
    const collapsed = (await renderer({ browseRows })('components/BaseBrowse.vue', props)).html;
    assert.equal((collapsed.match(/class="expand-btn"/g) || []).length, 2);
    assert.ok(collapsed.includes('aria-expanded="false"'));
    assert.ok(!collapsed.includes('class="expanded-row"'));
    const expanded = (await renderer({ browseRows, expanded: ['PJ.2610.0001'] })('components/BaseBrowse.vue', props)).html;
    assert.equal((expanded.match(/class="expanded-row"/g) || []).length, 1);
    assert.ok(expanded.includes('aria-expanded="true"'));
    assert.ok(expanded.includes('colspan="3"'));
    assert.ok(expanded.indexOf('class="expand-col"') < expanded.indexOf('class="num-col"'));
    assert.ok(expanded.indexOf('class="expanded-row"') < expanded.indexOf('002'));
    assert.ok(expanded.includes(rows.length ? 'Rp400.000' : '—'));
    assert.equal((expanded.match(/<td>Oktober 2026<\/td>/g) || []).length, rows.length ? 1 : 0);
    assert.equal((expanded.match(/<td>November 2026<\/td>/g) || []).length, rows.length === 2 ? 1 : 0);
  }
});
test('Shared schedule handles partial unknown values and uses theme tokens in all three contexts', async () => {
  const { html } = await renderer()('components/PinjamanSchedule.vue', { rows: [{ periode: null, nominal: null }] });
  assert.ok(html.includes('Total'));
  assert.ok(!html.includes('NaN'));
  assert.ok(!html.includes('Rp0'));
  const source = fs.readFileSync(path.join(root, 'components/PinjamanSchedule.vue'), 'utf8');
  for (const token of ['--ds-text', '--ds-surface', '--ds-surface-raised', '--ds-border']) assert.ok(source.includes(token));
  assert.match(source, /border-radius: 7px/);
  for (const file of ['PinjamanForm.vue', 'PinjamanView.vue']) assert.ok(fs.readFileSync(path.join(root, 'views/transaksi', file), 'utf8').includes('<PinjamanSchedule'));
});
test('Lookup modal is rendered via Teleport from the named form-content slot', async () => {
  const { teleports } = await renderer({ lookupOpen: true })();
  assert.ok(teleports.body?.includes('loan-lookup-title'));
  assert.ok(teleports.body?.includes('Cari Karyawan Aktif'));
  assert.ok(teleports.body?.includes('employee-lookup'));
});
test('Insert permission: normal ready form has enabled Save, no permission hides Save', async () => {
  const enabled = (await renderer()()).html;
  const button = enabled.match(/<button[^>]*class="form-btn primary"[^>]*>/)?.[0];
  assert.ok(button);
  assert.ok(!button.includes('disabled'));
  const denied = (await renderer({ insert: false })()).html;
  assert.ok(!denied.includes('class="form-btn primary"'));
});
for (const state of ['loading', 'error', 'saving', 'saved']) test(`Actual rendered Save is disabled during ${state}`, async () => {
  const { html } = await renderer({ [state]: true })();
  const button = html.match(/<button[^>]*class="form-btn primary"[^>]*>/)?.[0];
  assert.ok(button?.includes('disabled'), button);
});
test('BaseForm opt-in defaults preserve existing footer and form-content contract', async () => {
  const render = renderer();
  const { html } = await render('components/BaseForm.vue', { title: 'Existing form', saveFn: async () => 'Saved' },
    { 'form-content': () => vue.h('input', { id: 'existing-field' }) });
  assert.ok(html.includes('existing-field'));
  const button = html.match(/<button[^>]*class="form-btn primary"[^>]*>/)?.[0];
  assert.ok(button && !button.includes('disabled'));
  assert.ok(html.includes('Reset'));
});
test('Edit renders legacy options and persisted balance, guarded by edit permission rather than insert', async () => {
  const { html } = await renderer({ edit: true, insert: false })();
  assert.ok(html.includes('Edit Pinjaman'));
  assert.ok(html.includes('10x (existing)'));
  assert.ok(html.includes('Rp600.000 (existing)'));
  assert.ok(html.includes('Rp150.000'));
   assert.ok(html.includes('Rp450.000'));
   assert.ok(html.includes('Nomor dan jumlah yang sudah dibayar tetap'));
   assert.equal((html.match(/<td class="amount">Rp60.000<\/td>/g) || []).length, 10);
  assert.ok(html.includes('class="form-btn primary"'));
  const denied = (await renderer({ edit: true, insert: true, editAllowed: false })()).html;
  assert.ok(!denied.includes('class="form-btn primary"'));
});
test('Edit renders stored periods/amounts instead of recalculating legacy date/installments', async () => {
  const { html } = await renderer({ edit: true, stored: true })();
  assert.ok(html.includes('<td>Mei 2027</td>'));
  assert.ok(html.includes('<td>Juni 2027</td>'));
  assert.ok(html.includes('Rp123.000'));
  assert.ok(html.includes('Rp477.000'));
  assert.ok(!html.includes('<td>April 2020</td>'));
});
test('Processed Edit disables date/nominal/installments, bank and account remain editable', async () => {
  const { html } = await renderer({ edit: true, processed: true })();
  assert.match(html, /<input[^>]*type="date"[^>]*disabled/);
  const selects = html.match(/<select[^>]*>/g);
  assert.ok(selects[0].includes('disabled'));
  assert.ok(!selects[1].includes('disabled'));
  assert.ok(selects[2].includes('disabled'));
  assert.match(html, /Jadwal pinjaman tidak dapat diubah/);
  assert.ok(!html.match(/<input[^>]*maxlength="50"[^>]*>/)[0].includes('disabled'));
});
