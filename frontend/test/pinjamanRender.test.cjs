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
  const lookup = vue.reactive({ rows: settings.lookupRows || [], loading: false, error: '', pagination: { page: 1, last_page: 1, per_page: 25, total: settings.lookupRows?.length || 0 }, sortBy: '', sortDir: 'asc' });
  const noRequest = () => { throw Error('Rendering must not make API requests'); };
  const api = { get: noRequest, post: noRequest };
  const requireModule = name => {
    if (name === 'vue') return vue;
    if (name === 'vue-router') return { useRouter: () => ({ push() {} }), useRoute: () => ({ query: settings.edit ? { id: 'PJ.2002.0022' } : {} }) };
    if (name === 'vue-toastification') return { useToast: () => ({ error() {} }) };
    if (name === '@/stores/authStore') return { useAuthStore: () => ({ can: (_form, action) => action === 'edit' ? settings.editAllowed !== false : settings.insert !== false }) };
    if (name === '@/stores/tabsStore') return { useTabsStore: () => ({}) };
    if (name === '@/api/axios') return { api, getErrorMessage: e => e.message };
    if (name === '@/api') return { downloadFile: noRequest };
    if (name === '@/utils/format') return { todaySql: () => '2026-10-09', firstDayOfMonth: () => '2026-10-01', formatDateInput: value => value ?? '' };
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
    if (settings.emptyEmployee) { state.values.nik = ''; state.info.value = {}; }
    if (settings.edit) {
      state.original.value = { Nomor: 'PJ.2002.0022', Tanggal: '2020-03-21', Nik: '001', Pinjam: 600000,
         Cicilan: 10, Bank: null, Norek: null, Bayar: 150000, SisaBayar: 450000, Status: 'Belum Lunas', revision: 'revision-1' };
      Object.assign(state.values, { nomor: 'PJ.2002.0022', tanggal: '2020-03-21', pinjam: 600000, angsuran: 10, bank: '', norek: '' });
      if (settings.stored) state.original.value.Potongan = [{ periode: 'Mei 2027', nominal: 123000 }, { periode: 'Juni 2027', nominal: 477000 }];
      if (settings.processed) state.original.value.potong1_diproses_pada = '2026-11-09 10:00:00';
    }
    if (settings.summary) {
      state.values.pinjam = settings.summary.pinjam;
      if (settings.edit) state.original.value.Bayar = settings.summary.bayar;
    }
  };
  const captureBrowse = state => {
    state.loading.value = false;
    state.rows.value = settings.browseRows || [];
    state.expandedKeys.value = new Set(settings.expanded || []);
  };
  const captureView = state => {
    state.exporting.value = !!settings.exporting;
    if (settings.range) {
      state.exportStart.value = settings.range.start_date;
      state.exportEnd.value = settings.range.end_date;
    }
    if (settings.period) {
      state.appliedPeriod.value = settings.period;
      state.exportStart.value = settings.period.start_date;
      state.exportEnd.value = settings.period.end_date;
    }
  };
  function evaluate(source) {
    const module = { exports: {} };
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, require: requireModule, capture, captureBrowse, captureView });
    return module.exports;
  }
  function component(file) {
    if (cache.has(file)) return cache.get(file);
    let source = fs.readFileSync(path.join(root, file), 'utf8');
    if (file.endsWith('PinjamanForm.vue')) source = source.replace('</script>', '\ncapture({ loading, ready, saving, saved, cariOpen, options, values, info, original });\n</script>');
    if (file.endsWith('BaseBrowse.vue')) source = source.replace('</script>', '\ncaptureBrowse({ loading, rows, expandedKeys });\n</script>');
    if (file.endsWith('PinjamanView.vue')) source = source.replace('</script>', '\ncaptureView({ appliedPeriod, exportStart, exportEnd, exporting });\n</script>');
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

test('Pinjaman renders auto-period in toolbar, defaults to checked all dates, no explanatory block', async () => {
  const closed = await renderer()('views/transaksi/PinjamanView.vue');
  assert.match(closed.html, /Export Pengajuan/);
  assert.doesNotMatch(closed.html, /<span>Excel<\/span>/);
  assert.match(closed.html, /id="loan-export-start"[^>]*type="date"/);
  assert.match(closed.html, /id="loan-export-end"[^>]*type="date"/);
  assert.doesNotMatch(closed.html, /Terapkan|Histori pinjaman|Menampilkan semua tanggal|Ringkasan plafon tetap global/);
  assert.match(closed.html, /class="all-dates-button active" aria-pressed="true"/);
  assert.match(closed.html, /Semua periode/);
  assert.ok(closed.html.indexOf('class="toolbar-left"') < closed.html.indexOf('id="loan-export-start"'));
  assert.ok(closed.html.indexOf('class="toolbar-right"') < closed.html.indexOf('id="loan-export-start"'));
  assert.ok(closed.html.indexOf('id="loan-export-end"') < closed.html.indexOf('class="search-box"'));
  assert.match(closed.html, /class="export-button" disabled/);
  assert.ok(closed.html.indexOf('>TGL<') < closed.html.indexOf('>NO<'));
  assert.doesNotMatch(closed.teleports.body || '', /loan-export-title/);
  const source = fs.readFileSync(path.join(root, 'views/transaksi/PinjamanView.vue'), 'utf8');
  assert.equal((source.match(/@change="applyPeriod"/g) || []).length, 2);
  assert.match(source, /MsIcon v-if="!appliedPeriod" name="check"/);
  assert.match(source, /\.all-dates-button\.active[^}]*--ds-success/);
  assert.match(source, /\.all-dates-button[^}]*border-radius: 999px/);
  assert.match(source, /\.pinjaman-page \.all-dates-button\s*\{\s*border-radius: 999px !important;/);
  assert.match(source, /\.pinjaman-page[^}]*height: 100%[^}]*overflow: hidden/);
  assert.match(source, /:deep\(\.toolbar\)[^}]*flex-direction: column/);
  const filtered = await renderer({ period: { start_date: '2026-10-01', end_date: '2026-10-09' } })('views/transaksi/PinjamanView.vue');
  assert.match(filtered.html, /class="all-dates-button" aria-pressed="false"/);
  assert.doesNotMatch(filtered.html, /class="export-button" disabled/);
});

