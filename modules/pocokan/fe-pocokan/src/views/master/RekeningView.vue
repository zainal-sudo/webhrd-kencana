<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useToast } from "vue-toastification";
import { IconList, IconDownload } from "@tabler/icons-vue";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { useBrowse } from "@/composables/useBrowse";
import { rekeningApi, type Rekening } from "@/api/master/rekeningApi";
import { kelompokApi, type Kelompok } from "@/api/master/kelompokApi";
import { exportToExcel } from "@/utils/exportExcel";

const MENU_ID = "6"; // Sesuaikan Menu ID Rekening
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
} = useBrowse<Rekening>({ menuId: MENU_ID, fetchApi: rekeningApi.getAll });

// 💡 PERBAIKAN 1: Menyelaraskan Key Headers agar cocok dengan key kapital dari database
const headers = [
  { title: "Kode Rekening", key: "kode", width: "120px", align: "center" },
  { title: "Nama Rekening", key: "nama", minWidth: "220px" },
  { title: "Kelompok Akun", key: "kelompokNama", width: "180px" },
  { title: "Urutan", key: "urutan", width: "90px", align: "center" },
  { title: "Status", key: "ISAKTIF", width: "100px", align: "center" },
];

// ── Export Excel (.xlsx) ────────────────────────────────────────────
const exportExcelData = () => {
  const exportItems = getExportItems();
  if (!exportItems?.length) {
    toast.warning("Tidak ada data untuk diekspor.");
    return;
  }
  exportToExcel({
    title: "Export Data Rekening",
    filenamePrefix: "master-rekening",
    columns: [
      { header: "Kode Rekening", key: "kode", width: 14, align: "center" },
      { header: "Nama Rekening", key: "nama", width: 34 },
      { header: "Kelompok Akun", key: "kelompokNama", width: 24 },
      { header: "Urutan", key: "urutan", width: 10, align: "center" },
      { header: "Status", key: "statusLabel", width: 14, align: "center" },
    ],
    rows: exportItems.map((item: any) => ({
      ...item,
      statusLabel: (item.ISAKTIF === 1 || item.isAktif === 1 || item.REK_ISAKTIF === 1) ? "AKTIF" : "NON-AKTIF",
    })),
  });
};

// ── Dialog & Form State ──────────────────────────────────────────────
const dialog = ref(false);
const dialogTitle = ref("");
const isSaving = ref(false);
const kelompokOptions = ref<Kelompok[]>([]);

const emptyForm = () => ({
  isEdit: false,
  kode: "",
  nama: "",
  kelompokId: "",
  isAktif: true,
  urutan: 0
});

const form = ref(emptyForm());

// ── Validasi Form ─────────────────────────────────────────────────────
const errors = ref<{ kode?: string; nama?: string; kelompokId?: string }>({});

const validateForm = (): boolean => {
  const e: typeof errors.value = {};
  if (!form.value.kode?.toString().trim()) e.kode = "Kode rekening wajib diisi.";
  if (!form.value.nama?.trim()) e.nama = "Nama rekening wajib diisi.";
  if (!form.value.kelompokId) e.kelompokId = "Kelompok akun wajib dipilih.";
  errors.value = e;
  return Object.keys(e).length === 0;
};
const clearError = (f: keyof typeof errors.value) => { if (errors.value[f]) delete errors.value[f]; };

const loadKelompokOptions = async () => {
  try {
    kelompokOptions.value = await kelompokApi.getAll();
  } catch (e: any) {
    console.error("Gagal memuat kelompok:", e.message);
    toast.error("Gagal memuat daftar kelompok akun. Silakan coba lagi.");
  }
};

onMounted(() => {
  loadKelompokOptions();
});

const handleAdd = () => {
  form.value = emptyForm();
  errors.value = {};
  if (kelompokOptions.value.length === 0) loadKelompokOptions(); // retry kalau kosong
  dialogTitle.value = "Tambah Rekening Baru";
  dialog.value = true;
};



const handleEdit = async (item: any) => {
  try {
    const kodeAktif = item.KODE || item.kode || item.REK_KODE;
    const data = await rekeningApi.getById(kodeAktif);

    form.value = {
      isEdit: true,
      kode: data.kode || (data as any).KODE || (data as any).REK_KODE,
      nama: data.nama || (data as any).REK_NAMA || (data as any).NAMA,
      kelompokId: data.kelompokId || (data as any).REK_KOL_ID || (data as any).KELOMPOKID,
      isAktif: data.isAktif === 1 || (data as any).ISAKTIF === 1 || (data as any).REK_ISAKTIF === 1,
      urutan: data.urutan || (data as any).URUTAN || (data as any).rek_urutan || 0
    };
    errors.value = {};
    dialogTitle.value = "Ubah Rekening";
    dialog.value = true;
  } catch (e: any) {
    toast.error(e.message || "Gagal mengambil detail data.");
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
    const res = await rekeningApi.save(form.value);
    toast.success(res.message || "Data berhasil disimpan.");
    dialog.value = false;
    fetchData();
  } catch (e: any) {
    toast.error(e.response?.data?.message || e.message || "Gagal menyimpan data.");
  } finally {
    isSaving.value = false;
  }
};

