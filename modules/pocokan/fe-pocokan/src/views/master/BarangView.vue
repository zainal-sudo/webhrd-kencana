<script setup lang="ts">
import { ref, computed, onMounted, watch , onActivated, onDeactivated} from "vue";
import { useToast } from "vue-toastification";
import { IconBox, IconDownload, IconRefresh, IconPlus, IconTrash } from "@tabler/icons-vue";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { useBrowse } from "@/composables/useBrowse";
import {
  barangApi,
  type Barang,
  type BarangSaveForm,
  type BarangKomposisiItem,
  type BarangBiayaItem,
} from "@/api/master/barangApi";
import { kategoriApi, type Kategori } from "@/api/master/kategoriApi";
import { jenisBarangApi, type JenisBarang } from "@/api/master/jenisBarangApi";
import { gudangApi, type Gudang } from "@/api/master/gudangApi";
import { supplierApi, type Supplier } from "@/api/master/supplierApi";
import { exportToExcel } from "@/utils/exportExcel";

const MENU_ID = "14";
const toast = useToast();
const STORAGE_KEY = "barang";
// ── Data referensi untuk dropdown ────────────────────────────────────
const kategoriList = ref<Kategori[]>([]);
const jenisBarangList = ref<JenisBarang[]>([]);
const gudangList = ref<Gudang[]>([]);
const supplierList = ref<Supplier[]>([]);

const loadingRefs = ref(false);
const failedRefs = ref<string[]>([]);
const refreshingRef = ref<string | null>(null);

type RefsKey = "kategori" | "jenisBarang" | "gudang" | "supplier";

const applyRefsData = (data: Partial<Record<RefsKey, any[]>>) => {
  if (data.kategori?.length) kategoriList.value = data.kategori;
  if (data.jenisBarang?.length) jenisBarangList.value = data.jenisBarang;
  if (data.gudang?.length) gudangList.value = data.gudang;
  if (data.supplier?.length) supplierList.value = data.supplier;
};

const loadFormRefs = async (onlyKeys?: string[], retriesLeft = 3): Promise<void> => {
  loadingRefs.value = true;
  try {
    const res = await barangApi.getFormRefs(onlyKeys ?? ["kategori", "jenisBarang", "gudang", "supplier"]);
    applyRefsData(res.data);
    failedRefs.value = (res.failed || []).filter((k) => k !== "rekening");

    if (res.partial && retriesLeft > 0) {
      const attempt = 4 - retriesLeft;
      await new Promise((resolve) => setTimeout(resolve, attempt * 800));
      return loadFormRefs(res.failed, retriesLeft - 1);
    }

    if (res.partial && retriesLeft === 0 && failedRefs.value.length) {
      toast.warning(
        `Sebagian data referensi gagal dimuat: ${failedRefs.value.join(", ")}. Klik ikon refresh di field terkait untuk mencoba lagi.`
      );
    }
  } catch (e: any) {
    if (retriesLeft > 0) {
      const attempt = 4 - retriesLeft;
      await new Promise((resolve) => setTimeout(resolve, attempt * 800));
      return loadFormRefs(onlyKeys, retriesLeft - 1);
    }
    failedRefs.value = onlyKeys ?? ["kategori", "jenisBarang", "gudang", "supplier"];
    toast.error("Gagal memuat data referensi (kategori/jenis barang/gudang/supplier).");
  } finally {
    loadingRefs.value = false;
  }
};

const retryRef = async (key: RefsKey) => {
  refreshingRef.value = key;
  try {
    const res = await barangApi.getFormRefs([key]);
    applyRefsData(res.data);
    if (res.failed?.includes(key)) {
      toast.error(`Gagal memuat ulang data ${key}.`);
    } else {
      failedRefs.value = failedRefs.value.filter((k) => k !== key);
      toast.success("Data berhasil dimuat ulang.");
    }
  } catch {
    toast.error(`Gagal memuat ulang data ${key}.`);
  } finally {
    refreshingRef.value = null;
  }
};
const filter = ref({
  search: '',
  status: 'semua'
});
onActivated(() => {
  console.log("Tab aktif kembali, melakukan refresh...");
  sessionStorage.removeItem(STORAGE_KEY);
  filter.value = { search: '', status: 'semua' };
  loadFormRefs();
});

onMounted(() => {
  loadFormRefs();
});