test('Pinjaman toolbar groups Export + Tambah, keeps order and insert/export disabled states', async () => {
  const period = { start_date: '2026-10-01', end_date: '2026-10-09' };
  for (const settings of [{}, { range: period }, { range: period, exporting: true }, { period }, { period, insert: false }, { period, exporting: true }]) {
    const { html } = await renderer(settings)('views/transaksi/PinjamanView.vue');
    const group = html.match(/<div class="loan-toolbar-actions"[^>]*>([\s\S]*?)<\/div>/)?.[1];
    assert.ok(group, 'Actions must wrap as a single group');
    assert.match(group, /Export Pengajuan|Menyiapkan/);
    assert.equal(/class="tool-btn primary"/.test(group), settings.insert !== false);
    assert.equal(/class="export-button" disabled/.test(group), !(settings.period || settings.range) || !!settings.exporting);
    if (settings.range) assert.match(html, /class="all-dates-button active" aria-pressed="true"/);
    const positions = ['id="loan-export-start"', 'id="loan-export-end"', 'Semua periode', 'class="search-box"', 'title="Muat ulang"', 'class="export-button"'];
    if (settings.insert !== false) positions.push('class="tool-btn primary"');
    for (let i = 1; i < positions.length; i++) assert.ok(html.indexOf(positions[i]) > html.indexOf(positions[i - 1]), positions[i]);
    if (settings.exporting) assert.match(html, /id="loan-export-start"[^>]*disabled/);
  }
  const source = fs.readFileSync(path.join(root, 'views/transaksi/PinjamanView.vue'), 'utf8');
  assert.match(source, /#toolbar-actions="\{ addNew, addFormPath, addLabel \}"/);
  assert.match(source, /v-if="addFormPath"[^>]*@click="addNew"/);
  assert.match(source, /:add-form-path="auth.can\('frmPinjam', 'insert'\) \? '\/transaksi\/pinjaman\/form' : undefined"/);
  assert.match(source, /\.loan-toolbar-actions[^}]*flex-wrap: nowrap[^}]*flex: 0 0 auto/);
  assert.match(source, /:deep\(\.search-box\)[^}]*flex: 1 1 100px[^}]*min-width: 100px/);
  assert.match(source, /\.loan-period input[^}]*width: 112px/);
  assert.match(source, /@media \(min-width: 1100px\)[\s\S]*?:deep\(\.toolbar-right\) \{ flex-wrap: nowrap/);
  assert.match(source, /@media \(max-width: 600px\)[\s\S]*\.loan-period \{ flex-basis: 100%/);
  assert.match(source, /\.all-dates-button\.active[^}]*color-mix[^}]*10%[^}]*--ds-surface-raised/);
  assert.match(source, /focus-visible[^}]*outline: 2px solid var\(--ds-primary/);
  assert.match(source, /\.export-button:disabled[^}]*cursor: not-allowed/);
  const browse = fs.readFileSync(path.join(root, 'components/BaseBrowse.vue'), 'utf8');
  assert.match(browse, /name="toolbar-actions" :add-new="addNew" :add-form-path="addFormPath" :add-label="addLabel"/);
  assert.match(browse, /v-model="search"[\s\S]*?@input="onSearch"/);
  assert.match(browse, /title="Muat ulang" @click="refresh"/);
});

