const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const vue = require("vue");
const { setupSfc } = require("./helpers/setupSfc.cjs");

const rows = [{ Nomor: "A" }, { Nomor: "B" }, { Nomor: "C" }];
const visible = [rows[2], rows[0]];
const feedback = [];
const common = {
  "vue-router": { useRouter: () => ({}), useRoute: () => ({ path: "/test" }) },
  "vue-toastification": { useToast: () => new Proxy({}, { get: (_, level) => (message) => feedback.push({ level, message }) }) },
  "@/api/axios": { isAuthExpiredError: () => false },
};
const attachBrowse = (view, data = visible) => {
  view.items.value = rows;
  view.browseRef.value = { getExportItems: () => data };
};

test("useBrowse header and detail exports share the browse result and snapshot it before fetching", async () => {
  const module = { exports: {} };
  let headerExport, detailExport;
  const fetched = [];
  const imports = {
    ...common, vue: { ...vue, onMounted: () => {} },
    "@/stores/permissionStore": { usePermissionStore: () => ({ can: () => true, getMenuIdByRoute: () => "1" }) },
    "@/utils/styledExport": {
      exportStyledHeader: async (options) => { headerExport = options; },
      exportStyledDetail: async (options) => { detailExport = options; },
    },
  };
  const compiled = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, "../src/composables/useBrowse.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  vm.runInNewContext(compiled.outputText, { module, exports: module.exports, require: (name) => imports[name] });
  const view = module.exports.useBrowse({
    immediate: false, fetchApi: async () => rows,
  });
  attachBrowse(view);
  await view.exportHeaderOnly();
  assert.deepEqual(Array.from(headerExport.items, (row) => row.Nomor), ["C", "A"]);
  // Resolve both parallel fetches together.
  const resolvers = [];
  const view2 = module.exports.useBrowse({
    immediate: false, fetchApi: async () => rows,
    getDetailApi: async (key) => { fetched.push(key); await new Promise((resolve) => resolvers.push(resolve)); return [{ Line: key }]; },
  });
  attachBrowse(view2);
  const exporting = view2.exportDetailOnly();
  assert.deepEqual(fetched, ["C", "A"]);
  attachBrowse(view2, []);
  resolvers.forEach((resolve) => resolve());
  await exporting;
  assert.deepEqual(Array.from(detailExport.headerItems, (row) => row.Nomor), ["C", "A"]);
  headerExport = null;
  await view2.exportHeaderOnly();
  assert.equal(headerExport, null, "An empty filtered browse must not fall back to all rows");
});

test("journal detail export excludes hidden headers and preserves browse order", () => {
  let exported;
  const view = setupSfc("../src/views/transaksi/JurnalUmumView.vue", {}, {
    ...common,
    "@/api/transaksi/jurnalUmumApi": { jurnalUmumApi: {} },
    "@/utils/exportExcel": { exportJurnalUmumDetail: (data) => { exported = data; } },
  });
  attachBrowse(view);
  view.detailItems.value = [
    { Nomor: "A", line: 1 }, { Nomor: "B", line: 1 }, { Nomor: "C", line: 1 }, { Nomor: "C", line: 2 },
  ];
  view.doExportDetail();
  assert.deepEqual(Array.from(exported, (row) => `${row.Nomor}${row.line}`), ["C1", "C2", "A1"]);
});

test("bank reconciliation detail follows both account and date in the filtered browse", () => {
  let exported;
  const view = setupSfc("../src/views/laporan/LapRekonsiliasiBankView.vue", {}, {
    ...common,
    "@/api/laporan/rekonsiliasiBankApi": { rekonsiliasiBankApi: {} },
    "@/utils/exportExcel": { exportRekonsiliasiBankDetail: (data) => { exported = data; } },
  });
  attachBrowse(view, [{ Account: "BANK", Tanggal: "2026-10-02" }]);
  view.detailItems.value = [
    { Account: "BANK", Tanggal: "2026-10-01" },
    { Account: "BANK", Tanggal: "2026-10-02" },
    { Account: "CASH", Tanggal: "2026-10-02" },
  ];
  view.doExportDetail();
  assert.equal(exported.length, 1);
  assert.equal(exported[0].Account, "BANK");
  assert.equal(exported[0].Tanggal, "2026-10-02");
});

