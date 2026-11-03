<script setup lang="ts">
import { ref,watch } from "vue";
import { useRoute,useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { IconReceipt2 } from "@tabler/icons-vue";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { useBrowse } from "@/composables/useBrowse";
import { bayarSupplierApi } from "@/api/transaksi/bayarSupplierApi";
import { IconReceiptRefund } from "@tabler/icons-vue";
import { useTabsStore } from "@/stores/tabsStore";
import { nextTick } from "vue"; // Pastikan sudah di-import


// ID Menu untuk Pembayaran Supplier (sesuaikan dengan tabel hak akses/menu di database Anda)
const MENU_ID = "53"; 
const toast = useToast();
const router = useRouter();
const route  = useRoute();
const tabsStore = useTabsStore();
const showCloseDialog = ref(false);
const STORAGE_KEY = "pembayaran_supplier";
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
  fetchData();
});

// BUG SEBELUMNYA: fetchApi diisi `bayarSupplierApi.getAll` (referensi
// polos tanpa argumen), jadi startDate/endDate TIDAK PERNAH terkirim ke
// backend walau user sudah pilih periode -- filter selalu menampilkan
// SEMUA data. Sekarang dibungkus closure supaya nilai terbaru startDate/
// endDate selalu ikut terkirim tiap kali fetchData() dipanggil.
const {
  items,
  isLoading,
  selected,
  canInsert,
  canEdit,
  canDelete,
  canExport,
  fetchData,
} = useBrowse<any>({
  menuId: MENU_ID,
  fetchApi: () => bayarSupplierApi.getAll(startDate.value, endDate.value),
});

const fmt = (v: number) => new Intl.NumberFormat("id-ID").format(v || 0);

// Sama seperti badge StatusBayar di Browse Invoice: Lunas = hijau,
// Sebagian = kuning/warning, Belum = merah.
const statusBadgeClass = (status: string) => {
  if (status === "Lunas") return "badge-lunas";
  if (status === "Sebagian") return "badge-sebagian";
  return "badge-belum";
};

watch([startDate, endDate], ([s, e]) => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ startDate: s, endDate: e }));
  } catch {}
  fetchData();
});  
// Definisi Kolom Grid Tabel - Menggunakan Huruf Kapital mengikuti standar kembalian database Anda
const headers = [
  { title: "No. Bukti", key: "NOMOR", width: "150px", align: "center" },
  { title: "Tanggal", key: "TANGGAL", width: "120px", align: "center" },
  { title: "Memo", key: "MEMO", minWidth: "180px" },
  { title: "Pajak", key: "TAX", width: "80px", align: "center" },
  { title: "Kode", key: "SUP_KODE", width: "90px", align: "center" },
  { title: "Supplier", key: "SUP_NAMA", minWidth: "220px" },
  { title: "Total Bayar", key: "TOTAL_BAYAR", width: "160px", align: "right" },
  { title: "No. Giro", key: "NO_GIRO", width: "120px", align: "center" },
  { title: "Tgl Cair", key: "TGL_CAIR", width: "110px", align: "center" },
  { title: "Kas / Bank", key: "REK_NAMA", width: "180px" },
];

// Helper Format Nominal Angka ke Rupiah (Rp)
const fmtCurrency = (v: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(v);
};

// Helper Format Tampilan Tanggal agar rapi (YYYY-MM-DD ke DD/MM/YYYY)
const fmtDate = (dateStr: string) => {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat("id-ID").format(d);
  } catch {
    return dateStr;
  }
};

// ── 1. AKSI TOMBOL TAMBAH (ADD) ──────────────────────────────────────
const handleAdd = () => {
  // Langsung loncat ke halaman Form Input Baru
  router.push("/transaksi/bayarSupplier/baru");
};

// ── 2. AKSI TOMBOL UBAH (EDIT) ───────────────────────────────────────
const handleEdit = (item: any) => {
  const nomorBukti = item.NOMOR || item.nomor;
  if (!nomorBukti) {
    toast.warning("Nomor bukti transaksi tidak valid.");
    return;
  }
  // Loncat ke halaman Form Input dengan membawa query parameter nomor bukti untuk di-load
 router.push(`/transaksi/bayarSupplier/ubah/${encodeURIComponent(nomorBukti)}`);
};

// ── 3. AKSI TOMBOL HAPUS (DELETE) ────────────────────────────────────
const handleDelete = async (item: any) => {
  const nomorBukti = item.NOMOR || item.nomor;
  if (!nomorBukti) return;

  if (!confirm(`Apakah Anda yakin ingin membatalkan & menghapus transaksi pembayaran nomor "${nomorBukti}"?\nSisa hutang invoice terkait akan otomatis dikembalikan.`)) {
    return;
  }

  try {
    const res = await bayarSupplierApi.delete(nomorBukti);
    toast.success(res.message || "Transaksi pembayaran berhasil dihapus.");
    fetchData(); // Muat ulang isi tabel browse setelah berhasil menghapus
  } catch (e: any) {
    toast.error(e.response?.data?.message || e.message || "Gagal menghapus transaksi.");
  }
};
const confirmClose = async () => {
  showCloseDialog.value = false;
  const targetPath = route.path; // ✅ Ambil path halaman form aktif saat ini
  await nextTick();
  tabsStore.closeTab(targetPath); // ✅ Tutup tab berdasarkan path form tersebut
};
const expanded = ref<any[]>([]);
  const detailMap = ref<Record<string, any[]>>({});
