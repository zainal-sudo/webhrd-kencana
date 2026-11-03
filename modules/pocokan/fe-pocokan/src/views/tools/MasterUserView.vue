<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { isAuthExpiredError } from "@/api/axios";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { useBrowse } from "@/composables/useBrowse";
import { masterUserApi, type UserRow } from "@/api/tools/masterUserApi";
import { exportMasterUser } from "@/utils/exportExcel";
import { IconUsers, IconFileSpreadsheet } from "@tabler/icons-vue";

const router = useRouter();
const toast = useToast();
const MENU_ID = "1";

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
  isSingleSelected,
  selectedItem,
  fetchData,
  clearSelection,
} = useBrowse<UserRow>({
  menuId: MENU_ID,
  fetchApi: async () => masterUserApi.getBrowse(),
});

// ── Headers ───────────────────────────────────────────────────────────
const headers = [
  { key: "Kode", title: "Kode", width: "120px" },
  { key: "Nama", title: "Nama", width: "280px" },
  { key: "JumlahMenu", title: "Jumlah Menu", width: "120px", align: "right" as const },
  { key: "Edit", title: "Edit Laporan", width: "110px", align: "center" as const },
];

// ── Row props — user tanpa hak edit laporan diberi warna abu ──────────
const rowPropsFn = (data: any) => {
  const row = data?.item?.raw ?? data?.item ?? data;
  if (row?.Edit === "TIDAK")
    return { style: "color:#9e9e9e;font-style:italic;" };
  return {};
};

// ── Actions ───────────────────────────────────────────────────────────
const onAdd = () => router.push("/tools/users/create");
const onEdit = (item: any) =>
  router.push(`/tools/users/edit/${encodeURIComponent(item.Kode)}`);

const showDeleteDialog = ref(false);
const isDeleting = ref(false);

const onDelete = () => {
  if (!selectedItem.value) return;
  showDeleteDialog.value = true;
};

const confirmDelete = async () => {
  if (!selectedItem.value) return;
  isDeleting.value = true;
  try {
    await masterUserApi.delete(selectedItem.value.Kode);
    toast.success("User berhasil dihapus.");
    showDeleteDialog.value = false;
    await fetchData();
  } catch (e: any) {
    if (isAuthExpiredError(e)) return;
    toast.error(e.response?.data?.message ?? "Gagal menghapus.");
  } finally {
    isDeleting.value = false;
  }
};

const doExport = () => exportMasterUser(getExportItems() ?? []);
</script>

<template>
  <BaseBrowse
    ref="browseRef"
    title="Master User"
    :icon="IconUsers"
    :menu-id="MENU_ID"
    :headers="headers"
    :items="items ?? []"
    :is-loading="isLoading"
    :fixed-layout="false"
    item-value="Kode"
    v-model:selected="selected"
    :can-insert="canInsert"
    :can-edit="canEdit"
    :row-props-fn="rowPropsFn"
    @refresh="fetchData"
    @add="onAdd"
    @edit="onEdit"
  >
    <!-- ── Extra actions ── -->
    <template #extra-actions>
      <v-btn
        v-if="canDelete"
        size="small"
        color="error"
        variant="tonal"
        :disabled="!isSingleSelected"
        @click="onDelete"
      >
        Hapus
      </v-btn>
      <v-btn
        v-if="canExport"
        size="small"
        variant="tonal"
        color="success"
        @click="doExport"
      >
        <template #prepend>
          <IconFileSpreadsheet :size="13" :stroke-width="1.8" />
        </template>
        Export
      </v-btn>
    </template>

    <!-- ── Custom cell Edit ── -->
    <template #item.Edit="{ value }">
      <span
        class="aktif-badge"
        :class="value === 'YA' ? 'aktif-ya' : 'aktif-tidak'"
      >
        {{ value }}
      </span>
    </template>

    <!-- ── Jumlah menu ── -->
    <template #item.JumlahMenu="{ value }">
      <span style="font-variant-numeric: tabular-nums">{{ value }}</span>
    </template>
  </BaseBrowse>

  <!-- ── Dialog Hapus ── -->
  <v-dialog v-model="showDeleteDialog" max-width="400" persistent>
    <v-card rounded="lg">
      <v-card-title class="text-body-1 font-weight-bold pa-4">
        Konfirmasi Hapus
      </v-card-title>
      <v-card-text class="pa-4 pt-0" style="font-size: 12px">
        Yakin ingin menghapus user
        <strong>{{ selectedItem?.Kode }}</strong> — {{ selectedItem?.Nama }}?
        Hak akses user ini juga akan dihapus.
      </v-card-text>
      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn variant="text" @click="showDeleteDialog = false">Batal</v-btn>
        <v-btn
          color="error"
          variant="flat"
          :loading="isDeleting"
          @click="confirmDelete"
        >
          Ya, Hapus
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.aktif-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
  display: inline-block;
}
.aktif-ya {
  background: #e8e8f5;
  color: #3B5998;
}
.aktif-tidak {
  background: #fbe9e7;
  color: #c62828;
}
</style>
