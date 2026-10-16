const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');
const { parse, compileScript } = require('@vue/compiler-sfc');
const { renderToString } = require('@vue/server-renderer');
const read = file => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
function evaluate(source, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require: name => dependencies[name] || {}, ...globals });
  return module.exports;
}
const expected = 'Nik|Nama|Kode Absensi|Pabrik|Nama Pabrik|Sistem Gaji|Tgl Lahir|Jenis Kelamin|Tgl Masuk|Tgl Keluar|Size|Ibu Kandung|Email|Status BPJS|BPJS KES|BPJS TK|Masa Kerja|Jabatan|Bagian|Departemen|Status Karyawan|Status|Alamat|Telp|Identitas|RekeningBank|Pendidikan Terakhir|Jurusan|PKWT1|PKWT2'.split('|');

test('Actual employee browse renders 30 ordered headers, No 26 on page 2, dates and identifiers with actions', async () => {
  let columns;
  const store = { revision: 0, status: 'all', notifyStatus: false, setStatus() {} };
  const nullComponent = { render: () => null };
  const dependencies = {
    vue, 'vue-router': { useRouter: () => ({}) },
    'vue-toastification': { useToast: () => ({ dismiss() {} }) },
    '@/stores/karyawanBrowseStore': { useKaryawanBrowseStore: () => store },
    '@/stores/tabsStore': { useTabsStore: () => ({}) }, '@/api/axios': { api: {}, getErrorMessage: error => error.message },
    '@/utils/format': evaluate(read('utils/format.ts')), '@/utils/columnFilter': evaluate(read('utils/columnFilter.ts')),
    '@/utils/foto': { fotoUrl: () => '' },
  };
  function component(file, captureCode = '') {
    const source = read(file).replace('</script>', `${captureCode}\n</script>`);
    const { descriptor } = parse(source);
    return evaluate(compileScript(descriptor, { id: file, inlineTemplate: true }).content, dependencies, {
      captureView(value) { columns = value; },
      captureBrowse(state) {
        state.loading.value = false; state.page.value = 2; state.lastPage.value = 3;
        state.rows.value = [{ Nik: '001251415', Nama: 'PUJI YANTO', Kd_Abs: '000123', Pabrik: 'P04', 'Nama Pabrik': 'Pabrik Empat',
          TglLahir: '1990-01-02', TglMasuk: '2020-02-03', TglKeluar: null, PKWT1: '2026-03-04', PKWT2: null,
          NoBPJS: '0009876543210', NoNaker: '0001234567890', RekeningBank: '0001234567890123456789', StatusBPJS: 'Jamkesmas' }];
      },
    }).default;
  }
  for (const name of ['MsIcon', 'ColumnFilterPopup']) dependencies[`@/components/${name}.vue`] = { default: nullComponent };
  dependencies['@/components/fields/DateInput.vue'] = { default: nullComponent };
  dependencies['@/components/BaseBrowse.vue'] = { default: component('components/BaseBrowse.vue', '\ncaptureBrowse({ rows, loading, page, lastPage });') };
  const app = vue.createSSRApp(component('views/master/KaryawanView.vue', '\ncaptureView(columns);'));
  for (const name of ['v-dialog', 'v-card', 'v-card-item', 'v-card-title', 'v-card-text', 'v-card-actions', 'v-spacer', 'v-btn', 'v-tabs', 'v-tab', 'v-window', 'v-window-item', 'v-divider']) app.component(name, nullComponent);
  const html = await renderToString(app);
  assert.deepEqual(Array.from(columns, column => column.label), expected);
  assert.equal(columns.length, 30);
  assert.match(html, /<th class="num-col">No<\/th>/);
  assert.match(html, /<td class="num-col">26<\/td>/);
  const headers = [...html.matchAll(/<span class="th-label">([^<]+)<\/span>/g)].map(match => match[1]);
  assert.deepEqual(headers, expected);
  for (const text of ['000123', 'Pabrik Empat', '0009876543210', '0001234567890', '0001234567890123456789', 'Jamkesmas', '02/01/1990', '03/02/2020', '04/03/2026']) assert.ok(html.includes(text), text);
  assert.ok(html.includes('>Cetak Barcode</button>'));
  assert.ok(!html.includes('>Detail</button>'));
  assert.ok(html.includes('title="Edit"'));
  assert.ok(html.includes('title="Hapus"'));
  for (const key of ['TglLahir', 'TglMasuk', 'TglKeluar', 'PKWT1', 'PKWT2']) assert.equal(columns.find(column => column.key === key).type, 'date');
  assert.ok(html.includes('min-width:'));
  assert.ok(html.includes('data-native-scrollbar'));
  assert.match(read('views/master/KaryawanView.vue'), /\.karyawan-browse :deep\(\.browse-table th\)[^}]+text-transform: none/);
});
