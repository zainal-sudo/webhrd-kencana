<script setup lang="ts">
import { ref } from "vue";
import { useToast } from "vue-toastification";
import { IconBuildingWarehouse, IconDownload } from "@tabler/icons-vue";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { useBrowse } from "@/composables/useBrowse";
import { gudangApi, type Gudang } from "@/api/master/gudangApi";
import { exportToExcel } from "@/utils/exportExcel";

const MENU_ID = "16"; // Pastikan ID ini sesuai di database
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
} = useBrowse<Gudang>({ menuId: MENU_ID, fetchApi: gudangApi.getAll });

const headers = [
  { title: "Kode", key: "kode", width: "100px", align: "center" },
  { title: "Nama Gudang", key: "nama", minWidth: "200px" },
  { title: "Penanggung Jawab", key: "penanggungjawab", minWidth: "150px" },
  { title: "Keterangan", key: "keterangan", minWidth: "200px" },
];

// ── Export Excel (.xlsx) ────────────────────────────────────────────
const exportExcelData = () => {
  const exportItems = getExportItems();
  if (!exportItems?.length) {
    toast.warning("Tidak ada data untuk diekspor.");
    return;
  }
  exportToExcel({
    title: "Export Data Gudang",
    filenamePrefix: "master-gudang",
    columns: [
      { header: "Kode", key: "kode", width: 12, align: "center" },
      { header: "Nama Gudang", key: "nama", width: 30 },
      { header: "Penanggung Jawab", key: "penanggungjawab", width: 24 },
      { header: "Keterangan", key: "keterangan", width: 30 },
    ],
    rows: exportItems,
  });
};

// ── Dialog ───────────────────────────────────────────────────────────
const dialog = ref(false);
const dialogTitle = ref("");
const isSaving = ref(false);

const emptyForm = () => ({ isEdit: false, kode: "", nama: "", penanggungjawab: "", keterangan: "" });
const form = ref(emptyForm());

// ── Validasi Form ─────────────────────────────────────────────────────
const errors = ref<{ kode?: string; nama?: string }>({});

const validateForm = (): boolean => {
  const e: typeof errors.value = {};
  if (!form.value.kode.trim()) e.kode = "Kode gudang wajib diisi.";
  if (!form.value.nama.trim()) e.nama = "Nama gudang wajib diisi.";
  errors.value = e;
  return Object.keys(e).length === 0;
};
const clearError = (f: keyof typeof errors.value) => { if (errors.value[f]) delete errors.value[f]; };

const openCreate = () => {
  form.value = emptyForm();
  errors.value = {};
  dialogTitle.value = "Tambah Gudang";
  dialog.value = true;
};

const openEdit = (item: Gudang) => {
  form.value = {
    isEdit: true,
    kode: item.kode,
    nama: item.nama,
    penanggungjawab: item.penanggungjawab,
    keterangan: item.keterangan,
  };
  errors.value = {};
  dialogTitle.value = "Ubah Gudang";
  dialog.value = true;
};

const handleSave = async () => {
  if (isSaving.value) return;
  if (!validateForm()) {
    toast.warning("Periksa kembali data yang diisi.");
    return;
  }

  isSaving.value = true;
  try {
    await gudangApi.save(form.value);
    toast.success("Gudang berhasil disimpan.");
    dialog.value = false;
    await fetchData();
  } catch (e: any) {
    toast.error(e.response?.data?.message ?? "Gagal menyimpan.");
  } finally {
    isSaving.value = false;
  }
};

const handleDelete = async (item: Gudang) => {
  try {
    await gudangApi.delete(item.kode);
    toast.success("Gudang berhasil dihapus.");
    await fetchData();
  } catch (e: any) {
    toast.error(e.response?.data?.message ?? "Gagal menghapus.");
  }
};
</script>

<template>
  <BaseBrowse
    ref="browseRef"
    title="Master Data Gudang"
    :menu-id="MENU_ID"
    :icon="IconBuildingWarehouse"
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
    search-placeholder="Cari gudang..."
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
  </BaseBrowse>

  <!-- Dialog Tambah/Ubah -->
  <v-dialog v-model="dialog" max-width="600" persistent>
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center gap-2 pa-3" style="background:#3B5998; color:white;">
        <IconBuildingWarehouse :size="20" /> {{ dialogTitle }}
      </v-card-title>

      <v-card-text class="pa-4 pt-4">
        <div class="grid-fields-container">

          <div class="f-row">
            <label class="f-lbl">Kode Gudang <span class="req">*</span></label>
            <input
              type="text"
              v-model="form.kode"
              class="f-inp-native"
              :class="{ 'f-err': errors.kode }"
              :disabled="isSaving || form.isEdit"
              @input="clearError('kode')"
              placeholder="Contoh: GDG01"
            />
          </div>

          <div class="f-row">
            <label class="f-lbl">Nama Gudang <span class="req">*</span></label>
            <input
              type="text"
              v-model="form.nama"
              class="f-inp-native"
              :class="{ 'f-err': errors.nama }"
              :disabled="isSaving"
              @input="clearError('nama')"
              placeholder="Nama gudang"
            />
          </div>

          <div class="f-row">
            <label class="f-lbl">Penanggung Jawab</label>
            <input
              type="text"
              v-model="form.penanggungjawab"
              class="f-inp-native"
              :disabled="isSaving"
              placeholder="Nama PJ"
            />
          </div>

          <div class="f-row">
            <label class="f-lbl">Keterangan</label>
            <input
              type="text"
              v-model="form.keterangan"
              class="f-inp-native"
              :disabled="isSaving"
              placeholder="Keterangan tambahan"
            />
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
  width: 130px;
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
.f-inp-native:disabled { background-color: #f3f4f6; color: #6b7280; }
.f-err { border-color: #ef4444 !important; }
.f-err-text { flex: 1; font-size: 10px; color: #ef4444; }
</style>