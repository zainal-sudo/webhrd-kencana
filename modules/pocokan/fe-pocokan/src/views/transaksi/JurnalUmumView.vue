<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { isAuthExpiredError } from "@/api/axios";
import BaseBrowse from "@/components/BaseBrowse.vue";
import {
  jurnalUmumApi,
  type JurnalUmumRow,
  type JurnalUmumDetailRow,
} from "@/api/transaksi/jurnalUmumApi";
import { exportJurnalUmum, exportJurnalUmumDetail } from "@/utils/exportExcel";
import { IconBook, IconFileSpreadsheet } from "@tabler/icons-vue";

const router = useRouter();
const toast = useToast();
const MENU_ID = "26";

// ── Periode ───────────────────────────────────────────────────────────
const STORAGE_KEY = "finance_periode_jurnal_umum";

const getLocal = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

const getSavedPeriode = () => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
    if (saved?.startDate && saved?.endDate) return saved;
  } catch {
    /* silent */
  }
  return null;
};

const now = new Date();
const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
const savedPeriode = getSavedPeriode();

const startDate = ref(savedPeriode?.startDate ?? getLocal(firstDay));
const endDate = ref(savedPeriode?.endDate ?? getLocal(now));

watch([startDate, endDate], ([s, e]) => {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ startDate: s, endDate: e })
    );
  } catch {
    /* silent */
  }
  loadData();
});

// ── Data ──────────────────────────────────────────────────────────────
const items = ref<JurnalUmumRow[]>([]);
const detailItems = ref<JurnalUmumDetailRow[]>([]);
const isLoading = ref(false);
const selected = ref<JurnalUmumRow[]>([]);
const expanded = ref<any[]>([]);

const selectedItem = computed(() => selected.value[0] ?? null);

// ── Headers ───────────────────────────────────────────────────────────
const headers = [
  { key: "Nomor", title: "Nomor", width: "170px" },
  { key: "Tipe", title: "Tipe", width: "60px", align: "center" as const },
  {
    key: "Tanggal",
    title: "Tanggal",
    width: "100px",
    align: "center" as const,
  },
  { key: "Debet", title: "Debet", width: "140px", align: "right" as const },
  { key: "Kredit", title: "Kredit", width: "140px", align: "right" as const },
  { key: "Keterangan", title: "Keterangan", width: "280px" },
  { key: "Closed", title: "Closed", width: "70px", align: "center" as const },
];

// ── Load ──────────────────────────────────────────────────────────────
const loadData = async () => {
  isLoading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const [master, detail] = await Promise.all([
      jurnalUmumApi.getBrowse(startDate.value, endDate.value),
      jurnalUmumApi.getBrowseDetail(startDate.value, endDate.value),
    ]);
    items.value = master;
    detailItems.value = detail;
  } catch (e: any) {
    if (isAuthExpiredError(e)) return;
    toast.error(e.response?.data?.message ?? "Gagal memuat data.");
  } finally {
    isLoading.value = false;
  }
};

onMounted(loadData);

const getDetail = (nomor: string) =>
  detailItems.value.filter((d) => d.Nomor === nomor);

// ── Validasi ──────────────────────────────────────────────────────────
const validateAction = (action: "ubah" | "hapus"): boolean => {
  if (!selectedItem.value) {
    toast.warning("Pilih data terlebih dahulu.");
    return false;
  }
  if (selectedItem.value.Closed === "Sudah") {
    const msg =
      action === "ubah"
        ? "Transaksi sudah diclose. Tidak bisa diubah."
        : "Transaksi sudah diclose. Tidak bisa dihapus.";
    toast.warning(msg);
    return false;
  }
  return true;
};

// ── Aksi ──────────────────────────────────────────────────────────────
const onBaru = () => router.push({ name: "JurnalUmumCreate" });
const onUbah = () => {
  if (!validateAction("ubah")) return;
  router.push({
    name: "JurnalUmumEdit",
    params: { nomor: encodeURIComponent(selectedItem.value!.Nomor) },
  });
};

// ── Hapus ─────────────────────────────────────────────────────────────
const showDeleteDialog = ref(false);
const isDeleting = ref(false);

const onHapus = () => {
  if (!validateAction("hapus")) return;
  showDeleteDialog.value = true;
};

const confirmDelete = async () => {
  if (!selectedItem.value) return;
  isDeleting.value = true;
  try {
    await jurnalUmumApi.delete(selectedItem.value.Nomor);
    toast.success("Data berhasil dihapus.");
    showDeleteDialog.value = false;
    await loadData();
  } catch (e: any) {
    if (isAuthExpiredError(e)) return;
    toast.error(e.response?.data?.message ?? "Gagal menghapus.");
  } finally {
    isDeleting.value = false;
  }
};

// ── Export ────────────────────────────────────────────────────────────
const doExport = () =>
  exportJurnalUmum(getExportItems(), startDate.value, endDate.value);
const doExportDetail = () =>
  exportJurnalUmumDetail(getExportItems().flatMap((row) => getDetail(row.Nomor)), startDate.value, endDate.value);

// ── Row props ─────────────────────────────────────────────────────────
const rowPropsFn = (data: any) => {
  const row = data.item?.raw || data.item;
  if (row.Closed === "Sudah") return { class: "row-closed" };
  return {};
};

const fmt = (v: number) => new Intl.NumberFormat("id-ID").format(v || 0);

const fmtDate = (v: string) => {
  if (!v) return "-";
  const [y, m, d] = v.split("-");
  return `${d}-${m}-${y}`;
};
const browseRef = ref<InstanceType<typeof BaseBrowse> | null>(null);
const getExportItems = (): typeof items.value => browseRef.value?.getExportItems() ?? [];
</script>