const loadingDetails = ref<Set<string>>(new Set());

const getDetail = (nomor: string) => detailMap.value[nomor] ?? [];

const onUpdateExpanded = async (newExpanded: any[]) => {
  expanded.value = newExpanded;
  for (const item of newExpanded) {
    const nomor = item.NOMOR;
    if (!nomor) continue;
    if (detailMap.value[nomor] !== undefined) continue;
    loadingDetails.value = new Set([...loadingDetails.value, nomor]);
    try {
      detailMap.value[nomor] = await bayarSupplierApi.getDetail(nomor);
    } catch {
      detailMap.value[nomor] = [];
    } finally {
      loadingDetails.value.delete(nomor);
      loadingDetails.value = new Set(loadingDetails.value);
    }
  }
};
</script>

<template>
  <BaseBrowse
    title="Riwayat Pembayaran Supplier"
    :icon="IconReceiptRefund"
     :menu-id="MENU_ID"
    :headers="headers"
    :items="items"
    :is-loading="isLoading"    
	  :show-expand="true"
	  :expanded="expanded"
	  :loading-details="loadingDetails"
	  id-key="NOMOR"
	  item-value="NOMOR"
	  @update:expanded="onUpdateExpanded"
    v-model:selected="selected"
   
    v-model:show-close-dialog="showCloseDialog"
    :can-insert="canInsert"
    :can-edit="canEdit"
    :can-delete="canDelete"
    :can-export="canExport"
    @add="handleAdd"
    @edit="handleEdit"
    @delete="handleDelete"
    @confirm-close="confirmClose"
    @refresh="fetchData"
  >
    <template #icon>
      <IconReceipt2 :size="20" />
    </template>
    <template #filter-left>
      <div class="filter-group">
        <span class="filter-lbl">Periode</span>
        <input type="date" v-model="startDate" class="date-inp" />
        <span class="filter-sep">s/d</span>
        <input type="date" v-model="endDate" class="date-inp" />
      </div>
    </template>
    <template #item.TANGGAL="{ item }">
      <span>{{ fmtDate(item.TANGGAL || item.tanggal) }}</span>
    </template>

    <template #item.CARA_BAYAR="{ item }">
      <v-chip
        :color="
          (item.CARA_BAYAR || item.cara_bayar) === 'TUNAI' ? 'primary' : 'warning'
        "
        size="x-small"
        label
        class="font-weight-bold"
      >
        {{ item.CARA_BAYAR || item.cara_bayar }}
      </v-chip>
    </template>

    <template #item.TOTAL_BAYAR="{ item }">
      <span class="font-weight-bold text-success text-mono">
        {{ fmtCurrency(item.TOTAL_BAYAR || item.total_bayar || 0) }}
      </span>
    </template>

    <template #detail="{ item }">
    <div class="detail-wrap">
      <table class="detail-tbl">
        <thead>
          <tr>
            <th style="width:40px" class="tc">No</th>
            <th style="width:180px">No. Invoice</th>
            <th style="width:110px" class="tc">Tgl Invoice</th>
            <th class="tr">Total Invoice</th>
            <th class="tr" style="color:#4a4ade;">Nilai Dibayar</th>
            <th style="width:100px" class="tc">Status Bayar</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in getDetail(item.NOMOR)" :key="d.NoUrut">
            <td class="tc text-grey">{{ d.NoUrut }}</td>
            <td><span class="mono font-weight-bold">{{ d.NoInvoice }}</span></td>
            <td class="tc">{{ d.TglInvoice }}</td>
            <td class="tr text-grey">{{ fmtCurrency(d.TotalInvoice) }}</td>
            <td class="tr font-weight-bold text-green-darken-4">{{ fmtCurrency(d.NilaiBayar) }}</td>
            <td class="tc">
              <span :class="statusBadgeClass(d.StatusBayar)">{{ d.StatusBayar }}</span>
            </td>
          </tr>
          <tr v-if="!getDetail(item.NOMOR).length">
            <td colspan="6" class="tc" style="color:#9e9e9e;font-style:italic;padding:12px">
              Tidak ada detail.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
  <template #summary-row="{ filteredItems }">
        <span class="summary-lbl" style="color: white; font-weight: bold;">Total Bayar</span>
        <span class="summary-val" style="color: white; font-weight: bold;">
          {{
            fmt(
              filteredItems.reduce(
                (s: number, r: any) => s + Number(r.TOTAL_BAYAR),
                0,
              ),
            )
          }}
        </span>
        
      </template>
  </BaseBrowse>
</template>

<style scoped>
.filter-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
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
  font-size: 13px;
  color: #1f2937;
  outline: none;
  background-color: #fff;
}
.date-inp:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 1px #2563eb;
}
/* Styling tambahan untuk font teks nominal agar menyerupai display akuntansi */
.text-mono {
  font-family: "Courier New", Courier, monospace;
  font-size: 13px;
}
.badge-lunas {
  background: #e0f2e9; color: #2e7d32;
  padding: 1px 8px; border-radius: 10px; font-size: 10px; font-weight: 700;
}
.badge-sebagian {
  background: #fff4e0; color: #b26a00;
  padding: 1px 8px; border-radius: 10px; font-size: 10px; font-weight: 700;
}
.badge-belum {
  background: #fdecea; color: #c62828;
  padding: 1px 8px; border-radius: 10px; font-size: 10px; font-weight: 700;
}
</style>