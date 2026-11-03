<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useToast } from "vue-toastification";
import { isAuthExpiredError } from "@/api/axios";
import { useAuthStore } from "@/stores/authStore";
import BaseBrowse from "@/components/BaseBrowse.vue";
import {
  kasbonBelumSelesaiApi,
  type KasbonMasterRow,
  type KasbonDetailRow,
  type AccountItem,
} from "@/api/laporan/kasbonBelumSelesaiApi";
import {
  exportKasbonBelumSelesai,
  exportKasbonBelumSelesaiDetail,
} from "@/utils/exportExcel";
import {
  IconReceipt2,
  IconFileSpreadsheet,
  IconSearch,
} from "@tabler/icons-vue";

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "";

// ── Filter State (pola Manksi) ────────────────────────────────────────
const STORAGE_KEY = "finance_filter_kasbon_belum_selesai";

const getSaved = () => {
  try {
    const s = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
    if (s?.rekkode) return s;
  } catch {
    /* silent */
  }
  return null;
};
const saved = getSaved();

const filterState = ref({
  rekkode: saved?.rekkode ?? "",
  reknama: saved?.reknama ?? "",
});

const rekkode = computed({
  get: () => filterState.value.rekkode,
  set: (v) => {
    filterState.value = { ...filterState.value, rekkode: v };
  },
});
const reknama = computed({
  get: () => filterState.value.reknama,
  set: (v) => {
    filterState.value = { ...filterState.value, reknama: v };
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

// filterValues → BaseBrowse watch → emit refresh → loadData
const filterValues = computed(() => ({ ...filterState.value }));

// ── Data ──────────────────────────────────────────────────────────────
const items = ref<KasbonMasterRow[]>([]);
const detailItems = ref<KasbonDetailRow[]>([]);
const isLoading = ref(false);
const expanded = ref<any[]>([]);

// ── Modal Search Account ──────────────────────────────────────────────
const showModal = ref(false);
const modalSearch = ref("");
const modalLoading = ref(false);
const modalItems = ref<AccountItem[]>([]);
const modalPage = ref(1);
const MODAL_PAGE_SIZE = 50;

const modalPaged = computed(() => {
  const q = modalSearch.value.toLowerCase();
  const filtered = q
    ? modalItems.value.filter(
        (a) =>
          a.kode.toLowerCase().includes(q) || a.nama.toLowerCase().includes(q)
      )
    : modalItems.value;
  return filtered.slice(0, modalPage.value * MODAL_PAGE_SIZE);
});

let debounceTimer: ReturnType<typeof setTimeout>;
const onModalSearchInput = () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    modalPage.value = 1;
  }, 350);
};

const openModal = async () => {
  showModal.value = true;
  modalSearch.value = "";
  modalPage.value = 1;
  if (modalItems.value.length > 0) return;
  modalLoading.value = true;
  try {
    const cabang = authStore.userCabang || "P01";
    modalItems.value = await kasbonBelumSelesaiApi.searchAccount(cabang);
  } catch (e: any) {
    if (isAuthExpiredError(e)) return;
    toast.error("Gagal memuat daftar account.");
  } finally {
    modalLoading.value = false;
  }
};

const selectAccount = (item: AccountItem) => {
  filterState.value = { rekkode: item.kode, reknama: item.nama };
  showModal.value = false;
};

const onRekkodeBlur = async () => {
  if (!filterState.value.rekkode) return;
  try {
    const acc = await kasbonBelumSelesaiApi.getAccountByKode(
      filterState.value.rekkode
    );
    filterState.value = { ...filterState.value, reknama: acc.nama };
  } catch {
    filterState.value = { ...filterState.value, reknama: "" };
    toast.error("Account tersebut belum terdaftar.");
  }
};

// ── Headers Master ────────────────────────────────────────────────────
const headers = [
  { key: "Nomor", title: "Nomor", width: "190px" },
  {
    key: "Tanggal",
    title: "Tanggal",
    width: "100px",
    align: "center" as const,
  },
  { key: "Jenis", title: "Jenis", width: "70px", align: "center" as const },
  { key: "Pjh", title: "Pjh", width: "140px" },
  { key: "Nota", title: "Nota", width: "110px" },
  { key: "Penerima", title: "Penerima", width: "140px" },
  { key: "Nominal", title: "Nominal", width: "140px", align: "right" as const },
  { key: "Keterangan", title: "Keterangan", width: "300px" },
];

