<script setup lang="ts">
import { ref } from "vue";
import { useToast } from "vue-toastification";
import { IconList } from "@tabler/icons-vue";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { useBrowse } from "@/composables/useBrowse";
import {
  jenisPembayaranApi,
  type JenisPembayaran,
} from "@/api/master/jenisPembayaranApi";
import { exportJenisPembayaran } from "@/utils/exportExcel";

const MENU_ID = "8";
const toast = useToast();

const {
  browseRef,
  getExportItems,
  items,
  isLoading,
  selected,
  canInsert,
  canDelete,
  canExport,
  fetchData,
} = useBrowse<JenisPembayaran>({
  menuId: MENU_ID,
  fetchApi: jenisPembayaranApi.getAll,
});

const headers = [{ title: "Jenis Pembayaran", key: "nama", minWidth: "200px" }];

// ── Dialog ───────────────────────────────────────────────────────────
const dialog = ref(false);
const isSaving = ref(false);
const formNama = ref("");

const openCreate = () => {
  formNama.value = "";
  dialog.value = true;
};

const handleSave = async () => {
  if (!formNama.value.trim()) {
    toast.warning("Jenis pembayaran harus diisi.");
    return;
  }

  isSaving.value = true;
  try {
    await jenisPembayaranApi.save({ nama: formNama.value.trim() });
    toast.success("Berhasil disimpan.");
    dialog.value = false;
    await fetchData();
  } catch (e: any) {
    toast.error(e.response?.data?.message ?? "Gagal menyimpan.");
  } finally {
    isSaving.value = false;
  }
};

const handleDelete = async (item: JenisPembayaran) => {
  try {
    await jenisPembayaranApi.delete(item.nama);
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
    title="Master Jenis Pembayaran"
    :menu-id="MENU_ID"
    :icon="IconList"
    :headers="headers"
    :items="items ?? []"
    :is-loading="isLoading"
    :selected="selected"
    @update:selected="selected = $event"
    item-value="nama"
    :can-insert="canInsert"
    :can-edit="false"
    :can-delete="canDelete"
    :can-export="canExport"
    :export-fn="() => exportJenisPembayaran(getExportItems())"
    search-placeholder="Cari jenis pembayaran..."
    @refresh="fetchData"
    @add="openCreate"
    @delete="handleDelete"
  />

  <!-- ── Dialog Tambah ── -->
  <v-dialog v-model="dialog" max-width="380" persistent>
    <v-card rounded="lg">
      <v-card-title
        class="d-flex align-center gap-2 pa-4 pb-2"
        style="font-size: 14px; font-weight: 700; border-top: 3px solid #3B5998"
      >
        <IconList :size="18" :stroke-width="1.8" color="#3B5998" />
        Tambah Jenis Pembayaran
      </v-card-title>

      <v-card-text class="pa-4 pt-3">
        <label class="form-label"
          >Jenis Pembayaran <span class="req">*</span></label
        >
        <v-text-field
          v-model="formNama"
          density="compact"
          variant="outlined"
          hide-details
          placeholder="Contoh: BAYAR KE SUPPLIER"
          autofocus
          @keydown.enter="handleSave"
        />
      </v-card-text>

      <v-divider />
      <v-card-actions class="pa-3">
        <v-spacer />
        <v-btn variant="text" @click="dialog = false" :disabled="isSaving"
          >Batal</v-btn
        >
        <v-btn
          color="primary"
          variant="flat"
          @click="handleSave"
          :loading="isSaving"
          >Simpan</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.form-label {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  display: block;
  margin-bottom: 4px;
}
.req {
  color: red;
}
</style>
