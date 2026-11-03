<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { isAuthExpiredError } from "@/api/axios";
import BaseBrowse from "@/components/BaseBrowse.vue";
import {
  mutasiOutApi,
  type MutasiOutRow,
  type MutasiOutDetail,
} from "@/api/transaksi/mutasiOutApi";
import { exportMutasiOut } from "@/utils/exportExcel";
import {
  IconTruckDelivery,
  IconPrinter,
  IconFileExport,
  IconShieldLock,
} from "@tabler/icons-vue";

const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();

const MENU_ID = "31";

// ── Periode & filter (sessionStorage persist) ──────────────────────────
const STORAGE_KEY = "finance_filter_mutasi_out";

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
  jenis: saved?.jenis ?? "ACCESORIES",
  cabang: saved?.cabang ?? "ALL",
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
const items = ref<MutasiOutRow[]>([]);
const isLoading = ref(false);
const selected = ref<MutasiOutRow[]>([]);

const isSingleSelected = computed(() => selected.value.length === 1);
const selectedItem = computed(() => selected.value[0] ?? null);

const canInsert = computed(() => authStore.can(MENU_ID, "insert"));
const canEdit = computed(() => authStore.can(MENU_ID, "edit"));
const canDelete = computed(() => authStore.can(MENU_ID, "delete"));

// ── Headers ───────────────────────────────────────────────────────────
const headers = [
  { key: "Nomor", title: "Nomor", width: "160px" },
  { key: "Jenis", title: "Jenis", width: "100px" },
  {
    key: "Tanggal",
    title: "Tanggal",
    width: "100px",
    align: "center" as const,
  },
  { key: "Cab", title: "Cabang", width: "70px", align: "center" as const },
  { key: "Tujuan", title: "Tujuan", width: "70px", align: "center" as const },
  { key: "Keterangan", title: "Keterangan", width: "220px" },
  { key: "Usr", title: "User", width: "90px" },
  { key: "Bagian", title: "Bagian", width: "100px" },
  {
    key: "Created",
    title: "Created",
    width: "140px",
    align: "center" as const,
  },
  { key: "NoTerima", title: "No. Terima", width: "150px" },
  { key: "UsrTerima", title: "User Terima", width: "100px" },
  {
    key: "TglTerima",
    title: "Tgl Terima",
    width: "140px",
    align: "center" as const,
  },
];

// ── Load ──────────────────────────────────────────────────────────────
const loadData = async () => {
  isLoading.value = true;
  try {
    items.value = await mutasiOutApi.getBrowse({
      startDate: filterState.value.startDate,
      endDate: filterState.value.endDate,
      jenis: filterState.value.jenis,
      cabang: filterState.value.cabang,
    });
  } catch (e: any) {
    if (isAuthExpiredError(e)) return;
    toast.error(e.response?.data?.message ?? "Gagal memuat data.");
  } finally {
    isLoading.value = false;
  }
};

onMounted(loadData);

// ── Expand detail ─────────────────────────────────────────────────────
const expanded = ref<any[]>([]);
const dtlCache = ref<Record<string, MutasiOutDetail[]>>({});
const expandedLoading = ref<Record<string, boolean>>({});

const onUpdateExpanded = async (newExpanded: any[]) => {
  const keys = newExpanded.map((e) => (typeof e === "object" ? e.Nomor : e));
  expanded.value = newExpanded;

  for (const nomor of keys) {
    if (dtlCache.value[nomor] || expandedLoading.value[nomor]) continue;
    expandedLoading.value = { ...expandedLoading.value, [nomor]: true };
    try {
      dtlCache.value = {
        ...dtlCache.value,
        [nomor]: await mutasiOutApi.getDetail(nomor),
      };
    } catch {
      toast.error(`Gagal memuat rincian untuk ${nomor}`);
    } finally {
      expandedLoading.value = { ...expandedLoading.value, [nomor]: false };
    }
  }
};

// ── Actions ───────────────────────────────────────────────────────────
const onAdd = () =>
  router.push(`/transaksi/mutasi-out/create?jenis=${filterState.value.jenis}`);

const onEdit = (item: MutasiOutRow) => {
  router.push(`/transaksi/mutasi-out/edit/${encodeURIComponent(item.Nomor)}`);
};

const onDelete = async (item: MutasiOutRow) => {
  try {
    await mutasiOutApi.deleteData(item.Nomor);
    toast.success("Mutasi Out berhasil dihapus.");
    loadData();
  } catch (e: any) {
    if (isAuthExpiredError(e)) return;
    toast.error(e.response?.data?.message ?? "Gagal menghapus data.");
  }
};

const onPrint = () => {
  if (!selectedItem.value)
    return toast.warning("Pilih data yang akan dicetak.");
  window.open(
    `/transaksi/mutasi-out/print/${encodeURIComponent(
      selectedItem.value.Nomor
    )}`,
    "_blank"
  );
};

