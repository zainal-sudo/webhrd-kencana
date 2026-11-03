<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { isAuthExpiredError } from "@/api/axios";
import BaseBrowse from "@/components/BaseBrowse.vue";
import {
  pembayaranCustomerApi,
  type PembayaranCustomerRow,
  type PembayaranCustomerDetailRow,
} from "@/api/posting/pembayaranCustomerApi";
import {
  exportPembayaranCustomer,
  exportPembayaranCustomerDetail,
} from "@/utils/exportExcel";
import { IconFileInvoice, IconFileSpreadsheet } from "@tabler/icons-vue";

const router = useRouter();
const toast = useToast();
const MENU_ID = "51";

// ── Periode ───────────────────────────────────────────────────────────
const STORAGE_KEY = "finance_periode_pembayaran_customer";

const getLocal = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};
const getSaved = () => {
  try {
    const s = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
    if (s?.startDate && s?.endDate) return s;
  } catch {
    /* silent */
  }
  return null;
};

const now = new Date();
const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
const saved = getSaved();

const filterState = ref({
  startDate: saved?.startDate ?? getLocal(firstDay),
  endDate: saved?.endDate ?? getLocal(now),
});

const startDate = computed({
  get: () => filterState.value.startDate,
  set: (v) => {
    filterState.value = { ...filterState.value, startDate: v };
  },
});
const endDate = computed({
  get: () => filterState.value.endDate,
  set: (v) => {
    filterState.value = { ...filterState.value, endDate: v };
  },
});

watch(
  filterState,
  (val) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(val));
    } catch {
      /* silent */
    }
  },
  { deep: true }
);

const filterValues = computed(() => ({ ...filterState.value }));

// ── Data ──────────────────────────────────────────────────────────────
const items = ref<PembayaranCustomerRow[]>([]);
const detailItems = ref<PembayaranCustomerDetailRow[]>([]);
const isLoading = ref(false);
const selected = ref<PembayaranCustomerRow[]>([]);
const expanded = ref<any[]>([]);

const selectedItem = computed(() => selected.value[0] ?? null);

// ── Headers ───────────────────────────────────────────────────────────
const headers = [
  { key: "Nomor", title: "Nomor", width: "200px" },
  { key: "Tipe", title: "Tipe", width: "60px", align: "center" as const },
  { key: "Account", title: "Account", width: "100px" },
  { key: "NamaAccount", title: "Nama Account", width: "220px" },
  { key: "Rekening", title: "Rekening", width: "130px" },
  {
    key: "Tanggal",
    title: "Tanggal",
    width: "100px",
    align: "center" as const,
  },
  { key: "DiterimaDari", title: "Diterima Dari", width: "150px" },
  { key: "Nota", title: "Nota", width: "120px" },
  { key: "Keterangan", title: "Keterangan", width: "280px" },
  { key: "Nominal", title: "Nominal", width: "140px", align: "right" as const },
  { key: "Cabang", title: "Cabang", width: "70px", align: "center" as const },
  { key: "Closed", title: "Closed", width: "80px", align: "center" as const },
];