// ── Load ──────────────────────────────────────────────────────────────
const loadData = async () => {
  if (!filterState.value.rekkode || !filterState.value.reknama) return;
  isLoading.value = true;
  expanded.value = [];
  try {
    const res = await kasbonBelumSelesaiApi.getData(filterState.value.rekkode);
    items.value = res.master;
    detailItems.value = res.detail;
  } catch (e: any) {
    if (isAuthExpiredError(e)) return;
    toast.error(e.response?.data?.message ?? "Gagal memuat data.");
  } finally {
    isLoading.value = false;
  }
};

// ── Init ──────────────────────────────────────────────────────────────
onMounted(async () => {
  if (!filterState.value.rekkode) {
    try {
      const cabang = authStore.userCabang || "P01";
      const def = await kasbonBelumSelesaiApi.getDefaultAccount(cabang);
      const acc = await kasbonBelumSelesaiApi.getAccountByKode(def.kode);
      filterState.value = { rekkode: def.kode, reknama: acc.nama };
    } catch {
      /* silent */
    }
  }
  await loadData();
});

// ── Detail helper ─────────────────────────────────────────────────────
const getDetail = (nomor: string) =>
  detailItems.value.filter((d) => d.Nomor === nomor);

// ── Row props ─────────────────────────────────────────────────────────
const rowPropsFn = (_data: any) => ({});

// ── Summary ───────────────────────────────────────────────────────────
const totalNominal = computed(() =>
  items.value.reduce((s, r) => s + Number(r.Nominal), 0)
);

const fmt = (v: number) => new Intl.NumberFormat("id-ID").format(v || 0);

const fmtDate = (v: string) => {
  if (!v) return "-";
  const [y, m, d] = v.split("-");
  return `${d}-${m}-${y}`;
};

// ── Export ────────────────────────────────────────────────────────────
const doExport = () =>
  exportKasbonBelumSelesai(
    getExportItems(),
    filterState.value.rekkode,
    filterState.value.reknama
  );
const doExportDetail = () =>
  exportKasbonBelumSelesaiDetail(
    getExportItems().flatMap((row) => getDetail(row.Nomor)),
    filterState.value.rekkode,
    filterState.value.reknama
  );
const browseRef = ref<InstanceType<typeof BaseBrowse> | null>(null);
const getExportItems = (): typeof items.value => browseRef.value?.getExportItems() ?? [];
</script>

