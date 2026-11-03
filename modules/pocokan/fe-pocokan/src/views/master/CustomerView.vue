<script setup lang="ts">
import { ref } from "vue";
import { useToast } from "vue-toastification";
import { IconUsers, IconDownload } from "@tabler/icons-vue";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { useBrowse } from "@/composables/useBrowse";
import { customerApi, type Customer } from "@/api/master/customerApi";
import { exportToExcel } from "@/utils/exportExcel";

const MENU_ID = "14"; // Sesuaikan dengan database tmenu Anda
const toast = useToast();

const {
  browseRef,
  getExportItems,
  items, isLoading, selected, canInsert, canEdit, canDelete, canExport, fetchData
} = useBrowse<Customer>({ menuId: MENU_ID, fetchApi: customerApi.getAll });

const headers = [
  { title: "Kode", key: "kode", width: "100px", align: "center" },
  { title: "Nama Pelanggan", key: "nama", minWidth: "180px" },
  { title: "Alamat", key: "alamat", minWidth: "200px" },
  { title: "Kota", key: "kota", width: "120px" },
  { title: "No. Telp", key: "telp", width: "130px" },
  { title: "Contact Person", key: "cp", width: "130px" },
  { title: "Total Piutang", key: "piutang", width: "130px", align: "end" },
];

// ── Export Excel (.xlsx) ────────────────────────────────────────────
const exportExcelData = () => {
  const exportItems = getExportItems();
  if (!exportItems?.length) {
    toast.warning("Tidak ada data untuk diekspor.");
    return;
  }
  exportToExcel({
    title: "Export Data Customer",
    filenamePrefix: "master-customer",
    columns: [
      { header: "Kode", key: "kode", width: 12, align: "center" },
      { header: "Nama Pelanggan", key: "nama", width: 28 },
      { header: "Alamat", key: "alamat", width: 30 },
      { header: "Kota", key: "kota", width: 16 },
      { header: "No. Telp", key: "telp", width: 16 },
      { header: "Contact Person", key: "cp", width: 20 },
      { header: "Total Piutang", key: "piutang", width: 18, currency: true },
    ],
    rows: exportItems,
  });
};

const dialog = ref(false);
const dialogTitle = ref("");
const isSaving = ref(false);

const emptyForm = () => ({
  isEdit: false, kode: "", nama: "", alamat: "", kota: "", fax: "", telp: "", cp: "",
  top: 0, email: ""
});
const form = ref(emptyForm());

// ── Validasi Form ─────────────────────────────────────────────────────
const errors = ref<{ nama?: string }>({});
const validateForm = (): boolean => {
  const e: typeof errors.value = {};
  if (!form.value.nama.trim()) e.nama = "Nama customer wajib diisi.";
  errors.value = e;
  return Object.keys(e).length === 0;
};
const clearError = (f: keyof typeof errors.value) => { if (errors.value[f]) delete errors.value[f]; };

const openCreate = () => {
  form.value = emptyForm();
  form.value.kode = ""; // kosong = biar backend generate otomatis dari inisial nama
  errors.value = {};
  dialogTitle.value = "Tambah Customer Baru";
  dialog.value = true;
};

const openEdit = async (item: Customer) => {
  try {
    const d = await customerApi.getById(item.kode);
    form.value = { isEdit: true, ...d };
    errors.value = {};
    dialogTitle.value = "Ubah Data Customer";
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
    await customerApi.save(form.value);
    toast.success("Data customer berhasil disimpan.");
    dialog.value = false;
    await fetchData();
  } catch (e: any) {
    toast.error(e.response?.data?.message ?? "Gagal menyimpan data.");
  } finally {
    isSaving.value = false;
  }
};

const handleDelete = async (item: Customer) => {
  try {
    await customerApi.delete(item.kode);
    toast.success("Customer berhasil dihapus.");
    await fetchData();
  } catch (e: any) {
    toast.error(e.response?.data?.message ?? "Gagal menghapus.");
  }
};

const formatRupiah = (v: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);
</script>

<template>
  <BaseBrowse
    ref="browseRef"
    title="Master Data Customer (Pelanggan)"
    :menu-id="MENU_ID"
    :icon="IconUsers"
    :headers="headers"
    :items="items ?? []"
    :is-loading="isLoading"
    :selected="selected"
    @update:selected="selected = $event"
    item-value="kode"
    :can-insert="canInsert" :can-edit="canEdit" :can-delete="canDelete" :can-export="canExport"
    search-placeholder="Cari nama atau kota customer..."
    @refresh="fetchData" @add="openCreate" @edit="openEdit" @delete="handleDelete"
  >
    <template #extra-actions>
      <v-btn size="small" variant="tonal" color="success" @click="exportExcelData">
        <IconDownload :size="16" class="mr-1" /> Export 
      </v-btn>
    </template>

    <template #item.piutang="{ item }">
      <span :class="item.piutang > 0 ? 'text-red font-weight-bold' : 'text-grey'">
        {{ formatRupiah(item.piutang) }}
      </span>
    </template>
  </BaseBrowse>

  <!-- Dialog Tambah/Ubah -->
  <v-dialog v-model="dialog" max-width="700" persistent>
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center gap-2 pa-3" style="background:#3B5998; color:white;">
        <IconUsers :size="20" /> {{ dialogTitle }}
      </v-card-title>

      <v-card-text class="pa-4 pt-4">
        <div class="f-row mb-2">
          <label class="f-lbl">Nama Lengkap <span class="req">*</span></label>
          <input
            type="text"
            v-model="form.nama"
            class="f-inp-native"
            :class="{ 'f-err': errors.nama }"
            :disabled="isSaving"
            @input="clearError('nama')"
            placeholder="Nama Toko / Pelanggan"
          />
        </div>

        <div class="grid-fields-container">

          <div class="f-row">
            <label class="f-lbl">Kode Customer</label>
            <input
              type="text"
              v-model="form.kode"
              class="f-inp-native"
              :class="{ 'readonly-bg': form.isEdit }"
              :readonly="form.isEdit"
              :disabled="isSaving"
              placeholder="Kosongkan untuk otomatis dari nama"
            />
          </div>

          <div class="f-row">
            <label class="f-lbl">Kota</label>
            <input type="text" v-model="form.kota" class="f-inp-native" :disabled="isSaving" placeholder="Kota" />
          </div>

          <div class="f-row align-start">
            <label class="f-lbl mt-1">Alamat</label>
            <input type="text" v-model="form.alamat" class="f-inp-native" :disabled="isSaving" placeholder="Alamat lengkap" />
          </div>

          <div class="f-row">
            <label class="f-lbl">No. Telepon / HP</label>
            <input type="text" v-model="form.telp" class="f-inp-native" :disabled="isSaving" placeholder="Nomor telepon" />
          </div>

          <div class="f-row">
            <label class="f-lbl">Fax</label>
            <input type="text" v-model="form.fax" class="f-inp-native" :disabled="isSaving" placeholder="Nomor fax" />
          </div>

          <div class="f-row">
            <label class="f-lbl">Email</label>
            <input type="text" v-model="form.email" class="f-inp-native" :disabled="isSaving" placeholder="alamat@email.com" />
          </div>

          <div class="f-row">
            <label class="f-lbl">Contact Person</label>
            <input type="text" v-model="form.cp" class="f-inp-native" :disabled="isSaving" placeholder="Nama CP" />
          </div>

          <div class="f-row">
            <label class="f-lbl">TOP (Hari)</label>
            <input type="number" v-model.number="form.top" class="f-inp-native tr" :disabled="isSaving" placeholder="0" />
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