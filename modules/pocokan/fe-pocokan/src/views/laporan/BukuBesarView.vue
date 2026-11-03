<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useToast } from "vue-toastification";
import { isAuthExpiredError } from "@/api/axios";
import { useAuthStore } from "@/stores/authStore";
import BaseBrowse from "@/components/BaseBrowse.vue";
import {
  bukuBesarApi,
  type BukuBesarRow,
  type AccountItem,
} from "@/api/laporan/bukuBesarApi";
import { exportBukuBesar } from "@/utils/exportExcel";
import { IconBook, IconFileSpreadsheet, IconSearch } from "@tabler/icons-vue";

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "";

// ── Periode & Account ─────────────────────────────────────────────────
const STORAGE_KEY = "finance_periode_buku_besar";

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

// ── Satu filterState — pola Manksi ───────────────────────────────────
const filterState = ref({
  startDate: saved?.startDate ?? getLocal(firstDay),
  endDate: saved?.endDate ?? getLocal(now),
  rekkode: saved?.rekkode ?? "",
  reknama: saved?.reknama ?? "",
});

// Computed shorthand untuk kemudahan binding di template
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

// Simpan ke sessionStorage setiap filterState berubah
watch(
  filterState,
  (val) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(val));
    } catch {
      /* silent */
    }
  },
  { deep: true },
);

// filterValues dikirim ke BaseBrowse → BaseBrowse watch → emit("refresh") → loadData
// Guard di loadData: skip jika rekkode/reknama belum ada
const filterValues = computed(() => ({ ...filterState.value }));

// ── Data ──────────────────────────────────────────────────────────────
const items = ref<BukuBesarRow[]>([]);
const isLoading = ref(false);

// ── Modal Search Account ──────────────────────────────────────────────
const showModal = ref(false);
const modalSearch = ref("");
const modalLoading = ref(false);
const modalItems = ref<AccountItem[]>([]);
const modalPage = ref(1);
const MODAL_PAGE_SIZE = 50;

const modalFiltered = computed(() => {
  const q = modalSearch.value.toLowerCase();
  if (!q) return modalItems.value;
  return modalItems.value.filter(
    (a) => a.kode.toLowerCase().includes(q) || a.nama.toLowerCase().includes(q),
  );
});

const modalPaged = computed(() =>
  modalFiltered.value.slice(0, modalPage.value * MODAL_PAGE_SIZE),
);

const modalHasMore = computed(
  () => modalPaged.value.length < modalFiltered.value.length,
);

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
  modalLoading.value = true;
  try {
    const cabang = authStore.userCabang || "P01";
    modalItems.value = await bukuBesarApi.searchAccount(cabang);
  } catch (e: any) {
    if (isAuthExpiredError(e)) return;
    toast.error("Gagal memuat daftar account.");
  } finally {
    modalLoading.value = false;
  }
};

const selectAccount = (item: AccountItem) => {
  filterState.value = {
    ...filterState.value,
    rekkode: item.kode,
    reknama: item.nama,
  };
  showModal.value = false;
};

// ── Validasi kode manual (blur/enter) ────────────────────────────────
const onRekkodeBlur = async () => {
  if (!filterState.value.rekkode) return;
  try {
    const acc = await bukuBesarApi.getAccountByKode(filterState.value.rekkode);
    // Update reknama via filterState — trigger satu kali
    filterState.value = { ...filterState.value, reknama: acc.nama };
  } catch {
    filterState.value = { ...filterState.value, reknama: "" };
    toast.error("Account tersebut belum terdaftar.");
  }
};

// ── Headers ───────────────────────────────────────────────────────────
const headers = [
  {
    key: "Tanggal",
    title: "Tanggal",
    width: "100px",
    align: "center" as const,
  },
  { key: "Nomor", title: "Nomor", width: "190px" },
  { key: "Trs", title: "Trs", width: "55px", align: "center" as const },
  { key: "Nota", title: "Nota", width: "110px" },
  { key: "Penerima", title: "Penerima", width: "130px" },
  { key: "Keterangan", title: "Keterangan", width: "280px" },
  { key: "Debet", title: "Debet", width: "140px", align: "right" as const },
  { key: "Kredit", title: "Kredit", width: "140px", align: "right" as const },
  { key: "Saldo", title: "Saldo", width: "150px", align: "right" as const },
  { key: "Account", title: "Account", width: "90px" },
  { key: "NamaAccount", title: "Nama Account", width: "260px" },
  {
    key: "TglTransfer",
    title: "Tgl Transfer",
    width: "110px",
    align: "center" as const,
  },
];