const selectedJenis = computed(() =>
  jenisBarangList.value.find((j) => String(j.kode) === String(form.value.jenisKode))
);
const rekeningDisplay = computed(() => {
  const j = selectedJenis.value;
  if (!j || !j.rekKode) return "-- ikut Tipe Barang --";
  return `${j.rekKode}${j.rekNama ? " - " + j.rekNama : ""}`;
});

const searchText = ref("");
const filterAktif = ref<number | "">(1);

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
} = useBrowse<Barang>({
  menuId: MENU_ID,
  fetchApi: () =>
    barangApi.getAll({
      search: searchText.value || undefined,
      isAktif: filterAktif.value,
    }),
});

const headers = [
  { title: "Kode", key: "kode", width: "90px", align: "center" },
  { title: "Nama Barang", key: "nama", minWidth: "280px" },
  { title: "Satuan", key: "satuan", width: "90px", align: "center" },
  { title: "Kategori", key: "ktgNama", minWidth: "160px" },
  { title: "Jenis Barang", key: "jenisNama", minWidth: "160px" },
  { title: "Rekening", key: "rekNama", minWidth: "180px" },
  { title: "Gudang", key: "gdgNama", minWidth: "150px" },
  { title: "Stok", key: "stok", width: "90px", align: "end" },
  { title: "Min", key: "minStok", width: "80px", align: "end" },
  { title: "Hrg Beli", key: "hrgBeli", width: "120px", align: "end" },
  { title: "Hrg Jual", key: "hrgJual", width: "120px", align: "end" },
  { title: "Hpp Terakhir", key: "lastCost", width: "130px", align: "end" },
  { title: "Supplier", key: "supNama", minWidth: "180px" },
  { title: "Ada Komposisi", key: "jmlKomposisi", width: "120px", align: "center" },
  { title: "Aktif", key: "isAktif", width: "80px", align: "center" },
];

// Helper Format Decimal 2 digit
const formatDecimal = (val: number | null | undefined): string => {
  if (val === null || val === undefined || isNaN(Number(val))) return "0,00";
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(val));
};

const exportExcelData = () => {
  const exportItems = getExportItems();
  if (!exportItems?.length) {
    toast.warning("Tidak ada data untuk diekspor.");
    return;
  }
  exportToExcel({
    title: "Export Data Master Barang",
    filenamePrefix: "master-barang",
    columns: [
      { header: "Kode", key: "kode", width: 10, align: "center" },
      { header: "Nama Barang", key: "nama", width: 30 },
      { header: "Satuan", key: "satuan", width: 10 },
      { header: "Kategori", key: "ktgNama", width: 20 },
      { header: "Jenis Barang", key: "jenisNama", width: 20 },
      { header: "Gudang", key: "gdgNama", width: 16 },
      { header: "Merk", key: "merk", width: 16 },
      { header: "Supplier", key: "supNama", width: 22 },
      { header: "Rekening", key: "rekNama", width: 22 },
      { header: "Stok", key: "stok", width: 12, align: "right" },
      { header: "Min Stok", key: "minStok", width: 12, align: "right" },
      { header: "Max Stok", key: "maxStok", width: 12, align: "right" },
      { header: "Harga Beli", key: "hrgBeli", width: 14, align: "right" },
      { header: "Harga Jual", key: "hrgJual", width: 14, align: "right" },
      { header: "Harga Min", key: "hargaMin", width: 14, align: "right" },
      { header: "Last Cost", key: "lastCost", width: 14, align: "right" },
      { header: "Disc Sales (%)", key: "discSales", width: 14, align: "right" },
      { header: "Insentif", key: "insentif", width: 14, align: "right" },
      { header: "Kode Lama", key: "kodeLama", width: 14 },
      { header: "Spesifikasi", key: "spesifikasi", width: 26 },
      { header: "Ada Komposisi", key: "jmlKomposisi", width: 14, align: "center" },
      { header: "Aktif", key: "isAktif", width: 10, align: "center" },
    ],
    rows: exportItems,
  });
};

const dialog = ref(false);
const dialogTitle = ref("");
const isSaving = ref(false);
const activeTab = ref("informasi");

