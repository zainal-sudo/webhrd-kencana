<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useToast } from "vue-toastification";
import { IconBuildingBank } from "@tabler/icons-vue";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { useBrowse } from "@/composables/useBrowse";
import { useTabsStore } from "@/stores/tabsStore";
import { useRoute } from "vue-router";
import {
  accountApi,
  type Account,
  type AccountForm,
} from "@/api/master/accountApi";
import { exportAccount } from "@/utils/exportExcel";
const tabsStore = useTabsStore();

const MENU_ID = "6";
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
} = useBrowse<Account>({ menuId: MENU_ID, fetchApi: accountApi.getAll });

const headers = [
  { title: "Kode", key: "kode", width: "100px" },
  { title: "Nama", key: "nama", minWidth: "180px" },
  { title: "No. Rek Bank", key: "no_rekening", width: "140px" },
  { title: "Kelompok", key: "kelompok", width: "140px" },
  { title: "Cabang", key: "cabang", width: "70px", align: "center" },
  { title: "Store", key: "store", width: "120px" },
  { title: "Keterangan", key: "keterangan", minWidth: "120px" },
  { title: "Status", key: "status", width: "70px", align: "center" },
  { title: "Saldo Akhir", key: "saldo_akhir", width: "120px", align: "end" },
];

// ── Lookup options ────────────────────────────────────────────────────
const kelompokOpts = ref<{ id: number; nama: string }[]>([]);
const cabangOpts = ref<string[]>([]);
  const route = useRoute(); // <-- Tambahkan ini
onMounted(async () => {
  // ... kode onMounted yang sudah ada (fetch kelompok & cabang) ...
  try {
    const [kel, cab] = await Promise.all([
      accountApi.getKelompok(),
      accountApi.getCabang(),
    ]);
    kelompokOpts.value = kel;
    cabangOpts.value = cab.map((c) => c.cabang);
  } catch {
    /* silent */
  }

  // --- TAMBAHKAN INI UNTUK MERESET PENCARIAN SAAT TAB DITUTUP ---
  const currentTab = tabsStore.tabs.find((t) => t.path === route.path);
  if (currentTab) {
    currentTab.onClose = () => {
      if (browseRef.value && typeof browseRef.value.clearSearch === "function") {
        browseRef.value.clearSearch();
      }
    };
  }
});
onUnmounted(() => {
  if (browseRef.value && typeof browseRef.value.clearSearch === "function") {
    browseRef.value.clearSearch();
  }
});

// ── Dialog ───────────────────────────────────────────────────────────
const dialog = ref(false);
const dialogTitle = ref("");
const isSaving = ref(false);

const emptyForm = (): AccountForm => ({
  isEdit: false,
  kode: "",
  nama: "",
  no_rekening: "",
  kol_id: null,
  cabang: "",
  store: "",
  keterangan: "",
  is_aktif: true,
});
const form = ref<AccountForm>(emptyForm());

const openCreate = () => {
  form.value = emptyForm();
  form.value.cabang = cabangOpts.value[0] ?? "";
  dialogTitle.value = "Tambah Account / Rekening";
  dialog.value = true;
};

const openEdit = async (item: Account) => {
  try {
    const d = await accountApi.getById(item.kode);
    form.value = {
      isEdit: true,
      kode: d.kode,
      nama: d.nama,
      no_rekening: d.no_rekening,
      kol_id: d.kol_id,
      cabang: d.cabang,
      store: d.store ?? "",
      keterangan: d.keterangan,
      is_aktif: d.is_aktif === 0,
    };
    dialogTitle.value = "Ubah Account / Rekening";
    dialog.value = true;
  } catch (e: any) {
    if (e?.isAuthExpired) return; // ← skip toast, dialog sudah muncul
    toast.error(e.response?.data?.message ?? "Gagal memuat data.");
  }
};

const handleSave = async () => {
  if (!form.value.kode.trim()) {
    toast.warning("Kode harus diisi.");
    return;
  }
  if (!form.value.nama.trim()) {
    toast.warning("Nama harus diisi.");
    return;
  }
  if (!form.value.kol_id) {
    toast.warning("Kelompok harus dipilih.");
    return;
  }

  isSaving.value = true;
  try {
    await accountApi.save(form.value);
    toast.success("Berhasil disimpan.");
    dialog.value = false;
    await fetchData();
  } catch (e: any) {
    toast.error(e.response?.data?.message ?? "Gagal menyimpan.");
  } finally {
    isSaving.value = false;
  }
};

