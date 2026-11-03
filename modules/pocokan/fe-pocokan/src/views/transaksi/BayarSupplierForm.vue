<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
import SearchModal from "@/components/SearchModal.vue";
import { useTabsStore } from "@/stores/tabsStore";
import { IconCreditCard, IconSearch } from "@tabler/icons-vue";
import { bayarSupplierApi, type InvoiceHutang } from "@/api/transaksi/bayarSupplierApi";
import { nextTick } from "vue"; // Pastikan sudah di-import
const route  = useRoute();
const router = useRouter();
const toast  = useToast();

const MENU_ID   = "53";
const isEdit    = computed(() => !!route.params.nomor);
const isLoading = ref(false);
const isSaving  = ref(false);
const tabsStore = useTabsStore();
const showSaveDialog   = ref(false);
const showCancelDialog = ref(false);
const showCloseDialog  = ref(false);

// ── Tanggal safe ─────────────────────────────────────────────────────
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};

// ── Form State ────────────────────────────────────────────────────────
const form = ref({
  nomorBukti:    "",
  tanggal:       todayLocal(),
  supKode:       "",
  supNama:       "",
  rekKode:       "",
  rekNama:       "",
  caraBayar:     "TUNAI",
  nomorCek:      "",
  tglJatuhTempo: todayLocal(),
  catatan:       "",
});

const listInvoice = ref<InvoiceHutang[]>([]);

// ── Sort tabel invoice (klik header kolom) ─────────────────────────────
type SortKey = "invoiceNomor" | "invoiceTanggal" | "invoiceNetto" | "sisaHutang";
const sortKey = ref<SortKey>("invoiceTanggal");
const sortDir = ref<"asc" | "desc">("asc"); // default: terlama dulu (sama seperti urutan dari backend)

const toggleSort = (key: SortKey) => {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortKey.value = key;
    sortDir.value = "asc";
  }
};

