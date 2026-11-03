<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useToast } from "vue-toastification";
import { IconCategory, IconDownload } from "@tabler/icons-vue";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { useBrowse } from "@/composables/useBrowse";
import { kategoriApi, type Kategori } from "@/api/master/kategoriApi";
import { exportToExcel } from "@/utils/exportExcel";

const MENU_ID = "11";
const toast = useToast();

// ── Tingkat filter (Browse) ─────────────────────────────────────────
const TINGKAT_OPTIONS = [
  { title: "Departemen", value: 1 },
  { title: "Sub Kategori", value: 2 },
  { title: "Kategori", value: 3 },
];
const filterTingkat = ref<number>(1);

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
} = useBrowse<Kategori>({
  menuId: MENU_ID,
  fetchApi: () => kategoriApi.getAll({ tingkat: filterTingkat.value }),
});

watch(filterTingkat, () => fetchData());

const headers = [
  { title: "Kode", key: "kode", width: "120px", align: "center" },
  { title: "Nama", key: "nama", minWidth: "250px" },
];

// ── Export Excel ─────────────────────────────────────────────────────
const exportExcelData = () => {
  const exportItems = getExportItems();
  if (!exportItems?.length) {
    toast.warning("Tidak ada data untuk diekspor.");
    return;
  }
  const tingkatLabel = TINGKAT_OPTIONS.find((t) => t.value === filterTingkat.value)?.title ?? "";
  exportToExcel({
    title: `Export Data Kategori - ${tingkatLabel}`,
    filenamePrefix: "master-kategori",
    columns: [
      { header: "Kode", key: "kode", width: 16, align: "center" },
      { header: "Nama", key: "nama", width: 34 },
    ],
    rows: exportItems,
  });
};

// ── Dialog Tambah/Ubah ────────────────────────────────────────────────
const dialog = ref(false);
const dialogTitle = ref("");
const isSaving = ref(false);

const emptyForm = () => ({
  isEdit: false,
  kode: "",
  nama: "",
  tingkat: 1 as number,
  parentKode: "" as string,
});
const form = ref(emptyForm());

// Opsi induk (dimuat sesuai tingkat yang dipilih di form)
const parentOptions = ref<Kategori[]>([]);
const parentLabel = computed(() =>
  form.value.tingkat === 2 ? "Departemen Induk" : "Sub Kategori Induk"
);
const loadParentOptions = async () => {
  parentOptions.value = [];
  form.value.parentKode = "";
  if (form.value.tingkat === 1) return;
  parentOptions.value = await kategoriApi.getAll({ tingkat: form.value.tingkat - 1 });
};
watch(() => form.value.tingkat, loadParentOptions);

// ── Validasi ─────────────────────────────────────────────────────────
const errors = ref<{ nama?: string; parentKode?: string }>({});
const validateForm = (): boolean => {
  const e: typeof errors.value = {};
  if (!form.value.nama.trim()) e.nama = "Nama kategori wajib diisi.";
  if (form.value.tingkat > 1 && !form.value.parentKode) {
    e.parentKode = `${parentLabel.value} wajib dipilih.`;
  }
  errors.value = e;
  return Object.keys(e).length === 0;
};
const clearError = (f: keyof typeof errors.value) => {
  if (errors.value[f]) delete errors.value[f];
};

const openCreate = async () => {
  form.value = emptyForm();
  form.value.tingkat = filterTingkat.value; // default sesuai tab yang sedang aktif
  errors.value = {};
  dialogTitle.value = "Tambah Kategori";
  await loadParentOptions();
  dialog.value = true;
};

const openEdit = async (item: Kategori) => {
  try {
    const d = await kategoriApi.getById(item.kode);
    form.value = {
      isEdit: true,
      kode: d.kode,
      nama: d.nama,
      tingkat: d.tingkat,
      parentKode: d.kode.includes(".") ? d.kode.substring(0, d.kode.lastIndexOf(".")) : "",
    };
    errors.value = {};
    dialogTitle.value = "Ubah Kategori";
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
    await kategoriApi.save({
      isEdit: form.value.isEdit,
      kode: form.value.kode,
      nama: form.value.nama,
      tingkat: form.value.tingkat,
      parentKode: form.value.parentKode || null,
    });
    toast.success("Kategori berhasil disimpan.");
    dialog.value = false;
    await fetchData();
  } catch (e: any) {
    toast.error(e.response?.data?.message ?? "Gagal menyimpan.");
  } finally {
    isSaving.value = false;
  }
};

