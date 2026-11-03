<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useToast } from "vue-toastification";
import { IconUsers, IconDownload } from "@tabler/icons-vue";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { useBrowse } from "@/composables/useBrowse";
import { karyawanApi, type Karyawan, type Bagian, type Pabrik } from "@/api/master/karyawanApi";
import { exportToExcel } from "@/utils/exportExcel";

const MENU_ID = "4"; // Sesuai dengan tmenu Karyawan
const toast = useToast();

const {
  browseRef,
  getExportItems,
  items, isLoading, selected, canInsert, canEdit, canDelete, canExport, fetchData
} = useBrowse<Karyawan>({ menuId: MENU_ID, fetchApi: karyawanApi.getAll });

const bagianList = ref<Bagian[]>([]);
const pabrikList = ref<Pabrik[]>([]);

const loadLookups = async () => {
  try {
    const [bRes, pRes] = await Promise.all([
      karyawanApi.getBagianList(),
      karyawanApi.getPabrikList(),
    ]);
    bagianList.value = bRes;
    pabrikList.value = pRes;
  } catch (e) {
    console.error("Gagal memuat lookup bagian/pabrik", e);
  }
};

onMounted(() => {
  loadLookups();
});

const headers = [
  { title: "Kode", key: "kode", width: "100px", align: "center" },
  { title: "Nama Karyawan", key: "nama", minWidth: "180px", align: "start" },
  { title: "Bagian", key: "bagian", width: "120px", align: "start" },
  { title: "Pabrik", key: "pabrik", width: "100px", align: "start" },
  { title: "Tgl. Masuk", key: "tglmasuk", width: "120px", align: "center" },
  { title: "Gaji Pokok", key: "gapok", width: "130px", align: "end" },
  { title: "No. Rekening", key: "rekening", width: "150px", align: "start" },
  { title: "Aktif", key: "isaktif", width: "90px", align: "center" },
];

// ── Export Excel (.xlsx) ────────────────────────────────────────────
const exportExcelData = () => {
  const exportItems = getExportItems();
  if (!exportItems?.length) {
    toast.warning("Tidak ada data untuk diekspor.");
    return;
  }
  exportToExcel({
    title: "Export Data Karyawan",
    filenamePrefix: "master-karyawan",
    columns: [
      { header: "Kode", key: "kode", width: 12, align: "center" },
      { header: "Nama Karyawan", key: "nama", width: 28 },
      { header: "Bagian", key: "bagian", width: 16 },
      { header: "Pabrik", key: "pabrik", width: 14 },
      { header: "Tgl. Masuk", key: "tglmasuk", width: 16 },
      { header: "Gaji Pokok", key: "gapok", width: 18, currency: true },
      { header: "Lembur", key: "lembur", width: 16, currency: true },
    ],
    rows: exportItems,
  });
};

const dialog = ref(false);
const dialogTitle = ref("");
const isSaving = ref(false);

const emptyForm = () => ({
  isEdit: false, kode: "", nama: "", bagian: "", pabrik: "", tglmasuk: "", gapok: 0, lembur: 0, lembur2: 0, isaktif: 1, rekening: ""
});
const form = ref(emptyForm());

// ── Validasi Form ─────────────────────────────────────────────────────
const errors = ref<{ nama?: string }>({});
const validateForm = (): boolean => {
  const e: typeof errors.value = {};
  if (!form.value.nama.trim()) e.nama = "Nama karyawan wajib diisi.";
  errors.value = e;
  return Object.keys(e).length === 0;
};
const clearError = (f: keyof typeof errors.value) => { if (errors.value[f]) delete errors.value[f]; };

const openCreate = () => {
  form.value = emptyForm();
  errors.value = {};
  dialogTitle.value = "Tambah Karyawan Baru";
  dialog.value = true;
};

const openEdit = async (item: Karyawan) => {
  try {
    const d = await karyawanApi.getById(item.kode);
    form.value = { isEdit: true, ...d };
    errors.value = {};
    dialogTitle.value = "Ubah Data Karyawan";
    dialog.value = true;
  } catch (e: any) {
    toast.error(e.response?.data?.message ?? "Gagal memuat detail data.");
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
    await karyawanApi.save(form.value);
    toast.success("Data karyawan berhasil disimpan.");
    dialog.value = false;
    await fetchData();
  } catch (e: any) {
    toast.error(e.response?.data?.message ?? "Gagal menyimpan data.");
  } finally {
    isSaving.value = false;
  }
};