test('Pinjaman row actions follow DOM/keyboard order Detail, Edit, Delete and align vertically', async () => {
  const { html } = await renderer({ browseRows: [{ Nomor: 'PJ.2610.0001', Nik: '000', Tanggal: '2026-10-12' }] })('views/transaksi/PinjamanView.vue');
  const actions = html.match(/<div class="row-actions">([\s\S]*?)<\/div>/)?.[1];
  assert.ok(actions);
  assert.ok(actions.indexOf('class="detail-button"') < actions.indexOf('class="row-btn edit"'));
  assert.ok(actions.indexOf('class="row-btn edit"') < actions.indexOf('class="delete-button"'));
  const source = fs.readFileSync(path.join(root, 'views/transaksi/PinjamanView.vue'), 'utf8');
  assert.match(source, /:deep\(\.row-actions\) \{ align-items: center;/);
});

test('Actual PinjamanForm + BaseForm render all fields through form-content slot', async () => {
  const { html } = await renderer()();
  assert.match(html, /<input[^>]*type="date"/);
  assert.match(html, /class="employee-selector selected"/);
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
    const labels = ['Nomor Pinjaman', 'Tanggal Pinjaman', 'Karyawan', 'NIK', 'Pabrik', 'Nama', 'Bagian', 'Nominal Pinjaman', 'Bank', 'Jumlah Cicilan', 'No. Rekening', 'Periode Potongan', 'Bayar', 'Sisa Pinjaman', 'Status'];
    let previous = -1;
    for (const label of labels) {
      const position = html.indexOf(label, previous + 1);
      assert.ok(position > previous, label); previous = position;
    }
  }
  const source = fs.readFileSync(path.join(root, 'views/transaksi/PinjamanForm.vue'), 'utf8');
  assert.match(source, /\.loan-layout \{[^}]*grid-template-columns: minmax\(0, 1\.15fr\) minmax\(0, 1fr\)/);
  assert.match(source, /max-width: 850px[^}]*\.loan-layout \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(source, /\.employee-field \{ grid-column: 1 \/ -1/);
  assert.match(source, /background: var\(--ds-surface-raised\)/);
  const base = fs.readFileSync(path.join(root, 'components/BaseForm.vue'), 'utf8');
  assert.match(base, /\.form-body \{[^}]*overflow: auto/);
  assert.match(base, /\.form-footer \{[^}]*flex-shrink: 0/);
});
test('Employee selector empty/selected states render as one accessible field and retain read-only info card', async () => {
  const empty = (await renderer({ emptyEmployee: true })()).html;
  assert.ok(empty.includes('Cari / pilih karyawan aktif...'));
  assert.ok(empty.includes('Karyawan <span class="req">*</span>'));
  assert.ok(empty.includes('Hanya karyawan aktif dengan masa kerja minimal 6 bulan yang dapat dipilih.'));
  const emptyControl = empty.match(/<button[^>]*class="employee-selector"[^>]*>/)?.[0];
  assert.ok(emptyControl);
  assert.ok(emptyControl.includes('type="button"'));
  assert.ok(emptyControl.includes('aria-haspopup="dialog"'));
  assert.ok(emptyControl.includes('aria-expanded="false"'));
  assert.ok(emptyControl.includes('aria-describedby="pinjaman-employee-help"'));
  assert.ok(!emptyControl.includes('disabled'));
  for (const edit of [false, true]) {
    const html = (await renderer({ edit })()).html;
    assert.ok(!html.includes('Cari / pilih karyawan aktif...'));
    assert.ok(html.includes('class="employee-name">Karyawan Test</span>'));
    assert.ok(html.includes('class="employee-nik">· 001</span>'));
    assert.ok(html.includes('class="employee-change">Ganti</span>'));
    assert.equal((html.match(/id="pinjaman-employee-selector"/g) || []).length, 1);
    const card = html.match(/<dl class="employee-info-card"[\s\S]*?<\/dl>/)?.[0];
    assert.ok(card?.includes('aria-label="Informasi karyawan terpilih"'));
    for (const value of ['001', 'Karyawan Test', 'P01', 'HRD']) assert.ok(card.includes(value), value);
    assert.ok(!card.includes('<input')); assert.ok(!card.includes('<button'));
  }
  const opened = (await renderer({ lookupOpen: true })()).html;
  assert.match(opened, /class="employee-selector selected"[^>]*aria-expanded="true"/);
});
test('Employee info card has four read-only entries, empty placeholders, responsive theme styles, and precedes nominal', async () => {
  for (const settings of [{}, { edit: true }, { emptyEmployee: true }]) {
    const { html } = await renderer(settings)();
    const card = html.match(/<dl class="employee-info-card"[\s\S]*?<\/dl>/)?.[0];
    assert.ok(card);
    assert.deepEqual([...card.matchAll(/<dt>(.*?)<\/dt>/g)].map(match => match[1]), ['NIK', 'Pabrik', 'Nama', 'Bagian']);
    assert.equal((card.match(/<dd/g) || []).length, 4);
    assert.ok(!/<(?:input|select|button)\b/.test(card));
    if (settings.emptyEmployee) assert.equal((card.match(/>—<\/dd>/g) || []).length, 4);
    assert.ok(html.indexOf('pinjaman-employee-help') < html.indexOf(card));
    assert.ok(html.indexOf(card) < html.indexOf('Nominal Pinjaman'));
    assert.ok(!/<label[^>]*>(?:NIK|Pabrik|Nama|Bagian)<\/label>/.test(html));
  }
  const source = fs.readFileSync(path.join(root, 'views/transaksi/PinjamanForm.vue'), 'utf8');
  assert.match(source, /\.employee-info-card \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)[^}]*border: 1px solid var\(--ds-border\)[^}]*background: var\(--ds-surface\)[^}]*color: var\(--ds-text\)/);
  assert.match(source, /max-width: 600px[^}]*\.employee-info-card \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(source, /employee-info-card dd \{[^}]*overflow-wrap: anywhere/);
  // Must override the global .app-shell * { border-radius: 0 !important }.
  assert.match(source, /\.employee-info-card \{ border-radius: 8px !important; \}/);
});
test('Employee selector respects existing disabled states and uses responsive theme/focus styles, not filled primary', async () => {
  for (const settings of [{ loading: true }, { error: true }, { saving: true }, { saved: true }, { insert: false }, { edit: true, editAllowed: false }]) {
    const { html } = await renderer(settings)();
    const button = html.match(/<button[^>]*class="employee-selector[^"]*"[^>]*>/)?.[0];
    assert.ok(button?.includes('disabled'));
  }
  const source = fs.readFileSync(path.join(root, 'views/transaksi/PinjamanForm.vue'), 'utf8');
  assert.match(source, /\.employee-field \{[^}]*grid-template-columns: 140px minmax\(0, 1fr\)/);
  assert.match(source, /\.employee-field \.employee-selector \{[^}]*width: 100%[^}]*border: 1px solid var\(--ds-primary[^}]*background: var\(--ds-surface\)/);
  assert.match(source, /employee-selector:focus-visible \{ outline: 2px solid var\(--ds-primary/);
  assert.match(source, /employee-selector:hover:not\(:disabled\)/);
  assert.match(source, /max-width: 600px[^}]*\.employee-field \{ grid-template-columns: minmax\(0, 1fr\)/);
  const control = source.match(/<button id="pinjaman-employee-selector"[\s\S]*?<\/button>/)?.[0];
  assert.ok(control.includes('@click="cariOpen = true; search()"'));
  assert.ok(control.includes("values.nik ? 'person' : 'search'"));
  assert.ok(!control.includes('<button', control.indexOf('>') + 1));
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
test('Loan lookup renders notice and two rightmost columns, ineligible names visible but disabled', async () => {
  const rows = [
    { Nik: '00123', Nama: 'Andi Pratama', MasaKerja: '1 tahun 2 bulan', StatusKelayakan: 'Memenuhi syarat', BisaDipilih: true },
    { Nik: '00124', Nama: 'Budi Santoso', MasaKerja: '4 bulan', StatusKelayakan: 'Belum memenuhi syarat', BisaDipilih: false },
    { Nik: '00125', Nama: 'Missing Date', MasaKerja: '—', StatusKelayakan: 'Tanggal masuk tidak tersedia', BisaDipilih: false },
  ];
  const { teleports } = await renderer({ lookupOpen: true, lookupRows: rows })();
  const html = teleports.body;
  assert.ok(html.includes('Pinjaman hanya dapat diajukan untuk karyawan aktif dengan masa kerja minimal 6 bulan'));
  assert.ok(html.includes('Andi Pratama')); assert.ok(html.includes('Budi Santoso'));
  assert.ok(html.includes('1 tahun 2 bulan')); assert.ok(html.includes('4 bulan'));
  assert.ok(html.includes('Tanggal masuk tidak tersedia'));
  assert.equal((html.match(/class="unselectable-row"/g) || []).length, 2);
  assert.equal((html.match(/aria-disabled="true"/g) || []).length, 2);
  assert.ok(!html.includes('Urutkan Masa Kerja')); assert.ok(!html.includes('Urutkan Status'));
  assert.ok(html.indexOf('>Pabrik') < html.indexOf('>Masa Kerja'));
  assert.ok(html.indexOf('>Masa Kerja') < html.indexOf('>Status</span>'));
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

test('Two-panel loan form: schedule and three read-only badges on right, no schedule title', async () => {
  const { html } = await renderer()();
  assert.match(html, /class="loan-layout"/);
  assert.ok(html.indexOf('class="loan-data"') < html.indexOf('class="loan-summary"'));
  const summary = html.match(/<aside\b[^>]*class="loan-summary"[\s\S]*?<\/aside>/)?.[0];
  assert.ok(summary);
  assert.match(summary, /Periode Potongan/);
  assert.match(summary, /Nominal Potongan/);
  assert.doesNotMatch(summary, /<h3|<input|<select/);
  assert.equal((summary.match(/class="summary-badge /g) || []).length, 3);
  assert.match(summary, /summary-badge neutral[^>]*>Rp0/);
  assert.match(summary, /summary-badge pending[^>]*>Belum Lunas/);
});

test('Balance badges: paid green, outstanding yellow, settled green, unknown neutral', async () => {
  const partial = (await renderer({ edit: true })()).html;
  assert.match(partial, /summary-badge paid[^>]*>Rp150\.000/);
  assert.match(partial, /summary-badge pending[^>]*>Rp450\.000/);
  const settled = (await renderer({ edit: true, summary: { pinjam: 600000, bayar: 600000 } })()).html;
  assert.match(settled, /summary-badge paid[^>]*>Rp0/);
  assert.match(settled, /summary-badge paid[^>]*>Lunas/);
  const unknown = (await renderer({ edit: true, summary: { pinjam: null, bayar: null } })()).html;
  assert.equal((unknown.match(/class="summary-badge neutral"/g) || []).length, 3);
  assert.doesNotMatch(unknown, /class="summary-badge paid"/);
});

test('Schedule title stays visible by default outside loan form', async () => {
  const { html } = await renderer()('components/PinjamanSchedule.vue', { rows: [] });
  assert.match(html, /<h3[^>]*>Rencana Potongan<\/h3>/);
});
