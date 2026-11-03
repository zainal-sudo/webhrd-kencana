<script setup lang="ts">
import { ref } from "vue";
import { useToast } from "vue-toastification";
import { IconBuilding, IconDownload } from "@tabler/icons-vue";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { useBrowse } from "@/composables/useBrowse";
import { unitApi, type Unit } from "@/api/master/unitApi";
import { exportToExcel } from "@/utils/exportExcel";

const MENU_ID = "6"; // Sesuai dengan tmenu Unit (MEN_ID = 6)
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
} = useBrowse<Unit>({ menuId: MENU_ID, fetchApi: unitApi.getAll });

const headers = [
  { title: "Id", key: "kode", width: "120px", align: "center" },
  { title: "Pabrik", key: "nama", minWidth: "300px" },
];

// ── Export Excel (.xlsx) ────────────────────────────────────────────
const exportExcelData = () => {
  const exportItems = getExportItems();
  if (!exportItems?.length) {
    toast.warning("Tidak ada data untuk diekspor.");
    return;
  }
  exportToExcel({
    title: "Export Data Unit",
    filenamePrefix: "master-unit",
    columns: [
      { header: "Id", key: "kode", width: 15, align: "center" },
      { header: "Pabrik", key: "nama", width: 35 },
    ],
    rows: exportItems,
  });
};

// ── Dialog ───────────────────────────────────────────────────────────
const dialog = ref(false);
const dialogTitle = ref("");
const isSaving = ref(false);

const emptyForm = () => ({ isEdit: false, kode: "", nama: "" });
const form = ref(emptyForm());

// ── Validasi Form ─────────────────────────────────────────────────────
const errors = ref<{ kode?: string; nama?: string }>({});

const validateForm = (): boolean => {
  const e: typeof errors.value = {};
  if (!form.value.kode.trim()) e.kode = "Id unit wajib diisi.";
  if (!form.value.nama.trim()) e.nama = "Nama pabrik wajib diisi.";
  errors.value = e;
  return Object.keys(e).length === 0;
};
const clearError = (f: keyof typeof errors.value) => { if (errors.value[f]) delete errors.value[f]; };

const openCreate = () => {
  form.value = emptyForm();
  errors.value = {};
  dialogTitle.value = "Tambah Unit";
  dialog.value = true;
};

const openEdit = (item: Unit) => {
  form.value = {
    isEdit: true,
    kode: item.kode,
    nama: item.nama,
  };
  errors.value = {};
  dialogTitle.value = "Ubah Unit";
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
    await unitApi.save(form.value);
    toast.success("Unit berhasil disimpan.");
    dialog.value = false;
    await fetchData();
  } catch (e: any) {
    toast.error(e.response?.data?.message ?? "Gagal menyimpan.");
  } finally {
    isSaving.value = false;
  }
};

const handleDelete = async (item: Unit) => {
  try {
    await unitApi.delete(item.kode);
    toast.success("Unit berhasil dihapus.");
    await fetchData();
  } catch (e: any) {
    toast.error(e.response?.data?.message ?? "Gagal menghapus.");
  }
};
</script>

<template>
  <BaseBrowse
    ref="browseRef"
    title="Unit"
    :menu-id="MENU_ID"
    :icon="IconBuilding"
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
    search-placeholder="Cari unit..."
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
  <v-dialog v-model="dialog" max-width="500" persistent>
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center gap-2 pa-3" style="background:#3B5998; color:white;">
        <IconBuilding :size="20" /> {{ dialogTitle }}
      </v-card-title>

      <v-card-text class="pa-4 pt-4">
        <div class="grid-fields-container">

          <div class="f-row">
            <label class="f-lbl">Id <span class="req">*</span></label>
            <input
              type="text"
              v-model="form.kode"
              class="f-inp-native"
              :class="{ 'f-err': errors.kode }"
              :disabled="isSaving || form.isEdit"
              @input="clearError('kode')"
              placeholder="Contoh: P01 / HO"
            />
          </div>

          <div class="f-row">
            <label class="f-lbl">Pabrik <span class="req">*</span></label>
            <input
              type="text"
              v-model="form.nama"
              class="f-inp-native"
              :class="{ 'f-err': errors.nama }"
              :disabled="isSaving"
              @input="clearError('nama')"
              placeholder="Nama pabrik"
            />
          </div>

        </div>
      </v-card-text>

      <v-card-actions class="pa-3 bg-light">
        <v-spacer />
        <v-btn variant="plain" size="small" @click="dialog = false" :disabled="isSaving">Batal</v-btn>
        <v-btn color="primary" variant="flat" size="small" @click="handleSave" :loading="isSaving">Simpan</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.grid-fields-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.f-row {
  display: flex;
  align-items: center;
}
.f-lbl {
  width: 100px;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
}
.req {
  color: #ef4444;
}
.f-inp-native {
  flex: 1;
  height: 36px;
  padding: 0 10px;
  font-size: 13px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  outline: none;
  background: #fff;
}
.f-inp-native:focus {
  border-color: #3b5998;
  box-shadow: 0 0 0 1px #3b5998;
}
.f-err {
  border-color: #ef4444 !important;
}
</style>
