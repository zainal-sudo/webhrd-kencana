<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { IconAdjustments, IconPlus, IconTrash } from "@tabler/icons-vue";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { useBrowse } from "@/composables/useBrowse";
import {
  costCenterApi,
  type CostCenter,
  type CostCenterDetail,
} from "@/api/master/costCenterApi";
import { exportCostCenter } from "@/utils/exportExcel";

const MENU_ID = "5";
const toast = useToast();
const router = useRouter();

// ── Browse ────────────────────────────────────────────────────────────
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
} = useBrowse<CostCenter>({
  menuId: MENU_ID,
  fetchApi: costCenterApi.getAll,
});

const headers = [
  { title: "Nomor", key: "kode", width: "100px" },
  { title: "Nama", key: "nama", minWidth: "200px" },
];

const itemsMapped = computed(() => items.value);

// ── Expanded detail ───────────────────────────────────────────────────
const expanded = ref<any[]>([]);

// ── Dialog Form ───────────────────────────────────────────────────────
const dialog = ref(false);
const dialogTitle = ref("");
const isEdit = ref(false);
const isSaving = ref(false);

const formKode = ref("");
const formNama = ref("");
const formDetail = ref<CostCenterDetail[]>([{ nama: "" }]);

const openCreate = () => {
  isEdit.value = false;
  dialogTitle.value = "Tambah Cost Center";
  formKode.value = "";
  formNama.value = "";
  formDetail.value = [{ nama: "" }];
  dialog.value = true;
};

const openEdit = async (item: CostCenter) => {
  isEdit.value = true;
  dialogTitle.value = "Ubah Cost Center";
  try {
    const data = await costCenterApi.getById(item.kode);
    formKode.value = data.kode;
    formNama.value = data.nama;
    formDetail.value = data.detail.length
      ? data.detail.map((d) => ({ nama: d.nama, pakai: d.pakai }))
      : [{ nama: "" }];
    dialog.value = true;
  } catch (e: any) {
    if (e?.isAuthExpired) return; // ← skip toast, dialog sudah muncul
    toast.error(e.response?.data?.message ?? "Gagal memuat data.");
  }
};

const addDetailRow = () => {
  formDetail.value.push({ nama: "" });
};

const removeDetailRow = (idx: number) => {
  if (formDetail.value[idx].pakai) {
    toast.warning("Detail ini sudah dipakai transaksi, tidak bisa dihapus.");
    return;
  }
  formDetail.value.splice(idx, 1);
  if (formDetail.value.length === 0) formDetail.value.push({ nama: "" });
};

const handleSave = async () => {
  if (!formNama.value.trim()) {
    toast.warning("Nama harus diisi.");
    return;
  }
  const validDetail = formDetail.value.filter((d) => d.nama.trim());
  if (validDetail.length === 0) {
    toast.warning("Minimal 1 detail harus diisi.");
    return;
  }

  isSaving.value = true;
  try {
    await costCenterApi.save({
      isEdit: isEdit.value,
      kode: formKode.value,
      nama: formNama.value.trim(),
      detail: validDetail,
    });
    toast.success("Berhasil disimpan.");
    dialog.value = false;
    await fetchData();
  } catch (e: any) {
    toast.error(e.response?.data?.message ?? "Gagal menyimpan.");
  } finally {
    isSaving.value = false;
  }
};

