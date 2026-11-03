<script setup lang="ts">
import { ref, computed } from "vue";
import { useToast } from "vue-toastification";
import {
  IconBox,
  IconSearch,
  IconPlus,
  IconTrash,
  IconDownload,
} from "@tabler/icons-vue";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { useBrowse } from "@/composables/useBrowse";
import {
  barangJadiApi,
  type BarangJadi,
  type KomposisiItem,
  type BarangJadiTemplate,
} from "@/api/master/barangJadiApi";
import { kategoriApi } from "@/api/master/kategoriApi";
import { gudangApi } from "@/api/master/gudangApi";
import { supplierApi } from "@/api/master/supplierApi";
import { barangApi as bahanApi } from "@/api/master/barangApi";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

const MENU_ID = "20";
const toast = useToast();

// Default fixed untuk Barang Jadi (langsung ke-input otomatis, gak perlu
// dropdown/service tambahan — datanya memang tetap).
const DEFAULT_GDG_KODE = "GJ-01"; // Gudang Produk Jadi
const DEFAULT_REK_KODE = "17.004";
const DEFAULT_REK_NAMA = "Persediaan Barang Jadi"; // Persediaan Barang Jadi

const {
  browseRef,
  getExportItems,
  items,
  isLoading,
  selected,
  canInsert,
  canEdit,
  canDelete,
  canExport,
  fetchData,
} = useBrowse<BarangJadi>({ menuId: MENU_ID, fetchApi: barangJadiApi.getAll });

const headers = [
  { title: "Kode", key: "brg_kode", width: "80px", align: "center" },
  { title: "Nama", key: "brg_nama", width: "220px", minWidth: "220px" },
  { title: "Satuan", key: "brg_satuan", width: "80px", align: "center" },
  { title: "Kategori", key: "ktg_nama", width: "160px" },
  {
    title: "HPP Terakhir",
    key: "brg_hpp_terakhir",
    width: "120px",
    align: "end",
  },
  { title: "Harga Jual", key: "brg_hrgjual", width: "120px", align: "end" },
  { title: "Stok", key: "brg_stok", width: "90px", align: "end" },
  { title: "Min", key: "brg_MIN_STOK", width: "70px", align: "end" },
  { title: "Last Cost", key: "brg_lastcost", width: "110px", align: "end" },
  { title: "Harga Beli", key: "brg_hrgbeli", width: "110px", align: "end" },
  { title: "Supplier", key: "sup_nama", width: "150px" },
  {
    title: "Ada Komposisi",
    key: "adaKomposisi",
    width: "110px",
    align: "center",
  },
];

