<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useToast } from "vue-toastification";
import { isAuthExpiredError } from "@/api/axios";
import BaseBrowse from "@/components/BaseBrowse.vue";
import {
  rekonsiliasiBankApi,
  type RekonMasterRow,
  type RekonDetailRow,
} from "@/api/laporan/rekonsiliasiBankApi";
import {
  exportRekonsiliasiBankMaster,
  exportRekonsiliasiBankDetail,
} from "@/utils/exportExcel";
import { IconBuildingBank, IconFileSpreadsheet } from "@tabler/icons-vue";

const toast = useToast();
const MENU_ID = "";

// ── Filter State (pola Manksi) ────────────────────────────────────────
const STORAGE_KEY = "finance_filter_rekonsiliasi_bank";

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

// filterValues → BaseBrowse watch → emit refresh → loadData
const filterValues = computed(() => ({ ...filterState.value }));

// ── Data ──────────────────────────────────────────────────────────────
const items = ref<RekonMasterRow[]>([]);
const detailItems = ref<RekonDetailRow[]>([]);
const isLoading = ref(false);
const expanded = ref<any[]>([]);

// ── Headers ───────────────────────────────────────────────────────────
const headers = [
  {
    key: "Tanggal",
    title: "Tanggal",
    width: "100px",
    align: "center" as const,
  },
  { key: "Account", title: "Account", width: "90px" },
  { key: "Nama", title: "Nama", width: "220px" },
  {
    key: "SaldoBuku",
    title: "Saldo Buku",
    width: "130px",
    align: "right" as const,
  },
  { key: "Tambah", title: "Tambah", width: "120px", align: "right" as const },
  { key: "Kurang", title: "Kurang", width: "120px", align: "right" as const },
  { key: "Buku", title: "Buku", width: "130px", align: "right" as const },
  {
    key: "SaldoBank",
    title: "Saldo Bank",
    width: "130px",
    align: "right" as const,
  },
  { key: "Tambah_", title: "Tambah_", width: "120px", align: "right" as const },
  { key: "Kurang_", title: "Kurang_", width: "120px", align: "right" as const },
  { key: "Bank", title: "Bank", width: "130px", align: "right" as const },
  { key: "Selisih", title: "Selisih", width: "130px", align: "right" as const },
];

// ── Load ──────────────────────────────────────────────────────────────
const loadData = async () => {
  isLoading.value = true;
  expanded.value = [];
  try {
    const res = await rekonsiliasiBankApi.getData(
      filterState.value.startDate,
      filterState.value.endDate
    );
    items.value = res.master;
    detailItems.value = res.detail;
  } catch (e: any) {
    if (isAuthExpiredError(e)) return;
    toast.error(e.response?.data?.message ?? "Gagal memuat data.");
  } finally {
    isLoading.value = false;
  }
};

onMounted(loadData);

// ── Detail helper ─────────────────────────────────────────────────────
const getDetail = (account: string, tanggal: string) =>
  detailItems.value.filter(
    (d) => d.Account === account && d.Tanggal === tanggal
  );

// ── Row props — Selisih ≠ 0 → warning orange ─────────────────────────
const rowPropsFn = (data: any) => {
  const row = data?.item?.raw ?? data?.item ?? data;
  if (Number(row?.Selisih) !== 0)
    return { style: "background:#fff8e1;color:#e65100;" };
  return {};
};

// ── Summary ───────────────────────────────────────────────────────────
const totalSelisih = computed(() =>
  items.value.reduce((s, r) => s + Number(r.Selisih), 0)
);
const totalBuku = computed(() =>
  items.value.reduce((s, r) => s + Number(r.Buku), 0)
);
const totalBank = computed(() =>
  items.value.reduce((s, r) => s + Number(r.Bank), 0)
);

const fmt = (v: number) => new Intl.NumberFormat("id-ID").format(v || 0);

const fmtDate = (v: string) => {
  if (!v) return "-";
  const [y, m, d] = v.split("-");
  return `${d}-${m}-${y}`;
};

// ── Export ────────────────────────────────────────────────────────────
const doExport = () =>
  exportRekonsiliasiBankMaster(
    getExportItems(),
    filterState.value.startDate,
    filterState.value.endDate
  );
const doExportDetail = () =>
  exportRekonsiliasiBankDetail(
    getExportItems().flatMap((row) => getDetail(row.Account, row.Tanggal)),
    filterState.value.startDate,
    filterState.value.endDate
  );
const browseRef = ref<InstanceType<typeof BaseBrowse> | null>(null);
const getExportItems = (): typeof items.value => browseRef.value?.getExportItems() ?? [];
</script>

