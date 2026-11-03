<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
import { useTabsStore } from "@/stores/tabsStore";
import SearchModal from "@/components/SearchModal.vue";
import { nextTick } from "vue"; // Pastikan sudah di-import
import {
  IconAdjustments,
  IconSearch,
  IconRefresh,
  IconFileSpreadsheet,
  IconPlus,
  IconTrash,
} from "@tabler/icons-vue";
import {
  penyesuaianStokFormApi,
  type KoreksiForm,
  type KoreksiDetail,
} from "@/api/transaksi/penyesuaianStokFormApi";
import ExcelJS from "exceljs";

const route = useRoute();
const router = useRouter();
const toast = useToast();

const MENU_ID = "27";
const isEdit = computed(() => !!route.params.nomor);
const isLoading = ref(false);
const isSaving = ref(false);
const isLoadingBarang = ref(false);
const tabsStore = useTabsStore();
const showSaveDialog = ref(false);
const showCancelDialog = ref(false);
const showCloseDialog = ref(false);

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
};

// ── Form State ────────────────────────────────────────────────────────
const form = ref<KoreksiForm>({
  isEdit: false,
  nomor: "",
  tanggal: todayLocal(),
  gdgKode: "",
  gdgNama: "",
  keterangan: "",
  idbatch: "",
  expired: "",
  produksi: "",
  memo: "",
  detail: [],
});

// ── Formatter gaya program lama (Delphi) ───────────────────────────────
const fmtOldNum = (v: number | string | null | undefined): string => {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v) || 0;
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n));
  return n < 0 ? `(${formatted})` : formatted;
};

const fmtRp = (v: number | string | null | undefined): string =>
  "Rp " +
  new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(v) || 0);

// ── Gudang Modal ──────────────────────────────────────────────────────
const showGudangModal = ref(false);
const gudangOptions = ref<any[]>([]);
const gudangLoading = ref(false);

const searchGudang = async (q: string) => {
  gudangLoading.value = true;
  try {
    gudangOptions.value = await penyesuaianStokFormApi.getGudang(q || "");
  } catch {
    /* silent */
  } finally {
    gudangLoading.value = false;
  }
};

const openGudangModal = () => {
  if (isEdit.value) return;
  showGudangModal.value = true;
  searchGudang("");
};

const selectGudang = (g: any) => {
  if (!g) return;
  form.value.gdgKode = g.kode;
  form.value.gdgNama = g.nama;
  showGudangModal.value = false;
  form.value.detail = [];
  // Tidak lagi auto-load barang di sini — user pilih sendiri lewat
  // "Tambah Barang" (satu per satu) atau klik "Load Semua Barang".
};

// ── Load Data All: ambil seluruh barang gudang terpilih ────────────────
const loadBarangAll = async () => {
  if (!form.value.gdgKode) {
    toast.warning("Pilih gudang terlebih dahulu.");
    return;
  }
  isLoadingBarang.value = true;
  try {
    const res = await penyesuaianStokFormApi.getBarangByGudang(
      form.value.gdgKode,
      ""
    );
    form.value.detail = res.map(
      (item: any, index: number): KoreksiDetail => ({
        nourut: index + 1,
        brgKode: item.brgKode,
        brgNama: item.brgNama || "Tanpa Nama",
        barcode: String(item.brgKode || ""),
        satuan: item.satuan || "PCS",
        expired: item.expired || "",
        stokSystem: Number(item.stokSystem) || 0,
        fisik: null,
        qty: null,
        harga: Number(item.harga) || 0,
        nilai: null,
      })
    );
    toast.success(
      `Berhasil memuat ${form.value.detail.length} barang dari gudang ${form.value.gdgNama}.`
    );
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal memuat data barang.");
  } finally {
    isLoadingBarang.value = false;
  }
};

// ── Tambah Barang satu-per-satu (tanpa load semua stok gudang) ─────────
const showBarangModal = ref(false);
const barangOptions = ref<any[]>([]);
const barangLoading = ref(false);

