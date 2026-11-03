<script setup lang="ts">
import { ref, watch, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { penyesuaianStokApi } from "@/api/transaksi/penyesuaianStokApi";
import { exportToExcel } from "@/utils/exportExcel";
import { IconAdjustments, IconFileSpreadsheet } from "@tabler/icons-vue";

const router = useRouter();
const toast = useToast();
const MENU_ID = "27";

// ── Periode ───────────────────────────────────────────────────────────
const STORAGE_KEY = "inv_periode_penyesuaian_stok";

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
  } catch {}
  const now = new Date();
  return { startDate: getLocal(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: getLocal(now) };
};

const p = getSavedPeriode();
const startDate = ref(p.startDate);
const endDate = ref(p.endDate);

watch([startDate, endDate], ([s, e]) => {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ startDate: s, endDate: e })); } catch {}
  loadData();
});

// ── Formatter gaya program lama (Delphi) ───────────────────────────────
const fmtOldNum = (v: number | string | null | undefined): string => {
  const n = Number(v) || 0;
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n));
  return n < 0 ? `(${formatted})` : formatted;
};

const fmtRp = (v: number | string | null | undefined): string =>
  "Rp " + new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(v) || 0);

const fmtOldDate = (v: string | null | undefined): string => {
  if (!v || v === "0000-00-00") return "12/30/1899";
  const datePart = v.split(" ")[0].split("T")[0];
  const [y, m, d] = datePart.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return "12/30/1899";
  return `${m}/${d}/${y}`;
};

const fmtOldDateTime = (v: string | null | undefined): string => {
  if (!v) return "";
  const dt = new Date(v.replace(" ", "T"));
  if (isNaN(dt.getTime())) return v;
  let h = dt.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const mm = String(dt.getMinutes()).padStart(2, "0");
  const ss = String(dt.getSeconds()).padStart(2, "0");
  return `${dt.getMonth() + 1}/${dt.getDate()}/${dt.getFullYear()} ${h}:${mm}:${ss} ${ampm}`;
};

// ── Tabel ─────────────────────────────────────────────────────────────
const items = ref<any[]>([]);
const isLoading = ref(false);
const selected = ref<any[]>([]);
const selectedItem = computed(() => selected.value[0] ?? null);

// FIX LEBAR KOLOM: sebelumnya semua kolom pakai `width` tetap (kaku),
// jadi tabel selalu terasa sempit meski layar lebar. Sekarang ikut pola
// yang sama seperti Master Data Barang — kebanyakan kolom pakai
// `minWidth` (boleh melebar mengisi ruang kosong), cuma kolom yang
// memang perlu ukuran pas (angka pendek, status, tanggal singkat)
// yang tetap dikunci `width`. Kombinasi ini + :fixed-layout="false" di
// BaseBrowse (lihat template) yang bikin tabel Barang kelihatan lega.
const headers = [
  { title: "NOMOR",        key: "Nomor",        minWidth: "170px", align: "center" },
  { title: "TANGGAL",      key: "Tanggal",       width: "110px",    align: "center" },
  { title: "GUDANG",       key: "Gudang",        minWidth: "180px" },
  { title: "KETERANGAN",   key: "Keterangan",    minWidth: "220px" },
  { title: "TOTAL",        key: "Total",         minWidth: "160px", align: "end" },
  { title: "IDBATCH",      key: "Idbatch",       minWidth: "140px" },
  { title: "EXPIRED",      key: "Expired",       width: "110px",    align: "center" },
  { title: "PRODUKSI",     key: "Produksi",      minWidth: "200px" },
  { title: "MEMO",         key: "Memo",          minWidth: "260px" },
  { title: "QTY PRODUKSI", key: "QtyProduksi",   minWidth: "130px", align: "end" },
  { title: "SATUAN",       key: "Satuan",        width: "90px",     align: "center" },
  { title: "USER",         key: "UserCreate",    minWidth: "120px" },
  { title: "TGL INPUT",    key: "DateCreate",    minWidth: "170px" },
  { title: "JML ITEM",     key: "JumlahItem",    width: "100px",    align: "center" },
];

