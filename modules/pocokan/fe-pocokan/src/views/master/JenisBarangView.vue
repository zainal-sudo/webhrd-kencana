<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useToast } from "vue-toastification";
import { IconCategory2, IconDownload } from "@tabler/icons-vue";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { useBrowse } from "@/composables/useBrowse";
import { jenisBarangApi, type JenisBarang } from "@/api/master/jenisBarangApi";
import { rekeningApi, type Rekening } from "@/api/master/rekeningApi"; // sesuaikan path
import { exportToExcel } from "@/utils/exportExcel";

const MENU_ID = "15";
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
} = useBrowse<JenisBarang>({ menuId: MENU_ID, fetchApi: jenisBarangApi.getAll });

const headers = [
  { title: "Kode", key: "kode", width: "100px", align: "center" },
  { title: "Nama Jenis Barang", key: "nama", minWidth: "220px" },
  { title: "Rekening", key: "rekNama", minWidth: "200px" }, // tampilkan hasil join
];

// ── Rekening options ────────────────────────────────────────────────
const rekeningOptions = ref<Rekening[]>([]);
const loadRekening = async () => {
  try {
    rekeningOptions.value = await rekeningApi.getAll();
  } catch (e: any) {
    toast.error("Gagal memuat daftar rekening.");
  }
};
onMounted(loadRekening);

// ── Dialog ───────────────────────────────────────────────────────────
const dialog = ref(false);
const dialogTitle = ref("");
const isSaving = ref(false);

const emptyForm = () => ({
  isEdit: false,
  kode: undefined as number | undefined,
  nama: "",
  rekKode: null as string | null,
});
const form = ref(emptyForm());

const errors = ref<{ nama?: string; rekKode?: string }>({});
const validateForm = (): boolean => {
  const e: typeof errors.value = {};
  if (!form.value.nama.trim()) e.nama = "Nama jenis barang wajib diisi.";
  if (!form.value.rekKode) e.rekKode = "Rekening wajib dipilih.";
  errors.value = e;
  return Object.keys(e).length === 0;
};
const clearError = (f: keyof typeof errors.value) => { if (errors.value[f]) delete errors.value[f]; };

const openCreate = () => {
  form.value = emptyForm();
  errors.value = {};
  dialogTitle.value = "Tambah Jenis Barang";
  dialog.value = true;
};

const openEdit = async (item: JenisBarang) => {
  try {
    const d = await jenisBarangApi.getById(item.kode);
    form.value = { isEdit: true, kode: d.kode, nama: d.nama, rekKode: d.rekKode ?? null };
    errors.value = {};
    dialogTitle.value = "Ubah Jenis Barang";
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
  isSaving.value = true;
  try {
    await jenisBarangApi.save(form.value);
    toast.success("Jenis Barang berhasil disimpan.");
    dialog.value = false;
    await fetchData();
  } catch (e: any) {
    toast.error(e.response?.data?.message ?? "Gagal menyimpan.");
  } finally {
    isSaving.value = false;
  }
};

const handleDelete = async (item: JenisBarang) => {
  try {
    await jenisBarangApi.delete(item.kode);
    toast.success("Jenis Barang berhasil dihapus.");
    await fetchData();
  } catch (e: any) {
    toast.error(e.response?.data?.message ?? "Gagal menghapus.");
  }
};

const exportExcelData = () => {
  const exportItems = getExportItems();
  if (!exportItems?.length) {
    toast.warning("Tidak ada data untuk diekspor.");
    return;
  }
  exportToExcel({
    title: "Export Data Jenis Barang",
    filenamePrefix: "master-jenis-barang",
    columns: [
      { header: "Kode", key: "kode", width: 12, align: "center" },
      { header: "Nama Jenis Barang", key: "nama", width: 34 },
      { header: "Rekening", key: "rekNama", width: 30 },
    ],
    rows: exportItems,
  });
};
</script>

<template>
  <BaseBrowse
    ref="browseRef"
    title="Master Data Jenis Barang"
    :menu-id="MENU_ID"
    :icon="IconCategory2"
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
    search-placeholder="Cari jenis barang..."
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

  <v-dialog v-model="dialog" max-width="420" persistent>
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center gap-2 pa-3" style="background:#3B5998; color:white;">
        <IconCategory2 :size="20" /> {{ dialogTitle }}
      </v-card-title>

      <v-card-text class="pa-4 pt-4">
        <div v-if="form.isEdit" class="f-row mb-2">
          <label class="f-lbl">Kode</label>
          <input type="text" :value="form.kode" class="f-inp-native" disabled />
        </div>

        <div class="f-row mb-2">
          <label class="f-lbl">Nama Jenis Barang <span class="req">*</span></label>
          <input
            type="text"
            v-model="form.nama"
            class="f-inp-native"
            :class="{ 'f-err': errors.nama }"
            :disabled="isSaving"
            maxlength="30"
            @input="clearError('nama')"
            placeholder="Contoh: Barang Jadi"
          />
        </div>
        <div v-if="errors.nama" class="f-row align-start mb-2">
          <label class="f-lbl"></label>
          <div class="f-err-text">{{ errors.nama }}</div>
        </div>

        <div class="f-row">
          <label class="f-lbl">Rekening <span class="req">*</span></label>
          <select
            v-model="form.rekKode"
            class="f-inp-native"
            :class="{ 'f-err': errors.rekKode }"
            :disabled="isSaving"
            @change="clearError('rekKode')"
          >
            <option :value="null" disabled>-- Pilih Rekening --</option>
            <option v-for="r in rekeningOptions" :key="r.kode" :value="r.kode">
              {{ r.kode }} - {{ r.nama }}
            </option>
          </select>
        </div>
        <div v-if="errors.rekKode" class="f-row align-start mt-2">
          <label class="f-lbl"></label>
          <div class="f-err-text">{{ errors.rekKode }}</div>
        </div>

        <div v-if="!form.isEdit" class="f-hint mt-2">
          Kode dibuat otomatis oleh sistem (angka urut).
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
.f-row { display: flex; align-items: center; min-width: 0; }
.f-row.align-start { align-items: flex-start; }
.f-lbl {
  width: 150px;
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
.f-hint { font-size: 10px; color: #6b7280; }
</style>