const searchBarang = async (q: string) => {
  if (!form.value.gdgKode) return;
  barangLoading.value = true;
  try {
    const res = await penyesuaianStokFormApi.getBarangByGudang(
      form.value.gdgKode,
      q || ""
    );
    const existing = new Set(form.value.detail.map((d) => String(d.brgKode)));
    barangOptions.value = res.filter(
      (item: any) => !existing.has(String(item.brgKode))
    );
  } catch {
    /* silent */
  } finally {
    barangLoading.value = false;
  }
};

const openBarangModal = () => {
  if (!form.value.gdgKode) {
    toast.warning("Pilih gudang terlebih dahulu.");
    return;
  }
  if (isEdit.value) return;
  showBarangModal.value = true;
  searchBarang("");
};

const selectBarang = (item: any) => {
  if (!item) return;
  if (
    form.value.detail.some((d) => String(d.brgKode) === String(item.brgKode))
  ) {
    toast.warning("Barang sudah ada di daftar.");
    return;
  }
  form.value.detail.push({
    nourut: form.value.detail.length + 1,
    brgKode: item.brgKode,
    brgNama: item.brgNama || "Tanpa Nama",
    barcode: String(item.brgKode || ""),
    satuan: item.satuan || "PCS",
    expired: item.expired || "",
    stokSystem: Number(item.stokSystem) || 0,
    fisik: null,
    qty: null,
    harga: Number(item.harga) || 0,
    nilai: null,
  });
  showBarangModal.value = false;
  toast.success(`${item.brgNama} ditambahkan.`);
};

const removeBarang = (idx: number) => {
  form.value.detail.splice(idx, 1);
  form.value.detail.forEach((d, i) => (d.nourut = i + 1));
};

// ── From Excel: import kolom Fisik dari file Excel ─────────────────────
const fileInputRef = ref<HTMLInputElement | null>(null);
const isImporting = ref(false);

const triggerFromExcel = () => {
  if (!form.value.detail.length) {
    toast.warning('Klik "Load Data All" terlebih dahulu sebelum import Excel.');
    return;
  }
  fileInputRef.value?.click();
};

const onFromExcelChange = async (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  isImporting.value = true;
  try {
    const buf = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error("Sheet tidak ditemukan di file Excel.");

    const headerRow = ws.getRow(1);
    let colKode = -1;
    let colFisik = -1;
    headerRow.eachCell((cell, colNumber) => {
      const val = String(cell.value ?? "")
        .trim()
        .toLowerCase();
      if (["sku", "kode", "barcode", "kode barang"].includes(val))
        colKode = colNumber;
      if (["fisik", "qty fisik", "jumlah fisik", "stok fisik"].includes(val))
        colFisik = colNumber;
    });

    if (colKode === -1 || colFisik === -1) {
      throw new Error(
        'Format Excel tidak dikenali. Pastikan ada kolom header "SKU"/"Kode" dan "Fisik".'
      );
    }

    const byKode = new Map(
      form.value.detail.map((d) => [String(d.brgKode), d])
    );

    let matched = 0;
    let unmatched = 0;
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const kode = String(row.getCell(colKode).value ?? "").trim();
      const fisikRaw = row.getCell(colFisik).value;
      if (!kode) return;

      const target = byKode.get(kode);
      if (!target) {
        unmatched++;
        return;
      }

      const fisik = Number(fisikRaw);
      if (Number.isNaN(fisik)) return;

      target.fisik = fisik;
      recalcRow(target);
      matched++;
    });

    if (matched === 0) {
      toast.warning("Tidak ada baris yang cocok dengan barang di gudang ini.");
    } else {
      toast.success(
        `Berhasil import ${matched} barang dari Excel.` +
          (unmatched > 0
            ? ` (${unmatched} baris tidak dikenali, dilewati)`
            : "")
      );
    }
  } catch (err: any) {
    toast.error(err.message || "Gagal membaca file Excel.");
  } finally {
    isImporting.value = false;
  }
};