const loadData = async () => {
  isLoading.value = true;
  selected.value = [];
  try {
    items.value = await penyesuaianStokApi.getBrowse(startDate.value, endDate.value);
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal memuat data Penyesuaian Stok.");
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => loadData());

const expanded = ref<any[]>([]);
const detailMap = ref<Record<string, any[]>>({});
// FIX INDIKATOR LOADING: sebelumnya tidak ada cara membedakan "baris
// belum pernah di-fetch" vs "sudah di-fetch tapi ternyata kosong" —
// keduanya sama-sama tampil "Tidak ada detail." begitu expand diklik,
// padahal request-nya bisa saja belum selesai. Sekarang dilacak
// eksplisit lewat Set nomor yang sedang loading.
const detailLoading = ref<Set<string>>(new Set());

const getDetail = (nomor: string) => detailMap.value[nomor] ?? [];
const isDetailLoading = (nomor: string) => detailLoading.value.has(nomor);
const isDetailLoaded = (nomor: string) => detailMap.value[nomor] !== undefined;

const onUpdateExpanded = async (newExpanded: any[]) => {
  expanded.value = newExpanded;
  for (const item of newExpanded) {
    const nomor = item.Nomor;
    if (detailMap.value[nomor] !== undefined || detailLoading.value.has(nomor)) continue;
    detailLoading.value.add(nomor);
    try {
      detailMap.value[nomor] = await penyesuaianStokApi.getDetail(nomor);
    } catch {
      detailMap.value[nomor] = [];
    } finally {
      detailLoading.value.delete(nomor);
    }
  }
};

// ── Aksi ──────────────────────────────────────────────────────────────
const onBaru = () => router.push({ name: "penyesuaianStokCreate" });

const onUbah = () => {
  if (!selectedItem.value) return toast.warning("Pilih data terlebih dahulu.");
  router.push({ name: "penyesuaianStokEdit", params: { nomor: selectedItem.value.Nomor } });
};

const onHapus = async () => {
  if (!selectedItem.value) return toast.warning("Pilih data terlebih dahulu.");
  if (!confirm(`Hapus Penyesuaian Stok ${selectedItem.value.Nomor}?\nStok barang terkait akan dikembalikan ke sebelum penyesuaian ini.`)) return;
  try {
    await penyesuaianStokApi.delete(selectedItem.value.Nomor);
    toast.success("Data berhasil dihapus.");
    await loadData();
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal menghapus data.");
  }
};

const doExport = async () => {
  const exportItems = getExportItems();
  if (exportItems.length === 0) return toast.warning("Tidak ada data untuk diexport.");
  try {
    await exportToExcel({
      title: "Penyesuaian Stok",
      filenamePrefix: "PenyesuaianStok",
      sheetName: "Penyesuaian Stok",
      columns: [
        { header: "Nomor", key: "Nomor", width: 20 },
        { header: "Tanggal", key: "Tanggal", width: 14, align: "center" },
        { header: "Gudang", key: "Gudang", width: 20 },
        { header: "Keterangan", key: "Keterangan", width: 30 },
        { header: "Total", key: "Total", width: 16, align: "right" },
        { header: "Idbatch", key: "Idbatch", width: 16 },
        { header: "Expired", key: "Expired", width: 14, align: "center" },
        { header: "Produksi", key: "Produksi", width: 20 },
        { header: "Memo", key: "Memo", width: 20 },
        { header: "Qty Produksi", key: "QtyProduksi", width: 14, align: "right" },
        { header: "Satuan", key: "Satuan", width: 10, align: "center" },
        { header: "User", key: "UserCreate", width: 12 },
        { header: "Tgl Input", key: "DateCreate", width: 18 },
        { header: "Jml Item", key: "JumlahItem", width: 10, align: "center" },
      ],
      rows: exportItems,
    });
    toast.success("Berhasil export data ke Excel!");
  } catch (e) {
    console.error(e);
    toast.error("Gagal export data ke Excel.");
  }
};
const browseRef = ref<InstanceType<typeof BaseBrowse> | null>(null);
const getExportItems = (): typeof items.value => browseRef.value?.getExportItems() ?? [];
</script>

<template>
  <BaseBrowse
    ref="browseRef"
    title="Penyesuaian Stok"
    :icon="IconAdjustments"
    :menu-id="MENU_ID"
    :headers="headers"
    :items="items"
    :is-loading="isLoading"
    :show-expand="true"
    :expanded="expanded"
    item-value="Nomor"
    :fixed-layout="false"
    @update:expanded="onUpdateExpanded"
    v-model:selected="selected"
    @refresh="loadData"
  >
    <template #filter-left>
      <div class="filter-group">
        <span class="filter-lbl">Periode</span>
        <input type="date" v-model="startDate" class="date-inp" />
        <span class="filter-sep">s/d</span>
        <input type="date" v-model="endDate" class="date-inp" />
      </div>
    </template>

    <template #extra-actions>
      <v-btn size="small" color="primary" variant="flat" @click="onBaru">+ Baru</v-btn>
      <v-btn size="small" variant="outlined" :disabled="!selectedItem" @click="onUbah">Ubah</v-btn>
      <v-btn size="small" color="error" variant="tonal" :disabled="!selectedItem" @click="onHapus">Hapus</v-btn>
      <v-btn size="small" variant="tonal" color="success" @click="doExport">
        <template #prepend><IconFileSpreadsheet :size="13" :stroke-width="1.8" /></template>
        Export
      </v-btn>
    </template>

    <template #item.Nomor="{ item }">
      <span class="font-weight-bold text-primary">{{ item.Nomor }}</span>
    </template>
    <template #item.Tanggal="{ item }">
      <div class="tc">{{ fmtOldDate(item.Tanggal) }}</div>
    </template>
    <template #item.Total="{ item }">
      <div class="tr font-weight-bold" :class="item.Total < 0 ? 'text-red-darken-2' : 'text-green-darken-3'">
        {{ fmtOldNum(item.Total) }}
      </div>
    </template>
    <template #item.Expired="{ item }">
      <div class="tc">{{ fmtOldDate(item.Expired) }}</div>
    </template>
    <template #item.QtyProduksi="{ item }">
      <div class="tr">{{ fmtOldNum(item.QtyProduksi) }}</div>
    </template>
    <template #item.DateCreate="{ item }">
      <div class="tc">{{ fmtOldDateTime(item.DateCreate) }}</div>
    </template>
    <template #item.JumlahItem="{ item }">
      <div class="tc font-weight-bold">{{ item.JumlahItem }}</div>
    </template>

    <template #detail="{ item }">
  <div class="detail-wrap">
    <table class="detail-tbl">
      <thead>
        <tr>
          <th style="width:150px">Nomor</th>
          <th style="width:100px">Kode</th>
          <th style="min-width:220px">Nama</th>
          <th style="width:110px">Expired</th>
          <th style="width:80px">Satuan</th>
          <th style="width:100px">Qty Koreksi</th>
        </tr>
      </thead>
      <tbody>
        <!-- State 1: sedang fetch — tampilkan spinner, bukan pesan kosong -->
        <tr v-if="isDetailLoading(item.Nomor)">
          <td colspan="6" class="tc" style="padding:14px">
            <div class="detail-loading">
              <v-progress-circular indeterminate size="18" width="2" color="primary" />
              <span>Memuat detail...</span>
            </div>
          </td>
        </tr>

        <!-- State 2: sudah selesai fetch dan ada isinya -->
        <template v-else-if="isDetailLoaded(item.Nomor) && getDetail(item.Nomor).length">
          <tr v-for="d in getDetail(item.Nomor)" :key="d.NoUrut">
            <td><span class="mono">{{ d.Nomor }}</span></td>
            <td><span class="mono">{{ d.Kode }}</span></td>
            <td>{{ d.Nama }}</td>
            <td class="tc">{{ fmtOldDate(d.Expired) }}</td>
            <td class="tc">{{ d.Satuan }}</td>
            <td class="tr" :class="d.QtyKorksi < 0 ? 'text-red-darken-2' : 'text-green-darken-3'">
              {{ fmtOldNum(d.QtyKorksi) }}
            </td>
          </tr>
        </template>

        <!-- State 3: sudah selesai fetch, tapi memang tidak ada baris -->
        <tr v-else-if="isDetailLoaded(item.Nomor)">
          <td colspan="6" class="tc" style="color:#9e9e9e;font-style:italic;padding:8px">
            Tidak ada detail.
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
  </BaseBrowse>
</template>

<style scoped>
.filter-group { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.filter-lbl   { font-size: 12px; font-weight: 600; color: #374151; white-space: nowrap; }
.filter-sep   { font-size: 12px; color: #9ca3af; white-space: nowrap; }
.date-inp {
  height: 32px; border: 1px solid #d1d5db; border-radius: 6px;
  padding: 0 8px; font-size: 12px; outline: none; width: 130px;
}
.date-inp:focus { border-color: #1976d2; }
.tc { text-align: center; }
.tr { text-align: right; }
.mono { font-family: monospace; font-size: 10px; color: #6b7280; }
.detail-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #6b7280;
  font-size: 11px;
  font-style: italic;
}

/* ── Tabel Penyesuaian Stok: kolomnya banyak (14 kolom + expand),
   pakai pola yang sama seperti Master Data Barang — font sedikit
   dikecilkan supaya kolom bisa melebar mengisi ruang layar tanpa
   bikin tabel jadi terlalu panjang secara horizontal. ── */
:deep(.base-table thead th) {
  font-size: 10px !important;
}
:deep(.base-table tbody td) {
  font-size: 10.5px !important;
}
</style>