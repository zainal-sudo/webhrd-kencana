<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useToast } from "vue-toastification";
import { isAuthExpiredError } from "@/api/axios";
import { useAuthStore } from "@/stores/authStore";
import BaseBrowse from "@/components/BaseBrowse.vue";
import {
  stokFinanceApi,
  type StokMasterRow,
  type StokDetailRow,
} from "@/api/laporan/stokFinanceApi";
import { exportStokFinance } from "@/utils/exportExcel";
import { IconList, IconFileSpreadsheet } from "@tabler/icons-vue";

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "";

// ── Filter State (pola Manksi) ────────────────────────────────────────
const STORAGE_KEY = "finance_filter_stok_finance";

const getSaved = () => {
  try {
    const s = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
    if (s?.cabang) return s;
  } catch {
    /* silent */
  }
  return null;
};
const saved = getSaved();

const filterState = ref({
  cabang: saved?.cabang ?? (authStore.userCabang || "P01"),
});

const cabang = computed({
  get: () => filterState.value.cabang,
  set: (v) => {
    filterState.value = { ...filterState.value, cabang: v };
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
const items = ref<StokMasterRow[]>([]);
const detailItems = ref<StokDetailRow[]>([]);
const cabangList = ref<string[]>([]);
const isLoading = ref(false);
const expanded = ref<any[]>([]);

// ── Headers ───────────────────────────────────────────────────────────
const headers = [
  { key: "Jenis", title: "Jenis", width: "110px" },
  { key: "Kode", title: "Kode", width: "120px" },
  { key: "Nama", title: "Nama", width: "320px" },
  { key: "Satuan", title: "Satuan", width: "80px", align: "center" as const },
  { key: "Stok", title: "Stok", width: "90px", align: "right" as const },
  { key: "Mutasi", title: "Mutasi", width: "90px", align: "right" as const },
  { key: "REAL_", title: "REAL", width: "90px", align: "right" as const },
];

// ── Load ──────────────────────────────────────────────────────────────
const loadData = async () => {
  if (!filterState.value.cabang) return;
  isLoading.value = true;
  expanded.value = [];
  try {
    const res = await stokFinanceApi.getData(filterState.value.cabang);
    items.value = res.master;
    detailItems.value = res.detail;
  } catch (e: any) {
    if (isAuthExpiredError(e)) return;
    toast.error(e.response?.data?.message ?? "Gagal memuat data.");
  } finally {
    isLoading.value = false;
  }
};

onMounted(async () => {
  try {
    cabangList.value = await stokFinanceApi.getCabangList();
    // Set default cabang user jika ada di list
    if (
      cabangList.value.length > 0 &&
      !cabangList.value.includes(filterState.value.cabang)
    ) {
      filterState.value = { cabang: cabangList.value[0] };
    }
  } catch {
    /* silent */
  }
  await loadData();
});

// ── Detail helper ─────────────────────────────────────────────────────
const getDetail = (kode: string) =>
  detailItems.value.filter((d) => d.Kode === kode);

// ── Row props — REAL negatif → warning ───────────────────────────────
const rowPropsFn = (data: any) => {
  const row = data?.item?.raw ?? data?.item ?? data;
  if (Number(row?.REAL_) < 0)
    return { style: "background:#fff8e1;color:#e65100;" };
  return {};
};

// ── Summary ───────────────────────────────────────────────────────────
const totalStok = computed(() =>
  items.value.reduce((s, r) => s + Number(r.Stok), 0)
);
const totalMutasi = computed(() =>
  items.value.reduce((s, r) => s + Number(r.Mutasi), 0)
);
const totalReal = computed(() =>
  items.value.reduce((s, r) => s + Number(r.REAL_), 0)
);

const fmt = (v: number) => new Intl.NumberFormat("id-ID").format(v || 0);

const doExport = () => exportStokFinance(getExportItems(), filterState.value.cabang);
const browseRef = ref<InstanceType<typeof BaseBrowse> | null>(null);
const getExportItems = (): typeof items.value => browseRef.value?.getExportItems() ?? [];
</script>

<template>
  <BaseBrowse
    ref="browseRef"
    title="Stok Finance"
    :icon="IconList"
    :menu-id="MENU_ID"
    :headers="headers"
    :items="items"
    :is-loading="isLoading"
    :fixed-layout="false"
    :show-expand="true"
    :expanded="expanded"
    @update:expanded="expanded = $event"
    item-value="Kode"
    :row-props-fn="rowPropsFn"
    :filter-values="filterValues"
    @refresh="loadData"
  >
    <!-- ── Filter ── -->
    <template #filter-left>
      <div class="filter-group">
        <span class="filter-lbl">Cabang</span>
        <select v-model="cabang" class="cab-select">
          <option v-for="c in cabangList" :key="c" :value="c">
            {{ c }}
          </option>
        </select>
      </div>
    </template>

    <!-- ── Export ── -->
    <template #extra-actions>
      <v-btn size="small" variant="tonal" color="success" @click="doExport">
        <template #prepend>
          <IconFileSpreadsheet :size="13" :stroke-width="1.8" />
        </template>
        Export
      </v-btn>
    </template>

    <!-- ── Custom cells ── -->
    <template #item.Stok="{ value }">
      <span class="num-cell">{{ fmt(value) }}</span>
    </template>
    <template #item.Mutasi="{ value }">
      <span class="num-cell">{{ fmt(value) }}</span>
    </template>
    <template #item.REAL_="{ value }">
      <span class="num-cell fw-bold" :class="{ 'real-neg': Number(value) < 0 }">
        {{ fmt(value) }}
      </span>
    </template>

    <!-- ── Expanded detail ── -->
    <template #detail="{ item }">
      <div class="detail-wrap">
        <div v-if="!getDetail(item.Kode).length" class="detail-empty">
          Tidak ada riwayat mutasi untuk barang ini.
        </div>
        <table v-else class="detail-tbl">
          <thead>
            <tr>
              <th style="width: 100px">Tanggal</th>
              <th style="min-width: 140px">No Referensi</th>
              <th style="min-width: 140px">No MB</th>
              <th style="width: 100px">Jenis</th>
              <th style="width: 90px">Stok In</th>
              <th style="width: 90px">Stok Out</th>
              <th style="width: 90px">Selisih</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(d, idx) in getDetail(item.Kode)"
              :key="idx"
              :class="{ 'det-in': d.StokIn > 0, 'det-out': d.StokOut > 0 }"
            >
              <td class="tc">{{ d.Tanggal }}</td>
              <td>{{ d.Nomor }}</td>
              <td>{{ d.NoMB }}</td>
              <td class="tc">{{ d.Jenis }}</td>
              <td class="tr">{{ d.StokIn ? fmt(d.StokIn) : "" }}</td>
              <td class="tr">{{ d.StokOut ? fmt(d.StokOut) : "" }}</td>
              <td class="tr fw-bold" :class="{ 'real-neg': d.Selisih < 0 }">
                {{ fmt(d.Selisih) }}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="detail-foot">
              <td colspan="4" class="tr detail-foot-lbl">Total</td>
              <td class="tr detail-foot-val">
                {{
                  fmt(
                    getDetail(item.Kode).reduce(
                      (s, d) => s + Number(d.StokIn),
                      0
                    )
                  )
                }}
              </td>
              <td class="tr detail-foot-val">
                {{
                  fmt(
                    getDetail(item.Kode).reduce(
                      (s, d) => s + Number(d.StokOut),
                      0
                    )
                  )
                }}
              </td>
              <td class="tr detail-foot-val">
                {{
                  fmt(
                    getDetail(item.Kode).reduce(
                      (s, d) => s + Number(d.Selisih),
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
      <span class="summary-lbl">Total Stok</span>
      <span class="summary-val">{{ fmt(totalStok) }}</span>
      <span class="summary-lbl" style="margin-left: 20px">Total Mutasi</span>
      <span class="summary-val">{{ fmt(totalMutasi) }}</span>
      <span class="summary-lbl" style="margin-left: 20px">Total REAL</span>
      <span class="summary-val" :class="{ 'real-val-neg': totalReal < 0 }">
        {{ fmt(totalReal) }}
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
.cab-select {
  height: 32px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 0 8px;
  font-size: 12px;
  outline: none;
  background: white;
  cursor: pointer;
  min-width: 100px;
}
.cab-select:focus {
  border-color: #3B5998;
}

/* ── Cells ── */
.num-cell {
  font-variant-numeric: tabular-nums;
}
.fw-bold {
  font-weight: 700;
}
.real-neg {
  color: #e65100 !important;
}
.real-val-neg {
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
.det-in td {
  background: rgba(46, 46, 125, 0.04);
}
.det-out td {
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
.tc {
  text-align: center;
}
.tr {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