// ── Hitung ulang Qty & Nilai baris ──────────────────────────────────────
const recalcRow = (row: KoreksiDetail) => {
  if (
    row.fisik === null ||
    row.fisik === undefined ||
    (row.fisik as any) === ""
  ) {
    row.qty = 0;
    row.nilai = 0;
    return;
  }
  const fisik = Number(row.fisik) || 0;
  const stokSystem = Number(row.stokSystem) || 0;
  row.qty = fisik - stokSystem;
  row.nilai = row.qty * (Number(row.harga) || 0);
};

// ── Computed totals ───────────────────────────────────────────────────
const rowsBerubah = computed(() =>
  form.value.detail.filter(
    (d) => d.fisik !== null && d.fisik !== undefined && (d.fisik as any) !== ""
  )
);
const totalNilai = computed(() =>
  rowsBerubah.value.reduce((s, d) => s + (Number(d.nilai) || 0), 0)
);
const totalSelisih = computed(() =>
  rowsBerubah.value.reduce((s, d) => s + (Number(d.qty) || 0), 0)
);

// ── Load data edit ────────────────────────────────────────────────────
const loadData = async () => {
  const nomor = route.params.nomor as string;
  if (!nomor) return;
  isLoading.value = true;
  try {
    form.value.isEdit = true;
    const res = await penyesuaianStokFormApi.getDetailForm(
      decodeURIComponent(nomor)
    );
    Object.assign(form.value, res);
  } catch (e: any) {
    toast.error(
      e.response?.data?.message || "Gagal mengambil data Penyesuaian Stok."
    );
    router.push({ name: "penyesuaianStokBrowse" });
  } finally {
    isLoading.value = false;
  }
};

// ── Validasi & Simpan ─────────────────────────────────────────────────
const validateSave = () => {
  if (!form.value.gdgKode) {
    toast.warning("Pilih gudang terlebih dahulu.");
    return;
  }
  if (form.value.detail.length === 0) {
    toast.warning('Klik "Load Data All" untuk memuat barang terlebih dahulu.');
    return;
  }
  const rowsPerluDisimpan = form.value.detail.filter(
    (d) => (Number(d.qty) || 0) !== 0
  );
  if (rowsPerluDisimpan.length === 0) {
    toast.warning(
      "Tidak ada perubahan. Isi kolom Fisik untuk barang yang selisih dengan stok sistem."
    );
    return;
  }
  showSaveDialog.value = true;
};

const confirmSave = async () => {
  if (isSaving.value) return;
  isSaving.value = true;
  try {
    const res = await penyesuaianStokFormApi.save(form.value);
    toast.success(
      `Penyesuaian Stok ${res.data?.nomor || ""} berhasil disimpan.`
    );
    showSaveDialog.value = false;
    const targetPath = route.path;
    router.push({ name: "penyesuaianStokBrowse" });
    await nextTick();
    tabsStore.closeTab(targetPath);
  } catch (e: any) {
    toast.error(
      e.response?.data?.message || "Gagal menyimpan Penyesuaian Stok."
    );
  } finally {
    isSaving.value = false;
  }
};

const confirmCancel = () => {
  showCancelDialog.value = false;
  router.push({ name: "penyesuaianStokBrowse" });
};

const confirmClose = async () => {
  showCloseDialog.value = false;
  const targetPath = route.path; // ✅ Ambil path halaman form aktif saat ini
  router.push({ name: "penyesuaianStokBrowse" }); // Pindah ke halaman list/browse
  await nextTick();
  tabsStore.closeTab(targetPath); // ✅ Tutup tab berdasarkan path form tersebut
};

