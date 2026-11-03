<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useToast } from "vue-toastification";
import { isAuthExpiredError } from "@/api/axios";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { IconList } from "@tabler/icons-vue";
import {
  daftarHutangApi,
  type DaftarHutangRow,
  type DaftarHutangDetail,
} from "@/api/laporan/daftarHutangApi";
import {
  exportDaftarHutang,
  exportDaftarHutangDetail,
} from "@/utils/exportExcel";

const toast = useToast();

// ── Periode ───────────────────────────────────────────────────────────
const STORAGE_KEY = "finance_filter_daftar_hutang";

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

const startDate = ref(saved?.startDate ?? getLocal(firstDay));
const endDate = ref(saved?.endDate ?? getLocal(now));

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
const items = ref<DaftarHutangRow[]>([]);
const detailItems = ref<DaftarHutangDetail[]>([]);
const isLoading = ref(false);
const selected = ref<DaftarHutangRow[]>([]);
const expanded = ref<any[]>([]);

const filterValues = computed(() => ({
  startDate: startDate.value,
  endDate: endDate.value,
}));

// ── Headers ───────────────────────────────────────────────────────────
const headers = [
  { key: "Nomor", title: "Nomor", width: "160px" },
  { key: "Tipe", title: "Tipe", width: "60px", align: "center" as const },
  {
    key: "Tanggal",
    title: "Tanggal",
    width: "100px",
    align: "center" as const,
  },
  {
    key: "JatuhTempo",
    title: "Jatuh Tempo",
    width: "100px",
    align: "center" as const,
  },
  { key: "SupKode", title: "Kode Sup", width: "90px" },
  { key: "Nama", title: "Nama Supplier", width: "250px" },
  { key: "Total", title: "Total", width: "140px", align: "right" as const },
  { key: "Voucher", title: "Voucher", width: "140px", align: "right" as const },
  { key: "Bayar", title: "Bayar", width: "140px", align: "right" as const },
];

// ── Load ──────────────────────────────────────────────────────────────
const loadData = async () => {
  isLoading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const [master, detail] = await Promise.all([
      daftarHutangApi.getBrowse({
        startDate: startDate.value,
        endDate: endDate.value,
      }),
      daftarHutangApi.getDetail({
        startDate: startDate.value,
        endDate: endDate.value,
      }),
    ]);
    items.value = master;
    detailItems.value = detail;
  } catch (e: any) {
    if (!isAuthExpiredError(e))
      toast.error(e.response?.data?.message ?? "Gagal memuat data.");
  } finally {
    isLoading.value = false;
  }
};

onMounted(loadData);

// ── Detail per baris ──────────────────────────────────────────────────
const getDetail = (nomor: string) =>
  detailItems.value.filter((d) => d.Nomor === nomor);

// ── Summary ───────────────────────────────────────────────────────────
const totalAll = computed(() =>
  items.value.reduce((s, r) => s + Number(r.Total || 0), 0)
);

// ── Export ────────────────────────────────────────────────────────────
const doExport = () => {
  const exportItems = getExportItems();
  if (!exportItems.length)
    return toast.warning("Tidak ada data untuk diexport.");
  exportDaftarHutang(exportItems, startDate.value, endDate.value);
};

const doExportDetail = () => {
  const exportItems = getExportItems();
  if (!exportItems.length)
    return toast.warning("Tidak ada data untuk diexport.");
  exportDaftarHutangDetail(
    exportItems,
    detailItems.value,
    startDate.value,
    endDate.value
  );
};

// ── Formatting ────────────────────────────────────────────────────────
const fmt = (v: number) =>
  new Intl.NumberFormat("id-ID").format(Number(v || 0));

const fmtDate = (v: string) => {
  if (!v) return "-";
  const [y, m, d] = v.split("-");
  return `${d}-${m}-${y}`;
};

// ── Row props: highlight jatuh tempo lewat ────────────────────────────
const rowPropsFn = (data: any) => {
  const row: DaftarHutangRow = data?.item?.raw ?? data?.item ?? data;
  if (!row?.JatuhTempo) return {};
  const jt = new Date(row.JatuhTempo);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (jt < today && Number(row.Voucher || 0) === 0) {
    return { style: "color:#c62828; font-weight:600" };
  }
  return {};
};
const browseRef = ref<InstanceType<typeof BaseBrowse> | null>(null);
const getExportItems = (): typeof items.value => browseRef.value?.getExportItems() ?? [];
</script>