const emptyForm = (): BarangSaveForm & { kode?: number } => ({
  isEdit: false,
  nama: "",
  satuan: "PCS",
  ktgKode: null,
  jenisKode: null,
  gdgDefault: null,
  isStok: 1,
  isExpired: 0,
  hrgBeli: 0,
  hrgJual: 0,
  minStok: 0,
  maxStok: 0,
  supKode: null,
  isAktif: 1,
  discSales: 0,
  merk: null,
  isProductFocus: 0,
  lastCost: 0,
  divisi: null,
  isBoom: 0,
  insentif: 0,
  hargaMin: 0,
  kodeLama: null,
  spesifikasi: null,
});
const form = ref(emptyForm());
const displayInfo = ref<{ stok?: number; dateCreate?: string; dateModified?: string; userCreate?: string; userModified?: string }>({});

const komposisiItems = ref<BarangKomposisiItem[]>([]);
const komposisiSearchResults = ref<Barang[]>([]);
const komposisiSearching = ref(false);
let komposisiSearchTimer: ReturnType<typeof setTimeout> | null = null;

const searchBahan = (q: string) => {
  if (komposisiSearchTimer) clearTimeout(komposisiSearchTimer);
  if (!q || q.length < 2) {
    komposisiSearchResults.value = [];
    return;
  }
  komposisiSearchTimer = setTimeout(async () => {
    komposisiSearching.value = true;
    try {
      const res = await barangApi.searchBarangForKomposisi(q);
      komposisiSearchResults.value = res.filter((b) => b.kode !== form.value.kode);
    } finally {
      komposisiSearching.value = false;
    }
  }, 300);
};

const addKomposisiRow = () => {
  komposisiItems.value.push({ bahanKode: null, qty: 1, satuan: "pcs", spesifikasi: "" });
};
const removeKomposisiRow = (idx: number) => {
  komposisiItems.value.splice(idx, 1);
};
const pickBahan = (idx: number, b: Barang) => {
  const row = komposisiItems.value[idx];
  row.bahanKode = b.kode;
  row.bahanNama = b.nama;
  row.satuan = row.satuan || b.satuan;
  komposisiSearchResults.value = [];
};

const biayaItems = ref<BarangBiayaItem[]>([]);
const addBiayaRow = () => {
  biayaItems.value.push({ nama: "", biaya: 0 });
};
const removeBiayaRow = (idx: number) => {
  biayaItems.value.splice(idx, 1);
};

const formatRupiah = (val: number | null | undefined): string => {
  if (val === null || val === undefined || val === ("" as any) || isNaN(Number(val))) return "";
  return new Intl.NumberFormat("id-ID").format(Number(val));
};
const parseRupiah = (str: string): number => {
  const digits = str.replace(/[^0-9]/g, "");
  return digits ? Number(digits) : 0;
};

const makeCurrencyModel = (key: "hrgBeli" | "hrgJual" | "hargaMin" | "lastCost" | "insentif") =>
  computed({
    get: () => formatRupiah(form.value[key]),
    set: (val: string) => {
      form.value[key] = parseRupiah(val);
    },
  });

const hrgBeliDisplay = makeCurrencyModel("hrgBeli");
const hrgJualDisplay = makeCurrencyModel("hrgJual");
const hargaMinDisplay = makeCurrencyModel("hargaMin");
const lastCostDisplay = makeCurrencyModel("lastCost");
const insentifDisplay = makeCurrencyModel("insentif");

const rupiah = (val: number | null | undefined): string => {
  if (val === null || val === undefined || isNaN(Number(val))) return "-";
  return `Rp ${new Intl.NumberFormat("id-ID").format(Number(val))}`;
};

const errors = ref<{ nama?: string; satuan?: string }>({});
const validateForm = (): boolean => {
  const e: typeof errors.value = {};
  if (!form.value.nama.trim()) e.nama = "Nama barang wajib diisi.";
  if (!form.value.satuan.trim()) e.satuan = "Satuan wajib diisi.";
  errors.value = e;
  if (Object.keys(e).length) activeTab.value = "informasi";
  return Object.keys(e).length === 0;
};
const clearError = (f: keyof typeof errors.value) => {
  if (errors.value[f]) delete errors.value[f];
};

const openCreate = () => {
  form.value = emptyForm();
  displayInfo.value = {};
  komposisiItems.value = [];
  biayaItems.value = [];
  errors.value = {};
  activeTab.value = "informasi";
  dialogTitle.value = "Tambah Barang";
  dialog.value = true;
  if (!supplierList.value.length) loadFormRefs(["supplier"]);
};