onMounted(() => loadData());
</script>
<template>
  <BaseForm
    :title="isEdit ? 'Ubah Penyesuaian Stok' : 'Penyesuaian Stok Baru'"
    :icon="IconAdjustments"
    :menu-id="MENU_ID"
    :is-loading="isLoading"
    :is-saving="isSaving"
    :is-edit-mode="isEdit"
    v-model:show-save-dialog="showSaveDialog"
    v-model:show-cancel-dialog="showCancelDialog"
    v-model:show-close-dialog="showCloseDialog"
    @validate-save="validateSave"
    @confirm-save="confirmSave"
    @confirm-cancel="confirmCancel"
    @confirm-close="confirmClose"
  >
    <div class="form-header-grid">
      <div class="header-fields">
        <div class="grid-fields">
          <div class="f-row">
            <label class="f-lbl">Nomor</label>
            <input
              type="text"
              v-model="form.nomor"
              class="f-inp readonly-bg"
              placeholder="[ OTOMATIS ]"
              readonly
            />
          </div>

          <div class="f-row">
            <label class="f-lbl">Tanggal</label>
            <input type="date" v-model="form.tanggal" class="f-inp" />
          </div>

          <div class="f-row full-col">
            <label class="f-lbl">Gudang</label>
            <div class="search-group">
              <input
                type="text"
                :value="form.gdgKode"
                class="f-inp readonly-bg"
                style="width: 90px; flex: none"
                readonly
                placeholder="Kode"
              />
              <input
                type="text"
                :value="form.gdgNama"
                class="f-inp readonly-bg"
                readonly
                placeholder="Klik untuk memilih gudang..."
              />
              <button
                class="btn-srch btn-blue"
                type="button"
                @click="openGudangModal"
                :disabled="isEdit"
              >
                <IconSearch :size="14" />
              </button>
            </div>
          </div>

          <div class="f-row full-col">
            <label class="f-lbl">Keterangan</label>
            <input
              type="text"
              v-model="form.keterangan"
              class="f-inp"
              placeholder="contoh. PRODUKSI, PENYESUAIAN STOK, dll"
            />
          </div>
        </div>

        <div class="f-row align-start mt-1">
          <label class="f-lbl mt-1">Memo</label>
          <textarea
            v-model="form.memo"
            class="f-txa"
            rows="2"
            placeholder="Catatan tambahan..."
          ></textarea>
        </div>
      </div>

      <div class="header-summary">
        <div class="summary-box" :class="{ 'summary-box-neg': totalNilai < 0 }">
          <div class="summary-lbl">TOTAL NILAI PENYESUAIAN</div>
          <div class="summary-val">{{ fmtOldNum(totalNilai) }}</div>
          <div class="summary-sub">
            {{ rowsBerubah.length }} barang diisi &middot; selisih qty
            {{ fmtOldNum(totalSelisih) }}
          </div>
        </div>
        <template v-if="form.gdgKode">
          <button
            class="btn-load"
            type="button"
            :disabled="isEdit"
            @click="openBarangModal"
          >
            <IconPlus :size="14" />
            Tambah Barang
          </button>
          <button
            class="btn-load btn-outline"
            type="button"
            :disabled="isLoadingBarang || isEdit"
            @click="loadBarangAll"
          >
            <IconRefresh :size="14" :class="{ spin: isLoadingBarang }" />
            Load Semua Barang
          </button>
          <button
            v-if="form.detail.length"
            class="btn-load btn-excel"
            type="button"
            :disabled="isImporting || isEdit"
            @click="triggerFromExcel"
          >
            <IconFileSpreadsheet :size="14" />
            {{ isImporting ? "Mengimpor..." : "From Excel" }}
          </button>
        </template>
        <div v-else class="po-hint">← Pilih gudang untuk memuat barang</div>
        <input
          ref="fileInputRef"
          type="file"
          accept=".xlsx,.xls"
          style="display: none"
          @change="onFromExcelChange"
        />
      </div>
    </div>

    <div class="detail-section mt-4">
      <div class="section-title mb-2">
        Detail Barang
        <span v-if="form.gdgNama" class="po-badge">{{ form.gdgNama }}</span>
      </div>

      <div class="tbl-wrap">
        <table class="dtl-tbl">
          <thead>
            <tr>
              <th class="tc" style="width: 36px">NO</th>
              <th style="width: 110px">SKU</th>
              <th>NAMA BARANG</th>
              <th style="width: 70px" class="tc">SATUAN</th>
              <th style="width: 130px" class="tc">EXPIRED</th>
              <th style="width: 95px" class="tr">FISIK ✎</th>
              <th style="width: 95px" class="tr th-terima">STOK SYSTEM</th>
              <th style="width: 80px" class="tr">QTY</th>
              <th style="width: 110px" class="tr">HARGA</th>
              <th style="width: 120px" class="tr">NILAI</th>
              <th style="width: 40px" class="tc"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!form.gdgKode">
              <td colspan="11" class="tc pa-6 text-grey italic">
                Pilih gudang terlebih dahulu.
              </td>
            </tr>
            <tr v-else-if="isLoadingBarang">
              <td colspan="11" class="tc pa-6 text-grey italic">
                Memuat data barang...
              </td>
            </tr>
            <tr v-else-if="form.detail.length === 0">
              <td colspan="11" class="tc pa-4 text-orange-darken-3">
                Belum ada barang. Klik "Tambah Barang" untuk memilih satu per
                satu, atau "Load Semua Barang" untuk memuat seluruh isi gudang
                ini.
              </td>
            </tr>
            <tr
              v-for="(row, idx) in form.detail"
              :key="row.brgKode"
              :class="{ 'row-changed': (Number(row.qty) || 0) !== 0 }"
            >
              <td class="tc text-grey-darken-1 font-weight-bold">
                {{ idx + 1 }}
              </td>
              <td>
                <span class="mono">{{ row.barcode || row.brgKode }}</span>
              </td>
              <td>
                <span class="font-weight-bold text-grey-darken-4">{{
                  row.brgNama
                }}</span>
              </td>
              <td class="tc">{{ row.satuan }}</td>

              <td>
                <input
                  type="date"
                  v-model="row.expired"
                  class="cell-inp tc"
                  style="font-size: 10px"
                  :disabled="isEdit"
                />
              </td>

              <td>
                <input
                  type="number"
                  v-model.number="row.fisik"
                  class="cell-inp tr qty-inp"
                  :class="{
                    'qty-changed': (Number(row.qty) || 0) !== 0,
                    'qty-minus': (Number(row.qty) || 0) < 0,
                  }"
                  :placeholder="fmtOldNum(row.stokSystem)"
                  step="any"
                  :disabled="isEdit"
                  @input="recalcRow(row)"
                />
              </td>

              <td class="tr text-grey">{{ fmtOldNum(row.stokSystem) }}</td>

              <td
                class="tr font-weight-bold"
                :class="
                  (row.qty ?? 0) < 0
                    ? 'text-red-darken-2'
                    : (row.qty ?? 0) > 0
                    ? 'text-green-darken-3'
                    : 'text-grey'
                "
              >
                {{ row.qty === null ? "-" : fmtOldNum(row.qty) }}
              </td>

              <td>
                <input
                  type="number"
                  v-model.number="row.harga"
                  class="cell-inp tr"
                  min="0"
                  step="any"
                  :disabled="isEdit"
                  @input="recalcRow(row)"
                />
              </td>

              <td
                class="tr"
                :class="
                  (row.nilai ?? 0) < 0
                    ? 'text-red-darken-2'
                    : (row.nilai ?? 0) > 0
                    ? 'text-green-darken-3'
                    : 'text-grey'
                "
              >
                {{ row.nilai === null ? "-" : fmtOldNum(row.nilai) }}
              </td>
              <td class="tc">
                <button
                  v-if="!isEdit"
                  type="button"
                  class="btn-del"
                  title="Hapus baris"
                  @click="removeBarang(idx)"
                >
                  <IconTrash :size="14" />
                </button>
              </td>
            </tr>
          </tbody>
          <tfoot v-if="form.detail.length > 0">
            <tr class="tfoot-row">
              <td colspan="7" class="tr pr-2 text-caption text-grey">
                TOTAL ({{ rowsBerubah.length }} diisi)
              </td>
              <td
                class="tr font-weight-bold"
                :class="
                  totalSelisih < 0 ? 'text-red-darken-2' : 'text-green-darken-4'
                "
              >
                {{ fmtOldNum(totalSelisih) }}
              </td>
              <td></td>
              <td
                class="tr font-weight-bold pr-2"
                :class="
                  totalNilai < 0 ? 'text-red-darken-2' : 'text-green-darken-4'
                "
              >
                {{ fmtOldNum(totalNilai) }}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <v-dialog v-model="showSaveDialog" max-width="360">
      <v-card rounded="lg">
        <v-card-title
          class="text-subtitle-1 font-weight-bold pa-3 bg-blue-darken-3 text-white"
        >
          Konfirmasi Simpan
        </v-card-title>
        <v-card-text class="pa-4 text-body-2">
          Simpan penyesuaian stok gudang <strong>{{ form.gdgNama }}</strong
          >?<br />
          <span class="text-caption text-grey">
            {{ rowsBerubah.length }} barang diisi | Total nilai:
            {{ fmtOldNum(totalNilai) }}
          </span>
        </v-card-text>
        <v-card-actions class="pa-2 bg-grey-lighten-4 justify-end">
          <v-btn size="small" variant="outlined" @click="showSaveDialog = false"
            >Batal</v-btn
          >
          <v-btn
            size="small"
            color="primary"
            variant="flat"
            class="px-4"
            :loading="isSaving"
            @click="confirmSave"
            >Ya, Simpan</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showCancelDialog" max-width="320">
      <v-card rounded="lg">
        <v-card-title
          class="text-subtitle-1 font-weight-bold pa-3 bg-red-darken-4 text-white"
        >
          Batalkan
        </v-card-title>
        <v-card-text class="pa-4 text-body-2">
          Keluar dari halaman ini? Perubahan yang belum disimpan akan hilang.
        </v-card-text>
        <v-card-actions class="pa-2 bg-grey-lighten-4 justify-end">
          <v-btn
            size="small"
            variant="outlined"
            @click="showCancelDialog = false"
            >Kembali</v-btn
          >
          <v-btn
            size="small"
            color="error"
            variant="flat"
            @click="confirmCancel"
            >Ya, Keluar</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <SearchModal
      v-model="showGudangModal"
      title="Pilih Gudang"
      :columns="[
        { key: 'kode', title: 'KODE', width: '90px' },
        { key: 'nama', title: 'NAMA GUDANG' },
        { key: 'pj', title: 'PJ', width: '150px' },
      ]"
      :items="gudangOptions"
      :loading="gudangLoading"
      :server-search="true"
      search-placeholder="Cari kode atau nama gudang..."
      :search-keys="['kode', 'nama']"
      @select="selectGudang"
      @search="searchGudang"
    />

    <SearchModal
      v-model="showBarangModal"
      title="Tambah Barang"
      :columns="[
        { key: 'brgKode', title: 'SKU', width: '110px' },
        { key: 'brgNama', title: 'NAMA BARANG' },
        { key: 'satuan', title: 'SATUAN', width: '80px' },
        {
          key: 'stokSystem',
          title: 'STOK SYSTEM',
          width: '110px',
          align: 'right',
        },
      ]"
      :items="barangOptions"
      :loading="barangLoading"
      :server-search="true"
      search-placeholder="Cari SKU atau nama barang..."
      :search-keys="['brgKode', 'brgNama']"
      @select="selectBarang"
      @search="searchBarang"
    />
  </BaseForm>
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
.grid-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 16px;
}
.full-col {
  grid-column: 1 / -1;
}
@media (max-width: 600px) {
  .grid-fields {
    grid-template-columns: 1fr;
  }
}

