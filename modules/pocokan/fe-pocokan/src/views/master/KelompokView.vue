<script setup lang="ts">
import { ref } from "vue";
import { useToast } from "vue-toastification";
import { IconList, IconDownload } from "@tabler/icons-vue";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { useBrowse } from "@/composables/useBrowse";
import { kelompokApi, type Kelompok } from "@/api/master/kelompokApi";
import { exportToExcel } from "@/utils/exportExcel";

const MENU_ID = "7";
const toast = useToast();

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
} = useBrowse<Kelompok>({ menuId: MENU_ID, fetchApi: kelompokApi.getAll });

const headers = [
  { title: "Kode", key: "kode", width: "80px", align: "center" },
  { title: "Nama", key: "nama", minWidth: "200px" },
  {
    title: "Keterangan (D/K)",
    key: "keterangan",
    width: "130px",
    align: "center",
  },
];

const keteranganLabel = (val: string) =>
  val === "D" ? "D = Debet" : val === "K" ? "K = Kredit" : "-";

// ── Export Excel (.xlsx) ────────────────────────────────────────────
const exportExcelData = () => {
  const exportItems = getExportItems();
  if (!exportItems?.length) {
    toast.warning("Tidak ada data untuk diekspor.");
    return;
  }
  exportToExcel({
    title: "Export Data Kelompok Account",
    filenamePrefix: "master-kelompok-account",
    columns: [
      { header: "Kode", key: "kode", width: 10, align: "center" },
      { header: "Nama", key: "nama", width: 34 },
      { header: "Keterangan", key: "keteranganLabel", width: 16, align: "center" },
    ],
    rows: exportItems.map((item: any) => ({
      ...item,
      keteranganLabel: keteranganLabel(item.keterangan),
    })),
  });
};

// ── Dialog ───────────────────────────────────────────────────────────
const dialog = ref(false);
const dialogTitle = ref("");
const isSaving = ref(false);

const emptyForm = () => ({ isEdit: false, kode: "", nama: "", keterangan: "" });
const form = ref(emptyForm());

// ── Validasi Form ─────────────────────────────────────────────────────
const errors = ref<{ kode?: string; nama?: string }>({});

const validateForm = (): boolean => {
  const e: typeof errors.value = {};
  if (!form.value.kode.trim()) e.kode = "Kode wajib diisi.";
  if (!form.value.nama.trim()) e.nama = "Nama wajib diisi.";
  errors.value = e;
  return Object.keys(e).length === 0;
};
const clearError = (f: keyof typeof errors.value) => { if (errors.value[f]) delete errors.value[f]; };

const openCreate = () => {
  form.value = emptyForm();
  errors.value = {};
  dialogTitle.value = "Tambah Kelompok";
  dialog.value = true;
};

const openEdit = async (item: Kelompok) => {
  try {
    const d = await kelompokApi.getById(item.kode);
    form.value = {
      isEdit: true,
      kode: d.kode,
      nama: d.nama,
      keterangan: d.keterangan,
    };
    errors.value = {};
    dialogTitle.value = "Ubah Kelompok";
    dialog.value = true;
  } catch (e: any) {
    if (e?.isAuthExpired) return; // ← skip toast, dialog sudah muncul
    toast.error(e.response?.data?.message ?? "Gagal memuat data.");
  }
};

const handleSave = async () => {
  if (isSaving.value) return;
  if (!validateForm()) {
    toast.warning("Periksa kembali data yang diisi.");
    return;
  }

  isSaving.value = true;
  try {
    await kelompokApi.save(form.value);
    toast.success("Berhasil disimpan.");
    dialog.value = false;
    await fetchData();
  } catch (e: any) {
    toast.error(e.response?.data?.message ?? "Gagal menyimpan.");
  } finally {
    isSaving.value = false;
  }
};

const handleDelete = async (item: Kelompok) => {
  try {
    await kelompokApi.delete(item.kode);
    toast.success("Berhasil dihapus.");
    await fetchData();
  } catch (e: any) {
    toast.error(e.response?.data?.message ?? "Gagal menghapus.");
  }
};
</script>

<template>
  <BaseBrowse
    ref="browseRef"
    title="Master Kelompok Account"
    :menu-id="MENU_ID"
    :icon="IconList"
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
    search-placeholder="Cari kelompok..."
    @refresh="fetchData"
    @add="openCreate"
    @edit="openEdit"
    @delete="handleDelete"
  >
    <template #extra-actions>
      <v-btn size="small" variant="tonal" color="success" @click="exportExcelData">
        <IconDownload :size="16" class="mr-1" /> Export 
      </v-btn>
    </template>

    <!-- Badge D/K -->
    <template #item.keterangan="{ item }">
      <span
        v-if="item.keterangan"
        :style="{
          background: item.keterangan === 'D' ? '#e3f2fd' : '#fce4ec',
          color: item.keterangan === 'D' ? '#1565c0' : '#c62828',
          padding: '1px 10px',
          borderRadius: '3px',
          fontSize: '11px',
          fontWeight: 700,
        }"
      >
        {{ item.keterangan === "D" ? "D = Debet" : "K = Kredit" }}
      </span>
    </template>
  </BaseBrowse>

  <!-- ── Dialog Form ── -->
  <v-dialog v-model="dialog" max-width="500" persistent>
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center gap-2 pa-3" style="background:#3B5998; color:white;">
        <IconList :size="20" /> {{ dialogTitle }}
      </v-card-title>

      <v-card-text class="pa-4 pt-4">
        <div class="grid-fields-container">

          <div class="f-row">
            <label class="f-lbl">Kode <span class="req">*</span></label>
            <input
              type="text"
              v-model="form.kode"
              class="f-inp-native"
              :class="{ 'f-err': errors.kode }"
              :disabled="isSaving || form.isEdit"
              @input="clearError('kode')"
              placeholder="Contoh: 1"
            />
          </div>

          <div class="f-row">
            <label class="f-lbl">Nama <span class="req">*</span></label>
            <input
              type="text"
              v-model="form.nama"
              class="f-inp-native"
              :class="{ 'f-err': errors.nama }"
              :disabled="isSaving"
              @input="clearError('nama')"
              placeholder="Nama kelompok"
            />
          </div>

          <div class="f-row" style="grid-column: 1 / -1;">
            <label class="f-lbl">Keterangan</label>
            <select v-model="form.keterangan" class="f-inp-native select-native" :disabled="isSaving">
              <option value="">-- Pilih D atau K --</option>
              <option value="D">D = Debet</option>
              <option value="K">K = Kredit</option>
            </select>
          </div>

        </div>

        <div v-if="errors.kode || errors.nama" class="f-row align-start mt-2">
          <label class="f-lbl"></label>
          <div class="f-err-text">
            <div v-if="errors.kode">{{ errors.kode }}</div>
            <div v-if="errors.nama">{{ errors.nama }}</div>
          </div>
        </div>
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
.grid-fields-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 16px;
}
@media (max-width: 600px) {
  .grid-fields-container { grid-template-columns: 1fr; }
}
.f-row { display: flex; align-items: center; min-width: 0; }
.f-row.align-start { align-items: flex-start; }
.f-lbl {
  width: 110px;
  font-size: 11px;
  font-weight: 600;
  color: #4b5563;
  flex-shrink: 0;
}
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
.f-inp-native:focus { border-color: #3B5998; }
.select-native { cursor: pointer; }
.f-inp-native:disabled { background-color: #f3f4f6; color: #6b7280; }
.f-err { border-color: #ef4444 !important; }
.f-err-text { flex: 1; font-size: 10px; color: #ef4444; }
</style>