const handleDelete = async (item: Karyawan) => {
  try {
    await karyawanApi.delete(item.kode);
    toast.success("Karyawan berhasil dihapus.");
    await fetchData();
  } catch (e: any) {
    toast.error(e.response?.data?.message ?? "Gagal menghapus data.");
  }
};
</script>

<template>
  <BaseBrowse
    ref="browseRef"
    title="Master Karyawan"
    :menu-id="MENU_ID"
    :icon="IconUsers"
    :headers="headers"
    :items="items ?? []"
    :is-loading="isLoading"
    :selected="selected"
    @update:selected="selected = $event"
    item-value="kode"
    :can-insert="canInsert" :can-edit="canEdit" :can-delete="canDelete" :can-export="canExport"
    search-placeholder="Cari nama atau kode karyawan..."
    @refresh="fetchData" @add="openCreate" @edit="openEdit" @delete="handleDelete"
  >
    <template #extra-actions>
      <v-btn v-if="canExport" size="small" variant="tonal" color="success" @click="exportExcelData">
        <IconDownload :size="16" class="mr-1" /> Export
      </v-btn>
    </template>

    <template #item.isaktif="{ item }">
      <v-chip :color="item.isaktif === 'Aktif' || item.isaktif === 1 || item.isaktif === true ? 'success' : 'grey'" size="small" variant="flat">
        {{ item.isaktif === 'Aktif' || item.isaktif === 1 || item.isaktif === true ? 'Aktif' : 'Nonaktif' }}
      </v-chip>
    </template>
  </BaseBrowse>

  <!-- ── Dialog Form Input / Edit ────────────────────────────────────── -->
  <v-dialog v-model="dialog" max-width="700" persistent>
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center gap-2 pa-3" style="background:#3B5998; color:white;">
        <IconUsers :size="20" /> {{ dialogTitle }}
      </v-card-title>

      <v-card-text class="pa-4 pt-4">
        <div class="grid-fields-container">
          <div class="f-row">
            <label class="f-lbl">Kode</label>
            <input
              type="text"
              v-model="form.kode"
              class="f-inp-native readonly-bg"
              readonly
              disabled
              placeholder="Otomatis (1000, dst)"
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
              placeholder="Nama karyawan"
            />
          </div>

          <div class="f-row">
            <label class="f-lbl">Bagian</label>
            <select v-model="form.bagian" class="f-inp-native" :disabled="isSaving">
              <option value="">-- Pilih Bagian --</option>
              <option v-for="b in bagianList" :key="b.kode" :value="b.kode">
                {{ b.kode }} - {{ b.nama }}
              </option>
            </select>
          </div>

          <div class="f-row">
            <label class="f-lbl">Pabrik</label>
            <select v-model="form.pabrik" class="f-inp-native" :disabled="isSaving">
              <option value="">-- Pilih Pabrik --</option>
              <option v-for="p in pabrikList" :key="p.kode" :value="p.kode">
                {{ p.kode }} - {{ p.nama }}
              </option>
            </select>
          </div>

          <div class="f-row">
            <label class="f-lbl">Tgl. Masuk</label>
            <input type="date" v-model="form.tglmasuk" class="f-inp-native" :disabled="isSaving" />
          </div>

          <div class="f-row">
            <label class="f-lbl">Gaji Pokok</label>
            <input type="number" v-model.number="form.gapok" class="f-inp-native tr" :disabled="isSaving" placeholder="0" />
          </div>

          <div class="f-row">
            <label class="f-lbl">No. Rekening</label>
            <input type="text" v-model="form.rekening" class="f-inp-native" :disabled="isSaving" placeholder="No Rekening" />
          </div>

          <div class="f-row">
            <label class="f-lbl">Status</label>
            <select v-model="form.isaktif" class="f-inp-native" :disabled="isSaving">
              <option :value="1">Aktif</option>
              <option :value="0">Nonaktif</option>
            </select>
          </div>
        </div>

        <div v-if="errors.nama" class="f-row align-start mt-2">
          <label class="f-lbl"></label>
          <div class="f-err-text">{{ errors.nama }}</div>
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
  width: 120px;
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
.f-inp-native.tr { text-align: right; }
.f-inp-native:disabled { background-color: #f3f4f6; color: #6b7280; }
.readonly-bg { background-color: #f3f4f6; color: #6b7280; }
.f-err { border-color: #ef4444 !important; }
.f-err-text { flex: 1; font-size: 10px; color: #ef4444; }
</style>