const handleDelete = async (item: Kategori) => {
  try {
    await kategoriApi.delete(item.kode);
    toast.success("Kategori berhasil dihapus.");
    await fetchData();
  } catch (e: any) {
    toast.error(e.response?.data?.message ?? "Gagal menghapus.");
  }
};
</script>

<template>
  <BaseBrowse
    ref="browseRef"
    title="Master Data Kategori"
    :menu-id="MENU_ID"
    :icon="IconCategory"
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
    search-placeholder="Cari kategori..."
    @refresh="fetchData"
    @add="openCreate"
    @edit="openEdit"
    @delete="handleDelete"
  >
    <template #filter-right-prepend>
      <v-select
        v-model="filterTingkat"
        :items="TINGKAT_OPTIONS"
        item-title="title"
        item-value="value"
        label="Tingkat"
        density="compact"
        variant="outlined"
        hide-details
        style="max-width: 180px"
        class="mr-2"
      />
     
    </template>
  </BaseBrowse>

  <!-- Dialog Tambah/Ubah -->
  <v-dialog v-model="dialog" max-width="480" persistent>
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center gap-2 pa-3" style="background:#3B5998; color:white;">
        <IconCategory :size="20" /> {{ dialogTitle }}
      </v-card-title>

      <v-card-text class="pa-4 pt-4">
        <!-- Tingkat (hanya bisa dipilih saat tambah baru) -->
        <div class="f-row mb-2">
          <label class="f-lbl">Tingkat <span class="req">*</span></label>
          <select
            v-model.number="form.tingkat"
            class="f-inp-native"
            :disabled="isSaving || form.isEdit"
          >
            <option :value="1">Departemen</option>
            <option :value="2">Sub Kategori</option>
            <option :value="3">Kategori</option>
          </select>
        </div>

        <!-- Induk (hanya muncul jika tingkat 2 / 3) -->
        <div v-if="form.tingkat > 1" class="f-row mb-2">
          <label class="f-lbl">{{ parentLabel }} <span class="req">*</span></label>
          <select
            v-model="form.parentKode"
            class="f-inp-native"
            :class="{ 'f-err': errors.parentKode }"
            :disabled="isSaving || form.isEdit"
            @change="clearError('parentKode')"
          >
            <option value="" disabled>-- Pilih {{ parentLabel }} --</option>
            <option v-for="p in parentOptions" :key="p.kode" :value="p.kode">
              {{ p.kode }} - {{ p.nama }}
            </option>
          </select>
        </div>

        <!-- Kode: hanya tampil saat edit, auto-generate saat tambah baru -->
        <div v-if="form.isEdit" class="f-row mb-2">
          <label class="f-lbl">Kode Kategori</label>
          <input type="text" :value="form.kode" class="f-inp-native" disabled />
        </div>

        <div class="f-row">
          <label class="f-lbl">Nama Kategori <span class="req">*</span></label>
          <input
            type="text"
            v-model="form.nama"
            class="f-inp-native"
            :class="{ 'f-err': errors.nama }"
            :disabled="isSaving"
            maxlength="30"
            @input="clearError('nama')"
            placeholder="Nama kategori"
          />
        </div>

        <div v-if="errors.nama || errors.parentKode" class="f-row align-start mt-2">
          <label class="f-lbl"></label>
          <div class="f-err-text">
            <div v-if="errors.parentKode">{{ errors.parentKode }}</div>
            <div v-if="errors.nama">{{ errors.nama }}</div>
          </div>
        </div>

        <div v-if="!form.isEdit" class="f-hint mt-2">
          Kode akan dibuat otomatis oleh sistem sesuai tingkat &amp; induk yang dipilih.
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
.f-hint { font-size: 10px; color: #6b7280; padding-left: 150px; }
</style>