// ── Export Excel (.xlsx) — SELURUH data, tanpa filter periode ─────────
const exportCsv = async () => {
  const exportItems = getExportItems();
  if (!exportItems?.length) {
    toast.warning("Tidak ada data untuk diekspor.");
    return;
  }

  const cols = [
    { header: "Kode", key: "brg_kode", width: 10 },
    { header: "Nama", key: "brg_nama", width: 34 },
    { header: "Satuan", key: "brg_satuan", width: 10 },
    { header: "Kategori", key: "ktg_nama", width: 22 },
    { header: "Tipe", key: "ktg_tipe", width: 16 },
    { header: "Hpp_Terakhir", key: "brg_hpp_terakhir", width: 16 },
    { header: "HargaJual", key: "brg_hrgjual", width: 16 },
    { header: "Stok", key: "brg_stok", width: 10 },
    { header: "Min", key: "brg_MIN_STOK", width: 8 },
    { header: "Lastcost", key: "brg_lastcost", width: 14 },
    { header: "HargaBeli", key: "brg_hrgbeli", width: 14 },
    { header: "Supplier", key: "sup_nama", width: 24 },
    { header: "Adakomposisi", key: "brg_isboom", width: 14 },
  ];

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Barang Jadi");
  sheet.columns = cols;

  sheet.mergeCells(1, 1, 1, cols.length);
  sheet.getCell(
    "A1"
  ).value = `Export Data Barang Jadi (${exportItems.length} data)`;
  sheet.getCell("A1").font = { bold: true, size: 12 };
  sheet.getCell("A1").alignment = { vertical: "middle" };
  sheet.getRow(1).height = 22;

  const headerRow = sheet.addRow(cols.map((c) => c.header));
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FF1B1B5E" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0F0" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = { bottom: { style: "thin" } };
  });

  exportItems.forEach((item: any) => {
    const row = sheet.addRow({
      brg_kode: item.brg_kode,
      brg_nama: item.brg_nama,
      brg_satuan: item.brg_satuan,
      ktg_nama: item.ktg_nama,
      ktg_tipe: item.ktg_tipe ?? "Barang Jadi",
      brg_hpp_terakhir: item.brg_hpp_terakhir ?? 0,
      brg_hrgjual: item.brg_hrgjual ?? 0,
      brg_stok: item.brg_stok ?? 0,
      brg_MIN_STOK: item.brg_MIN_STOK ?? 0,
      brg_lastcost: item.brg_lastcost ?? 0,
      brg_hrgbeli: item.brg_hrgbeli ?? 0,
      sup_nama: item.sup_nama || "-",
      brg_isboom: item.brg_isboom ? "Ya" : "-",
    });

    row.eachCell((cell, colNumber) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFFF00" },
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFDDDDDD" } },
        bottom: { style: "thin", color: { argb: "FFDDDDDD" } },
      };
      if ([6, 7, 10, 11].includes(colNumber)) {
        cell.numFmt = '"Rp" #,##0';
        cell.alignment = { horizontal: "right" };
      }
      if ([8, 9].includes(colNumber)) {
        cell.alignment = { horizontal: "right" };
      }
    });
  });

  sheet.views = [{ state: "frozen", ySplit: 2 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  saveAs(blob, `barang-jadi_${new Date().toISOString().slice(0, 10)}.xlsx`);
};

// ── Dropdown lookup data ──────────────────────────────────────────────
const kategoriList = ref<any[]>([]);
const gudangList = ref<any[]>([]);
const supplierList = ref<any[]>([]);
const bahanList = ref<any[]>([]);
const lookupsLoaded = ref(false);

const loadLookups = async () => {
  if (lookupsLoaded.value) return;
  try {
    const [k, g, s, b] = await Promise.all([
      kategoriApi.getAll(),
      gudangApi.getAll(),
      supplierApi.getAll(),
      bahanApi.getAll(),
    ]);
    kategoriList.value = k;
    gudangList.value = g;
    supplierList.value = s;
    bahanList.value = b;
    lookupsLoaded.value = true;
  } catch (e) {
    toast.error("Gagal memuat data kategori/gudang/supplier/bahan.");
  }
};
loadLookups();

const kategoriBarangJadi = computed(() =>
  kategoriList.value.find((k) => k.nama?.toLowerCase().includes("produk jadi"))
);

const satuanOptions = [
  "Pcs",
  "Box",
  "Dus",
  "Set",
  "Kg",
  "Liter",
  "Roll",
  "Lbr",
];

// ── Dialog & Form State ─────────────────────────────────────────────
const dialog = ref(false);
const dialogTitle = ref("");
const isSaving = ref(false);
const isDeleting = ref(false);

const emptyForm = (): Partial<BarangJadi> => ({
  brg_nama: "",
  brg_satuan: "Pcs",
  brg_ktg_kode: "",
  brg_gdg_default: DEFAULT_GDG_KODE,
  brg_rek_kode: DEFAULT_REK_KODE,
  brg_merk: "",
  brg_isstok: 0,
  brg_isaktif: 1,
  brg_hrgbeli: 0,
  brg_hrgjual: undefined as unknown as number,
  brg_MIN_STOK: 0,
  brg_MAX_STOK: 0,
  brg_sup_kode: "",
  brg_spesifikasi: "",
});
const form = ref<Partial<BarangJadi>>(emptyForm());
const komposisi = ref<KomposisiItem[]>([]);

const errors = ref<{
  nama?: string;
  satuan?: string;
  hrgJual?: string;
  stok?: string;
}>({});

const validateForm = (): boolean => {
  const e: typeof errors.value = {};
  if (!form.value.brg_nama?.trim()) e.nama = "Nama barang wajib diisi.";
  else if (form.value.brg_nama.trim().length < 3)
    e.nama = "Nama minimal 3 karakter.";

  if (!form.value.brg_satuan?.trim()) e.satuan = "Satuan wajib diisi.";

  const hrgJual = Number(form.value.brg_hrgjual);
  if (
    form.value.brg_hrgjual === undefined ||
    form.value.brg_hrgjual === null ||
    !Number.isFinite(hrgJual) ||
    hrgJual <= 0
  ) {
    e.hrgJual = "Harga jual wajib diisi dan tidak boleh 0 atau minus.";
  }

  const minStok = Number(form.value.brg_MIN_STOK) || 0;
  const maxStok = Number(form.value.brg_MAX_STOK) || 0;
  if (minStok < 0 || maxStok < 0) {
    e.stok = "Min/Max stok tidak boleh minus.";
  } else if (maxStok > 0 && maxStok < minStok) {
    e.stok = "Max stok tidak boleh lebih kecil dari min stok.";
  }

  errors.value = e;
  return Object.keys(e).length === 0;
};
const clearError = (f: keyof typeof errors.value) => {
  if (errors.value[f]) delete errors.value[f];
};

const hrgJualDisplay = computed({
  get: () =>
    form.value.brg_hrgjual
      ? new Intl.NumberFormat("id-ID").format(form.value.brg_hrgjual)
      : "",
  set: (val: string) => {
    clearError("hrgJual");
    const numeric = val.replace(/\D/g, "").slice(0, 15);
    form.value.brg_hrgjual = numeric
      ? parseInt(numeric, 10)
      : (undefined as unknown as number);
  },
});

// ── Tab Komposisi ──────────────────────────────────────────────────
const lookupBahanDialog = ref(false);
const searchBahan = ref("");
const activeRowIndex = ref<number | null>(null);

const addKomposisiRow = () => {
  komposisi.value.push({
    bk_brg_kode: form.value.brg_kode || 0,
    bk_bhn_kode: 0,
    bk_qty: 1,
    bk_satuan: "Pcs",
    bk_spesifikasi: "",
    bhn_nama: "",
  });
};

const removeKomposisiRow = (idx: number) => {
  komposisi.value.splice(idx, 1);
};

const openBahanLookup = (idx: number) => {
  if (isSaving.value) return;
  activeRowIndex.value = idx;
  lookupBahanDialog.value = true;
};

const selectBahan = (b: any) => {
  if (activeRowIndex.value === null) return;

  const alreadyUsed = komposisi.value.some(
    (r, idx) => idx !== activeRowIndex.value && r.bk_bhn_kode === b.kode
  );
  if (alreadyUsed) {
    toast.warning(`Bahan "${b.nama}" sudah dipakai di baris lain.`);
    return;
  }

  const row = komposisi.value[activeRowIndex.value];
  row.bk_bhn_kode = b.kode;
  row.bhn_nama = b.nama;
  row.bk_satuan = b.satuan || "Pcs";
  lookupBahanDialog.value = false;
};

const filteredBahanList = computed(() => {
  if (!searchBahan.value.trim()) return bahanList.value;
  const q = searchBahan.value.toLowerCase();
  return bahanList.value.filter((b) => b.nama?.toLowerCase().includes(q));
});

const bahanHarga = (bhnKode: number) => {
  if (!bhnKode) return 0;
  return bahanList.value.find((b) => b.kode === bhnKode)?.hrgBeli ?? 0;
};

const rowSubtotal = (row: KomposisiItem) =>
  Math.round((row.bk_qty || 0) * bahanHarga(row.bk_bhn_kode));

const totalHpp = computed(() =>
  komposisi.value.reduce((sum, row) => sum + rowSubtotal(row), 0)
);

import { watch } from "vue";
watch(
  totalHpp,
  (val) => {
    form.value.brg_hrgbeli = val;
  },
  { immediate: true }
);

// ── Pilih dari Komposisi yang Ada (template) ───────────────────────────
const templateDialog = ref(false);
const templateList = ref<BarangJadiTemplate[]>([]);
const templateSearch = ref("");
const templateLoading = ref(false);

const openTemplatePicker = async () => {
  templateDialog.value = true;
  templateLoading.value = true;
  try {
    templateList.value = await barangJadiApi.getTemplateList();
  } catch (e) {
    toast.error("Gagal memuat daftar komposisi yang ada.");
  } finally {
    templateLoading.value = false;
  }
};

const filteredTemplateList = computed(() => {
  if (!templateSearch.value.trim()) return templateList.value;
  const q = templateSearch.value.toLowerCase();
  return templateList.value.filter((t) =>
    t.brg_nama?.toLowerCase().includes(q)
  );
});

const applyTemplate = async (tpl: BarangJadiTemplate) => {
  try {
    const kmp = await barangJadiApi.getKomposisi(tpl.brg_kode);
    form.value.brg_nama = tpl.brg_nama;
    form.value.brg_satuan = tpl.brg_satuan || form.value.brg_satuan;
    komposisi.value = kmp.map((row: any) => ({
      bk_brg_kode: form.value.brg_kode || 0,
      bk_bhn_kode: row.bk_bhn_kode,
      bk_qty: row.bk_qty,
      bk_satuan: row.bk_satuan,
      bk_spesifikasi: row.bk_spesifikasi || "",
      bhn_nama: row.bhn_nama,
    }));
    templateDialog.value = false;
    toast.success(
      `Resep dari "${tpl.brg_nama}" diterapkan. Kamu masih bisa mengubah nama, harga, dan komposisinya.`
    );
  } catch (e: any) {
    toast.error("Gagal memuat komposisi dari barang tersebut.");
  }
};

// ── Aksi CRUD ────────────────────────────────────────────────────────
const openCreate = async () => {
  await loadLookups();
  form.value = emptyForm();
  if (kategoriBarangJadi.value) {
    form.value.brg_ktg_kode = kategoriBarangJadi.value.kode;
  }
  komposisi.value = [];
  errors.value = {};
  dialogTitle.value = "Tambah Barang Jadi";
  dialog.value = true;
};

const openEdit = async (item: BarangJadi) => {
  await loadLookups();
  try {
    const [data, kmp] = await Promise.all([
      barangJadiApi.getById(item.brg_kode),
      barangJadiApi.getKomposisi(item.brg_kode),
    ]);
    form.value = data;
    komposisi.value = kmp;
    errors.value = {};
    dialogTitle.value = "Ubah Barang Jadi";
    dialog.value = true;
  } catch (e: any) {
    toast.error(e.response?.data?.message ?? "Gagal memuat detail barang.");
  }
};

const handleSave = async (mode: "close" | "new" = "close") => {
  if (isSaving.value) return;
  if (!validateForm()) {
    toast.warning("Periksa kembali data yang diisi.");
    return;
  }

  const invalidRow = komposisi.value.find(
    (r) => !r.bk_bhn_kode || !r.bk_qty || r.bk_qty <= 0
  );
  if (invalidRow) {
    toast.warning("Ada baris komposisi yang belum lengkap (bahan/qty).");
    return;
  }

  const bhnKodes = komposisi.value.map((r) => r.bk_bhn_kode);
  const hasDuplicate = new Set(bhnKodes).size !== bhnKodes.length;
  if (hasDuplicate) {
    toast.warning(
      "Ada bahan yang dipilih lebih dari sekali. Hapus salah satu baris duplikat."
    );
    return;
  }

  isSaving.value = true;
  try {
    const payload = { ...form.value, items: komposisi.value };
    const result = await barangJadiApi.save(payload);
    toast.success(result.message ?? "Barang jadi berhasil disimpan.");
    await fetchData();

    if (mode === "close") {
      dialog.value = false;
    } else {
      form.value = emptyForm();
      if (kategoriBarangJadi.value) {
        form.value.brg_ktg_kode = kategoriBarangJadi.value.kode;
      }
      komposisi.value = [];
      errors.value = {};
      dialogTitle.value = "Tambah Barang Jadi";
    }
  } catch (e: any) {
    toast.error(
      e.response?.data?.message ?? "Gagal menyimpan. Silakan coba lagi."
    );
  } finally {
    isSaving.value = false;
  }
};

const confirmDeleteItem = ref<BarangJadi | null>(null);
const confirmDeleteDialog = ref(false);
const askDelete = (item: BarangJadi) => {
  if (isDeleting.value) return;
  confirmDeleteItem.value = item;
  confirmDeleteDialog.value = true;
};
const handleDelete = async () => {
  if (isDeleting.value || !confirmDeleteItem.value) return;
  isDeleting.value = true;
  try {
    await barangJadiApi.delete(confirmDeleteItem.value.brg_kode);
    toast.success("Barang jadi berhasil dihapus.");
    confirmDeleteDialog.value = false;
    await fetchData();
  } catch (e: any) {
    toast.error(e.response?.data?.message ?? "Gagal menghapus.");
  } finally {
    isDeleting.value = false;
  }
};

const formatRupiah = (v: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(v || 0);
const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v || 0);
</script>

<template>
  <BaseBrowse
    ref="browseRef"
    title="Master Barang Jadi"
    :menu-id="MENU_ID"
    :icon="IconBox"
    :headers="headers"
    :items="items ?? []"
    :is-loading="isLoading"
    :selected="selected"
    @update:selected="selected = $event"
    item-value="brg_kode"
    :can-insert="canInsert"
    :can-edit="canEdit"
    :can-delete="canDelete"
    :can-export="canExport"
    search-placeholder="Cari nama barang jadi..."
    @refresh="fetchData"
    @add="openCreate"
    @edit="openEdit"
    @delete="askDelete"
  >
    <!--
      Tombol export ditaruh di slot header-actions supaya sebaris dengan
      BARU / UBAH / HAPUS / TUTUP. Kalau BaseBrowse.vue belum punya slot
      ini, tambahkan `<slot name="header-actions" />` di baris tombol
      aksinya di BaseBrowse.vue.
    -->
    <template #extra-actions>
      <v-btn size="small" variant="tonal" color="success" @click="exportCsv">
        <IconDownload :size="16" class="mr-1" /> Export
      </v-btn>
    </template>

    <template #item.brg_hrgjual="{ item }"
      ><span>{{ formatRupiah(item.brg_hrgjual) }}</span></template
    >
    <template #item.brg_hrgbeli="{ item }"
      ><span>{{ formatRupiah(item.brg_hrgbeli) }}</span></template
    >
    <template #item.brg_lastcost="{ item }"
      ><span>{{ formatRupiah(item.brg_lastcost) }}</span></template
    >
    <template #item.brg_hpp_terakhir="{ item }"
      ><span>{{ formatRupiah(item.brg_hpp_terakhir) }}</span></template
    >
    <template #item.sup_nama="{ item }"
      ><span>{{ item.sup_nama || "-" }}</span></template
    >
    <template #item.adaKomposisi="{ item }">
      <v-chip
        :color="item.brg_isboom ? 'success' : 'grey'"
        size="x-small"
        variant="flat"
      >
        {{ item.brg_isboom ? "Ya" : "-" }}
      </v-chip>
    </template>
  </BaseBrowse>

  <!-- ══════════════════════════════════════════════════════════════
       DIALOG TAMBAH / UBAH BARANG JADI
  ══════════════════════════════════════════════════════════════ -->
  <v-dialog v-model="dialog" max-width="1200" persistent scrollable>
    <v-card rounded="lg">
      <v-card-title
        class="d-flex align-center gap-2 pa-3"
        style="background: #3B5998; color: white"
      >
        <IconBox :size="20" /> {{ dialogTitle }}
      </v-card-title>

      <v-card-text class="pa-4 pt-4" style="max-height: 70vh">
        <div class="form-header-grid">
          <div class="header-fields">
            <div class="grid-fields-container">
              <div class="f-row">
                <label class="f-lbl"
                  >Nama Barang <span class="req">*</span></label
                >
                <input
                  type="text"
                  v-model="form.brg_nama"
                  class="f-inp-native"
                  :class="{ 'f-err': errors.nama }"
                  :disabled="isSaving"
                  @input="clearError('nama')"
                  placeholder="Nama barang..."
                />
              </div>

              <div class="f-row">
                <label class="f-lbl">Satuan <span class="req">*</span></label>
                <input
                  type="text"
                  v-model="form.brg_satuan"
                  list="satuan-list"
                  class="f-inp-native"
                  :class="{ 'f-err': errors.satuan }"
                  :disabled="isSaving"
                  @input="clearError('satuan')"
                  placeholder="Pcs/Box/..."
                />
                <datalist id="satuan-list">
                  <option v-for="s in satuanOptions" :key="s" :value="s" />
                </datalist>
              </div>

              <div class="f-row">
                <label class="f-lbl">Kategori</label>
                <input
                  type="text"
                  :value="kategoriBarangJadi?.nama || 'Barang Jadi'"
                  class="f-inp-native readonly-bg"
                  readonly
                />
              </div>

              <div class="f-row">
                <label class="f-lbl">Merk</label>
                <input
                  type="text"
                  v-model="form.brg_merk"
                  class="f-inp-native"
                  :disabled="isSaving"
                  placeholder="Merk..."
                />
              </div>

              <div class="f-row">
                <label class="f-lbl">Gudang</label>
                <input
                  type="text"
                  :value="
                    gudangList.find((g) => g.kode === form.brg_gdg_default)
                      ?.nama || form.brg_gdg_default
                  "
                  class="f-inp-native readonly-bg"
                  readonly
                />
              </div>

              <div class="f-row">
                <label class="f-lbl">Rekening</label>
                <input
                  type="text"
                  :value="`${
                    form.brg_rek_kode || DEFAULT_REK_KODE
                  } - ${DEFAULT_REK_NAMA}`"
                  class="f-inp-native readonly-bg"
                  readonly
                />
              </div>

              <div class="f-row">
                <label class="f-lbl">Pemasok Utama</label>
                <select
                  v-model="form.brg_sup_kode"
                  class="f-inp-native select-native"
                  :disabled="isSaving"
                >
                  <option value="">-- Pilih Supplier --</option>
                  <option
                    v-for="s in supplierList"
                    :key="s.kode"
                    :value="s.kode"
                  >
                    {{ s.nama }}
                  </option>
                </select>
              </div>

              <div class="f-row">
                <label class="f-lbl">Min Stok</label>
                <input
                  type="number"
                  v-model.number="form.brg_MIN_STOK"
                  class="f-inp-native tr"
                  :class="{ 'f-err': errors.stok }"
                  :disabled="isSaving"
                />
              </div>

              <div class="f-row">
                <label class="f-lbl">Max Stok</label>
                <input
                  type="number"
                  v-model.number="form.brg_MAX_STOK"
                  class="f-inp-native tr"
                  :disabled="isSaving"
                />
              </div>

              <div class="f-row">
                <label class="f-lbl">Status</label>
                <div
                  class="d-flex align-center"
                  style="gap: 16px; height: 28px"
                >
                  <label class="chk-native">
                    <input
                      type="checkbox"
                      v-model="form.brg_isaktif"
                      :true-value="1"
                      :false-value="0"
                      :disabled="isSaving"
                    />
                    Aktif
                  </label>
                  <label class="chk-native">
                    <input
                      type="checkbox"
                      v-model="form.brg_isstok"
                      :true-value="1"
                      :false-value="0"
                      :disabled="isSaving"
                    />
                    IsStok
                  </label>
                </div>
              </div>
            </div>

            <div class="f-row align-start mt-1">
              <label class="f-lbl mt-1">Spesifikasi</label>
              <input
                type="text"
                v-model="form.brg_spesifikasi"
                class="f-inp-native"
                :disabled="isSaving"
                placeholder="Spesifikasi barang..."
              />
            </div>

            <div
              v-if="errors.nama || errors.satuan || errors.stok"
              class="f-row align-start mt-1"
            >
              <label class="f-lbl"></label>
              <div class="f-err-text">
                <div v-if="errors.nama">{{ errors.nama }}</div>
                <div v-if="errors.satuan">{{ errors.satuan }}</div>
                <div v-if="errors.stok">{{ errors.stok }}</div>
              </div>
            </div>
          </div>

          <div class="header-summary">
            <div class="summary-box">
              <div class="summary-lbl">HARGA JUAL</div>
              <input
                type="text"
                v-model="hrgJualDisplay"
                class="summary-inp"
                :class="{ 'f-err': errors.hrgJual }"
                :disabled="isSaving"
                placeholder="0"
              />
            </div>
            <div v-if="errors.hrgJual" class="f-err-text tr mt-1">
              {{ errors.hrgJual }}
            </div>

            <div class="summary-sub-rows">
              <div class="sub-total-item">
                <span>Harga Beli (HPP) — Total Bahan :</span>
                <span class="font-weight-bold"
                  >Rp {{ fmtCurrency(totalHpp) }}</span
                >
              </div>
            </div>
          </div>
        </div>

        <div class="detail-section mt-4">
          <div class="d-flex align-center justify-space-between mb-2">
            <div class="section-title">Resep / Komposisi Bahan</div>
            <div class="d-flex gap-2">
              <v-btn
                size="x-small"
                color="secondary"
                variant="outlined"
                @click="openTemplatePicker"
                :disabled="isSaving"
              >
                <IconSearch :size="12" class="mr-1" /> Pilih dari Komposisi yang
                Ada
              </v-btn>
              <v-btn
                size="x-small"
                color="green-darken-3"
                class="font-weight-bold text-white"
                @click="addKomposisiRow"
                :disabled="isSaving"
              >
                <IconPlus :size="12" class="mr-1" /> Tambah Bahan
              </v-btn>
            </div>
          </div>

          <div class="detail-table-wrap">
            <table class="detail-table">
              <thead>
                <tr>
                  <th class="tc" style="width: 36px">NO</th>
                  <th>BAHAN</th>
                  <th style="width: 110px" class="tc">SATUAN</th>
                  <th style="width: 90px" class="tr">QTY</th>
                  <th style="width: 120px" class="tr">HARGA SATUAN</th>
                  <th style="width: 130px" class="tr">SUBTOTAL</th>
                  <th class="tc" style="width: 44px">AKSI</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, idx) in komposisi" :key="idx">
                  <td class="tc font-weight-bold color-grey">{{ idx + 1 }}</td>
                  <td>
                    <div
                      class="cell-search-group"
                      @click="openBahanLookup(idx)"
                    >
                      <input
                        type="text"
                        :value="row.bhn_nama || 'Klik untuk pilih bahan...'"
                        class="cell-inp readonly-bg"
                        readonly
                      />
                      <button
                        class="cell-btn-search"
                        type="button"
                        :disabled="isSaving"
                        @click.stop="openBahanLookup(idx)"
                      >
                        <IconSearch :size="12" />
                      </button>
                    </div>
                  </td>
                  <td>
                    <input
                      type="text"
                      v-model="row.bk_satuan"
                      list="satuan-list"
                      class="cell-inp tc"
                      :disabled="isSaving"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      v-model.number="row.bk_qty"
                      min="0.0001"
                      step="any"
                      class="cell-inp tr text-blue font-weight-bold"
                      :disabled="isSaving"
                    />
                  </td>
                  <td class="tr pr-2">
                    {{ fmtCurrency(bahanHarga(row.bk_bhn_kode)) }}
                  </td>
                  <td class="tr pr-2 font-weight-bold text-grey-darken-3">
                    {{ fmtCurrency(rowSubtotal(row)) }}
                  </td>
                  <td class="tc">
                    <button
                      class="cell-btn-delete"
                      type="button"
                      :disabled="isSaving"
                      @click="removeKomposisiRow(idx)"
                    >
                      <IconTrash :size="13" />
                    </button>
                  </td>
                </tr>
                <tr v-if="komposisi.length === 0">
                  <td colspan="7" class="tc pa-4 text-grey style-italic">
                    Belum ada komposisi bahan.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </v-card-text>

      <v-divider />
      <v-card-actions class="pa-3 dialog-actions">
        <v-spacer />
        <v-btn variant="text" @click="dialog = false" :disabled="isSaving"
          >Batal</v-btn
        >
        <v-btn
          color="secondary"
          variant="outlined"
          @click="handleSave('new')"
          :loading="isSaving"
          :disabled="isSaving"
        >
          Simpan &amp; Baru
        </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          @click="handleSave('close')"
          :loading="isSaving"
          :disabled="isSaving"
        >
          Simpan &amp; Tutup
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Lookup Bahan -->
  <v-dialog v-model="lookupBahanDialog" max-width="450" scrollable>
    <v-card rounded="lg">
      <v-card-title
        class="pa-3 font-weight-bold"
        style="font-size: 14px; background-color: #f5f5f5"
      >
        Pilih Bahan
      </v-card-title>
      <div class="pa-2">
        <v-text-field
          v-model="searchBahan"
          label="Cari Bahan..."
          density="compact"
          variant="outlined"
          append-inner-icon="mdi-magnify"
          hide-details
          clearable
        />
      </div>
      <v-divider />
      <v-card-text class="pa-0" style="height: 350px">
        <v-list density="compact" hover>
          <v-list-item
            v-for="b in filteredBahanList"
            :key="b.kode"
            @click="selectBahan(b)"
          >
            <template #title
              ><strong>{{ b.kode }}</strong> - {{ b.nama }} ({{ b.satuan }}) —
              {{ formatRupiah(b.hrgBeli) }}</template
            >
          </v-list-item>
          <v-list-item v-if="bahanList.length === 0"
            ><div class="text-center text-grey text-caption pa-4">
              Data bahan kosong.
            </div></v-list-item
          >
        </v-list>
      </v-card-text>
      <v-divider />
      <v-card-actions class="pa-2"
        ><v-spacer /><v-btn
          size="small"
          variant="text"
          @click="lookupBahanDialog = false"
          >Tutup</v-btn
        ></v-card-actions
      >
    </v-card>
  </v-dialog>

  <!-- Pilih dari Komposisi yang Ada -->
  <v-dialog v-model="templateDialog" max-width="500" scrollable>
    <v-card rounded="lg">
      <v-card-title
        class="pa-3 font-weight-bold"
        style="font-size: 14px; background-color: #f5f5f5"
      >
        Pilih dari Komposisi yang Sudah Ada
      </v-card-title>
      <div class="pa-2">
        <v-text-field
          v-model="templateSearch"
          label="Cari nama barang..."
          density="compact"
          variant="outlined"
          append-inner-icon="mdi-magnify"
          hide-details
          clearable
        />
      </div>
      <v-divider />
      <v-card-text class="pa-0" style="height: 380px">
        <div v-if="templateLoading" class="text-center pa-6">
          <v-progress-circular indeterminate size="24" color="primary" />
        </div>
        <v-list v-else density="compact" hover>
          <v-list-item
            v-for="t in filteredTemplateList"
            :key="t.brg_kode"
            @click="applyTemplate(t)"
          >
            <template #title
              ><strong>{{ t.brg_nama }}</strong></template
            >
            <template #subtitle
              >Kode sumber: {{ t.brg_kode }} — Satuan:
              {{ t.brg_satuan }}</template
            >
          </v-list-item>
          <v-list-item
            v-if="!templateLoading && filteredTemplateList.length === 0"
          >
            <div class="text-center text-grey text-caption pa-4">
              Belum ada barang jadi dengan resep tersimpan.
            </div>
          </v-list-item>
        </v-list>
      </v-card-text>
      <v-divider />
      <v-card-actions class="pa-2"
        ><v-spacer /><v-btn
          size="small"
          variant="text"
          @click="templateDialog = false"
          >Tutup</v-btn
        ></v-card-actions
      >
    </v-card>
  </v-dialog>

  <!-- Konfirmasi Hapus -->
  <v-dialog v-model="confirmDeleteDialog" max-width="400" persistent>
    <v-card rounded="lg">
      <v-card-title class="pa-4 pb-2" style="font-size: 15px; font-weight: 700"
        >Konfirmasi Hapus</v-card-title
      >
      <v-card-text class="pa-4 pt-0"
        >Yakin ingin menghapus barang
        <strong>{{ confirmDeleteItem?.brg_nama }}</strong
        >?</v-card-text
      >
      <v-divider />
      <v-card-actions class="pa-3">
        <v-spacer />
        <v-btn
          variant="text"
          @click="confirmDeleteDialog = false"
          :disabled="isDeleting"
          >Batal</v-btn
        >
        <v-btn
          color="error"
          variant="flat"
          @click="handleDelete"
          :loading="isDeleting"
          :disabled="isDeleting"
          >Ya, Hapus</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.form-header-grid {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 20px;
  align-items: start;
}
@media (max-width: 960px) {
  .form-header-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}
.header-fields {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.grid-fields-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 16px;
}
@media (max-width: 600px) {
  .grid-fields-container {
    grid-template-columns: 1fr;
  }
}
.f-row {
  display: flex;
  align-items: center;
}
.f-row.align-start {
  align-items: flex-start;
}
.f-lbl {
  width: 110px;
  font-size: 11px;
  font-weight: 600;
  color: #4b5563;
  flex-shrink: 0;
}
.req {
  color: red;
}
.f-inp-native {
  flex: 1;
  height: 28px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 0 8px;
  font-size: 11px;
  outline: none;
  background: white;
}
.f-inp-native:focus {
  border-color: #3B5998;
}
.f-inp-native.tr {
  text-align: right;
}
.select-native {
  cursor: pointer;
}
.readonly-bg {
  background-color: #f3f4f6;
  color: #6b7280;
}
.f-err {
  border-color: #ef4444 !important;
}
.f-err-text {
  flex: 1;
  font-size: 10px;
  color: #ef4444;
}
.f-err-text.tr {
  text-align: right;
}
.chk-native {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #374151;
  cursor: pointer;
}

.header-summary {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 10px;
}
.summary-box {
  background: #3B5998;
  color: white;
  padding: 10px;
  border-radius: 4px;
  text-align: right;
}
.summary-lbl {
  font-size: 10px;
  font-weight: 600;
  opacity: 0.85;
  margin-bottom: 4px;
}
.summary-inp {
  width: 100%;
  height: 30px;
  background: white;
  border: none;
  border-radius: 4px;
  padding: 0 8px;
  font-size: 20px;
  font-weight: 800;
  text-align: right;
  outline: none;
  color: #3B5998;
}
.summary-sub-rows {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
}
.sub-total-item {
  display: flex;
  justify-content: space-between;
  color: #4b5563;
  border-bottom: 1px dashed #e5e7eb;
  padding-bottom: 2px;
}

.section-title {
  font-size: 11px;
  font-weight: 700;
  color: #3B5998;
  text-transform: uppercase;
}
.detail-table-wrap {
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  overflow: auto;
}
.detail-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.detail-table thead tr {
  background: #3B5998;
}
.detail-table th {
  color: white;
  font-weight: 700;
  padding: 6px;
  white-space: nowrap;
}
.detail-table td {
  padding: 3px 4px;
  border-bottom: 1px solid #f0f0f0;
  vertical-align: middle;
}
.detail-table tbody tr:hover td {
  background: rgba(46, 46, 125, 0.03);
}
.cell-inp {
  width: 100%;
  height: 24px;
  border: 1px solid #d1d5db;
  border-radius: 3px;
  padding: 0 4px;
  font-size: 11px;
  outline: none;
}
.cell-inp:focus {
  border-color: #3B5998;
}
.cell-inp.tc {
  text-align: center;
}
.cell-inp.tr {
  text-align: right;
}
.cell-search-group {
  display: flex;
  gap: 2px;
  cursor: pointer;
}
.cell-btn-search {
  height: 24px;
  width: 24px;
  background: #3B5998;
  color: white;
  border: none;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cell-btn-delete {
  color: #ef4444;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
}
.tc {
  text-align: center;
}
.tr {
  text-align: right;
}
</style>