const openEdit = async (item: Barang) => {
  try {
    if (!supplierList.value.length || !jenisBarangList.value.length) {
      await loadFormRefs();
    }

    const [d, komposisi, biaya] = await Promise.all([
      barangApi.getById(item.kode),
      barangApi.getKomposisi(item.kode).catch(() => []),
      barangApi.getBiayaLain(item.kode).catch(() => []),
    ]);

    form.value = {
      isEdit: true,
      kode: d.kode,
      nama: d.nama,
      satuan: d.satuan,
      ktgKode: d.ktgKode,
      jenisKode: d.jenisKode,
      gdgDefault: d.gdgDefault,
      isStok: d.isStok,
      isExpired: d.isExpired,
      hrgBeli: d.hrgBeli,
      hrgJual: d.hrgJual,
      minStok: d.minStok,
      maxStok: d.maxStok,
      supKode: d.supKode !== null && d.supKode !== undefined ? String(d.supKode).trim() : null,
      isAktif: d.isAktif,
      discSales: d.discSales,
      merk: d.merk,
      isProductFocus: d.isProductFocus,
      lastCost: d.lastCost,
      divisi: d.divisi,
      isBoom: d.isBoom,
      insentif: d.insentif,
      hargaMin: d.hargaMin,
      kodeLama: d.kodeLama,
      spesifikasi: d.spesifikasi,
    };
    displayInfo.value = {
      stok: d.stok,
      dateCreate: d.dateCreate,
      dateModified: d.dateModified,
      userCreate: d.userCreate,
      userModified: d.userModified,
    };
    komposisiItems.value = komposisi.map((k) => ({ ...k }));
    biayaItems.value = biaya.map((b) => ({ ...b }));
    errors.value = {};
    activeTab.value = "informasi";
    dialogTitle.value = `Ubah Barang - ${d.nama}`;
    dialog.value = true;
  } catch (e: any) {
    if (e?.isAuthExpired) return;
    toast.error(e.response?.data?.message ?? "Gagal memuat data.");
  }
};

const handleSave = async () => {
  if (isSaving.value) return;
  if (!validateForm()) {
    toast.warning("Periksa kembali data yang diisi.");
    return;
  }
  for (const row of komposisiItems.value) {
    if (!row.bahanKode) {
      toast.warning("Ada baris Komposisi yang belum memilih barang/bahan.");
      activeTab.value = "komposisi";
      return;
    }
  }
  for (const row of biayaItems.value) {
    if (!row.nama?.trim()) {
      toast.warning("Ada baris Biaya Non Bahan Baku tanpa nama.");
      activeTab.value = "biaya";
      return;
    }
  }

  isSaving.value = true;
  try {
    await barangApi.save({
      ...form.value,
      items: komposisiItems.value,
      biayaLain: biayaItems.value,
    });
    toast.success("Data barang berhasil disimpan.");
    dialog.value = false;
    await fetchData();
  } catch (e: any) {
    toast.error(e.response?.data?.message ?? "Gagal menyimpan.");
  } finally {
    isSaving.value = false;
  }
};

const handleDelete = async (item: Barang) => {
  try {
    await barangApi.delete(item.kode);
    toast.success("Barang berhasil dihapus.");
    await fetchData();
  } catch (e: any) {
    toast.error(e.response?.data?.message ?? "Gagal menghapus.");
  }
};

const totalBiayaLain = computed(() =>
  biayaItems.value.reduce((sum, b) => sum + (Number(b.biaya) || 0), 0)
);
</script>

