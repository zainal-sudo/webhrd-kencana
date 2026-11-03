<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
import { useTabsStore } from "@/stores/tabsStore";
import SearchModal from "@/components/SearchModal.vue";
import {
  IconArrowsTransferDown,
  IconSearch,
  IconTrash,
  IconPlus,
} from "@tabler/icons-vue";
import { mutasiFormApi, type MutasiForm } from "@/api/transaksi/mutasiFormApi";

const route = useRoute();
const router = useRouter();
const toast = useToast();

const MENU_ID = "13"; // Sesuaikan Menu ID Anda
const isEdit = computed(() => !!route.params.nomor);
const isLoading = ref(false);
const isSaving = ref(false);
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

const form = ref<MutasiForm>({
  isEdit: false,
  nomor: "",
  tanggal: todayLocal(),
  gdgAsal: "",
  gdgAsalNama: "",
  gdgTujuan: "",
  gdgTujuanNama: "",
  memo: "",
  detail: [],
});

// Modal Gudang Selector
const activeGudangType = ref<"asal" | "tujuan">("asal");
const showGudangModal = ref(false);
const gudangOptions = ref<any[]>([]);
const gudangLoading = ref(false);

const searchGudang = async (q: string) => {
  gudangLoading.value = true;
  try {
    gudangOptions.value = await mutasiFormApi.getGudang(q || "");
  } finally {
    gudangLoading.value = false;
  }
};

const openGudangModal = (type: "asal" | "tujuan") => {
  activeGudangType.value = type;
  showGudangModal.value = true;
  searchGudang("");
};

const selectGudang = (g: any) => {
  if (!g) return;
  if (activeGudangType.value === "asal") {
    form.value.gdgAsal = g.kode;
    form.value.gdgAsalNama = g.nama;
  } else {
    form.value.gdgTujuan = g.kode;
    form.value.gdgTujuanNama = g.nama;
  }
  showGudangModal.value = false;
};

// Modal Barang Selector
const showBarangModal = ref(false);
const barangOptions = ref<any[]>([]);
const barangLoading = ref(false);

const searchBarang = async (q: string) => {
  if (!form.value.gdgAsal) {
    toast.warning("Pilih Gudang Asal terlebih dahulu.");
    return;
  }
  barangLoading.value = true;
  try {
    // Kirim gdgAsal saat mengambil data barang
    barangOptions.value = await mutasiFormApi.getBarang(
      q || "",
      form.value.gdgAsal
    );
  } finally {
    barangLoading.value = false;
  }
};

const openBarangModal = () => {
  if (!form.value.gdgAsal) {
    toast.warning("Pilih Gudang Asal terlebih dahulu.");
    return;
  }
  showBarangModal.value = true;
  searchBarang("");
};

const selectBarang = (b: any) => {
  if (!b) return;

  // Cek apakah barang dengan kode yang sama sudah ada di tabel detail
  const isDuplicate = form.value.detail.some((item) => item.brgKode === b.kode);

  if (isDuplicate) {
    toast.warning(
      `Barang dengan kode ${b.kode} (${b.nama}) sudah ada di dalam daftar.`
    );
    return; // Batalkan penambahan
  }

  // Jika belum ada, masukkan ke array detail
  form.value.detail.push({
    brgKode: b.kode,
    brgNama: b.nama,
    barcode: b.barcode || b.kode,
    qty: 1,
    expired: "0000-00-00",
    keterangan: "",
  });

  showBarangModal.value = false;
};

const removeRow = (index: number) => {
  form.value.detail.splice(index, 1);
};

const totalQty = computed(() =>
  form.value.detail.reduce((sum, item) => sum + (Number(item.qty) || 0), 0)
);

