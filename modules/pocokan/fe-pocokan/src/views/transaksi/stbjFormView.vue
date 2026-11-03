<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
import { useTabsStore } from "@/stores/tabsStore";
import SearchModal from "@/components/SearchModal.vue";
import {
  IconPackage,
  IconSearch,
  IconTrash,
  IconPlus,
} from "@tabler/icons-vue";
import { stbjFormApi, type StbjForm } from "@/api/transaksi/stbjFormApi";

const route = useRoute();
const router = useRouter();
const toast = useToast();

const MENU_ID = "40"; // Sesuaikan menu ID
const isEdit = computed(() => !!route.params.nomor);
const isLoading = ref(false);
const isSaving = ref(false);
const tabsStore = useTabsStore();
const showSaveDialog = ref(false);
const showCancelDialog = ref(false);
const showCloseDialog = ref(false);
const emptyForm = (): StbjForm => ({
  isEdit: false,
  nomor: "",
  tanggal: todayLocal(),
  gdgKode: "",
  gdgNama: "",
  gdgpKode: "",
  gdgpNama: "",
  memo: "",
  detail: [],
});
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
};

const form = ref<StbjForm>({
  isEdit: false,
  nomor: "",
  tanggal: todayLocal(),
  gdgKode: "",
  gdgNama: "",
  gdgpKode: "",
  gdgpNama: "",
  memo: "",
  detail: [],
});

// ── Gudang Modal ──────────────────────────────────────────────────────
const showGudangModal = ref(false);
const gudangOptions = ref<any[]>([]);
const gudangLoading = ref(false);

const searchGudang = async (q: string) => {
  gudangLoading.value = true;
  try {
    gudangOptions.value = await stbjFormApi.getGudang(q || "");
  } catch {
    /* silent */
  } finally {
    gudangLoading.value = false;
  }
};

const openGudangModal = () => {
  showGudangModal.value = true;
  searchGudang("");
};

const selectGudang = (g: any) => {
  if (!g) return;
  form.value.gdgKode = g.kode;
  form.value.gdgNama = g.nama;
  showGudangModal.value = false;
};

// ── Barang Modal ──────────────────────────────────────────────────────
const showBarangModal = ref(false);
const barangOptions = ref<any[]>([]);
const barangLoading = ref(false);

const searchBarang = async (q: string) => {
  barangLoading.value = true;
  try {
    barangOptions.value = await stbjFormApi.getBarang(q || "");
  } catch {
    /* silent */
  } finally {
    barangLoading.value = false;
  }
};

const openBarangModal = () => {
  showBarangModal.value = true;
  searchBarang("");
};

const selectBarang = (b: any) => {
  if (!b) return;
  // Cek apakah barang sudah ada di detail
  const exist = form.value.detail.find((d) => d.brgKode === b.kode);
  if (exist) {
    toast.warning("Barang sudah ada di daftar detail.");
    return;
  }

  form.value.detail.push({
    brgKode: b.kode,
    brgNama: b.nama,
    barcode: b.barcode || b.kode,
    jumlah: 1,
    koli: 0,
    keterangan: "",
  });
  showBarangModal.value = false;
};

const removeRow = (index: number) => {
  form.value.detail.splice(index, 1);
};

// ── Computed totals ───────────────────────────────────────────────────
const totalJumlah = computed(() =>
  form.value.detail.reduce((s, d) => s + (Number(d.jumlah) || 0), 0)
);
const totalKoli = computed(() =>
  form.value.detail.reduce((s, d) => s + (Number(d.koli) || 0), 0)
);

// ── Load data edit ────────────────────────────────────────────────────
const loadData = async () => {
  const nomor = route.params.nomor as string;
  if (!nomor) {
    form.value = emptyForm(); // ✅ Reset bersih jika mode tambah baru
    return;
  }
  isLoading.value = true;
  try {
    form.value.isEdit = true;
    const res = await stbjFormApi.getDetailForm(decodeURIComponent(nomor));
    Object.assign(form.value, res);
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal mengambil data STBJ.");
    router.push({ name: "stbjBrowse" });
  } finally {
    isLoading.value = false;
  }
};

// ✅ Pantau perubahan rute: jika parameter nomor hilang (klik Tambah Baru), form langsung bersih
import { watch } from "vue";
watch(
  () => route.params.nomor,
  () => {
    loadData();
  }
);