const handleDelete = async (item: Account) => {
  try {
    await accountApi.delete(item.kode);
    toast.success("Berhasil dihapus.");
    await fetchData();
  } catch (e: any) {
    toast.error(e.response?.data?.message ?? "Gagal menghapus.");
  }
};

const fmt = (v: number) => new Intl.NumberFormat("id-ID").format(v || 0);
</script>

<template>
  <BaseBrowse
    ref="browseRef"
    title="Master Account / Rekening"
    :menu-id="MENU_ID"
    :icon="IconBuildingBank"
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
    :export-fn="() => exportAccount(getExportItems())"
    search-placeholder="Cari account..."
    @refresh="fetchData"
    @add="openCreate"
    @edit="openEdit"
    @delete="handleDelete"
  >
    <!-- Saldo formatting -->
    <template #item.saldo_akhir="{ item }">
      <span :style="{ color: item.saldo_akhir < 0 ? '#c62828' : 'inherit' }">
        {{ fmt(item.saldo_akhir) }}
      </span>
    </template>

    <!-- Status badge -->
    <template #item.status="{ item }">
      <span
        :style="{
          background: item.status === 'Aktif' ? '#e8e8f5' : '#ffebee',
          color: item.status === 'Aktif' ? '#3B5998' : '#c62828',
          padding: '1px 8px',
          borderRadius: '3px',
          fontSize: '11px',
          fontWeight: 600,
        }"
        >{{ item.status }}</span
      >
    </template>
  </BaseBrowse>

  <!-- ── Dialog Form ── -->
  <v-dialog v-model="dialog" max-width="500" persistent>
    <v-card rounded="lg">
      <v-card-title
        class="d-flex align-center gap-2 pa-4 pb-2"
        style="font-size: 14px; font-weight: 700; border-top: 3px solid #3B5998"
      >
        <IconBuildingBank :size="18" :stroke-width="1.8" color="#3B5998" />
        {{ dialogTitle }}
      </v-card-title>

      <v-card-text class="pa-4 pt-3">
        <div class="form-grid">
          <!-- Kode -->
          <div class="form-row">
            <label class="form-label">Kode <span class="req">*</span></label>
            <v-text-field
              v-model="form.kode"
              density="compact"
              variant="outlined"
              hide-details
              :disabled="form.isEdit"
              placeholder="Contoh: 1101"
            />
          </div>

          <!-- Nama -->
          <div class="form-row">
            <label class="form-label">Nama <span class="req">*</span></label>
            <v-text-field
              v-model="form.nama"
              density="compact"
              variant="outlined"
              hide-details
              placeholder="Nama rekening"
            />
          </div>

          <!-- No Rekening Bank -->
          <div class="form-row">
            <label class="form-label">No. Rekening Bank</label>
            <v-text-field
              v-model="form.no_rekening"
              density="compact"
              variant="outlined"
              hide-details
              placeholder="Nomor rekening bank"
            />
          </div>

          <!-- Kelompok -->
          <div class="form-row">
            <label class="form-label"
              >Kelompok <span class="req">*</span></label
            >
            <v-select
              v-model="form.kol_id"
              density="compact"
              variant="outlined"
              hide-details
              :items="kelompokOpts"
              item-title="nama"
              item-value="id"
              placeholder="Pilih kelompok"
            />
          </div>

          <!-- Cabang -->
          <div class="form-row">
            <label class="form-label">Cabang</label>
            <v-select
              v-model="form.cabang"
              density="compact"
              variant="outlined"
              hide-details
              :items="cabangOpts"
              placeholder="Pilih cabang"
            />
          </div>

          <!-- Store Kaosan -->
          <div class="form-row">
            <label class="form-label">Store (Kaosan)</label>
            <v-text-field
              v-model="form.store"
              density="compact"
              variant="outlined"
              hide-details
              placeholder="Cabang kaosan"
            />
          </div>

          <!-- Keterangan -->
          <div class="form-row">
            <label class="form-label">Keterangan</label>
            <v-text-field
              v-model="form.keterangan"
              density="compact"
              variant="outlined"
              hide-details
              placeholder="Keterangan opsional"
            />
          </div>

          <!-- Status -->
          <div class="form-row">
            <label class="form-label">Status</label>
            <v-checkbox
              v-model="form.is_aktif"
              label="Aktif"
              density="compact"
              hide-details
              color="primary"
            />
          </div>
        </div>
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
