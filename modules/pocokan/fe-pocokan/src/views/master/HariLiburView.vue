<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { useToast } from "vue-toastification";
import { IconCalendarEvent, IconDownload, IconCalendarPlus } from "@tabler/icons-vue";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { useBrowse } from "@/composables/useBrowse";
import { hariLiburApi, type HariLibur } from "@/api/master/hariLiburApi";
import { exportToExcel } from "@/utils/exportExcel";

const MENU_ID = "8"; // Sesuai dengan tmenu Hari Libur
const toast = useToast();

const currentYear = new Date().getFullYear();
const selectedYear = ref(currentYear);

// Pilihan tahun: dari 5 tahun lalu sampai 2 tahun ke depan
const tahunList = Array.from({ length: 8 }, (_, i) => currentYear - 5 + i);

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
} = useBrowse<HariLibur>({
  menuId: MENU_ID,
  fetchApi: () => hariLiburApi.getAll(selectedYear.value),
});

// Watch perubahan tahun filter agar otomatis reload data
watch(selectedYear, () => {
  fetchData();
});

const headers = [
  { title: "Tanggal", key: "tanggal", width: "150px", align: "center" },
  { title: "Keterangan", key: "keterangan", minWidth: "350px" },
];

// ── Insert All Hari Minggu ──────────────────────────────────────────
const isGenerating = ref(false);
const handleInsertSundays = async () => {
  if (isGenerating.value) return;
  if (!confirm(`Generate dan masukkan semua Hari Minggu untuk tahun ${selectedYear.value}? (Tanggal yang sudah ada akan di-ignore)`)) {
    return;
  }

  isGenerating.value = true;
  try {
    const res = await hariLiburApi.insertSundays(selectedYear.value);
    toast.success(res.message ?? "Berhasil menambahkan Hari Minggu.");
    await fetchData();
  } catch (e: any) {
    toast.error(e.response?.data?.message ?? "Gagal generate Hari Minggu.");
  } finally {
    isGenerating.value = false;
  }
};

// ── Export Excel (.xlsx) ────────────────────────────────────────────
const exportExcelData = () => {
  const exportItems = getExportItems();
  if (!exportItems?.length) {
    toast.warning("Tidak ada data untuk diekspor.");
    return;
  }
  exportToExcel({
    title: `Export Data Hari Libur Tahun ${selectedYear.value}`,
    filenamePrefix: `master-hari-libur-${selectedYear.value}`,
    columns: [
      { header: "Tanggal", key: "tanggal", width: 15, align: "center" },
      { header: "Keterangan", key: "keterangan", width: 40 },
    ],
    rows: exportItems,
  });
};

// ── Dialog ───────────────────────────────────────────────────────────
const dialog = ref(false);
const dialogTitle = ref("");
const isSaving = ref(false);

const emptyForm = () => ({ isEdit: false, tanggal: "", keterangan: "", oldTanggal: "" });
const form = ref(emptyForm());

// ── Validasi Form ─────────────────────────────────────────────────────
const errors = ref<{ tanggal?: string; keterangan?: string }>({});

const validateForm = (): boolean => {
  const e: typeof errors.value = {};
  if (!form.value.tanggal.trim()) e.tanggal = "Tanggal wajib diisi.";
  if (!form.value.keterangan.trim()) e.keterangan = "Keterangan wajib diisi.";
  errors.value = e;
  return Object.keys(e).length === 0;
};
const clearError = (f: keyof typeof errors.value) => { if (errors.value[f]) delete errors.value[f]; };

const openCreate = () => {
  form.value = emptyForm();
  errors.value = {};
  dialogTitle.value = "Tambah Hari Libur";
  dialog.value = true;
};

const openEdit = (item: HariLibur) => {
  form.value = {
    isEdit: true,
    tanggal: item.tanggal,
    keterangan: item.keterangan,
    oldTanggal: item.tanggal,
  };
  errors.value = {};
  dialogTitle.value = "Ubah Hari Libur";
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
    await hariLiburApi.save(form.value);
    toast.success("Hari libur berhasil disimpan.");
    dialog.value = false;
    await fetchData();
  } catch (e: any) {
    toast.error(e.response?.data?.message ?? "Gagal menyimpan.");
  } finally {
    isSaving.value = false;
  }
};

const handleDelete = async (item: HariLibur) => {
  try {
    await hariLiburApi.delete(item.tanggal);
    toast.success("Hari libur berhasil dihapus.");
    await fetchData();
  } catch (e: any) {
    toast.error(e.response?.data?.message ?? "Gagal menghapus.");
  }
};
</script>

<template>
  <div class="pa-2 d-flex align-center justify-space-between bg-white border-bottom mb-2 px-4 rounded shadow-sm">
    <div class="d-flex align-center gap-3">
      <span class="font-weight-bold text-subtitle-2 text-grey-darken-2">Filter Tahun:</span>
      <select v-model="selectedYear" class="f-inp-native" style="max-width: 130px;">
        <option v-for="thn in tahunList" :key="thn" :value="thn">{{ thn }}</option>
      </select>
    </div>

    <v-btn
      size="small"
      color="primary"
      variant="flat"
      @click="handleInsertSundays"
      :loading="isGenerating"
    >
      <IconCalendarPlus :size="16" class="mr-1" /> Insert All Hari Minggu ({{ selectedYear }})
    </v-btn>
  </div>

  <BaseBrowse
    ref="browseRef"
    title="Hari Libur"
    :menu-id="MENU_ID"
    :icon="IconCalendarEvent"
    :headers="headers"
    :items="items ?? []"
    :is-loading="isLoading"
    :selected="selected"
    @update:selected="selected = $event"
    item-value="tanggal"
    :can-insert="canInsert"
    :can-edit="canEdit"
    :can-delete="canDelete"
    :can-export="canExport"
    search-placeholder="Cari hari libur / keterangan..."
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
        <IconCalendarEvent :size="20" /> {{ dialogTitle }}
      </v-card-title>

      <v-card-text class="pa-4 pt-4">
        <div class="grid-fields-container">

          <div class="f-row">
            <label class="f-lbl">Tanggal <span class="req">*</span></label>
            <input
              type="date"
              v-model="form.tanggal"
              class="f-inp-native"
              :class="{ 'f-err': errors.tanggal }"
              :disabled="isSaving"
              @input="clearError('tanggal')"
            />
          </div>

          <div class="f-row">
            <label class="f-lbl">Keterangan <span class="req">*</span></label>
            <input
              type="text"
              v-model="form.keterangan"
              class="f-inp-native"
              :class="{ 'f-err': errors.keterangan }"
              :disabled="isSaving"
              @input="clearError('keterangan')"
              placeholder="Keterangan hari libur"
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