// ── Validasi & Simpan ─────────────────────────────────────────────────
const validateSave = () => {
  if (!form.value.gdgKode) {
    toast.warning("Pilih gudang tujuan terlebih dahulu.");
    return;
  }
  if (form.value.detail.length === 0) {
    toast.warning("Minimal masukkan satu item barang.");
    return;
  }
  for (const d of form.value.detail) {
    if ((d.jumlah || 0) <= 0) {
      toast.warning(`Jumlah untuk barang "${d.brgNama}" harus lebih dari 0.`);
      return;
    }
  }
  showSaveDialog.value = true;
};

const confirmSave = async () => {
  if (isSaving.value) return;
  isSaving.value = true;
  try {
    const res = await stbjFormApi.save(form.value);
    toast.success(`STBJ ${res.data?.nomor || ""} berhasil disimpan.`);
    showSaveDialog.value = false;
    const targetPath = route.path;
    router.push({ name: "stbjBrowse" });
    await nextTick();
    tabsStore.closeTab(targetPath);
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal menyimpan STBJ.");
  } finally {
    isSaving.value = false;
  }
};

const confirmCancel = () => {
  showCancelDialog.value = false;
  router.push({ name: "stbjBrowse" });
};

const confirmClose = async () => {
  showCloseDialog.value = false;
  const targetPath = route.path; // ✅ Ambil path halaman form aktif saat ini
  router.push({ name: "stbjBrowse" }); // Pindah ke halaman list/browse
  await nextTick();
  tabsStore.closeTab(targetPath); // ✅ Tutup tab berdasarkan path form tersebut
};

onMounted(() => loadData());

const fmtQty = (v: number) =>
  new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(v || 0);
</script>