// ── Load ──────────────────────────────────────────────────────────────
const loadData = async () => {
  isLoading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const [master, detail] = await Promise.all([
      pembayaranCustomerApi.getBrowse(
        filterState.value.startDate,
        filterState.value.endDate
      ),
      pembayaranCustomerApi.getBrowseDetail(
        filterState.value.startDate,
        filterState.value.endDate
      ),
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

// ── Hapus ─────────────────────────────────────────────────────────────
// Delphi: cek Closed="Sudah" → tolak (di backend), confirm → delete
const showDeleteDialog = ref(false);
const isDeleting = ref(false);

const onHapus = () => {
  if (!selectedItem.value) {
    toast.warning("Pilih data terlebih dahulu.");
    return;
  }
  // Delphi: jika Closed="Sudah" → warning langsung di frontend juga
  if (selectedItem.value.Closed === "Sudah") {
    toast.error("Transaksi tersebut sudah diclose. Tidak bisa dihapus.");
    return;
  }
  showDeleteDialog.value = true;
};

const confirmDelete = async () => {
  if (!selectedItem.value) return;
  isDeleting.value = true;
  try {
    await pembayaranCustomerApi.delete(selectedItem.value.Nomor);
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

// ── Posting ───────────────────────────────────────────────────────────
const onPosting = () => {
  router.push({ name: "PembayaranCustomerForm" });
};

// ── Export ────────────────────────────────────────────────────────────
const doExport = () =>
  exportPembayaranCustomer(
    getExportItems(),
    filterState.value.startDate,
    filterState.value.endDate
  );
const doExportDetail = () =>
  exportPembayaranCustomerDetail(
    getExportItems().flatMap((row) => getDetail(row.Nomor)),
    filterState.value.startDate,
    filterState.value.endDate
  );

// ── Row props — merah jika Closed=Belum ───────────────────────────────
// Delphi: cxStyle1 saat jur_close=0
const rowPropsFn = (_data: any) => ({});

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
    title="Posting Pembayaran Customer"
    :icon="IconFileInvoice"
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
    :summary-key="'Nominal'"
    :summary-label="'Total Nominal'"
    :filter-values="filterValues"
    @refresh="loadData"
  >
    <!-- ── Filter ── -->
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
      <v-btn size="small" color="primary" variant="flat" @click="onPosting">
        <template #prepend
          ><IconFileInvoice :size="13" :stroke-width="1.8"
        /></template>
        Posting
      </v-btn>
      <v-btn
        size="small"
        color="error"
        variant="tonal"
        :disabled="!selectedItem"
        @click="onHapus"
      >
        Hapus
      </v-btn>
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

    <!-- ── Custom cell Nominal ── -->
    <template #item.Nominal="{ value }">
      <span class="tr">{{ fmt(value) }}</span>
    </template>

    <template #item.Tanggal="{ value }">
      <span>{{ fmtDate(value) }}</span>
    </template>

    <!-- ── Expanded detail ── -->
    <template #detail="{ item }">
      <div class="detail-wrap">
        <table class="detail-tbl">
          <thead>
            <tr>
              <th style="width: 40px">No</th>
              <th style="min-width: 300px">Uraian</th>
              <th style="width: 130px">Nominal</th>
              <th style="width: 90px">Account</th>
              <th style="min-width: 200px">Nama Account</th>
              <th style="min-width: 140px">Detail CC</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(d, idx) in getDetail(item.Nomor)" :key="idx">
              <td class="tc">{{ d.No }}</td>
              <td>{{ d.Uraian }}</td>
              <td class="tr">{{ fmt(d.Nominal) }}</td>
              <td>{{ d.Account }}</td>
              <td>{{ d.NamaAccount }}</td>
              <td>{{ d.DetailCC }}</td>
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
          <tfoot v-if="getDetail(item.Nomor).length">
            <tr class="detail-foot">
              <td colspan="2" class="tr detail-foot-lbl">Total</td>
              <td class="tr detail-foot-val">
                {{
                  fmt(
                    getDetail(item.Nomor).reduce(
                      (s, d) => s + Number(d.Nominal),
                      0
                    )
                  )
                }}
              </td>
              <td colspan="3"></td>
            </tr>
          </tfoot>
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
      <v-card-text class="pa-4 pt-0" style="font-size: 12px">
        Yakin ingin menghapus <strong>{{ selectedItem?.Nomor }}</strong
        >? Tindakan ini tidak dapat dibatalkan.
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
.filter-group {
  display: flex;
  align-items: center;
  gap: 6px;
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
  width: 130px;
}
.date-inp:focus {
  border-color: #3B5998;
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
  padding: 4px 6px;
  white-space: nowrap;
  text-align: left;
}
.detail-tbl td {
  padding: 3px 6px;
  border-bottom: 1px solid #f0f0f0;
}
.detail-tbl tbody tr:hover td {
  background: rgba(46, 46, 125, 0.05);
}
.detail-foot td {
  background: #f0f0fd;
  border-top: 2px solid #3B5998;
  padding: 4px 6px;
}
.detail-foot-lbl {
  font-size: 11px;
  font-weight: 700;
  color: #374151;
}
.detail-foot-val {
  font-size: 11px;
  font-weight: 700;
  color: #3B5998;
  font-variant-numeric: tabular-nums;
}
.tc {
  text-align: center;
}
.tr {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