test("master export takes the browse result rather than the unfiltered master dataset", () => {
  let exported;
  const items = vue.ref([{ kode: "A", nama: "Admin" }, { kode: "B", nama: "Produksi" }]);
  const view = setupSfc("../src/views/master/UnitView.vue", {}, {
    ...common,
    "@/composables/useBrowse": { useBrowse: () => ({
      items, browseRef: vue.ref(null), getExportItems: () => [items.value[1]],
    }) },
    "@/api/master/unitApi": { unitApi: {} },
    "@/utils/exportExcel": { exportToExcel: (options) => { exported = options; } },
  });
  view.exportExcelData();
  assert.deepEqual(Array.from(exported.rows, (row) => row.kode), ["B"]);
});

test("browse exporter uses numeric sorting and all filtered rows before pagination", async () => {
  const { sortItems } = await import("vuetify/lib/components/VDataTable/composables/sort.js");
  const view = setupSfc("../src/components/BaseBrowse.vue", {
    items: [{ id: "A", Total: 10 }, { id: "B", Total: 2 }, { id: "C", Total: 100 }],
    headers: [{ key: "id" }, { key: "Total" }], filterState: {}, summaryColumns: [], itemsPerPage: 1,
  }, {
    ...common,
    vuetify: { useLocale: () => ({ current: vue.ref("en") }) },
    "vuetify/lib/components/VDataTable/composables/sort.js": { sortItems },
  });
  view.sortBy.value = [{ key: "Total", order: "asc" }];
  view.currentPage.value = 2;
  assert.deepEqual(Array.from(view.getExportItems(), (row) => row.id), ["B", "A", "C"]);
  view.columnFilters.value = { Total: { operator: ">=", value: 10 } };
  assert.deepEqual(Array.from(view.getExportItems(), (row) => row.id), ["A", "C"]);
  view.search.value = "missing";
  assert.equal(view.getExportItems().length, 0);
});

test("invoice detail fetched for the period is restricted and ordered by the browse snapshot", async () => {
  let exported;
  const view = setupSfc("../src/views/transaksi/InvBrowse.vue", {}, {
    ...common,
    "@/composables/useQzPrint": { useQzPrint: () => ({}) },
    "@/api/transaksi/invApi": { invApi: { getExportDetail: async () => ({ data: [
      { Nomor: "A", Qty: 1, Harga: 10 }, { Nomor: "B", Qty: 2, Harga: 20 }, { Nomor: "C", Qty: 3, Harga: 30 },
    ] }) } },
    "@/utils/exportExcel": { exportToExcel: async (options) => { exported = options; } },
  });
  attachBrowse(view);
  await view.doExportWithDetail();
  assert.ok(exported);
  assert.deepEqual(Array.from(exported.rows, (row) => row.Nomor), ["C", "A"]);
});

test("attendance report total uses only exported rows", () => {
  let exported;
  const view = setupSfc("../src/views/laporan/LapAbsensiView.vue", {}, {
    ...common,
    "@/api/master/unitApi": { unitApi: {} },
    "@/api/laporan/lapAbsensiApi": { lapAbsensiApi: {} },
    "@/utils/exportExcel": { exportToExcel: (options) => { exported = options; } },
  });
  attachBrowse(view, [{ kehadiran: 1 }, { kehadiran: 0.5 }]);
  view.exportExcelData();
  assert.equal(exported.rows.at(-1).kehadiran, 1.5);
});

test("Mutasi Out exports details even when matching rows have never been expanded", async () => {
  let exported;
  const fetched = [];
  const view = setupSfc("../src/views/transaksi/MutasiOutView.vue", {}, {
    ...common,
    "@/stores/authStore": { useAuthStore: () => ({}) },
    "@/api/transaksi/mutasiOutApi": { mutasiOutApi: { getDetail: async (key) => { fetched.push(key); return [{ key }]; } } },
    "@/utils/exportExcel": { exportMutasiOut: async (headers, details) => { exported = { headers, details }; } },
  });
  attachBrowse(view);
  view.dtlCache.value = { A: [{ key: "cached" }] };
  await view.onExportDetail();
  assert.deepEqual(fetched, ["C"]);
  assert.deepEqual(Array.from(exported.headers, (row) => row.Nomor), ["C", "A"]);
  assert.equal(exported.details.C[0].key, "C");
  assert.equal(exported.details.A[0].key, "cached");
});