const loadData = async () => {
  const nomor = route.params.nomor as string;
  if (!nomor) return;
  isLoading.value = true;
  try {
    form.value.isEdit = true;
    const res = await mutasiFormApi.getDetailForm(decodeURIComponent(nomor));
    Object.assign(form.value, res);
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal mengambil data Mutasi.");
    router.push({ name: "mutasiBrowse" });
  } finally {
    isLoading.value = false;
  }
};

const validateSave = () => {
  if (!form.value.gdgAsal)
    return toast.warning("Pilih Gudang Asal terlebih dahulu.");
  if (!form.value.gdgTujuan)
    return toast.warning("Pilih Gudang Tujuan terlebih dahulu.");
  if (form.value.gdgAsal === form.value.gdgTujuan) {
    return toast.warning("Gudang Asal dan Gudang Tujuan tidak boleh sama.");
  }
  if (form.value.detail.length === 0)
    return toast.warning("Minimal masukkan satu item barang.");
  showSaveDialog.value = true;
};

const confirmSave = async () => {
  if (isSaving.value) return;
  isSaving.value = true;
  try {
    const res = await mutasiFormApi.save(form.value);
    toast.success(`Mutasi ${res.data?.nomor || ""} berhasil disimpan.`);
    showSaveDialog.value = false;
    const targetPath = route.path;
    router.push({ name: "mutasiBrowse" });
    await nextTick();
    tabsStore.closeTab(targetPath);
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal menyimpan Mutasi.");
  } finally {
    isSaving.value = false;
  }
};

onMounted(() => {
  loadData();
});
</script>