<template>
  <BaseBrowse
    ref="browseRef"
    title="Rekonsiliasi Bank"
    :icon="IconBuildingBank"
    :menu-id="MENU_ID"
    :headers="headers"
    :items="items"
    :is-loading="isLoading"
    :fixed-layout="false"
    :show-expand="true"
    :expanded="expanded"
    @update:expanded="expanded = $event"
    item-value="Account"
    :row-props-fn="rowPropsFn"
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

    <!-- ── Export buttons ── -->
    <template #extra-actions>
      <v-btn size="small" variant="tonal" color="success" @click="doExport">
        <template #prepend>
          <IconFileSpreadsheet :size="13" :stroke-width="1.8" />
        </template>
        Export
      </v-btn>
      <v-btn size="small" variant="tonal" color="info" @click="doExportDetail">
        <template #prepend>
          <IconFileSpreadsheet :size="13" :stroke-width="1.8" />
        </template>
        Export Detail
      </v-btn>
    </template>

    <!-- ── Custom cells angka ── -->
    <template
      v-for="col in [
        'SaldoBuku',
        'Tambah',
        'Kurang',
        'SaldoBank',
        'Tambah_',
        'Kurang_',
      ]"
      :key="col"
      v-slot:[`item.${col}`]="{ value }"
    >
      <span class="num-cell">{{ value ? fmt(value) : "" }}</span>
    </template>

    <template #item.Buku="{ value }">
      <span class="num-cell fw-bold">{{ fmt(value) }}</span>
    </template>
    <template #item.Bank="{ value }">
      <span class="num-cell fw-bold">{{ fmt(value) }}</span>
    </template>
    <template #item.Selisih="{ value }">
      <span
        class="num-cell fw-bold"
        :class="{ 'selisih-ada': Number(value) !== 0 }"
      >
        {{ fmt(value) }}
      </span>
    </template>
    <template #item.Tanggal="{ value }">
      <span>{{ fmtDate(value) }}</span>
    </template>

    <!-- ── Expanded detail ── -->
    <template #detail="{ item }">
      <div class="detail-wrap">
        <div
          v-if="!getDetail(item.Account, item.Tanggal).length"
          class="detail-empty"
        >
          Tidak ada item detail untuk rekonsiliasi ini.
        </div>
        <table v-else class="detail-tbl">
          <thead>
            <tr>
              <th style="width: 100px">Tanggal</th>
              <th style="width: 90px">Account</th>
              <th style="min-width: 200px">Nama</th>
              <th style="width: 110px">Jenis</th>
              <th style="min-width: 160px">Nomor</th>
              <th style="min-width: 220px">Keterangan</th>
              <th style="width: 130px">Nominal</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(d, idx) in getDetail(item.Account, item.Tanggal)"
              :key="idx"
              :class="{
                'det-tambah': d.Jenis.includes('Tambah'),
                'det-kurang': d.Jenis.includes('Kurang'),
              }"
            >
              <td class="tc">{{ fmtDate(d.Tanggal) }}</td>
              <td>{{ d.Account }}</td>
              <td>{{ d.Nama }}</td>
              <td>
                <span
                  class="jenis-badge"
                  :class="`jenis-${d.Jenis.toLowerCase().replace(' ', '_')}`"
                >
                  {{ d.Jenis }}
                </span>
              </td>
              <td>{{ d.Nomor }}</td>
              <td>{{ d.Keterangan }}</td>
              <td class="tr">{{ fmt(d.Nominal) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="detail-foot">
              <td colspan="6" class="tr detail-foot-lbl">Total</td>
              <td class="tr detail-foot-val">
                {{
                  fmt(
                    getDetail(item.Account, item.Tanggal).reduce(
                      (s, d) => s + Number(d.Nominal),
                      0
                    )
                  )
                }}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </template>

    <!-- ── Summary bar ── -->
    <template #summary-row>
      <span class="summary-lbl">Total Buku</span>
      <span class="summary-val">{{ fmt(totalBuku) }}</span>
      <span class="summary-lbl" style="margin-left: 20px">Total Bank</span>
      <span class="summary-val">{{ fmt(totalBank) }}</span>
      <span class="summary-lbl" style="margin-left: 20px">Total Selisih</span>
      <span
        class="summary-val"
        :class="{ 'selisih-val-ada': totalSelisih !== 0 }"
      >
        {{ fmt(totalSelisih) }}
      </span>
    </template>
  </BaseBrowse>
</template>

<style scoped>
/* ── Filter ── */
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

/* ── Cells ── */
.num-cell {
  font-variant-numeric: tabular-nums;
}
.fw-bold {
  font-weight: 700;
}
.selisih-ada {
  color: #e65100 !important;
}
.selisih-val-ada {
  color: #ffcdd2 !important;
}

/* ── Detail ── */
.detail-wrap {
  padding: 4px 0;
}
.detail-empty {
  padding: 12px 10px;
  font-size: 11px;
  color: #9e9e9e;
  font-style: italic;
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
.det-tambah td {
  background: rgba(46, 46, 125, 0.03);
}
.det-kurang td {
  background: rgba(230, 81, 0, 0.03);
}
.detail-tbl tbody tr:hover td {
  background: rgba(46, 46, 125, 0.06) !important;
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

/* Jenis badge */
.jenis-badge {
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
}
.jenis-tambah_buku {
  background: rgba(46, 46, 125, 0.12);
  color: #3B5998;
}
.jenis-tambah_bank {
  background: rgba(21, 101, 192, 0.12);
  color: #1565c0;
}
.jenis-kurang_buku {
  background: rgba(230, 81, 0, 0.12);
  color: #e65100;
}
.jenis-kurang_bank {
  background: rgba(183, 28, 28, 0.12);
  color: #b71c1c;
}

.tc {
  text-align: center;
}
.tr {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
