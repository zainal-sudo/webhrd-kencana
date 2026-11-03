const { test } = require("node:test");
const assert = require("node:assert/strict");
const vue = require("vue");
const { setupSfc } = require("./helpers/setupSfc.cjs");

test("salary export follows browse sorting, search and column filters across all pages", async () => {
  const { sortItems } = await import("vuetify/lib/components/VDataTable/composables/sort.js");
  const sourceRows = [
    { id: "A", nama: "Ani", unit: "u1", bagian: "Packing", rekening: "", thp: 100 },
    { id: "B", nama: "Budi", unit: "u1", bagian: "Admin", rekening: "", thp: 200 },
    { id: "C", nama: "Cici", unit: "u2", bagian: "Admin", rekening: "123", thp: 300 },
    { id: "D", nama: "Dedi", unit: "u1", bagian: "Gudang", rekening: "", thp: 0 },
    { id: "E", nama: "Eka", unit: "u1", bagian: "Gudang", rekening: "", thp: -50 },
  ].map((row) => ({ ...row, hari: 1, lemburLE2: 0, lemburGT2: 0, kehadiran: row.thp, lembur: 0, potongan: 0 }));
  let exported;
  const report = setupSfc("../src/views/laporan/LapGajiView.vue", {}, {
    "vue-router": { useRouter: () => ({}) },
    "vue-toastification": { useToast: () => ({ warning: () => assert.fail("Unexpected empty export") }) },
    "@/api/laporan/lapGajiApi": { lapGajiApi: { getData: async () => sourceRows } },
    "@/utils/terbilang": { roundTHPGaji: Math.round, formatTerbilangGaji: String },
    "@/utils/exportMultiSheetExcel": { exportToMultiSheetExcel: async (options) => { exported = options; } },
  });
  await report.loadData();
  assert.equal(report.items.value.length, 4, "THP zero is hidden; negative THP remains");
  const browse = setupSfc("../src/components/BaseBrowse.vue", {
    items: report.items.value, headers: report.headers, filterState: {},
    filterValues: {}, summaryColumns: [], itemsPerPage: 1,
  }, {
    "vue-router": { useRoute: () => ({ path: "/laporan/lap-gaji" }) },
    vuetify: { useLocale: () => ({ current: vue.ref("en") }) },
    "vuetify/lib/components/VDataTable/composables/sort.js": { sortItems },
  });
  report.browseRef.value = { getExportItems: browse.getExportItems };
  const ids = (sheet) => Array.from(sheet.rows.slice(0, -1), (row) => row.id);

  browse.sortBy.value = [{ key: "bagian", order: "asc" }];
  browse.currentPage.value = 2;
  await report.exportExcelData();
  assert.deepEqual(ids(exported.sheets[0]), ["B", "C", "E", "A"]);
  assert.deepEqual(ids(exported.sheets.find((sheet) => sheet.name === "u1-cash")), ["B", "E", "A"]);

  browse.sortBy.value = [{ key: "bagian", order: "desc" }];
  browse.columnFilters.value = { unit: { allowed: new Set(["u1"]) } };
  await report.exportExcelData();
  assert.deepEqual(ids(exported.sheets[0]), ["A", "E", "B"]);
  assert.equal(exported.sheets[0].rows.at(-1).thp, 250);
  assert.equal(exported.sheets.length, 2, "Filtered-out units have no exported sheets");

  browse.search.value = "Budi";
  await report.exportExcelData();
  assert.deepEqual(ids(exported.sheets[0]), ["B"]);
  assert.equal(exported.sheets[0].rows.at(-1).thp, 200);
  assert.deepEqual(sourceRows.map((row) => row.id), ["A", "B", "C", "D", "E"]);
});