<template>
  <BaseBrowse
    ref="browseRef"
    title="Kasbon Belum Selesai"
    :icon="IconReceipt2"
    :menu-id="MENU_ID"
    :headers="headers"
    :items="items"
    :is-loading="isLoading"
    :fixed-layout="false"
    :show-expand="true"
    :expanded="expanded"
    @update:expanded="expanded = $event"
    item-value="Nomor"
    :row-props-fn="rowPropsFn"
    :summary-key="'Nominal'"
    :summary-label="'Total Nominal'"
    :filter-values="filterValues"
    @refresh="loadData"
  >
    <!-- ── Filter ── -->
    <template #filter-left>
      <div class="filter-group">
        <span class="filter-lbl">Account</span>
        <input
          :value="rekkode"
          @input="(e) => (rekkode = (e.target as HTMLInputElement).value)"
          type="text"
          class="kode-inp"
          placeholder="Kode..."
          @blur="onRekkodeBlur"
          @keydown.enter="onRekkodeBlur"
        />
        <v-btn
          size="small"
          icon
          variant="outlined"
          @click="openModal"
          title="Cari Account"
        >
          <IconSearch :size="14" :stroke-width="1.8" />
        </v-btn>
        <input
          :value="reknama"
          readonly
          class="nama-inp"
          placeholder="Nama account..."
        />
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

    <!-- ── Custom cell Nominal ── -->
    <template #item.Nominal="{ value }">
      <span class="num-cell">{{ value ? fmt(value) : "" }}</span>
    </template>

    <template #item.Tanggal="{ value }">
      <span>{{ fmtDate(value) }}</span>
    </template>

    <!-- ── Expanded detail ── -->
    <template #detail="{ item }">
      <div class="detail-wrap">
        <div v-if="!getDetail(item.Nomor).length" class="detail-empty">
          Tidak ada detail untuk kasbon ini.
        </div>
        <table v-else class="detail-tbl">
          <thead>
            <tr>
              <th style="min-width: 300px">Uraian</th>
              <th style="width: 80px">Satuan</th>
              <th style="width: 80px">Qty</th>
              <th style="width: 120px">Nominal</th>
              <th style="width: 120px">Total</th>
              <th style="min-width: 160px">Kegunaan</th>
              <th style="min-width: 120px">Keterangan</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(d, idx) in getDetail(item.Nomor)" :key="idx">
              <td>{{ d.Uraian }}</td>
              <td class="tc">{{ d.Satuan }}</td>
              <td class="tr">{{ fmt(d.Qty) }}</td>
              <td class="tr">{{ fmt(d.Nominal) }}</td>
              <td class="tr">{{ fmt(d.Total) }}</td>
              <td>{{ d.Kegunaan }}</td>
              <td>
                <span v-if="d.Keterangan" class="ket-badge">{{
                  d.Keterangan
                }}</span>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="detail-foot">
              <td colspan="3" class="tr detail-foot-lbl">Total</td>
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
              <td class="tr detail-foot-val">
                {{
                  fmt(
                    getDetail(item.Nomor).reduce(
                      (s, d) => s + Number(d.Total),
                      0
                    )
                  )
                }}
              </td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </template>

    <!-- ── Summary bar ── -->
    <template #summary-row>
      <span class="summary-lbl">Total Nominal</span>
      <span class="summary-val">{{ fmt(totalNominal) }}</span>
    </template>
  </BaseBrowse>

  <!-- ── Modal Search Account ── -->
  <v-dialog v-model="showModal" max-width="520" scrollable>
    <v-card rounded="lg">
      <v-card-title
        class="text-body-1 font-weight-bold pa-4 pb-2"
        style="border-top: 3px solid #3B5998"
      >
        Pilih Account
      </v-card-title>
      <v-card-text class="pa-3 pt-0">
        <input
          v-model="modalSearch"
          type="text"
          class="modal-search-inp"
          placeholder="Cari kode atau nama..."
          @input="onModalSearchInput"
          autofocus
        />
        <div v-if="modalLoading" class="modal-loading">
          <v-progress-circular indeterminate color="primary" size="28" />
        </div>
        <div v-else class="modal-list">
          <div
            v-for="item in modalPaged"
            :key="item.kode"
            class="modal-item"
            @click="selectAccount(item)"
          >
            <span class="modal-kode">{{ item.kode }}</span>
            <span class="modal-nama">{{ item.nama }}</span>
          </div>
          <div v-if="!modalPaged.length" class="modal-empty">
            Tidak ada data.
          </div>
        </div>
      </v-card-text>
      <v-card-actions class="pa-3" style="border-top: 1px solid #eee">
        <v-spacer />
        <v-btn variant="text" size="small" @click="showModal = false"
          >Tutup</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
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
.kode-inp {
  height: 32px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 0 8px;
  font-size: 12px;
  outline: none;
  width: 90px;
  font-family: monospace;
}
.kode-inp:focus {
  border-color: #3B5998;
}
.nama-inp {
  height: 32px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 0 8px;
  font-size: 12px;
  outline: none;
  width: 240px;
  background: #f5f5f5;
  color: #555;
}

/* ── Detail table ── */
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
.ket-badge {
  background: rgba(46, 46, 125, 0.1);
  color: #3B5998;
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 10px;
  font-weight: 600;
}
.num-cell {
  font-variant-numeric: tabular-nums;
}
.tc {
  text-align: center;
}
.tr {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* ── Modal ── */
.modal-search-inp {
  width: 100%;
  height: 34px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 0 10px;
  font-size: 12px;
  outline: none;
  margin-bottom: 8px;
  box-sizing: border-box;
}
.modal-search-inp:focus {
  border-color: #3B5998;
}
.modal-loading {
  display: flex;
  justify-content: center;
  padding: 24px;
}
.modal-list {
  max-height: 360px;
  overflow-y: auto;
}
.modal-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  cursor: pointer;
  border-radius: 4px;
  font-size: 12px;
  transition: background 0.1s;
}
.modal-item:hover {
  background: rgba(46, 46, 125, 0.08);
}
.modal-kode {
  font-family: monospace;
  font-size: 11px;
  font-weight: 700;
  color: #3B5998;
  min-width: 80px;
}
.modal-nama {
  color: #374151;
}
.modal-empty {
  text-align: center;
  padding: 20px;
  color: #9e9e9e;
  font-size: 12px;
}
</style>