const onExportDetail = async () => {
  const exportItems = getExportItems();
  if (!exportItems.length)
    return toast.warning("Tidak ada data untuk diexport.");
  try {
    const details = await Promise.all(
      exportItems.map(async (row) => [
        row.Nomor,
        dtlCache.value[row.Nomor] ?? await mutasiOutApi.getDetail(row.Nomor),
      ] as const),
    );
    await exportMutasiOut(exportItems, Object.fromEntries(details));
  } catch (error: any) {
    if (!isAuthExpiredError(error)) toast.error("Gagal mengekspor detail Mutasi Out.");
  }
};

// ── PIN Dialog ────────────────────────────────────────────────────────
const pinDialog = ref(false);
const pinAlasan = ref("");

const openPinDialog = () => {
  if (!selectedItem.value) return;
  pinAlasan.value = "";
  pinDialog.value = true;
};

const submitPin = async () => {
  if (!pinAlasan.value.trim()) return toast.error("Alasan wajib diisi.");
  try {
    await mutasiOutApi.requestPin({
      nomor: selectedItem.value!.Nomor,
      tanggal: selectedItem.value!.Tanggal,
      keterangan: selectedItem.value!.Keterangan,
      alasan: pinAlasan.value,
    });
    toast.success("Berhasil diajukan. Menunggu ACC.");
    pinDialog.value = false;
    loadData();
  } catch (e: any) {
    if (isAuthExpiredError(e)) return;
    toast.error(e.response?.data?.message ?? "Gagal mengajukan PIN.");
  }
};

// ── Formatting ────────────────────────────────────────────────────────
const fmtDate = (val: string) => {
  if (!val) return "-";
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, d] = val.split("-");
    return `${d}-${m}-${y}`;
  }
  return val;
};