// ── Delete ────────────────────────────────────────────────────────────
const handleDelete = async (item: CostCenter) => {
  try {
    await costCenterApi.delete(item.kode);
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
    title="Master Cost Center"
    :menu-id="MENU_ID"
    :icon="IconAdjustments"
    :headers="headers"
    :items="itemsMapped ?? []"
    :is-loading="isLoading"
    :selected="selected"
    @update:selected="selected = $event"
    item-value="kode"
    :can-insert="canInsert"
    :can-edit="canEdit"
    :can-delete="canDelete"
    :can-export="canExport"
    :show-expand="true"
    :expanded="expanded"
    @update:expanded="expanded = $event"
    search-placeholder="Cari cost center..."
    @refresh="fetchData"
    @add="openCreate"
    @edit="openEdit"
    @delete="handleDelete"
    :export-fn="() => exportCostCenter(getExportItems(), 'browse')"
  >
    <!-- Expanded detail -->
    <template #detail="{ item }">
      <div
        style="
          display: inline-block;
          border: 1px solid #e0e0e0;
          border-radius: 4px;
          overflow: hidden;
          background: white;
        "
      >
        <table style="border-collapse: collapse; width: auto; min-width: 200px">
          <thead>
            <tr>
              <th style="width: 40px">No</th>
              <th style="min-width: 160px">Nama Detail</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(d, i) in item.detail" :key="i">
              <td>{{ Number(i) + 1 }}</td>
              <td>{{ d.nama }}</td>
            </tr>
            <tr v-if="!item.detail?.length">
              <td colspan="2" style="text-align: center; color: #aaa">
                Tidak ada detail
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- Extra: Export Detail -->
    <template #extra-actions="{ selected: sel }">
      <v-btn
        size="small"
        color="blue"
        @click="exportCostCenter(getExportItems(), 'detail')"
      >
        Export Detail
      </v-btn>
    </template>
  </BaseBrowse>

  <!-- ── Dialog Form ── -->
  <v-dialog v-model="dialog" max-width="560" persistent>
    <v-card rounded="lg">
      <v-card-title
        class="d-flex align-center gap-2 pa-4 pb-2"
        style="font-size: 14px; font-weight: 700; border-top: 3px solid #3B5998"
      >
        <IconAdjustments :size="18" :stroke-width="1.8" color="#3B5998" />
        {{ dialogTitle }}
      </v-card-title>

      <v-card-text class="pa-4 pt-2">
        <!-- Nomor (hanya tampil saat edit) -->
        <div v-if="isEdit" class="form-row mb-3">
          <label class="form-label">Nomor</label>
          <v-text-field
            v-model="formKode"
            disabled
            density="compact"
            variant="outlined"
            hide-details
          />
        </div>

        <!-- Nama -->
        <div class="form-row mb-4">
          <label class="form-label"
            >Nama Cost Center <span style="color: red">*</span></label
          >
          <v-text-field
            v-model="formNama"
            density="compact"
            variant="outlined"
            hide-details
            placeholder="Contoh: FINANCE & AKUNTING"
            autofocus
            @keydown.enter="$event.preventDefault()"
          />
        </div>

        <!-- Detail -->
        <div class="form-label mb-2" style="font-weight: 700">
          Detail Cost Center <span style="color: red">*</span>
        </div>
        <div class="detail-list">
          <div v-for="(d, idx) in formDetail" :key="idx" class="detail-row">
            <span class="detail-no">{{ idx + 1 }}</span>
            <v-text-field
              v-model="d.nama"
              density="compact"
              variant="outlined"
              hide-details
              placeholder="Nama detail..."
              :disabled="!!d.pakai"
              :hint="d.pakai ? 'Sudah dipakai transaksi' : ''"
              class="flex-1"
            />
            <v-btn
              size="small"
              icon
              variant="text"
              color="error"
              :disabled="!!d.pakai"
              @click="removeDetailRow(idx)"
            >
              <IconTrash :size="15" :stroke-width="1.8" />
            </v-btn>
          </div>
        </div>

        <v-btn
          size="small"
          variant="tonal"
          color="primary"
          class="mt-2"
          @click="addDetailRow"
        >
          <template #prepend
            ><IconPlus :size="14" :stroke-width="2"
          /></template>
          Tambah Baris
        </v-btn>
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
.form-row {
  display: flex;
  flex-direction: column;
}
.detail-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 260px;
  overflow-y: auto;
  padding-right: 2px;
}
.detail-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.detail-no {
  font-size: 12px;
  color: #999;
  width: 20px;
  text-align: right;
  flex-shrink: 0;
}
.flex-1 {
  flex: 1;
}

:deep(.expanded-wrapper) {
  display: inline-block !important;
  width: auto !important;
}

:deep(.expanded-wrapper table) {
  width: auto !important;
  table-layout: auto !important;
}

:deep(.expanded-inner) {
  display: flex;
  justify-content: flex-start;
}
</style>