const handleDelete = async (item: any) => {
  const kodeAktif = item.KODE || item.kode || item.REK_KODE;
  const namaAktif = item.NAMA || item.nama || item.REK_NAMA;

  if (!confirm(`Apakah Anda yakin ingin menghapus rekening "${namaAktif}"?`)) return;
  try {
    const res = await rekeningApi.delete(kodeAktif);
    toast.success(res.message || "Data berhasil dihapus.");
    fetchData();
  } catch (e: any) {
    toast.error(e.response?.data?.message || e.message || "Gagal menghapus data.");
  }
};
</script>

<template>
  <BaseBrowse
    ref="browseRef"
    title="Master Rekening"
    :menu-id="MENU_ID"
	:headers="headers"
    :items="items ?? []"
    :loading="isLoading"
	:selected="selected"
	@update:selected="selected = $event"
    show-select
    item-value="kode" 
    v-model="selected"
    :can-insert="canInsert"
    :can-edit="canEdit"
    :can-delete="canDelete"
    :can-export="canExport"
	@refresh="fetchData"
    @add="handleAdd"
    @edit="handleEdit"
    @delete="handleDelete"
  >
    <template #icon>
      <IconList :size="20" />
    </template>

    <template #extra-actions>
      <v-btn size="small" variant="tonal" color="success" @click="exportExcelData">
        <IconDownload :size="16" class="mr-1" /> Export
      </v-btn>
    </template>

    <template #item.ISAKTIF="{ item }">
      <v-chip 
        :color="(item.ISAKTIF === 1 || item.isAktif === 1 || item.REK_ISAKTIF === 1) ? 'success' : 'error'" 
        size="x-small" 
        label
        class="font-weight-bold"
      >
        {{ (item.ISAKTIF === 1 || item.isAktif === 1 || item.REK_ISAKTIF === 1) ? 'AKTIF' : 'NON-AKTIF' }}
      </v-chip>
    </template>
  </BaseBrowse>

  <!-- Dialog Tambah/Ubah -->
  <v-dialog v-model="dialog" max-width="600" persistent>
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center gap-2 pa-3" style="background:#3B5998; color:white;">
        <IconList :size="20" /> {{ dialogTitle }}
      </v-card-title>

      <v-card-text class="pa-4 pt-4">
        <div class="f-row mb-2">
          <label class="f-lbl">Kode Rekening <span class="req">*</span></label>
          <input
            type="text"
            v-model="form.kode"
            class="f-inp-native"
            :class="{ 'f-err': errors.kode }"
            :disabled="isSaving || form.isEdit"
            maxlength="8"
            @input="clearError('kode')"
            placeholder="Contoh: 101.01"
          />
        </div>

        <div class="f-row mb-2">
          <label class="f-lbl">Nama Rekening <span class="req">*</span></label>
          <input
            type="text"
            v-model="form.nama"
            class="f-inp-native"
            :class="{ 'f-err': errors.nama }"
            :disabled="isSaving"
            maxlength="80"
            @input="clearError('nama')"
            placeholder="Nama Kas / Bank / Akun"
          />
        </div>

        <div class="grid-fields-container">

          <div class="f-row">
            <label class="f-lbl">Kelompok Akun</label>
            <select
              v-model="form.kelompokId"
              class="f-inp-native select-native"
              :class="{ 'f-err': errors.kelompokId }"
              :disabled="isSaving"
              @change="clearError('kelompokId')"
            >
              <option value="" disabled>Pilih kelompok akun</option>
              <option v-for="k in kelompokOptions" :key="k.kode" :value="k.kode">{{ k.nama }}</option>
            </select>
          </div>

          <div class="f-row">
            <label class="f-lbl">Urutan Tampil</label>
            <input
              type="number"
              v-model.number="form.urutan"
              class="f-inp-native tr"
              :disabled="isSaving"
              placeholder="0"
            />
          </div>

          <div class="f-row">
            <label class="f-lbl">Status</label>
            <div class="d-flex align-center" style="gap:16px; height:28px;">
              <label class="chk-native">
                <input type="checkbox" v-model="form.isAktif" :disabled="isSaving" />
                Rekening Aktif
              </label>
            </div>
          </div>

        </div>

        <div v-if="errors.kode || errors.nama || errors.kelompokId" class="f-row align-start mt-2">
          <label class="f-lbl"></label>
          <div class="f-err-text">
            <div v-if="errors.kode">{{ errors.kode }}</div>
            <div v-if="errors.nama">{{ errors.nama }}</div>
            <div v-if="errors.kelompokId">{{ errors.kelompokId }}</div>
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
.f-row { display: flex; align-items: center; }
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
.select-native { cursor: pointer; }
.f-inp-native:disabled { background-color: #f3f4f6; color: #6b7280; }
.f-err { border-color: #ef4444 !important; }
.f-err-text { flex: 1; font-size: 10px; color: #ef4444; }
.chk-native { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #374151; cursor: pointer; }
</style>