<template>
  <BaseBrowse
    ref="browseRef"
    title="Jurnal Umum"
    :icon="IconBook"
    :menu-id="MENU_ID"
    :headers="headers"
    :items="items"
    :is-loading="isLoading"
    :fixed-layout="false"
    :show-expand="true"
    :expanded="expanded"
    @update:expanded="expanded = $event"
    item-value="Nomor"
    v-model:selected="selected"
    :row-props-fn="rowPropsFn"
    @refresh="loadData"
  >
    <!-- ── Filter periode ── -->
    <template #filter-left>
      <div class="filter-group">
        <span class="filter-lbl">Periode</span>
        <input v-model="startDate" type="date" class="date-inp" />
        <span class="filter-sep">s/d</span>
        <input v-model="endDate" type="date" class="date-inp" />
      </div>
    </template>

    <!-- ── Tombol aksi ── -->
    <template #extra-actions>
      <v-btn size="small" color="primary" variant="flat" @click="onBaru"
        >+ Baru</v-btn
      >
      <v-btn
        size="small"
        variant="outlined"
        :disabled="!selectedItem"
        @click="onUbah"
        >Ubah</v-btn
      >
      <v-btn
        size="small"
        color="error"
        variant="tonal"
        :disabled="!selectedItem"
        @click="onHapus"
        >Hapus</v-btn
      >
      <v-btn size="small" variant="tonal" color="success" @click="doExport">
        <template #prepend
          ><IconFileSpreadsheet :size="13" :stroke-width="1.8"
        /></template>
        Export
      </v-btn>
      <v-btn size="small" variant="tonal" color="info" @click="doExportDetail">
        <template #prepend
          ><IconFileSpreadsheet :size="13" :stroke-width="1.8"
        /></template>
        Export Detail
      </v-btn>
    </template>

    <!-- ── Custom cell: Debet ── -->
    <template #item.Debet="{ value }">
      <span style="font-variant-numeric: tabular-nums">{{
        fmt(Number(value))
      }}</span>
    </template>

    <!-- ── Custom cell: Kredit ── -->
    <template #item.Kredit="{ value }">
      <span style="font-variant-numeric: tabular-nums">{{
        fmt(Number(value))
      }}</span>
    </template>

    <template #item.Tanggal="{ value }">
      <span>{{ fmtDate(value) }}</span>
    </template>

    <!-- ── Custom cell: Closed badge ── -->
    <template #item.Closed="{ value }">
      <span :class="value === 'Sudah' ? 'badge-closed' : 'badge-open'">{{
        value
      }}</span>
    </template>

    <!-- ── Expanded detail ── -->
    <template #detail="{ item }">
      <div class="detail-wrap">
        <table class="detail-tbl">
          <thead>
            <tr>
              <th style="width: 100px">Account</th>
              <th style="min-width: 200px">Nama Account</th>
              <th style="min-width: 120px">Detail CC</th>
              <th style="width: 130px">Debet</th>
              <th style="width: 130px">Kredit</th>
              <th style="min-width: 280px">Uraian</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(d, idx) in getDetail(item.Nomor)" :key="idx">
              <td>{{ d.Account }}</td>
              <td>{{ d.NamaAccount }}</td>
              <td>{{ d.DetailCC }}</td>
              <td class="tr">{{ d.Debet ? fmt(d.Debet) : "" }}</td>
              <td class="tr">{{ d.Kredit ? fmt(d.Kredit) : "" }}</td>
              <td>{{ d.Uraian }}</td>
            </tr>
            <tr v-if="!getDetail(item.Nomor).length">
              <td
                colspan="6"
                class="tc"
                style="color: #9e9e9e; font-style: italic; padding: 8px"
              >
                Tidak ada detail.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </BaseBrowse>

  <!-- ── Dialog Hapus ── -->
  <v-dialog v-model="showDeleteDialog" max-width="400" persistent>
    <v-card rounded="lg">
      <v-card-title class="text-body-1 font-weight-bold pa-4"
        >Konfirmasi Hapus</v-card-title
      >
      <v-card-text class="pa-4 pt-0">
        Yakin ingin menghapus <strong>{{ selectedItem?.Nomor }}</strong
        >?
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
/* Filter */
.filter-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap; /* Mencegah overflow jika layar menyempit */
}
.filter-lbl {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  white-space: nowrap;
}
.filter-sep {
  font-size: 12px;
  color: #9ca3af;
  white-space: nowrap;
}
.date-inp {
  height: 32px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 0 8px;
  font-size: 12px;
  outline: none;
  width: 130px; /* 👈 Lebar disamakan */
}
.date-inp:focus {
  border-color: #3B5998;
}

.tc {
  text-align: center;
}
.tr {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

:deep(.row-closed td) {
  color: #9e9e9e !important;
}

.badge-closed {
  background: #e0e0e0;
  color: #616161;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
}
.badge-open {
  background: #e8e8f5;
  color: #3B5998;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
}

.detail-wrap {
  padding: 4px 0;
}
.detail-tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.detail-tbl thead tr {
  background: #3B5998;
}
.detail-tbl th {
  color: white;
  font-weight: 700;
  padding: 4px 8px;
  white-space: nowrap;
  text-align: left;
}
.detail-tbl td {
  padding: 3px 8px;
  border-bottom: 1px solid #f0f0f0;
}
.detail-tbl tbody tr:hover td {
  background: rgba(46, 46, 125, 0.05);
}
</style>