<template>
  <BaseBrowse
    ref="browseRef"
    title="Daftar Hutang"
    :icon="IconList"
    menu-id="0"
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
    :filter-values="filterValues"
    summary-key="Total"
    summary-label="Total Hutang"
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
      <v-btn size="small" variant="tonal" color="success" @click="doExport">
        <template #prepend>
          <v-icon size="14">mdi-file-excel</v-icon>
        </template>
        Export
      </v-btn>
      <v-btn size="small" variant="tonal" color="info" @click="doExportDetail">
        <template #prepend>
          <v-icon size="14">mdi-file-excel-outline</v-icon>
        </template>
        Export Detail
      </v-btn>
    </template>

    <!-- ── Custom cells ── -->
    <template #item.Tipe="{ value }">
      <span class="badge-tipe">{{ value }}</span>
    </template>
    <template #item.Tanggal="{ value }">{{ fmtDate(value) }}</template>
    <template #item.JatuhTempo="{ value }">{{ fmtDate(value) }}</template>
    <template #item.Total="{ value }">
      <span style="font-variant-numeric: tabular-nums">{{
        fmt(Number(value))
      }}</span>
    </template>
    <template #item.Voucher="{ value }">
      <span style="font-variant-numeric: tabular-nums; color: #1565c0">
        {{ fmt(Number(value)) }}
      </span>
    </template>
    <template #item.Bayar="{ value }">
      <span style="font-variant-numeric: tabular-nums; color: #3B5998">
        {{ fmt(Number(value)) }}
      </span>
    </template>

    <!-- ── Expanded detail: daftar voucher ── -->
    <template #detail="{ item }">
      <div class="det-wrap">
        <table class="det-tbl">
          <thead>
            <tr>
              <th style="width: 160px">No. Voucher</th>
              <th style="width: 100px" class="tc">Tgl Voucher</th>
              <th style="width: 140px" class="tr">Total</th>
              <th style="width: 120px" class="tc">Status Realisasi</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(d, i) in getDetail(item.Nomor)"
              :key="i"
              :class="d.StatusRealisasi == 1 ? 'det-realisasi' : ''"
            >
              <td class="mono">{{ d.NomorVoucher }}</td>
              <td class="tc">{{ fmtDate(d.TanggalVoucher) }}</td>
              <td class="tr">{{ fmt(d.Total) }}</td>
              <td class="tc">
                <span
                  :class="
                    d.StatusRealisasi == 1 ? 'badge-realisasi' : 'badge-belum'
                  "
                >
                  {{ d.StatusRealisasi == 1 ? "Sudah" : "Belum" }}
                </span>
              </td>
            </tr>
            <tr v-if="!getDetail(item.Nomor).length">
              <td
                colspan="4"
                class="tc"
                style="color: #9e9e9e; font-style: italic; padding: 8px"
              >
                Belum ada voucher.
              </td>
            </tr>
          </tbody>
          <tfoot v-if="getDetail(item.Nomor).length">
            <tr class="det-foot">
              <td colspan="2" class="tr det-foot-lbl">Total Voucher</td>
              <td class="tr det-foot-val">
                {{
                  fmt(
                    getDetail(item.Nomor).reduce(
                      (s, d) => s + Number(d.Total),
                      0
                    )
                  )
                }}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </template>
  </BaseBrowse>
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

.det-wrap {
  padding: 4px 0;
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
.det-realisasi td {
  color: #1565c0;
}

.det-foot td {
  background: #f0f0fd;
  border-top: 2px solid #3B5998;
  padding: 4px 8px;
}
.det-foot-lbl {
  font-size: 11px;
  font-weight: 700;
  color: #374151;
}
.det-foot-val {
  font-size: 11px;
  font-weight: 700;
  color: #3B5998;
  font-variant-numeric: tabular-nums;
}

.badge-realisasi {
  background: #e3f2fd;
  color: #1565c0;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
}
.badge-belum {
  background: #fce4ec;
  color: #c62828;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
}
.tc {
  text-align: center;
}
.tr {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.mono {
  font-family: monospace;
}
.badge-tipe {
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #d1d5db;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}
</style>