// ── Load ──────────────────────────────────────────────────────────────
// Guard: skip jika rekkode/reknama belum valid
// Dipanggil oleh BaseBrowse (@refresh) saat filterValues berubah
const loadData = async () => {
  if (!filterState.value.rekkode || !filterState.value.reknama) return;
  isLoading.value = true;
  try {
    items.value = await bukuBesarApi.getBukuBesar(
      filterState.value.rekkode,
      filterState.value.startDate,
      filterState.value.endDate,
    );
  } catch (e: any) {
    if (isAuthExpiredError(e)) return;
    toast.error(e.response?.data?.message ?? "Gagal memuat data.");
  } finally {
    isLoading.value = false;
  }
};

// ── Init: load default account lalu data ─────────────────────────────
onMounted(async () => {
  if (!filterState.value.rekkode) {
    try {
      const cabang = authStore.userCabang || "P01";
      const def = await bukuBesarApi.getDefaultAccount(cabang);
      const acc = await bukuBesarApi.getAccountByKode(def.kode);
      // Set sekaligus — satu perubahan filterState
      filterState.value = {
        ...filterState.value,
        rekkode: def.kode,
        reknama: acc.nama,
      };
    } catch {
      /* silent */
    }
  }
  // loadData manual di mount — BaseBrowse belum aktif saat ini
  await loadData();
});

// ── Row props ─────────────────────────────────────────────────────────
const rowPropsFn = (data: any) => {
  const row = data?.item?.raw ?? data?.item ?? data;
  if (row?.Keterangan === "Saldo Awal")
    return { style: "background:#fffde7;font-weight:600;color:#f57f17" };
  return {};
};

// ── Summary totals ────────────────────────────────────────────────────
const totalDebet = computed(() =>
  items.value
    .filter((r) => r.Keterangan !== "Saldo Awal")
    .reduce((s, r) => s + Number(r.Debet), 0),
);
const totalKredit = computed(() =>
  items.value
    .filter((r) => r.Keterangan !== "Saldo Awal")
    .reduce((s, r) => s + Number(r.Kredit), 0),
);
const saldoAkhir = computed(() =>
  items.value.length > 0 ? items.value[items.value.length - 1].Saldo : 0,
);

const fmt = (v: number) => new Intl.NumberFormat("id-ID").format(v || 0);
const fmtDate = (v: string) => {
  if (!v) return "-";
  const [y, m, d] = v.split("-");
  return `${d}-${m}-${y}`;
};

const doExport = () =>
  exportBukuBesar(
    getExportItems(),
    filterState.value.rekkode,
    filterState.value.reknama,
    filterState.value.startDate,
    filterState.value.endDate,
  );
const browseRef = ref<InstanceType<typeof BaseBrowse> | null>(null);
const getExportItems = (): typeof items.value => browseRef.value?.getExportItems() ?? [];
</script>