const fmtDateTime = (val: string) => {
  if (!val) return "-";
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  return `${String(d.getDate()).padStart(2, "0")}-${String(
    d.getMonth() + 1
  ).padStart(2, "0")}-${d.getFullYear()} ${String(d.getHours()).padStart(
    2,
    "0"
  )}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const fmtQty = (v: number) =>
  Number(v || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const getNomorStyle = (ngedit: string) => {
  if (ngedit === "WAIT") return "background:#1565c0;color:#fff;";
  if (ngedit === "TOLAK") return "background:#c62828;color:#fff;";
  if (ngedit === "ACC") return "background:#3B5998;color:#fff;";
  return "";
};
const browseRef = ref<InstanceType<typeof BaseBrowse> | null>(null);
const getExportItems = (): typeof items.value => browseRef.value?.getExportItems() ?? [];
</script>

<template>
  <BaseBrowse
    ref="browseRef"
    title="Mutasi Out Garmen"
    :icon="IconTruckDelivery"
    :menu-id="MENU_ID"
    :headers="headers"
    :items="items"
    :is-loading="isLoading"
    item-value="Nomor"
    v-model:selected="selected"
    :filter-values="filterValues"
    :can-insert="canInsert"
    :can-edit="canEdit"
    :can-delete="canDelete"
    show-expand
    :expanded="expanded"
    @update:expanded="onUpdateExpanded"
    @add="onAdd"
    @edit="onEdit"
    @delete="onDelete"
    @refresh="loadData"
  >
    <template #filter-left>
      <div class="filter-group">
        <span class="filter-lbl">Periode</span>
        <input v-model="filterState.startDate" type="date" class="date-inp" />
        <span class="filter-sep">s/d</span>
        <input v-model="filterState.endDate" type="date" class="date-inp" />
      </div>

      <div class="filter-divider" />

      <div class="filter-group">
        <span class="filter-lbl">Jenis</span>
        <div class="radio-wrap">
          <label class="radio-item">
            <input
              type="radio"
              v-model="filterState.jenis"
              value="ACCESORIES"
            />
            <span>ACC</span>
          </label>
          <label class="radio-item">
            <input type="radio" v-model="filterState.jenis" value="OBAT" />
            <span>OBAT</span>
          </label>
          <label class="radio-item">
            <input type="radio" v-model="filterState.jenis" value="SPAREPART" />
            <span>SPAREPART</span>
          </label>
          <label class="radio-item">
            <input type="radio" v-model="filterState.jenis" value="ATK/RTK" />
            <span>ATK</span>
          </label>
        </div>
      </div>

      <div class="filter-divider" />

      <div class="filter-group">
        <span class="filter-lbl">Cabang</span>
        <select
          v-model="filterState.cabang"
          class="date-inp"
          style="width: 80px"
        >
          <option value="ALL">ALL</option>
          <option value="HO-">HO-</option>
          <option value="P01">P01</option>
          <option value="P02">P02</option>
          <option value="P03">P03</option>
          <option value="P04">P04</option>
          <option value="P05">P05</option>
        </select>
      </div>
    </template>

    <template #extra-actions>
      <v-btn
        size="small"
        variant="tonal"
        color="grey-darken-3"
        :disabled="!isSingleSelected"
        @click="onPrint"
      >
        <template #prepend
          ><IconPrinter :size="14" :stroke-width="1.8"
        /></template>
        Cetak
      </v-btn>

      <v-btn
        size="small"
        variant="tonal"
        color="success"
        @click="onExportDetail"
      >
        <template #prepend
          ><IconFileExport :size="14" :stroke-width="1.8"
        /></template>
        Export Detail
      </v-btn>

      <v-btn
        size="small"
        variant="tonal"
        color="primary"
        :disabled="!isSingleSelected"
        @click="openPinDialog"
      >
        <template #prepend
          ><IconShieldLock :size="14" :stroke-width="1.8"
        /></template>
        Pengajuan Ubah
      </v-btn>
    </template>

    <template #item.Nomor="{ item }">
      <div class="nomor-cell" :style="getNomorStyle(item.Ngedit)">
        {{ item.Nomor }}
      </div>
    </template>

    <template #item.Tanggal="{ value }">{{ fmtDate(value) }}</template>
    <template #item.Created="{ value }">{{ fmtDateTime(value) }}</template>
    <template #item.TglTerima="{ value }">{{ fmtDateTime(value) }}</template>

    <template #detail="{ item }">
      <div class="det-wrap">
        <div v-if="expandedLoading[item.Nomor]" class="det-loading">
          <v-progress-circular indeterminate color="primary" size="20" />
          <span>Memuat rincian...</span>
        </div>
        <table v-else class="det-tbl">
          <thead>
            <tr>
              <th style="width: 120px">No. Permintaan</th>
              <th style="width: 90px">Kode</th>
              <th style="min-width: 200px">Nama Barang</th>
              <th style="min-width: 150px">Spesifikasi</th>
              <th style="width: 70px" class="tc">Satuan</th>
              <th style="width: 90px" class="tr">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(d, i) in dtlCache[item.Nomor]" :key="i">
              <td class="mono">{{ d.NoPermintaan }}</td>
              <td class="mono accent">{{ d.Kode }}</td>
              <td class="bold">{{ d.Nama }}</td>
              <td>{{ d.Spesifikasi }}</td>
              <td class="tc">{{ d.Satuan }}</td>
              <td class="tr bold accent">{{ fmtQty(d.Jumlah) }}</td>
            </tr>
            <tr v-if="!dtlCache[item.Nomor]?.length">
              <td colspan="6" class="empty-td">Tidak ada detail barang.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </BaseBrowse>

  <!-- ── Dialog Pengajuan Ubah ── -->
  <v-dialog v-model="pinDialog" max-width="400" persistent>
    <v-card rounded="lg">
      <v-card-title
        class="pa-4 pb-2"
        style="font-size: 13px; font-weight: 700; border-top: 3px solid #3B5998"
      >
        Pengajuan Perubahan Data
      </v-card-title>
      <v-card-text class="pa-4 pt-2" style="font-size: 12px">
        <div class="mb-2">
          <strong>Mutasi:</strong> {{ selectedItem?.Nomor }}<br />
          <strong>Tujuan:</strong> {{ selectedItem?.Tujuan }}
        </div>
        <v-textarea
          v-model="pinAlasan"
          label="Alasan Pengajuan"
          variant="outlined"
          density="compact"
          rows="3"
          autofocus
          hide-details
        />
      </v-card-text>
      <v-card-actions class="pa-3" style="border-top: 1px solid #e0e0e0">
        <v-btn variant="text" @click="pinDialog = false">Batal</v-btn>
        <v-spacer />
        <v-btn color="primary" variant="flat" @click="submitPin">
          Ajukan Sekarang
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
}
.filter-divider {
  width: 1px;
  height: 24px;
  background: rgba(var(--v-border-color), var(--v-border-opacity));
  flex-shrink: 0;
  margin: 0 4px;
}
.date-inp {
  height: 32px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 0 8px;
  font-size: 12px;
  outline: none;
  background: white;
}
.date-inp:focus {
  border-color: #3B5998;
}

.radio-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 0 8px;
  height: 32px;
}
.radio-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #374151;
  cursor: pointer;
  white-space: nowrap;
}
.radio-item input {
  accent-color: #3B5998;
  width: 13px;
  height: 13px;
  cursor: pointer;
}

.nomor-cell {
  font-family: monospace;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 3px;
  display: inline-block;
}

/* ── Detail expand ── */
.det-wrap {
  padding: 4px 0;
}
.det-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  font-size: 12px;
  color: #6b7280;
}
.det-tbl {
  border-collapse: collapse;
  font-size: 11px;
}
.det-tbl thead tr {
  background: #3B5998;
}
.det-tbl th {
  color: white;
  font-weight: 700;
  padding: 4px 8px;
  white-space: nowrap;
  text-align: left;
}
.det-tbl td {
  padding: 3px 8px;
  border-bottom: 1px solid #f0f0f0;
  white-space: nowrap;
}
.det-tbl tbody tr:hover td {
  background: rgba(46, 46, 125, 0.05);
}
.mono {
  font-family: monospace;
}
.accent {
  color: #3B5998;
}
.bold {
  font-weight: 700;
}
.tc {
  text-align: center;
}
.tr {
  text-align: right;
}
.empty-td {
  text-align: center;
  color: #9e9e9e;
  font-style: italic;
  padding: 12px;
}
</style>