const sortedListInvoice = computed(() => {
  const dir = sortDir.value === "asc" ? 1 : -1;
  return [...listInvoice.value].sort((a, b) => {
    const av = a[sortKey.value];
    const bv = b[sortKey.value];
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
});

// ── onMounted: load nomor otomatis atau data edit ─────────────────────
onMounted(async () => {
  isLoading.value = true;
  try {
    if (isEdit.value) {
      // Mode edit: load data lengkap
      const nomor = decodeURIComponent(route.params.nomor as string);
      const res = await bayarSupplierApi.getDetailForm(nomor);

      form.value.nomorBukti    = res.nomorBukti;
      form.value.tanggal       = res.tanggal;
      form.value.supKode       = res.supKode;
      form.value.supNama       = res.supNama;
      form.value.rekKode       = res.rekKode;
      form.value.rekNama       = res.rekNama;
      form.value.caraBayar     = res.caraBayar;
      form.value.nomorCek      = res.nomorCek || "";
      form.value.tglJatuhTempo = res.tglJatuhTempo || todayLocal();
      form.value.catatan       = res.catatan || "";

      // listInvoice dari backend sudah include yang tercentang (isChecked=1)
      listInvoice.value = res.listInvoice.map((inv: any) => ({
        ...inv,
        isChecked:  !!inv.isChecked,
        nilaiBayar: Number(inv.nilaiBayar) || 0,
        sisaHutang: Number(inv.sisaHutang) || 0,
      }));
    } else {
      // Mode baru: load nomor otomatis
      const init = await bayarSupplierApi.getInitData();
      form.value.nomorBukti = init.nomorOtomatis;
    }
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal memuat data.");
    if (isEdit.value) router.push({ name: "bayarSupplierBrowse" });
  } finally {
    isLoading.value = false;
  }
});

// ── Supplier Modal ────────────────────────────────────────────────────
const showSupplierModal = ref(false);
const supplierOptions   = ref<any[]>([]);

// try/catch ditambahkan: sebelumnya kalau request gagal (404/403/500),
// errornya "ditelan diam-diam" -- modal cuma nampilin "Tidak ada data"
// tanpa keterangan, padahal sebenarnya request-nya gagal total, bukan
// datanya memang kosong. Sekarang error asli ditampilkan lewat toast.
const searchSupplier = async (q: string) => {
  try {
    supplierOptions.value = await bayarSupplierApi.getSupplier(q || "");
  } catch (e: any) {
    supplierOptions.value = [];
    toast.error(e.response?.data?.message || e.message || "Gagal memuat daftar supplier.");
  }
};

const selectSupplier = async (sup: any) => {
  if (!sup) return;
  form.value.supKode = sup.kode || sup.sup_kode;
  form.value.supNama = sup.nama || sup.sup_nama;
  showSupplierModal.value = false;
  listInvoice.value = [];
  try {
    listInvoice.value = await bayarSupplierApi.getInvoiceHutang(form.value.supKode);
  } catch (e: any) {
    toast.error(e.message || "Gagal memuat daftar hutang.");
  }
};

// ── Rekening Modal ────────────────────────────────────────────────────
const showRekeningModal = ref(false);
const rekeningOptions   = ref<any[]>([]);

const searchRekening = async (q: string) => {
  try {
    rekeningOptions.value = await bayarSupplierApi.getRekening(q || "");
  } catch (e: any) {
    rekeningOptions.value = [];
    toast.error(e.response?.data?.message || e.message || "Gagal memuat daftar kas/bank.");
  }
};

const selectRekening = (rek: any) => {
  if (!rek) return;
  form.value.rekKode = rek.KODE || rek.kode;
  form.value.rekNama = rek.NAMA || rek.nama;
  showRekeningModal.value = false;
};

// ── Grid ──────────────────────────────────────────────────────────────
const handleCheckboxChange = (row: InvoiceHutang) => {
  row.nilaiBayar = row.isChecked ? row.sisaHutang : 0;
};

const validateNilaiBayar = (row: InvoiceHutang) => {
  if (row.nilaiBayar > row.sisaHutang) {
    toast.warning(`Nilai bayar melebihi sisa hutang untuk nota ${row.invoiceNomor}`);
    row.nilaiBayar = row.sisaHutang;
  }
  row.isChecked = row.nilaiBayar > 0;
};

const grandTotalBayar = computed(() =>
  listInvoice.value.reduce((acc, row) =>
    acc + (row.isChecked ? Number(row.nilaiBayar || 0) : 0), 0)
);

const fmtCurrency = (v: number) => new Intl.NumberFormat("id-ID").format(v || 0);

// ── Validasi & Simpan ─────────────────────────────────────────────────
const validateSave = () => {
  if (!form.value.supKode) {
    toast.warning("Pilih Supplier terlebih dahulu."); return;
  }
  if (!form.value.rekKode) {
    toast.warning("Pilih Kas/Bank terlebih dahulu."); return;
  }
  if (!listInvoice.value.some(r => r.isChecked && r.nilaiBayar > 0)) {
    toast.warning("Pilih minimal satu invoice yang ingin dilunasi."); return;
  }
  showSaveDialog.value = true;
};
const resetForm = async () => {
  form.value.supKode = "";
  form.value.supNama = "";
  form.value.rekKode = "";
  form.value.rekNama = "";
  form.value.caraBayar = "TUNAI";
  form.value.nomorCek = "";
  form.value.tglJatuhTempo = todayLocal();
  form.value.catatan = "";
  listInvoice.value = []; // Kosongkan tabel invoice

  try {
    // Ambil nomor otomatis baru untuk transaksi selanjutnya
    const init = await bayarSupplierApi.getInitData();
    form.value.nomorBukti = init.nomorOtomatis;
  } catch (e: any) {
    toast.error("Gagal memuat nomor transaksi baru.");
  }
};
const confirmSave = async () => {
  if (isSaving.value) return; // guard: cegah double-submit (spam klik)
  isSaving.value = true;
  try {
    const payload = {
      header: {
        ...form.value,
        isEdit: isEdit.value,  // ← penting untuk backend tahu mode edit/insert
      },
      totalBayar: grandTotalBayar.value,
      details: listInvoice.value.filter(r => r.isChecked && r.nilaiBayar > 0),
    };
    await bayarSupplierApi.saveData(payload);
    toast.success(`Pembayaran ${isEdit.value ? "berhasil diubah" : "berhasil disimpan"}.`);

    showSaveDialog.value = false;
    const targetPath = route.path;
   
    router.push({ name: "bayarSupplierBrowse" });
    await nextTick();
    tabsStore.closeTab(targetPath);
    resetForm();
  } catch (e: any) {
    toast.error(e.response?.data?.message || e.message || "Gagal menyimpan data.");
  } finally {
    isSaving.value = false;
  }
};

// BATAL = reset form (mode baru) atau kembalikan ke data awal (mode edit)
const confirmCancel = () => {
  showCancelDialog.value = false;
  if (isEdit.value) {
    router.go(0);
  } else {
    resetForm(); // Panggil fungsi reset total di sini
  }
};

// TUTUP = keluar ke browse
const confirmClose = async () => {
  showCloseDialog.value = false;
  const targetPath = route.path; // ✅ Ambil path halaman form aktif saat ini
  router.push({ name: "bayarSupplierBrowse" }); // Pindah ke halaman list/browse
  await nextTick();
  tabsStore.closeTab(targetPath); // ✅ Tutup tab berdasarkan path form tersebut
};
</script>

<template>
  <BaseForm
    :title="isEdit ? 'Ubah Pembayaran Supplier' : 'Pembayaran Supplier Baru'"
    :icon="IconCreditCard"
    :menu-id="MENU_ID"
    :is-loading="isLoading"
    :is-saving="isSaving"
    :is-edit-mode="isEdit"
    v-model:show-save-dialog="showSaveDialog"
    v-model:show-cancel-dialog="showCancelDialog"
    v-model:show-close-dialog="showCloseDialog"
    @validate-save="validateSave"
    @confirm-save="confirmSave"
    @confirm-cancel="confirmCancel"
    @confirm-close="confirmClose"
  >

    <!-- ── Panel Header ────────────────────────────────────────────── -->
    <div class="panel-header">
      <div class="grid-cols-3">

        <!-- Kolom 1 -->
        <div class="column">
          <div class="f-row">
            <label class="f-lbl">No. Transaksi</label>
            <input type="text" v-model="form.nomorBukti" class="f-inp readonly-bg" readonly placeholder="[ OTOMATIS ]" />
          </div>
          <div class="f-row">
            <label class="f-lbl">Tanggal</label>
            <input type="date" v-model="form.tanggal" class="f-inp" />
          </div>
          <div class="f-row">
            <label class="f-lbl">Supplier</label>
            <div class="search-group">
              <input type="text" :value="form.supKode" class="f-inp w-30 readonly-bg" readonly placeholder="Kode" />
              <input type="text" :value="form.supNama" class="f-inp w-70 readonly-bg" readonly placeholder="Pilih Supplier..." />
              <button class="btn-srch" type="button"
                :disabled="isEdit"
                @click="showSupplierModal = true; searchSupplier('')">
                <IconSearch :size="14" />
              </button>
            </div>
          </div>
        </div>

        <!-- Kolom 2 -->
        <div class="column">
          <div class="f-row">
            <label class="f-lbl">Kas / Bank</label>
            <div class="search-group">
              <input type="text" :value="form.rekKode" class="f-inp w-30 readonly-bg" readonly placeholder="Kode" />
              <input type="text" :value="form.rekNama" class="f-inp w-70 readonly-bg" readonly placeholder="Pilih Kas/Bank..." />
              <button class="btn-srch btn-green" type="button"
                @click="showRekeningModal = true; searchRekening('')">
                <IconSearch :size="14" />
              </button>
            </div>
          </div>
          <div class="f-row">
            <label class="f-lbl">Cara Bayar</label>
            <select v-model="form.caraBayar" class="f-inp">
              <option value="TUNAI">TUNAI</option>
              <option value="TRANSFER">TRANSFER</option>
              <option value="GIRO">GIRO / CEK</option>
            </select>
          </div>
          <div class="f-row" v-if="form.caraBayar === 'GIRO'">
            <label class="f-lbl">No. Cek / Giro</label>
            <input type="text" v-model="form.nomorCek" class="f-inp" placeholder="Nomor Giro" />
          </div>
        </div>

        <!-- Kolom 3 -->
        <div class="column">
          <div class="f-row" v-if="form.caraBayar === 'GIRO'">
            <label class="f-lbl">Jatuh Tempo</label>
            <input type="date" v-model="form.tglJatuhTempo" class="f-inp" />
          </div>
          <div class="f-row align-start">
            <label class="f-lbl mt-1">Keterangan</label>
            <textarea v-model="form.catatan" class="f-area" rows="3" placeholder="Keterangan pembayaran..."></textarea>
          </div>
        </div>

      </div>
    </div>

    <!-- ── Tabel Invoice ───────────────────────────────────────────── -->
    <div class="table-container mt-3">
      <table class="grid-table">
        <thead>
          <tr>
            <th style="width:50px" class="tc">Pilih</th>
            <th style="width:170px" class="sortable" @click="toggleSort('invoiceNomor')">
              No. Invoice
              <span class="sort-icon" v-if="sortKey === 'invoiceNomor'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th style="width:110px" class="tc sortable" @click="toggleSort('invoiceTanggal')">
              Tanggal
              <span class="sort-icon" v-if="sortKey === 'invoiceTanggal'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th class="tr sortable" @click="toggleSort('invoiceNetto')">
              Total Netto
              <span class="sort-icon" v-if="sortKey === 'invoiceNetto'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th class="tr">Sudah Dibayar</th>
            <th class="tr">Retur</th>
            <th class="tr sortable" @click="toggleSort('sisaHutang')">
              Sisa Hutang
              <span class="sort-icon" v-if="sortKey === 'sisaHutang'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th style="width:190px" class="tr">Nilai Pembayaran (Rp)</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in sortedListInvoice" :key="idx"
            :class="{ 'row-selected': row.isChecked }">
            <td class="tc">
              <input type="checkbox" v-model="row.isChecked" @change="handleCheckboxChange(row)" />
            </td>
            <td><span class="mono">{{ row.invoiceNomor }}</span></td>
            <td class="tc">{{ row.invoiceTanggal }}</td>
            <td class="tr text-grey">Rp {{ fmtCurrency(row.invoiceNetto) }}</td>
            <td class="tr text-grey">Rp {{ fmtCurrency(row.sudahDibayar) }}</td>
            <td class="tr text-grey">Rp {{ fmtCurrency(row.totalRetur) }}</td>
            <td class="tr font-weight-bold text-red">Rp {{ fmtCurrency(row.sisaHutang) }}</td>
            <td class="tr">
              <input type="number" v-model.number="row.nilaiBayar"
                @input="validateNilaiBayar(row)"
                class="cell-input"
                placeholder="0"
                :disabled="!row.isChecked && row.nilaiBayar === 0"
              />
            </td>
          </tr>
          <tr v-if="listInvoice.length === 0">
            <td colspan="6" class="tc empty-text">
              {{ form.supKode ? 'Tidak ada invoice sisa hutang untuk supplier ini.' : 'Pilih supplier untuk menampilkan daftar invoice.' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── Footer Total ────────────────────────────────────────────── -->
    <div class="footer-summary mt-3">
      <div class="total-box">
        <span class="total-label">TOTAL PEMBAYARAN</span>
        <span class="total-val">Rp {{ fmtCurrency(grandTotalBayar) }}</span>
      </div>
    </div>

    <!-- ── Dialog Simpan ───────────────────────────────────────────── -->
    <v-dialog v-model="showSaveDialog" max-width="340">
      <v-card rounded="lg">
        <v-card-title class="text-subtitle-1 font-weight-bold pa-3 bg-blue-darken-3 text-white">
          Konfirmasi Simpan
        </v-card-title>
        <v-card-text class="pa-4 text-body-2">
          {{ isEdit ? 'Ubah' : 'Simpan' }} pembayaran supplier <strong>{{ form.supNama }}</strong>?<br/>
          <span class="text-caption text-grey">
            Total bayar: <strong>Rp {{ fmtCurrency(grandTotalBayar) }}</strong>
          </span>
        </v-card-text>
        <v-card-actions class="pa-2 bg-grey-lighten-4 justify-end">
          <v-btn size="small" variant="outlined" @click="showSaveDialog = false">Batal</v-btn>
          <v-btn size="small" color="primary" variant="flat" class="px-4"
            :loading="isSaving" @click="confirmSave">Ya, Simpan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ── Dialog Batal ────────────────────────────────────────────── -->
    <v-dialog v-model="showCancelDialog" max-width="320">
      <v-card rounded="lg">
        <v-card-title class="text-subtitle-1 font-weight-bold pa-3 bg-orange-darken-3 text-white">
          {{ isEdit ? 'Reset Perubahan' : 'Reset Form' }}
        </v-card-title>
        <v-card-text class="pa-4 text-body-2">
          {{ isEdit ? 'Batalkan perubahan dan kembalikan ke data semula?' : 'Reset form? Data yang sudah diisi akan dikosongkan.' }}
        </v-card-text>
        <v-card-actions class="pa-2 bg-grey-lighten-4 justify-end">
          <v-btn size="small" variant="outlined" @click="showCancelDialog = false">Kembali</v-btn>
          <v-btn size="small" color="warning" variant="flat" @click="confirmCancel">Ya, Reset</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ── Dialog Tutup ────────────────────────────────────────────── -->
    <v-dialog v-model="showCloseDialog" max-width="320">
      <v-card rounded="lg">
        <v-card-title class="text-subtitle-1 font-weight-bold pa-3 bg-red-darken-4 text-white">
          Konfirmasi Tutup
        </v-card-title>
        <v-card-text class="pa-4 text-body-2">
          Yakin ingin keluar? Perubahan yang belum disimpan akan hilang.
        </v-card-text>
        <v-card-actions class="pa-2 bg-grey-lighten-4 justify-end">
          <v-btn size="small" variant="outlined" @click="showCloseDialog = false">Kembali</v-btn>
          <v-btn size="small" color="error" variant="flat" @click="confirmClose">Ya, Keluar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ── SearchModal Supplier ────────────────────────────────────── -->
    <SearchModal
      v-model="showSupplierModal"
      title="Pilih Supplier"
      :columns="[
        { key: 'kode', title: 'KODE',          width: '100px' },
        { key: 'nama', title: 'NAMA SUPPLIER', width: '200px' },
      ]"
      :items="supplierOptions"
      :server-search="true"
      search-placeholder="Cari kode atau nama supplier..."
      @select="selectSupplier"
      @search="searchSupplier"
    />

    <!-- ── SearchModal Rekening ────────────────────────────────────── -->
    <SearchModal
      v-model="showRekeningModal"
      title="Pilih Kas / Bank"
      :columns="[
        { key: 'kode', title: 'KODE',      width: '100px' },
        { key: 'nama', title: 'NAMA AKUN', width: '200px' },
      ]"
      :items="rekeningOptions"
      :server-search="true"
      search-placeholder="Cari kode atau nama kas/bank..."
      @select="selectRekening"
      @search="searchRekening"
    />

  </BaseForm>
</template>

<style scoped>
.panel-header {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 12px 16px;
}
.grid-cols-3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
}
@media (max-width: 960px) { .grid-cols-3 { grid-template-columns: 1fr; } }

.f-row { display: flex; align-items: center; margin-bottom: 7px; gap: 8px; }
.align-start { align-items: flex-start !important; }
.f-lbl { width: 100px; font-size: 11px; font-weight: 600; color: #475569; flex-shrink: 0; }
.mt-1 { margin-top: 3px; }
.f-inp {
  flex: 1; height: 28px; padding: 0 8px;
  border: 1px solid #cbd5e1; border-radius: 4px;
  font-size: 11px; outline: none;
}
.f-inp:focus { border-color: #3B5998; }
.f-area {
  flex: 1; padding: 4px 8px;
  border: 1px solid #cbd5e1; border-radius: 4px;
  font-size: 11px; resize: none; outline: none;
}
.f-area:focus { border-color: #3B5998; }
.readonly-bg { background: #f1f5f9; color: #64748b; }

.search-group {
  display: flex; flex: 1;
  border: 1px solid #cbd5e1; border-radius: 4px;
  overflow: hidden; background: white;
  min-width: 0; /* penting: cegah search-group ikut melebar mengikuti konten anak */
}
.search-group input {
  border: none; padding: 0 8px;
  font-size: 11px; height: 28px; outline: none;
  min-width: 0; /* penting: tanpa ini, input dgn flex:1 (w-70) memaksa lebar
                   minimum sesuai kontennya sendiri, mendorong tombol search
                   keluar batas box lalu ke-clip oleh overflow:hidden di atas */
}
.w-30 { width: 30%; flex: none; }
.w-70 { flex: 1; }
.btn-srch {
  height: 28px; width: 32px; padding: 0;
  background: #3B5998; color: white;
  border: none; display: flex; align-items: center;
  justify-content: center; cursor: pointer; flex-shrink: 0;
}
.btn-srch:disabled { background: #9e9e9e; cursor: not-allowed; }
.btn-green { background: #3B5998; }

.table-container {
  background: white; border-radius: 6px;
  border: 1px solid #e2e8f0;
  /* fix: sebelumnya tabel tidak punya area scroll sendiri, jadi kalau
     invoice-nya banyak, baris paling bawah ketutup box "Total Pembayaran"
     dan tidak bisa di-scroll sama sekali. Sekarang tabel scroll sendiri,
     header tetap sticky di atas biar label kolom selalu kelihatan. */
  max-height: calc(100vh - 430px);
  min-height: 160px;
  overflow-y: auto;
}
.grid-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.grid-table thead th { position: sticky; top: 0; z-index: 1; }
.grid-table th {
  background: #3B5998; color: white;
  padding: 7px 10px; font-size: 11px; font-weight: 700;
  text-transform: uppercase; white-space: nowrap;
}
.grid-table th.sortable { cursor: pointer; user-select: none; }
.grid-table th.sortable:hover { background: #3B5998; }
.sort-icon { font-size: 9px; margin-left: 4px; }
.grid-table td { padding: 5px 10px; border-bottom: 1px solid #f0f0f0; }
.grid-table tbody tr:hover td { background: rgba(21,101,192,0.04); }
.row-selected td { background-color: #f0f0fd !important; }

.cell-input {
  width: 100%; height: 24px; padding: 0 6px;
  border: 1px solid #cbd5e1; border-radius: 3px;
  font-size: 11px; font-weight: bold;
  background: #fffdf0; text-align: right; outline: none;
}
.cell-input:focus { border-color: #3B5998; }
.cell-input:disabled { background: #f1f5f9; color: #9ca3af; }

.footer-summary {
  display: flex; justify-content: flex-end;
  position: sticky; bottom: 0;
  background: #f1f1f8; /* samakan dgn background halaman biar nyatu, bukan numpuk transparan */
  padding-top: 8px; padding-bottom: 4px;
  z-index: 2;
}
.total-box {
  background: #1e293b; color: white;
  padding: 10px 20px; border-radius: 6px;
  text-align: right; min-width: 280px;
}
.total-label { display: block; font-size: 10px; color: #94a3b8; font-weight: 600; }
.total-val { font-size: 20px; font-weight: 700; color: #4a4ade; }

.mt-3 { margin-top: 10px; }
.tc { text-align: center; }
.tr { text-align: right; }
.mono { font-family: monospace; font-weight: bold; font-size: 11px; }
.text-red  { color: #dc2626; }
.text-grey { color: #64748b; }
.font-weight-bold { font-weight: 700; }
.empty-text { padding: 24px !important; color: #94a3b8; font-style: italic; text-align: center; }
</style>