<template>
  <BaseBrowse
    ref="browseRef"
    title="Buku Besar"
    :icon="IconBook"
    :menu-id="MENU_ID"
    :headers="headers"
    :items="items"
    :is-loading="isLoading"
    :fixed-layout="false"
    item-value="Nomor"
    :row-props-fn="rowPropsFn"
    :filter-values="filterValues"
    @refresh="loadData"
  >
    <!-- ── Filter ── -->
    <template #filter-left>
      <div class="d-flex align-center flex-wrap" style="gap: 10px">
        <div class="d-flex align-center" style="gap: 6px">
          <span class="filter-lbl">Periode</span>
          <input v-model="startDate" type="date" class="date-inp" />
          <span class="filter-lbl">s/d</span>
          <input v-model="endDate" type="date" class="date-inp" />
        </div>
        <div class="filter-divider"></div>
        <div class="d-flex align-center" style="gap: 6px">
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
      </div>
    </template>

    <!-- ── Tombol export ── -->
    <template #extra-actions>
      <v-btn size="small" variant="tonal" color="success" @click="doExport">
        <template #prepend>
          <IconFileSpreadsheet :size="13" :stroke-width="1.8" />
        </template>
        Export
      </v-btn>
    </template>

    <!-- ── Custom cells ── -->
    <template #item.Debet="{ value }">
      <span class="num-cell">{{ value ? fmt(value) : "" }}</span>
    </template>
    <template #item.Kredit="{ value }">
      <span class="num-cell">{{ value ? fmt(value) : "" }}</span>
    </template>
    <template #item.Saldo="{ value }">
      <span class="num-cell" :class="{ 'saldo-neg': value < 0 }">{{
        fmt(value)
      }}</span>
    </template>
    <template #item.Tanggal="{ value }">
      <span>{{ fmtDate(value) }}</span>
    </template>
    <template #item.TglTransfer="{ value }">
      <span>{{ fmtDate(value) }}</span>
    </template>

    <!-- ── Summary bar ── -->
    <template #summary-row>
      <span class="summary-lbl">Total Debet</span>
      <span class="summary-val">{{ fmt(totalDebet) }}</span>
      <span class="summary-lbl" style="margin-left: 20px">Total Kredit</span>
      <span class="summary-val">{{ fmt(totalKredit) }}</span>
      <span class="summary-lbl" style="margin-left: 20px">Saldo Akhir</span>
      <span class="summary-val" :class="{ 'saldo-neg-white': saldoAkhir < 0 }">
        {{ fmt(saldoAkhir) }}
      </span>
    </template>
  </BaseBrowse>

  <!-- ── Modal Search Account ── -->
  <v-dialog v-model="showModal" max-width="520" scrollable>
    <v-card rounded="lg">
      <v-card-title
        class="pa-4 pb-2"
        style="font-size: 13px; font-weight: 700; border-top: 3px solid #3B5998"
      >
        Pilih Account
      </v-card-title>

      <v-card-text class="pa-3 pt-2" style="max-height: 480px">
        <!-- Search + total -->
        <div class="modal-search-row">
          <input
            v-model="modalSearch"
            type="text"
            class="modal-search-inp"
            placeholder="Cari kode atau nama..."
            @input="onModalSearchInput"
            autofocus
          />
          <span class="modal-total-badge">
            {{ modalFiltered.length.toLocaleString("id-ID") }} data
          </span>
        </div>

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

          <!-- Load more -->
          <div v-if="modalHasMore" class="modal-load-more">
            <v-btn
              size="small"
              variant="tonal"
              color="primary"
              @click="modalPage++"
            >
              Tampilkan lebih banyak
              <span class="modal-load-more-count">
                ({{ modalPaged.length }} / {{ modalFiltered.length }})
              </span>
            </v-btn>
          </div>

          <!-- Sudah semua -->
          <div v-else-if="modalPaged.length > 0" class="modal-end-info">
            Menampilkan semua
            {{ modalFiltered.length.toLocaleString("id-ID") }} data
          </div>

          <div v-if="!modalPaged.length" class="modal-empty">
            Tidak ada data.
          </div>
        </div>
      </v-card-text>

      <v-card-actions class="pa-3" style="border-top: 1px solid #eee">
        <span class="modal-footer-info">
          Total:
          <strong>{{ modalItems.length.toLocaleString("id-ID") }}</strong>
          account
          <template v-if="modalSearch">
            · Hasil filter:
            <strong>{{ modalFiltered.length.toLocaleString("id-ID") }}</strong>
          </template>
        </span>
        <v-spacer />
        <v-btn variant="text" size="small" @click="showModal = false"
          >Tutup</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.filter-lbl {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  white-space: nowrap;
}
.filter-divider {
  width: 1px;
  height: 24px;
  background: rgba(var(--v-border-color), var(--v-border-opacity));
  flex-shrink: 0;
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
.num-cell {
  font-variant-numeric: tabular-nums;
}
.saldo-neg {
  color: #cc0000;
  font-weight: 700;
}
.saldo-neg-white {
  color: #ffcdd2 !important;
}

/* Modal */
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
.modal-search-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.modal-search-inp {
  flex: 1;
  height: 34px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 0 10px;
  font-size: 12px;
  outline: none;
  box-sizing: border-box;
}
.modal-search-inp:focus {
  border-color: #3B5998;
}
.modal-total-badge {
  font-size: 11px;
  font-weight: 600;
  color: #3B5998;
  background: #f0f0fd;
  border: 1px solid #c8c8e6;
  border-radius: 20px;
  padding: 3px 10px;
  white-space: nowrap;
  flex-shrink: 0;
}
.modal-load-more {
  display: flex;
  justify-content: center;
  padding: 10px 0 4px;
}
.modal-load-more-count {
  font-size: 10px;
  opacity: 0.7;
  margin-left: 4px;
}
.modal-end-info {
  text-align: center;
  font-size: 10px;
  color: #9ca3af;
  padding: 8px 0 2px;
}
.modal-footer-info {
  font-size: 11px;
  color: #6b7280;
}
</style>