<template>
  <BaseForm
    :title="isEdit ? 'Ubah Mutasi Gudang' : 'Mutasi Gudang Baru'"
    :icon="IconArrowsTransferDown"
    :menu-id="MENU_ID"
    :is-loading="isLoading"
    :is-saving="isSaving"
    :is-edit-mode="isEdit"
    v-model:show-save-dialog="showSaveDialog"
    v-model:show-cancel-dialog="showCancelDialog"
    v-model:show-close-dialog="showCloseDialog"
    @validate-save="validateSave"
    @confirm-save="confirmSave"
    @confirm-cancel="router.push({ name: 'mutasiBrowse' })"
    @confirm-close="router.push({ name: 'mutasiBrowse' })"
  >
    <div class="form-header-grid">
      <div class="header-fields">
        <div class="grid-fields">
          <div class="f-row">
            <label class="f-lbl">No. Mutasi</label>
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
            <label class="f-lbl">Gudang Asal</label>
            <div class="search-group">
              <input
                type="text"
                :value="form.gdgAsal"
                class="f-inp readonly-bg"
                style="width: 90px; flex: none"
                readonly
              />
              <input
                type="text"
                :value="form.gdgAsalNama"
                class="f-inp readonly-bg"
                readonly
                placeholder="Pilih gudang asal..."
              />
              <button
                class="btn-srch btn-blue"
                type="button"
                @click="openGudangModal('asal')"
              >
                <IconSearch :size="14" />
              </button>
            </div>
          </div>
          <div class="f-row full-col">
            <label class="f-lbl">Gudang Tujuan</label>
            <div class="search-group">
              <input
                type="text"
                :value="form.gdgTujuan"
                class="f-inp readonly-bg"
                style="width: 90px; flex: none"
                readonly
              />
              <input
                type="text"
                :value="form.gdgTujuanNama"
                class="f-inp readonly-bg"
                readonly
                placeholder="Pilih gudang tujuan..."
              />
              <button
                class="btn-srch btn-blue"
                type="button"
                @click="openGudangModal('tujuan')"
              >
                <IconSearch :size="14" />
              </button>
            </div>
          </div>
        </div>
        <div class="f-row align-start mt-1">
          <label class="f-lbl mt-1">Keterangan</label>
          <textarea
            v-model="form.memo"
            class="f-txa"
            rows="2"
            placeholder="Catatan mutasi..."
          ></textarea>
        </div>
      </div>

      <div class="header-summary">
        <div class="summary-box">
          <div class="summary-lbl">TOTAL QTY</div>
          <div class="summary-val">{{ totalQty }}</div>
          <div class="summary-sub">{{ form.detail.length }} item barang</div>
        </div>
      </div>
    </div>

    <div class="detail-section mt-4">
      <div class="section-title mb-2 flex justify-between align-center">
        <span>Detail Item Mutasi</span>
        <v-btn
          size="small"
          color="primary"
          variant="flat"
          @click="openBarangModal"
        >
          <template #prepend><IconPlus :size="14" /></template>Tambah Barang
        </v-btn>
      </div>

      <div class="tbl-wrap">
        <table class="dtl-tbl">
          <thead>
            <tr>
              <th class="tc" style="width: 36px">NO</th>
              <th style="width: 130px">BARCODE</th>
              <th>NAMA BARANG</th>
              <th style="width: 100px" class="tr">QTY ✎</th>
              <th style="width: 130px" class="tc">EXPIRED ✎</th>
              <th style="width: 200px">KETERANGAN ✎</th>
              <th class="tc" style="width: 40px">AKSI</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="form.detail.length === 0">
              <td colspan="7" class="tc pa-6 text-grey italic">
                Belum ada item barang ditambahkan.
              </td>
            </tr>
            <tr v-for="(row, idx) in form.detail" :key="idx">
              <td class="tc font-weight-bold">{{ idx + 1 }}</td>
              <td>
                <span class="mono">{{ row.barcode }}</span>
              </td>
              <td>{{ row.brgNama }}</td>
              <td>
                <input
                  type="number"
                  v-model.number="row.qty"
                  class="cell-inp tr qty-inp"
                  min="1"
                />
              </td>
              <td>
                <input type="date" v-model="row.expired" class="cell-inp tc" />
              </td>
              <td>
                <input
                  type="text"
                  v-model="row.keterangan"
                  class="cell-inp"
                  placeholder="Ket item..."
                />
              </td>
              <td class="tc">
                <button class="btn-del" type="button" @click="removeRow(idx)">
                  <IconTrash :size="14" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <SearchModal
      v-model="showGudangModal"
      :title="
        activeGudangType === 'asal'
          ? 'Pilih Gudang Asal'
          : 'Pilih Gudang Tujuan'
      "
      :columns="[
        { key: 'kode', title: 'KODE', width: '90px' },
        { key: 'nama', title: 'NAMA GUDANG' },
      ]"
      :items="gudangOptions"
      :loading="gudangLoading"
      :server-search="true"
      search-placeholder="Cari gudang..."
      :search-keys="['kode', 'nama']"
      @select="selectGudang"
      @search="searchGudang"
    />

    <SearchModal
      v-model="showBarangModal"
      title="Pilih Barang & Stok"
      :columns="[
        { key: 'kode', title: 'KODE', width: '120px' },
        { key: 'nama', title: 'NAMA BARANG' },
        { key: 'stok', title: 'STOK', width: '90px', align: 'right' },
      ]"
      :items="barangOptions"
      :loading="barangLoading"
      :server-search="true"
      search-placeholder="Cari barang..."
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
}
.btn-blue {
  background: #3B5998;
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
.summary-lbl {
  font-size: 10px;
  font-weight: 600;
  opacity: 0.85;
}
.summary-val {
  font-size: 26px;
  font-weight: 800;
}
.summary-sub {
  font-size: 10px;
  opacity: 0.75;
  margin-top: 2px;
}
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
}
.dtl-tbl td {
  padding: 3px 4px;
  border-bottom: 1px solid #f0f0f0;
  vertical-align: middle;
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
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
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
.mt-1 {
  margin-top: 4px;
}
.mt-4 {
  margin-top: 16px;
}
.mb-2 {
  margin-bottom: 8px;
}
.pa-6 {
  padding: 24px;
}
.italic {
  font-style: italic;
}
</style>