<template>
  <BaseBrowse
    ref="browseRef"
    :key="refreshKey"
    title="Master Data Barang"
    :menu-id="MENU_ID"
    :icon="IconBox"
    :headers="headers"
    :items="items ?? []"
    :is-loading="isLoading"
    :selected="selected"
    @update:selected="selected = $event"
    item-value="kode"
    :can-insert="canInsert"
    :can-edit="canEdit"
    :can-delete="canDelete"
    :can-export="canExport"
    :fixed-layout="false"
    search-placeholder="Cari kode / nama barang..."
    @refresh="fetchData"
    @add="openCreate"
    @edit="openEdit"
    @delete="handleDelete"
  >
    <template #filter-right-prepend>
      <v-select
        v-model="filterAktif"
        :items="[
          { title: 'Semua Status', value: '' },
          { title: 'Aktif', value: 1 },
          { title: 'Nonaktif', value: 0 },
        ]"
        item-title="title"
        item-value="value"
        density="compact"
        variant="outlined"
        hide-details
        style="max-width: 140px"
        class="mr-2"
        @update:model-value="fetchData"
      />
    </template>

    <template #extra-actions>
      <v-btn size="small" variant="tonal" color="success" @click="exportExcelData">
        <IconDownload :size="16" class="mr-1" /> Export
      </v-btn>
    </template>

    <!-- Slot Kolom Tabel Stok dengan Format Decimal 2 -->
    <template #item.stok="{ item }">
      {{ formatDecimal(item.stok) }}
    </template>
    <template #item.minStok="{ item }">
      {{ formatDecimal(item.minStok) }}
    </template>

    <template #item.hrgBeli="{ item }">
      {{ rupiah(item.hrgBeli) }}
    </template>
    <template #item.hrgJual="{ item }">
      {{ rupiah(item.hrgJual) }}
    </template>
    <template #item.lastCost="{ item }">
      {{ rupiah(item.lastCost) }}
    </template>
    <template #item.jmlKomposisi="{ item }">
      <span v-if="item.jmlKomposisi">{{ item.jmlKomposisi }}</span>
      <span v-else class="text-medium-emphasis">-</span>
    </template>
  </BaseBrowse>

  <!-- Dialog Tambah/Ubah -->
  <v-dialog v-model="dialog" max-width="960" width="90%" persistent scrollable>
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center gap-2 pa-3" style="background:#3B5998; color:white;">
        <IconBox :size="20" /> {{ dialogTitle }}
      </v-card-title>

      <v-tabs v-model="activeTab" color="primary" density="compact" class="px-2">
        <v-tab value="informasi">Informasi Barang</v-tab>
        <v-tab value="komposisi">
          Komposisi <v-chip v-if="komposisiItems.length" size="x-small" class="ml-1">{{ komposisiItems.length }}</v-chip>
        </v-tab>
        <v-tab value="biaya">
          Biaya Non Bahan Baku <v-chip v-if="biayaItems.length" size="x-small" class="ml-1">{{ biayaItems.length }}</v-chip>
        </v-tab>
      </v-tabs>
      <v-divider />

      <v-card-text class="pa-4" style="max-height: 68vh">
        <v-window v-model="activeTab">
          <!-- TAB 1: INFORMASI BARANG -->
          <v-window-item value="informasi">
            <div class="f-row mb-2">
              <label class="f-lbl">Tipe Barang</label>
              <div class="f-ref-wrap">
                <v-autocomplete
                  v-model="form.jenisKode"
                  :items="jenisBarangList"
                  item-title="nama"
                  item-value="kode"
                  density="compact"
                  variant="outlined"
                  hide-details
                  clearable
                  placeholder="-- Pilih Tipe Barang --"
                  :loading="loadingRefs || refreshingRef === 'jenisBarang'"
                  no-data-text="No data available"
                  :disabled="isSaving"
                  class="f-autocomplete"
                />
                <v-btn
                  icon
                  size="small"
                  variant="tonal"
                  :color="failedRefs.includes('jenisBarang') ? 'warning' : 'default'"
                  :loading="refreshingRef === 'jenisBarang'"
                  @click="retryRef('jenisBarang')"
                  title="Muat ulang data Tipe Barang"
                >
                  <IconRefresh :size="16" />
                </v-btn>
              </div>
            </div>

            <div class="f-row mb-2">
              <label class="f-lbl">Rekening (COA)</label>
              <input type="text" :value="rekeningDisplay" class="f-inp-native" disabled />
            </div>

            <div v-if="form.isEdit" class="f-row mb-2">
              <label class="f-lbl">Kode</label>
              <input type="text" :value="form.kode" class="f-inp-native" disabled />
            </div>

            <div class="f-row mb-2">
              <label class="f-lbl">Nama <span class="req">*</span></label>
              <input
                type="text" v-model="form.nama" class="f-inp-native"
                :class="{ 'f-err': errors.nama }" maxlength="100"
                :disabled="isSaving" @input="clearError('nama')"
                placeholder="Nama barang"
              />
            </div>

            <div class="f-row mb-2">
              <label class="f-lbl">Satuan <span class="req">*</span></label>
              <input
                type="text" v-model="form.satuan" class="f-inp-native f-inp-short"
                :class="{ 'f-err': errors.satuan }" maxlength="10"
                :disabled="isSaving" @input="clearError('satuan')"
                placeholder="PCS"
              />
            </div>

            <div class="f-row mb-2">
              <label class="f-lbl">Kategori</label>
              <div class="f-ref-wrap">
                <v-autocomplete
                  v-model="form.ktgKode"
                  :items="kategoriList"
                  item-title="nama"
                  item-value="kode"
                  density="compact"
                  variant="outlined"
                  hide-details
                  clearable
                  placeholder="-- Pilih Kategori --"
                  :loading="loadingRefs || refreshingRef === 'kategori'"
                  no-data-text="No data available"
                  :disabled="isSaving"
                  class="f-autocomplete"
                />
                <v-btn
                  icon
                  size="small"
                  variant="tonal"
                  :color="failedRefs.includes('kategori') ? 'warning' : 'default'"
                  :loading="refreshingRef === 'kategori'"
                  @click="retryRef('kategori')"
                  title="Muat ulang data Kategori"
                >
                  <IconRefresh :size="16" />
                </v-btn>
              </div>
            </div>

            <div class="f-row mb-2">
              <label class="f-lbl">Merk</label>
              <input type="text" v-model="form.merk" class="f-inp-native" maxlength="20" :disabled="isSaving" />
            </div>

            <div class="f-row mb-2">
              <label class="f-lbl">Gudang Default</label>
              <div class="f-ref-wrap">
                <v-autocomplete
                  v-model="form.gdgDefault"
                  :items="gudangList"
                  item-title="nama"
                  item-value="kode"
                  density="compact"
                  variant="outlined"
                  hide-details
                  clearable
                  placeholder="-- Pilih Gudang --"
                  :loading="loadingRefs || refreshingRef === 'gudang'"
                  no-data-text="No data available"
                  :disabled="isSaving"
                  class="f-autocomplete"
                />
                <v-btn
                  icon
                  size="small"
                  variant="tonal"
                  :color="failedRefs.includes('gudang') ? 'warning' : 'default'"
                  :loading="refreshingRef === 'gudang'"
                  @click="retryRef('gudang')"
                  title="Muat ulang data Gudang"
                >
                  <IconRefresh :size="16" />
                </v-btn>
              </div>
            </div>

            <div class="f-row mb-2">
              <label class="f-lbl">Status</label>
              <div class="f-status-group">
                <v-checkbox
                  v-model="form.isAktif" :true-value="1" :false-value="0"
                  label="Aktif" density="compact" hide-details :disabled="isSaving"
                />
                <v-checkbox
                  v-model="form.isStok" :true-value="1" :false-value="0"
                  label="IsStok" density="compact" hide-details :disabled="isSaving"
                />
              </div>
            </div>

            <div class="f-row mb-2">
              <label class="f-lbl">Harga Beli</label>
              <div class="f-currency-wrap f-inp-short">
                <span class="f-currency-prefix">Rp</span>
                <input
                  type="text" inputmode="numeric"
                  v-model="hrgBeliDisplay"
                  class="f-inp-native f-inp-currency"
                  :disabled="isSaving" placeholder="0"
                />
              </div>
              <label class="f-lbl f-lbl-2">Min Stok</label>
              <input type="number" v-model.number="form.minStok" class="f-inp-native f-inp-short" :disabled="isSaving" min="0" step="0.01" />
            </div>

            <div class="f-row mb-2">
              <label class="f-lbl">Harga Jual</label>
              <div class="f-currency-wrap f-inp-short">
                <span class="f-currency-prefix">Rp</span>
                <input
                  type="text" inputmode="numeric"
                  v-model="hrgJualDisplay"
                  class="f-inp-native f-inp-currency"
                  :disabled="isSaving" placeholder="0"
                />
              </div>
              <label class="f-lbl f-lbl-2">Max Stok</label>
              <input type="number" v-model.number="form.maxStok" class="f-inp-native f-inp-short" :disabled="isSaving" min="0" step="0.01" />
            </div>

            <div v-if="form.isEdit" class="f-row mb-2">
              <label class="f-lbl">Stok Saat Ini</label>
              <input type="text" :value="formatDecimal(displayInfo.stok ?? 0)" class="f-inp-native" disabled />
            </div>

            <div class="f-row mb-2">
              <label class="f-lbl">Pemasok Utama</label>
              <div class="f-ref-wrap">
                <v-autocomplete
                  v-model="form.supKode"
                  :items="supplierList"
                  item-title="nama"
                  item-value="kode"
                  density="compact"
                  variant="outlined"
                  hide-details
                  clearable
                  placeholder="-- Pilih Pemasok --"
                  :loading="loadingRefs || refreshingRef === 'supplier'"
                  no-data-text="No data available"
                  :disabled="isSaving"
                  class="f-autocomplete"
                />
                <v-btn
                  icon
                  size="small"
                  variant="tonal"
                  :color="failedRefs.includes('supplier') ? 'warning' : 'default'"
                  :loading="refreshingRef === 'supplier'"
                  @click="retryRef('supplier')"
                  title="Muat ulang data Pemasok"
                >
                  <IconRefresh :size="16" />
                </v-btn>
              </div>
            </div>

            <div class="f-row align-start">
              <label class="f-lbl">Spesifikasi</label>
              <textarea v-model="form.spesifikasi" class="f-inp-native f-textarea" maxlength="100" :disabled="isSaving" rows="2" />
            </div>

            <div v-if="errors.nama || errors.satuan" class="f-row align-start mt-2">
              <label class="f-lbl"></label>
              <div class="f-err-text">
                <div v-if="errors.nama">{{ errors.nama }}</div>
                <div v-if="errors.satuan">{{ errors.satuan }}</div>
              </div>
            </div>
          </v-window-item>

          <!-- TAB 2: KOMPOSISI -->
          <v-window-item value="komposisi">
            <div class="d-flex justify-space-between align-center mb-2">
              <span class="text-caption font-weight-bold text-medium-emphasis">
                Resep / komposisi barang ini — tiap baris adalah barang lain (bahan baku/kemasan) yang dipakai.
              </span>
              <v-btn size="small" variant="tonal" color="primary" @click="addKomposisiRow" :disabled="isSaving">
                <IconPlus :size="16" class="mr-1" /> Tambah Baris
              </v-btn>
            </div>

            <div v-if="!komposisiItems.length" class="text-center text-medium-emphasis pa-6">
              Belum ada komposisi. Klik "Tambah Baris" untuk menambah bahan.
            </div>

            <div
              v-for="(row, idx) in komposisiItems"
              :key="idx"
              class="komposisi-row mb-2"
            >
              <div class="komposisi-search">
                <v-autocomplete
                  v-model="row.bahanKode"
                  :items="komposisiSearchResults"
                  item-title="nama"
                  item-value="kode"
                  density="compact"
                  variant="outlined"
                  hide-details
                  :loading="komposisiSearching"
                  no-data-text="Ketik min. 2 huruf untuk cari barang..."
                  placeholder="Cari nama/kode barang..."
                  :disabled="isSaving"
                  @update:search="searchBahan"
                  @update:model-value="(v) => { const b = komposisiSearchResults.find(x => x.kode === v); if (b) pickBahan(idx, b); }"
                >
                  <template #selection>
                    {{ row.bahanNama || row.bahanKode || '-- Pilih Barang --' }}
                  </template>
                </v-autocomplete>
              </div>
              <input
                type="number" v-model.number="row.qty" class="f-inp-native komposisi-qty"
                min="0" step="0.01" placeholder="Qty" :disabled="isSaving"
              />
              <input
                type="text" v-model="row.satuan" class="f-inp-native komposisi-satuan"
                placeholder="Satuan" maxlength="10" :disabled="isSaving"
              />
              <input
                type="text" v-model="row.spesifikasi" class="f-inp-native komposisi-spek"
                placeholder="Spesifikasi (opsional)" :disabled="isSaving"
              />
              <v-btn icon size="small" variant="text" color="error" @click="removeKomposisiRow(idx)" :disabled="isSaving">
                <IconTrash :size="16" />
              </v-btn>
            </div>
          </v-window-item>

          <!-- TAB 3: BIAYA NON BAHAN BAKU -->
          <v-window-item value="biaya">
            <div class="d-flex justify-space-between align-center mb-2">
              <span class="text-caption font-weight-bold text-medium-emphasis">
                Biaya tambahan di luar bahan baku (mis. tenaga jahit, ongkos proses, dll).
              </span>
              <v-btn size="small" variant="tonal" color="primary" @click="addBiayaRow" :disabled="isSaving">
                <IconPlus :size="16" class="mr-1" /> Tambah Biaya
              </v-btn>
            </div>

            <div v-if="!biayaItems.length" class="text-center text-medium-emphasis pa-6">
              Belum ada biaya non bahan baku.
            </div>

            <div v-for="(row, idx) in biayaItems" :key="idx" class="biaya-row mb-2">
              <input
                type="text" v-model="row.nama" class="f-inp-native biaya-nama"
                placeholder="Nama biaya (mis. Tenaga Jahit)" maxlength="100" :disabled="isSaving"
              />
              <div class="f-currency-wrap biaya-nominal">
                <span class="f-currency-prefix">Rp</span>
                <input
                  type="number" v-model.number="row.biaya" class="f-inp-native f-inp-currency"
                  min="0" step="any" placeholder="0" :disabled="isSaving"
                />
              </div>
              <v-btn icon size="small" variant="text" color="error" @click="removeBiayaRow(idx)" :disabled="isSaving">
                <IconTrash :size="16" />
              </v-btn>
            </div>

            <div v-if="biayaItems.length" class="text-right text-caption font-weight-bold mt-2">
              Total Biaya Non Bahan Baku: {{ rupiah(totalBiayaLain) }}
            </div>
          </v-window-item>
        </v-window>
      </v-card-text>

      <v-divider />
      <v-card-actions class="pa-3">
        <v-spacer />
        <v-btn variant="text" @click="dialog = false" :disabled="isSaving">Batal</v-btn>
        <v-btn color="primary" variant="flat" @click="handleSave" :loading="isSaving" :disabled="isSaving">
          Simpan
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.f-row { display: flex; align-items: center; min-width: 0; }
.f-row.align-start { align-items: flex-start; }
.f-lbl {
  width: 160px;
  font-size: 11px;
  font-weight: 600;
  color: #4b5563;
  flex-shrink: 0;
}
.f-lbl-2 { width: 90px; text-align: right; padding-right: 8px; }
.req { color: red; }
.f-inp-native {
  flex: 1;
  min-width: 0;
  height: 28px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 0 8px;
  font-size: 11px;
  outline: none;
  background: white;
}
.f-inp-short { flex: 0 0 120px; }
.f-status-group { display: flex; align-items: center; gap: 16px; }
.f-textarea { height: auto; padding: 6px 8px; resize: vertical; }
.f-inp-native:focus { border-color: #3B5998; }
.f-inp-native:disabled { background-color: #f3f4f6; color: #6b7280; }
.f-err { border-color: #ef4444 !important; }
.f-err-text { flex: 1; font-size: 10px; color: #ef4444; }
.f-hint { font-size: 10px; color: #6b7280; }

.f-autocomplete { flex: 1; min-width: 0; }
.f-autocomplete :deep(.v-field) { font-size: 11px; min-height: 28px; }
.f-autocomplete :deep(.v-field__input) { min-height: 28px; padding-top: 4px; padding-bottom: 4px; }
.f-autocomplete :deep(.v-field__append-inner) { padding-top: 2px; }

.f-ref-wrap { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; }
.f-ref-wrap .f-autocomplete { flex: 1; }
.f-ref-wrap .v-btn { flex-shrink: 0; }

.f-currency-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  height: 28px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: white;
  overflow: hidden;
}
.f-currency-wrap:focus-within { border-color: #3B5998; }
.f-currency-prefix {
  flex-shrink: 0;
  padding: 0 6px;
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  background: #f3f4f6;
  height: 100%;
  display: flex;
  align-items: center;
  border-right: 1px solid #d1d5db;
}
.f-inp-currency {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: none !important;
  padding: 0 8px;
  font-size: 11px;
  outline: none;
  text-align: right;
}
.f-inp-currency:disabled { background-color: #f3f4f6; color: #6b7280; }

/* Tab Komposisi */
.komposisi-row { display: flex; align-items: center; gap: 6px; }
.komposisi-search { flex: 1 1 auto; min-width: 0; }
.komposisi-search :deep(.v-field) { font-size: 11px; min-height: 28px; }
.komposisi-qty { flex: 0 0 70px; }
.komposisi-satuan { flex: 0 0 70px; }
.komposisi-spek { flex: 0 0 160px; }

/* Tab Biaya */
.biaya-row { display: flex; align-items: center; gap: 6px; }
.biaya-nama { flex: 1 1 auto; }
.biaya-nominal { flex: 0 0 160px; }

:deep(.base-table thead th) {
  font-size: 10px !important;
}
:deep(.base-table tbody td) {
  font-size: 10.5px !important;
}
</style>