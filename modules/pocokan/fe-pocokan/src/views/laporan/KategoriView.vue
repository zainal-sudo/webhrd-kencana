<script setup lang="ts">
import { ref } from "vue";
import { useToast } from "vue-toastification";
import { IconCategory } from "@tabler/icons-vue";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { useBrowse } from "@/composables/useBrowse";
import { kategoriApi, type Kategori } from "@/api/master/kategoriApi";

// Sesuaikan MENU_ID dengan database hak akses retail Anda (contoh: "11")
const MENU_ID = "11"; 
const toast = useToast();

const {
  items,
  isLoading,
  selected,
  canInsert,
  canEdit,
  canDelete,
  canExport,
  fetchData,
} = useBrowse<Kategori>({ menuId: MENU_ID, fetchApi: kategoriApi.getAll });

const headers = [
  { title: "Kode Kategori", key: "kode", width: "120px", align: "center" },
  { title: "Nama Kategori", key: "nama", minWidth: "250px" },
];

// ── Dialog ───────────────────────────────────────────────────────────
const dialog = ref(false);
const dialogTitle = ref("");
const isSaving = ref(false);

const emptyForm = () => ({ isEdit: false, kode: "", nama: "" });
const form = ref(emptyForm());

const openCreate = () => {
  form.value = emptyForm();
  dialogTitle.value = "Tambah Kategori";
  dialog.value = true;
};

const openEdit = async (item: Kategori) => {
  try {
    const d = await kategoriApi.getById(item.kode);
    form.value = {
      isEdit: true,
      kode: d.kode,
      nama: d.nama,
    };
    dialogTitle.value = "Ubah Kategori";
    dialog.value = true;
  } catch (e: any) {
    if (e?.isAuthExpired) return;
    toast.error(e.response?.data?.message ?? "Gagal memuat data.");
  }
};

const handleSave = async () => {
  if (!form.value.kode.trim()) {
    toast.warning("Kode kategori harus diisi.");
    return;
  }
  if (form.value.kode.length > 5) {
    toast.warning("Kode kategori maksimal 5 karakter.");
    return;
  }
  if (!form.value.nama.trim()) {
    toast.warning("Nama kategori harus diisi.");
    return;
  }

  isSaving.value = true;
  try {
    await kategoriApi.save(form.value);
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
  />

  <v-dialog v-model="dialog" max-width="400" persistent>
    <v-card rounded="lg">
      <v-card-title
        class="d-flex align-center gap-2 pa-4 pb-2"
        style="font-size: 14px; font-weight: 700; border-top: 3px solid #3B5998"
      >
        <IconCategory :size="18" :stroke-width="1.8" color="#3B5998" />
        {{ dialogTitle }}
      </v-card-title>

      <v-card-text class="pa-4 pt-3">
        <div class="form-grid">
          <div class="form-row">
            <label class="form-label">Kode Kategori <span class="req">*</span></label>
            <v-text-field
              v-model="form.kode"
              density="compact"
              variant="outlined"
              hide-details
              maxlength="5"
              :disabled="form.isEdit"
              placeholder="Maks 5 karakter (Contoh: K001)"
            />
          </div>
          <div class="form-row">
            <label class="form-label">Nama Kategori <span class="req">*</span></label>
            <v-text-field
              v-model="form.nama"
              density="compact"
              variant="outlined"
              hide-details
              maxlength="80"
              placeholder="Nama kategori barang"
            />
          </div>
        </div>
      </v-card-text>

      <v-divider />
      <v-card-actions class="pa-3">
        <v-spacer />
        <v-btn variant="text" @click="dialog = false" :disabled="isSaving">Batal</v-btn>
        <v-btn color="primary" variant="flat" @click="handleSave" :loading="isSaving">Simpan</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.form-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.form-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.form-label {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}
.req {
  color: red;
}
</style>