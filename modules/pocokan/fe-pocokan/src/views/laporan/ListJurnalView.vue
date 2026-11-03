<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from "vue";
import { useToast } from "vue-toastification";
import { isAuthExpiredError } from "@/api/axios";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { listJurnalApi, type ListJurnalRow } from "@/api/laporan/listJurnalApi";
import {
  exportListJurnal,
  exportListJurnalFromConfig,
} from "@/utils/exportExcel";
import {
  IconList,
  IconFileSpreadsheet,
  IconTable,
  IconChartBar,
} from "@tabler/icons-vue";
import { initPivot, jQuery as jq } from "@/lib/pivottable-setup";

const toast = useToast();
const MENU_ID = "";

// ── Periode ───────────────────────────────────────────────────────────
const STORAGE_KEY = "finance_periode_list_jurnal";

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
const saved = getSaved();

const filterState = ref({
  startDate: saved?.startDate ?? getLocal(now),
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

// Simpan ke sessionStorage
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

// filterValues → BaseBrowse watch → emit refresh → loadData
const filterValues = computed(() => ({ ...filterState.value }));

// ── Tab ───────────────────────────────────────────────────────────────
const activeTab = ref<"grid" | "pivot" | "chart">("grid");

// ── Data ──────────────────────────────────────────────────────────────
const items = ref<ListJurnalRow[]>([]);
const isLoading = ref(false);

// ── BaseBrowse headers ────────────────────────────────────────────────
const headers = [
  { key: "Bulan", title: "Bulan", width: "60px", align: "center" as const },
  { key: "Tahun", title: "Tahun", width: "60px", align: "center" as const },
  {
    key: "Tanggal",
    title: "Tanggal",
    width: "100px",
    align: "center" as const,
  },
  { key: "Nomor", title: "Nomor", width: "200px" },
  { key: "Referensi", title: "Referensi", width: "200px" },
  { key: "Account", title: "Account", width: "100px" },
  { key: "AccountName", title: "Nama Account", width: "240px" },
  { key: "Keterangan", title: "Keterangan", width: "280px" },
  { key: "Debet", title: "Debet", width: "140px", align: "right" as const },
  { key: "Kredit", title: "Kredit", width: "140px", align: "right" as const },
  { key: "DetailCC", title: "Detail CC", width: "160px" },
];

// ── Load ──────────────────────────────────────────────────────────────
const loadData = async () => {
  isLoading.value = true;
  try {
    items.value = await listJurnalApi.getListJurnal(
      filterState.value.startDate,
      filterState.value.endDate
    );
    pivotRendered.value = false; // data baru → pivot perlu di-render ulang
  } catch (e: any) {
    if (isAuthExpiredError(e)) return;
    toast.error(e.response?.data?.message ?? "Gagal memuat data.");
  } finally {
    isLoading.value = false;
    if (activeTab.value === "pivot") {
      await nextTick();
      renderPivot();
      pivotRendered.value = true;
    }
  }
};

onMounted(loadData);

// ── Pivot ─────────────────────────────────────────────────────────────
const pivotContainer = ref<HTMLElement | null>(null);

const renderPivot = async () => {
  await nextTick();
  await nextTick();
  if (!pivotContainer.value || items.value.length === 0) return;

  await initPivot();

  let savedConfig: Record<string, unknown> = {};
  try {
    const raw = localStorage.getItem("pivot_config_list_jurnal");
    if (raw) savedConfig = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    /* ignore */
  }

  const plainData = buildPlainData();

  (jq(pivotContainer.value) as any).empty().pivotUI(
    plainData,
    {
      rows: (savedConfig.rows as string[]) ?? ["AccountName", "Tanggal"],
      cols: (savedConfig.cols as string[]) ?? ["Tahun", "Bulan", "Jenis"],
      vals: (savedConfig.vals as string[]) ?? ["Nilai"],
      aggregatorName: (savedConfig.aggregatorName as string) ?? "Sum",
      rendererName: (savedConfig.rendererName as string) ?? "Table",
      hiddenAttributes: [],
      onRefresh: (config: Record<string, unknown>) => {
        localStorage.setItem(
          "pivot_config_list_jurnal",
          JSON.stringify(config)
        );
        pivotConfigVersion.value++;
      },
    },
    true
  );
};

const resetPivotConfig = () => {
  localStorage.removeItem("pivot_config_list_jurnal");
  renderPivot();
};

const pivotRendered = ref(false);

// Watch tab change → render pivot saat masuk tab pivot
watch(activeTab, async (tab) => {
  if (tab === "pivot" && !pivotRendered.value) {
    await nextTick();
    renderPivot();
    pivotRendered.value = true;
  }
});

// ── Chart ─────────────────────────────────────────────────────────────
const chartType = ref<"column" | "bar" | "line" | "area" | "pie">("column");
const chartCanvasRef = ref<HTMLCanvasElement | null>(null);
const pivotConfigVersion = ref(0);
let chartInstance: any = null;

const getPivotConfig = () => {
  let config: Record<string, any> = {};
  try {
    const raw = localStorage.getItem("pivot_config_list_jurnal");
    if (raw) config = JSON.parse(raw);
  } catch {
    /* silent */
  }
  return {
    rows: (config.rows as string[]) ?? ["AccountName"],
    cols: (config.cols as string[]) ?? ["Tahun", "Bulan", "Jenis"],
    vals: (config.vals as string[]) ?? ["Nilai"],
    aggregatorName: (config.aggregatorName as string) ?? "Sum",
    exclusions: (config.exclusions as Record<string, string[]>) ?? {},
    inclusions: (config.inclusions as Record<string, string[]>) ?? {},
  };
};

// Bangun plainData (sama seperti renderPivot/doExportPivot)
const buildPlainData = () => {
  const plainData: Record<string, any>[] = [];
  for (const r of items.value) {
    const base = {
      Bulan: String(r.Bulan),
      Tahun: String(r.Tahun),
      Tanggal: r.Tanggal ?? "",
      Account: r.Account ?? "",
      AccountName: r.AccountName ?? "",
      Keterangan: r.Keterangan ?? "",
      DetailCC: r.DetailCC ?? "",
      Referensi: r.Referensi ?? "",
      Nomor: r.Nomor ?? "",
    };
    if (Number(r.Debet)) {
      plainData.push({ ...base, Jenis: "Debet", Nilai: Number(r.Debet) });
    }
    if (Number(r.Kredit)) {
      plainData.push({ ...base, Jenis: "Kredit", Nilai: Number(r.Kredit) });
    }
  }
  return plainData;
};

const chartData = computed(() => {
  void pivotConfigVersion.value;
  const { rows, cols, vals, aggregatorName, exclusions, inclusions } =
    getPivotConfig();
  let plainData = buildPlainData();

  // Inclusions: jika attr punya inclusions, hanya tampilkan value yang ada di list
  for (const attr of Object.keys(inclusions)) {
    const allowed = new Set(inclusions[attr]);
    if (allowed.size) {
      plainData = plainData.filter((item) => allowed.has(item[attr] ?? ""));
    }
  }

  // Exclusions: hilangkan value yang ada di list exclusions
  for (const attr of Object.keys(exclusions)) {
    const excluded = new Set(exclusions[attr]);
    if (excluded.size) {
      plainData = plainData.filter((item) => !excluded.has(item[attr] ?? ""));
    }
  }

  const valField = vals[0] ?? "Nilai";
  const rowKey = rows[0] ?? "AccountName";
  const getColKey = (item: Record<string, any>) =>
    cols.length ? cols.map((c) => item[c] ?? "").join(" / ") : "Total";

  const map = new Map<string, Map<string, number>>();
  const colSet = new Set<string>();

  for (const item of plainData) {
    const rowLabel = rows.length
      ? rows.map((r) => item[r] ?? "").join(" / ")
      : item[rowKey] ?? "";
    const colLabel = getColKey(item);
    colSet.add(colLabel);

    if (!map.has(rowLabel)) map.set(rowLabel, new Map());
    const colMap = map.get(rowLabel)!;
    const val = Number(item[valField]) || 0;

    if (aggregatorName === "Count") {
      colMap.set(colLabel, (colMap.get(colLabel) ?? 0) + 1);
    } else {
      colMap.set(colLabel, (colMap.get(colLabel) ?? 0) + val);
    }
  }

  const rowLabels = [...map.entries()]
    .map(([label, colMap]) => ({
      label,
      total: [...colMap.values()].reduce((s, v) => s + v, 0),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 20)
    .map((r) => r.label);

  const colLabels = [...colSet.values()].sort();

  return {
    labels: rowLabels,
    colLabels,
    datasets: colLabels.map((col) => ({
      label: col,
      data: rowLabels.map((row) => map.get(row)?.get(col) ?? 0),
    })),
  };
});

watch([activeTab, chartData, chartType], async ([tab]) => {
  if (tab !== "chart") return;
  await nextTick();
  if (!chartCanvasRef.value) return;

  const {
    Chart,
    BarController,
    LineController,
    PieController,
    BarElement,
    LineElement,
    PointElement,
    ArcElement,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend,
    Filler,
  } = await import("chart.js");
  Chart.register(
    BarController,
    LineController,
    PieController,
    BarElement,
    LineElement,
    PointElement,
    ArcElement,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend,
    Filler
  );

  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  const palette = [
    { bg: "rgba(46, 46, 125,0.75)", border: "#3B5998" },
    { bg: "rgba(21,101,192,0.65)", border: "#1565c0" },
    { bg: "rgba(239,108,0,0.65)", border: "#ef6c00" },
    { bg: "rgba(106,27,154,0.65)", border: "#6a1b9a" },
    { bg: "rgba(198,40,40,0.65)", border: "#c62828" },
    { bg: "rgba(0, 0, 105,0.65)", border: "#000069" },
  ];

  const { labels, datasets } = chartData.value;

  // ── Pie: hanya pakai dataset pertama, label = labels, data = nilai dataset pertama
  if (chartType.value === "pie") {
    const pieData = chartData.value.labels.map((_, i) =>
      datasets.reduce((s, ds) => s + (ds.data[i] ?? 0), 0)
    );
    const pieColors = labels.map((_, i) => palette[i % palette.length]);
    chartInstance = new Chart(chartCanvasRef.value, {
      type: "pie",
      data: {
        labels,
        datasets: [
          {
            label: "Total",
            data: pieData,
            backgroundColor: pieColors.map((c) => c.bg),
            borderColor: pieColors.map((c) => c.border),
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "right" },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                `${ctx.label}: ${new Intl.NumberFormat("id-ID").format(
                  ctx.parsed ?? 0
                )}`,
            },
          },
        },
      },
    });
    return;
  }

  // ── Column / Bar / Line / Area
  const isHorizontalBar = chartType.value === "bar";
  const baseType =
    chartType.value === "line" || chartType.value === "area" ? "line" : "bar";

  chartInstance = new Chart(chartCanvasRef.value, {
    type: baseType,
    data: {
      labels,
      datasets: datasets.map((ds, idx) => {
        const color = palette[idx % palette.length];
        if (baseType === "line") {
          return {
            label: ds.label,
            data: ds.data,
            borderColor: color.border,
            backgroundColor:
              chartType.value === "area" ? color.bg : color.border,
            fill: chartType.value === "area",
            tension: 0.25,
            pointRadius: 2,
          };
        }
        return {
          label: ds.label,
          data: ds.data,
          backgroundColor: color.bg,
          borderColor: color.border,
          borderWidth: 1,
        };
      }),
    },
    options: {
      indexAxis: isHorizontalBar ? "y" : "x",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top" },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              `${ctx.dataset.label}: ${new Intl.NumberFormat("id-ID").format(
                (isHorizontalBar ? ctx.parsed.x : ctx.parsed.y) ?? 0
              )}`,
          },
        },
      },
      scales: {
        [isHorizontalBar ? "x" : "y"]: {
          ticks: {
            callback: (v) =>
              new Intl.NumberFormat("id-ID", { notation: "compact" }).format(
                Number(v)
              ),
          },
        },
        [isHorizontalBar ? "y" : "x"]: {
          ticks: { maxRotation: 35, font: { size: 10 } },
        },
      },
    },
  });
});

const hasChartData = computed(() => chartData.value.labels.length > 0);

const fmt = (v: number) => new Intl.NumberFormat("id-ID").format(v || 0);
const fmtDate = (v: string) => {
  if (!v) return "-";
  const [y, m, d] = v.split("-");
  return `${d}-${m}-${y}`;
};

const doExport = () =>
  exportListJurnal(
    getExportItems(),
    filterState.value.startDate,
    filterState.value.endDate
  );

const doExportPivot = async () => {
  let config: Record<string, any> = {};
  try {
    const raw = localStorage.getItem("pivot_config_list_jurnal");
    if (raw) config = JSON.parse(raw);
  } catch {
    /* silent */
  }

  const rows: string[] = config.rows ?? ["AccountName"];
  const cols: string[] = config.cols ?? ["Tahun", "Bulan", "Jenis"];
  const vals: string[] = config.vals ?? ["Nilai"];
  const aggregator: string = config.aggregatorName ?? "Sum";

  const plainData: Record<string, any>[] = [];
  for (const r of items.value) {
    const base = {
      Bulan: String(r.Bulan),
      Tahun: String(r.Tahun),
      Account: r.Account ?? "",
      AccountName: r.AccountName ?? "",
      Keterangan: r.Keterangan ?? "",
      DetailCC: r.DetailCC ?? "",
      Referensi: r.Referensi ?? "",
      Tanggal: r.Tanggal ?? "",
    };
    if (Number(r.Debet))
      plainData.push({ ...base, Jenis: "Debet", Nilai: Number(r.Debet) });
    if (Number(r.Kredit))
      plainData.push({ ...base, Jenis: "Kredit", Nilai: Number(r.Kredit) });
  }

  await exportListJurnalFromConfig(
    plainData,
    rows,
    cols,
    vals[0] ?? "Nilai",
    aggregator,
    filterState.value.startDate,
    filterState.value.endDate
  );
};
const browseRef = ref<InstanceType<typeof BaseBrowse> | null>(null);
const getExportItems = (): typeof items.value => browseRef.value?.getExportItems() ?? [];
</script>

<template>
  <!-- ── Grid tab ── -->
  <div v-show="activeTab === 'grid'">
    <BaseBrowse
      ref="browseRef"
      title="List Jurnal"
      :icon="IconList"
      :menu-id="MENU_ID"
      :headers="headers"
      :items="items"
      :is-loading="isLoading"
      :fixed-layout="false"
      item-value="Nomor"
      :filter-values="filterValues"
      @refresh="loadData"
    >
      <template #filter-left>
        <div class="filter-group">
          <span class="filter-lbl">Periode</span>
          <input v-model="startDate" type="date" class="date-inp" />
          <span class="filter-sep">s/d</span>
          <input v-model="endDate" type="date" class="date-inp" />
        </div>
      </template>

      <template #filter-right-prepend>
        <div class="filter-divider" />
        <div class="tab-wrap">
          <button class="tab-btn active">
            <IconTable :size="13" :stroke-width="1.8" /> Grid Data
          </button>
          <button class="tab-btn" @click="activeTab = 'pivot'">
            <IconList :size="13" :stroke-width="1.8" /> Pivot
          </button>
          <button class="tab-btn" @click="activeTab = 'chart'">
            <IconChartBar :size="13" :stroke-width="1.8" /> Grafik
          </button>
        </div>
      </template>

      <template #extra-actions>
        <v-btn size="small" variant="tonal" color="success" @click="doExport">
          <template #prepend
            ><IconFileSpreadsheet :size="13" :stroke-width="1.8"
          /></template>
          Export
        </v-btn>
      </template>

      <template #item.Debet="{ value }">
        <span class="num-cell">{{ value ? fmt(value) : "" }}</span>
      </template>
      <template #item.Kredit="{ value }">
        <span class="num-cell">{{ value ? fmt(value) : "" }}</span>
      </template>
      <template #item.Tanggal="{ value }">
        <span>{{ fmtDate(value) }}</span>
      </template>

      <template #summary-row="{ filteredItems }">
        <span class="summary-lbl">Total Debet</span>
        <span class="summary-val">
          {{
            fmt(
              filteredItems.reduce(
                (s: number, r: any) => s + Number(r.Debet),
                0
              )
            )
          }}
        </span>
        <span class="summary-lbl" style="margin-left: 24px">Total Kredit</span>
        <span class="summary-val">
          {{
            fmt(
              filteredItems.reduce(
                (s: number, r: any) => s + Number(r.Kredit),
                0
              )
            )
          }}
        </span>
      </template>
    </BaseBrowse>
  </div>

  <!-- ── Pivot & Chart tab ── -->
  <div v-show="activeTab !== 'grid'" class="lap-layout">
    <div class="lap-header">
      <div class="page-title-section">
        <div class="title-icon-wrap">
          <IconList :size="16" :stroke-width="1.8" />
        </div>
        <h1 class="page-title">List Jurnal</h1>
      </div>
      <div class="header-actions">
        <v-btn size="small" variant="tonal" color="success" @click="doExport">
          <template #prepend
            ><IconFileSpreadsheet :size="13" :stroke-width="1.8"
          /></template>
          Export
        </v-btn>
      </div>
    </div>

    <div class="lap-card">
      <!-- Filter bar pivot/chart -->
      <div class="filter-bar">
        <div class="filter-group">
          <span class="filter-lbl">Periode</span>
          <input v-model="startDate" type="date" class="date-inp" />
          <span class="filter-sep">s/d</span>
          <input v-model="endDate" type="date" class="date-inp" />
          <v-btn
            size="small"
            color="primary"
            variant="tonal"
            :loading="isLoading"
            @click="loadData"
          >
            Tampilkan
          </v-btn>
        </div>
        <div class="filter-divider" />
        <div class="tab-wrap">
          <button class="tab-btn" @click="activeTab = 'grid'">
            <IconTable :size="13" :stroke-width="1.8" /> Grid Data
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'pivot' }"
            @click="activeTab = 'pivot'"
          >
            <IconList :size="13" :stroke-width="1.8" /> Pivot
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'chart' }"
            @click="activeTab = 'chart'"
          >
            <IconChartBar :size="13" :stroke-width="1.8" /> Grafik
          </button>
        </div>
      </div>

      <!-- Pivot -->
      <div v-show="activeTab === 'pivot'" class="tab-inner">
        <div v-if="isLoading" class="tab-loading">
          <v-progress-circular indeterminate color="primary" size="36" />
          <span>Memuat data...</span>
        </div>
        <div v-else-if="!items.length" class="tab-empty">
          Tidak ada data untuk periode ini.
        </div>
        <div v-else class="pivot-wrapper">
          <div class="pivot-hint">
            <span>
              Drag field ke baris/kolom. Tersedia: AccountName, Account,
              Tanggal, Tahun, Bulan, Nomor, Referensi, Jenis, Nilai, DetailCC.
            </span>
            <div class="d-flex gap-2">
              <v-btn
                size="small"
                variant="text"
                color="warning"
                @click="resetPivotConfig"
              >
                Reset Pivot
              </v-btn>
              <v-btn
                size="small"
                variant="tonal"
                color="success"
                @click="doExportPivot"
              >
                <template #prepend
                  ><IconFileSpreadsheet :size="13" :stroke-width="1.8"
                /></template>
                Export Pivot
              </v-btn>
            </div>
          </div>
          <div ref="pivotContainer" class="pivot-container" />
        </div>
      </div>

      <!-- Chart -->
      <div v-show="activeTab === 'chart'" class="tab-inner">
        <div v-if="isLoading" class="tab-loading">
          <v-progress-circular indeterminate color="primary" size="36" />
        </div>
        <div v-else-if="!hasChartData" class="tab-empty">
          Tidak ada data untuk periode ini.
        </div>
        <div v-else class="chart-wrap">
          <div class="chart-header">
            <div class="chart-title">
              {{ getPivotConfig().rows.join(" / ") }} berdasarkan
              {{ getPivotConfig().cols.join(" / ") }}
            </div>
            <select v-model="chartType" class="chart-type-select">
              <option value="column">Column</option>
              <option value="bar">Bar</option>
              <option value="line">Line</option>
              <option value="area">Area</option>
              <option value="pie">Pie</option>
            </select>
          </div>
          <div class="chart-container">
            <canvas ref="chartCanvasRef" />
          </div>
        </div>
      </div>
    </div>
  </div>
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
  width: 130px;
}
.date-inp:focus {
  border-color: #3B5998;
}

/* ── Tab selector ── */
.tab-wrap {
  display: flex;
  align-items: center;
  gap: 2px;
  background: rgba(var(--v-border-color), 0.06);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 6px;
  padding: 3px;
}
.tab-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  border: none;
  border-radius: 4px;
  background: transparent;
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.tab-btn:hover {
  background: rgba(46, 46, 125, 0.08);
  color: #3B5998;
}
.tab-btn.active {
  background: #3B5998;
  color: white;
}

/* ── Pivot/Chart layout ── */
.lap-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 8px 12px;
  gap: 6px;
}
.lap-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 36px;
}
.page-title-section {
  display: flex;
  align-items: center;
  gap: 8px;
}
.title-icon-wrap {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: rgba(46, 46, 125, 0.1);
  color: #3B5998;
  display: flex;
  align-items: center;
  justify-content: center;
}
.page-title {
  font-size: 0.95rem;
  font-weight: 700;
  margin: 0;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.lap-card {
  flex: 1;
  min-height: 0;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-top: 3px solid #3B5998;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.filter-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 12px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.tab-inner {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.tab-loading,
.tab-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 200px;
  font-size: 12px;
  color: #9e9e9e;
}

/* ── Pivot ── */
.pivot-wrapper {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.pivot-hint {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 12px;
  font-size: 10px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  background: rgba(46, 46, 125, 0.03);
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.pivot-container {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px;
}

:deep(.pvtUi),
:deep(.pvtUi *) {
  font-size: 11px !important;
  font-family: inherit !important;
}
:deep(.pvtUi) {
  border: none !important;
  background: transparent !important;
}
:deep(.pvtAxisContainer),
:deep(.pvtVals) {
  background: rgba(46, 46, 125, 0.04) !important;
  border: 1px solid rgba(46, 46, 125, 0.15) !important;
  border-radius: 4px !important;
  min-height: 48px !important;
  padding: 4px !important;
}
:deep(.pvtAttr) {
  background: rgba(46, 46, 125, 0.1) !important;
  color: #3B5998 !important;
  border: 1px solid rgba(46, 46, 125, 0.25) !important;
  border-radius: 3px !important;
  padding: 2px 7px !important;
  font-weight: 600 !important;
  cursor: grab !important;
}
:deep(.pvtTable th) {
  background: #3B5998 !important;
  color: white !important;
  font-weight: 700 !important;
  padding: 5px 9px !important;
  white-space: nowrap !important;
}
:deep(.pvtTable td) {
  padding: 3px 9px !important;
  text-align: right !important;
  border: 1px solid rgba(var(--v-border-color), 0.1) !important;
}
:deep(.pvtTotal),
:deep(.pvtGrandTotal) {
  font-weight: 700 !important;
  background: rgba(46, 46, 125, 0.07) !important;
}

/* ── Chart ── */
.chart-wrap {
  padding: 12px;
  flex: 1;
  display: flex;
  flex-direction: column;
}
.chart-title {
  font-size: 12px;
  font-weight: 700;
  color: #374151;
  margin-bottom: 10px;
  text-align: center;
}
.chart-container {
  flex: 1;
  min-height: 350px;
  position: relative;
}

.num-cell {
  font-variant-numeric: tabular-nums;
}
</style>

<style>
/* ── Pivot Filter Dialog ── */
.pvtFilterBox {
  background: white !important;
  border: 1px solid #e5e7eb !important;
  border-radius: 8px !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12) !important;
  padding: 0 !important;
  min-width: 220px !important;
  overflow: hidden !important;
  font-family: inherit !important;
}

/* Header "Filter values" */
.pvtFilterBox h4 {
  font-size: 11px !important;
  font-weight: 700 !important;
  color: white !important;
  background: #3B5998 !important;
  margin: 0 !important;
  padding: 8px 12px !important;
  letter-spacing: 0.04em !important;
  text-transform: uppercase !important;
}

/* Select All / None links */
.pvtFilterBox p {
  display: flex !important;
  gap: 6px !important;
  padding: 6px 12px !important;
  margin: 0 !important;
  border-bottom: 1px solid #f0f0f0 !important;
  background: #f9fafb !important;
}
.pvtFilterBox p a {
  font-size: 11px !important;
  font-weight: 600 !important;
  color: #3B5998 !important;
  text-decoration: none !important;
  padding: 2px 8px !important;
  border: 1px solid #c8c8e6 !important;
  border-radius: 4px !important;
  background: white !important;
  cursor: pointer !important;
  transition: all 0.15s !important;
}
.pvtFilterBox p a:hover {
  background: #3B5998 !important;
  color: white !important;
}

/* Scrollable checkbox list */
.pvtFilterBox .pvtCheckContainer {
  max-height: 240px !important;
  overflow-y: auto !important;
  padding: 6px 4px !important;
  scrollbar-width: thin !important;
}
.pvtFilterBox .pvtCheckContainer p {
  display: flex !important;
  align-items: center !important;
  gap: 6px !important;
  padding: 4px 10px !important;
  margin: 0 !important;
  border: none !important;
  background: transparent !important;
  border-radius: 4px !important;
  cursor: pointer !important;
  transition: background 0.1s !important;
}
.pvtFilterBox .pvtCheckContainer p:hover {
  background: rgba(46, 46, 125, 0.06) !important;
}
.pvtFilterBox .pvtCheckContainer p label {
  font-size: 11px !important;
  color: #374151 !important;
  cursor: pointer !important;
  user-select: none !important;
  display: flex !important;
  align-items: center !important;
  gap: 6px !important;
  width: 100% !important;
}
.pvtFilterBox .pvtCheckContainer input[type="checkbox"] {
  accent-color: #3B5998 !important;
  width: 13px !important;
  height: 13px !important;
  flex-shrink: 0 !important;
  cursor: pointer !important;
}

/* Footer buttons Apply / Cancel */
.pvtFilterBox .pvtButton {
  display: flex !important;
  gap: 6px !important;
  justify-content: flex-end !important;
  padding: 8px 12px !important;
  border-top: 1px solid #f0f0f0 !important;
  background: #f9fafb !important;
}
.pvtFilterBox button {
  height: 28px !important;
  padding: 0 14px !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  border-radius: 5px !important;
  border: none !important;
  cursor: pointer !important;
  transition: all 0.15s !important;
}
/* Apply button */
.pvtFilterBox button:first-of-type {
  background: #3B5998 !important;
  color: white !important;
}
.pvtFilterBox button:first-of-type:hover {
  background: #3B5998 !important;
}
/* Cancel button */
.pvtFilterBox button:last-of-type {
  background: white !important;
  color: #374151 !important;
  border: 1px solid #d1d5db !important;
}
.pvtFilterBox button:last-of-type:hover {
  background: #f3f4f6 !important;
}

.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  flex-shrink: 0;
}
.chart-title {
  font-size: 12px;
  font-weight: 700;
  color: #374151;
  margin-bottom: 0;
}
.chart-type-select {
  height: 30px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 600;
  outline: none;
  background: white;
  color: #374151;
  cursor: pointer;
}
.chart-type-select:focus {
  border-color: #3B5998;
}
</style>