.f-row {
  display: flex;
  align-items: center;
}
.align-start {
  align-items: flex-start !important;
}
.f-lbl {
  width: 100px;
  font-size: 11px;
  font-weight: 600;
  color: #4b5563;
  flex-shrink: 0;
}
.f-inp,
.f-txa {
  flex: 1;
  height: 28px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 0 8px;
  font-size: 11px;
  outline: none;
}
.f-txa {
  height: auto;
  padding: 4px 8px;
}
.f-inp:focus,
.f-txa:focus {
  border-color: #1976d2;
}
.readonly-bg {
  background: #f3f4f6;
  color: #6b7280;
}

.search-group {
  display: flex;
  flex: 1;
  gap: 4px;
}
.btn-srch {
  height: 28px;
  width: 32px;
  color: white;
  border: none;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}
.btn-blue {
  background: #3B5998;
}
.btn-blue:disabled {
  background: #9e9e9e;
  cursor: not-allowed;
}

.btn-load {
  margin-top: 10px;
  width: 100%;
  height: 32px;
  background: #3B5998;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.btn-load:disabled {
  background: #9e9e9e;
  cursor: not-allowed;
}
.btn-outline {
  background: white;
  color: #3B5998;
  border: 1px solid #3B5998;
  margin-top: 6px;
}
.btn-outline:disabled {
  background: #f3f4f6;
  color: #9e9e9e;
  border-color: #d1d5db;
}
.btn-excel {
  background: #1e7e34;
  margin-top: 6px;
}
.btn-excel:disabled {
  background: #9e9e9e;
}
.btn-del {
  background: none;
  border: none;
  color: #b91c1c;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 3px;
}
.btn-del:hover {
  background: #fee2e2;
}
.spin {
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.header-summary {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 12px;
}
.summary-box {
  background: #3B5998;
  color: white;
  padding: 12px;
  border-radius: 4px;
  text-align: right;
}
.summary-box-neg {
  background: #b91c1c;
}
.summary-lbl {
  font-size: 10px;
  font-weight: 600;
  opacity: 0.85;
}
.summary-val {
  font-size: 22px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.summary-sub {
  font-size: 10px;
  opacity: 0.75;
  margin-top: 2px;
}
.po-hint {
  margin-top: 10px;
  font-size: 10px;
  color: #9ca3af;
  text-align: center;
  font-style: italic;
}

.section-title {
  font-size: 11px;
  font-weight: 700;
  color: #3B5998;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: 8px;
}
.po-badge {
  font-size: 10px;
  font-weight: 600;
  color: #3B5998;
  background: #e8e8f5;
  padding: 1px 8px;
  border-radius: 10px;
  text-transform: none;
}
.tbl-wrap {
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  overflow: auto;
  max-height: 70vh;
}
.dtl-tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.dtl-tbl thead tr {
  background: #3B5998;
}
.dtl-tbl th {
  color: white;
  font-weight: 700;
  padding: 6px;
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 2;
  background: #3B5998;
}
.th-terima {
  background: #3B5998 !important;
}
.dtl-tbl td {
  padding: 3px 4px;
  border-bottom: 1px solid #f0f0f0;
  vertical-align: middle;
}
.dtl-tbl tbody tr:hover td {
  background: rgba(21, 101, 192, 0.03);
}
.dtl-tbl tfoot .tfoot-row td {
  background: #f5f5f5;
  border-top: 2px solid #e0e0e0;
  padding: 5px 4px;
}

.row-changed td {
  background: rgba(46, 46, 125, 0.02);
}
.mono {
  font-family: monospace;
  font-size: 10px;
  color: #6b7280;
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
.cell-inp:disabled {
  background: #f3f4f6;
  color: #9ca3af;
  cursor: not-allowed;
}
.cell-inp::placeholder {
  color: #b8b8d8;
  font-weight: 400;
}
.qty-inp {
  background: #e8e8f5;
  border-color: #a5a5d6;
  font-weight: 700;
  color: #3B5998;
}
.qty-inp:focus {
  border-color: #3B5998;
}
.qty-changed {
  background: #fff9e6 !important;
  border-color: #facc15 !important;
}
.qty-minus {
  background: #ffebee !important;
  border-color: #ef9a9a !important;
  color: #c62828 !important;
}

.tc {
  text-align: center;
}
.tr {
  text-align: right;
}
.pr-2 {
  padding-right: 8px;
}
.mt-1 {
  margin-top: 4px;
}
.mt-4 {
  margin-top: 16px;
}
.mb-2 {
  margin-bottom: 8px;
}
.italic {
  font-style: italic;
}
.pa-4 {
  padding: 16px;
}
.pa-6 {
  padding: 24px;
}
</style>