<template>
  <BaseForm
    :title="
      isEdit
        ? 'Ubah Surat Terima Barang Jadi'
        : 'Surat Terima Barang Jadi Baru (STBJ)'
    "
    :icon="IconPackage"
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
    <!-- ── Header ──────────────────────────────────────────────────── -->
    <div class="form-header-grid">
      <div class="header-fields">
        <div class="grid-fields">
          <!-- No STBJ -->
          <div class="f-row">
            <label class="f-lbl">No. STBJ</label>
            <input
              type="text"
              v-model="form.nomor"
              class="f-inp readonly-bg"
              placeholder="[ OTOMATIS ]"
              readonly
            />
          </div>

          <!-- Tanggal -->
          <div class="f-row">
            <label class="f-lbl">Tanggal</label>
            <input type="date" v-model="form.tanggal" class="f-inp" />
          </div>

          <!-- Gudang Tujuan -->
          <div class="f-row full-col">
            <label class="f-lbl">Gudang Tujuan</label>
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
                placeholder="Pilih gudang tujuan..."
              />
              <button
                class="btn-srch btn-blue"
                type="button"
                @click="openGudangModal"
              >
                <IconSearch :size="14" />
              </button>
            </div>
          </div>
        </div>

        <!-- Keterangan -->
        <div class="f-row align-start mt-1">
          <label class="f-lbl mt-1">Keterangan</label>
          <textarea
            v-model="form.memo"
            class="f-txa"
            rows="2"
            placeholder="Catatan penerimaan..."
          ></textarea>
        </div>
      </div>

      <!-- Summary Box -->
      <div class="header-summary">
        <div class="summary-box">
          <div class="summary-lbl">TOTAL JUMLAH</div>
          <div class="summary-val">{{ fmtQty(totalJumlah) }}</div>
          <div class="summary-sub">
            Total Koli: {{ fmtQty(totalKoli) }} | {{ form.detail.length }} item
          </div>
        </div>
      </div>
    </div>

    <!-- ── Tabel Detail ────────────────────────────────────────────── -->
    <div class="detail-section mt-4">
      <div class="section-title mb-2 flex justify-between align-center">
        <span>Detail Barang Jadi</span>
        <v-btn
          size="small"
          color="primary"
          variant="flat"
          @click="openBarangModal"
        >
          <template #prepend><IconPlus :size="14" /></template>
          Tambah Barang
        </v-btn>
      </div>

      <div class="tbl-wrap">
        <table class="dtl-tbl">
          <thead>
            <tr>
              <th class="tc" style="width: 36px">NO</th>
              <th style="width: 130px">BARCODE</th>
              <th>NAMA BARANG</th>
              <th style="width: 100px" class="tr th-terima">JUMLAH ✎</th>
              <th style="width: 80px" class="tr th-terima">KOLI ✎</th>
              <th style="width: 200px">KETERANGAN ✎</th>
              <th class="tc" style="width: 40px">AKSI</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="form.detail.length === 0">
              <td colspan="7" class="tc pa-6 text-grey italic">
                Belum ada item barang ditambahkan. Klik "+ Tambah Barang".
              </td>
            </tr>
            <tr v-for="(row, idx) in form.detail" :key="idx">
              <td class="tc text-grey-darken-1 font-weight-bold">
                {{ idx + 1 }}
              </td>
              <td>
                <span class="mono">{{ row.barcode }}</span>
              </td>
              <td>
                <span class="font-weight-bold text-grey-darken-4">{{
                  row.brgNama
                }}</span>
              </td>

              <!-- Qty Jumlah -->
              <td>
                <input
                  type="number"
                  v-model.number="row.jumlah"
                  class="cell-inp tr qty-inp"
                  min="0"
                />
              </td>
              <!-- Qty Koli -->
              <td>
                <input
                  type="number"
                  v-model.number="row.koli"
                  class="cell-inp tr qty-inp"
                  min="0"
                />
              </td>
              <!-- Keterangan Item -->
              <td>
                <input
                  type="text"
                  v-model="row.keterangan"
                  class="cell-inp"
                  placeholder="Ket. item..."
                />
              </td>
              <!-- Hapus Baris -->
              <td class="tc">
                <button
                  class="btn-del"
                  type="button"
                  @click="removeRow(idx)"
                  title="Hapus baris"
                >
                  <IconTrash :size="14" />
                </button>
              </td>
            </tr>
          </tbody>
          <tfoot v-if="form.detail.length > 0">
            <tr class="tfoot-row">
              <td colspan="3" class="tr pr-2 text-caption text-grey">TOTAL</td>
              <td class="tr font-weight-bold text-green-darken-4 pr-2">
                {{ fmtQty(totalJumlah) }}
              </td>
              <td class="tr font-weight-bold text-green-darken-4 pr-2">
                {{ fmtQty(totalKoli) }}
              </td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <!-- ── Dialog Simpan ───────────────────────────────────────────── -->
    <v-dialog v-model="showSaveDialog" max-width="340">
      <v-card rounded="lg">
        <v-card-title
          class="text-subtitle-1 font-weight-bold pa-3 bg-blue-darken-3 text-white"
        >
          Konfirmasi Simpan
        </v-card-title>
        <v-card-text class="pa-4 text-body-2">
          Simpan data STBJ ke gudang <strong>{{ form.gdgNama }}</strong
          >?<br />
          <span class="text-caption text-grey"
            >Total jumlah: {{ fmtQty(totalJumlah) }} |
            {{ form.detail.length }} item</span
          >
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

    <!-- ── Dialog Batal ────────────────────────────────────────────── -->
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

    <!-- ── SearchModal Gudang ──────────────────────────────────────── -->
    <SearchModal
      v-model="showGudangModal"
      title="Pilih Gudang Tujuan"
      :columns="[
        { key: 'kode', title: 'KODE', width: '90px' },
        { key: 'nama', title: 'NAMA GUDANG' },
      ]"
      :items="gudangOptions"
      :loading="gudangLoading"
      :server-search="true"
      search-placeholder="Cari kode atau nama gudang..."
      :search-keys="['kode', 'nama']"
      @select="selectGudang"
      @search="searchGudang"
    />

    <!-- ── SearchModal Barang ──────────────────────────────────────── -->
    <SearchModal
      v-model="showBarangModal"
      title="Pilih Barang Jadi"
      :columns="[
        { key: 'kode', title: 'KODE / BARCODE', width: '130px' },
        { key: 'nama', title: 'NAMA BARANG' },
      ]"
      :items="barangOptions"
      :loading="barangLoading"
      :server-search="true"
      search-placeholder="Cari kode atau nama barang..."
      :search-keys="['kode', 'nama']"
      @select="selectBarang"
      @search="searchBarang"
    />
  </BaseForm>
</template>

<style scoped>
.form-header-grid {
  display: grid;
  grid-template-columns: 1fr 280px;
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
  width: 110px;
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

/* Summary */
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
.summary-lbl {
  font-size: 10px;
  font-weight: 600;
  opacity: 0.85;
}
.summary-val {
  font-size: 26px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.summary-sub {
  font-size: 10px;
  opacity: 0.75;
  margin-top: 2px;
}

/* Table */
.section-title {
  font-size: 11px;
  font-weight: 700;
  color: #3B5998;
  text-transform: uppercase;
}
.tbl-wrap {
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  overflow: auto;
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
.qty-inp {
  background: #e8e8f5;
  border-color: #a5a5d6;
  font-weight: 700;
  color: #3B5998;
}

.btn-del {
  background: none;
  border: none;
  color: #ef5350;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
}
.btn-del:hover {
  background: #ffebee;
}

.flex {
  display: flex;
}
.justify-between {
  justify-content: space-between;
}
.align-center {
  align-items: center;
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
