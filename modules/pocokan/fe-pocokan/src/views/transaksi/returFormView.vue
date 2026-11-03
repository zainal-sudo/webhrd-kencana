<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import BaseForm from "@/components/BaseForm.vue";
import { useTabsStore } from "@/stores/tabsStore";
import SearchModal from "@/components/SearchModal.vue";
import { nextTick } from "vue"; // Pastikan sudah di-import
import {
  IconTruckReturn,
  IconSearch,
  IconPlus,
  IconTrash,
  IconPrinter,
  IconLock,
} from "@tabler/icons-vue";
import { returFormApi, type ReturForm, type ReturDetail } from "@/api/transaksi/returFormApi"; 

const route = useRoute();
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const tabsStore = useTabsStore();
const MENU_ID = "16"; // Menu ID Retur Pembelian
const isEdit = computed(() => !!route.params.nomor);
const isLoading = ref(false);
const isSaving = ref(false);

// Dialog State
const showSaveDialog = ref(false);
const showCancelDialog = ref(false);
const showCloseDialog = ref(false);
const showPrintDialog = ref(false);
const savedNomor = ref("");

const today = new Date().toISOString().slice(0, 10);

// ── State Form Sesuai Interface Retur ────────────────────────────────
const form = ref<ReturForm>({
  isEdit: false,
  nomor: "",
  tanggal: today,
  supKode: "",
  supNama: "",
  gdgKode: "",
  invNomor: "",
  memo: "",
  isTax: 0,
  discFakturPr: 0,    
  discFaktur: 0,      
  amount: 0,
  taxAmount: 0,
  detail: [],
});

// ✅ FIX INTEGRASI: pajak & diskon faktur SEKARANG ikut Invoice sumbernya,
// bukan lagi bisa dipilih bebas. Field ini dikunci begitu Invoice dipilih.
// Backend juga sudah menegakkan ini di sisi server (bukan sekadar UI),
// jadi walau ada yang coba kirim isTax berbeda lewat request langsung,
// nilai yang tersimpan tetap mengikuti invoice.
const taxLocked = computed(() => !!form.value.invNomor);

// ── Master Options untuk Modal Pencarian ──────────────────────────────
const supplierOptions = ref<any[]>([]);
const barangOptions = ref<any[]>([]);
const gudangOptions = ref<any[]>([]);
const invoiceOptions = ref<any[]>([]);

const supplierLoading = ref(false);
const barangLoading = ref(false);
const gudangLoading = ref(false);
const invoiceLoading = ref(false);

// ── Pengendali Modal ──────────────────────────────────────────────────
const showSupplierModal = ref(false);
const showBarangModal = ref(false);
const showGudangModal = ref(false);
const showInvoiceModal = ref(false);

const activeDetailIndex = ref<number>(-1);

// ✅ Item barang yang boleh dipilih = hanya item yang ada di invoice terpilih.
const invoiceItemOptions = ref<any[]>([]);

// ── Hitung Subtotal Bruto Otomatis (Persis PO) ────────────────────────
const subtotalBruto = computed(() => {
  return form.value.detail.reduce((sum, d) => {
    const qty = Number(d.qty) || 0;
    const harga = Number(d.harga) || 0;
    const discPr = Number(d.discPr) || 0;

    const totalItem = qty * harga;
    const nilaiDiscItem = (totalItem * discPr) / 100;
    return sum + (totalItem - nilaiDiscItem);
  }, 0);
});

// ── Logika Kalkulasi Grand Total, Pajak & Diskon (Persis PO) ──────────
const calcTotal = () => {
  const bruto = subtotalBruto.value;

  if (form.value.discFakturPr > 0) {
    form.value.discFaktur = Math.round((bruto * form.value.discFakturPr) / 100);
  }

  const setelahDiskonFaktur = bruto - (form.value.discFaktur || 0);

  if (form.value.isTax > 0) {
    if (form.value.isTax === 2) {
      form.value.taxAmount = Math.round((setelahDiskonFaktur * 11) / 100);
      form.value.amount = setelahDiskonFaktur + form.value.taxAmount;
    } else {
      form.value.taxAmount = Math.round((setelahDiskonFaktur * 11) / 111);
      form.value.amount = setelahDiskonFaktur;
    }
  } else {
    form.value.taxAmount = 0;
    form.value.amount = setelahDiskonFaktur;
  }
};

// ── Ambil Data Master Awal untuk Modal ────────────────────────────────
const loadSearchOptions = async () => {
  supplierLoading.value = true;
  gudangLoading.value = true;
  try {
    const [resSupplier, resGudang] = await Promise.all([
      returFormApi.getSupplier(""),
      returFormApi.getGudang("")
    ]);
    supplierOptions.value = resSupplier || [];
    gudangOptions.value = resGudang || [];
  } catch (e) {
    console.error("Gagal memuat opsi pencarian:", e);
  } finally {
    supplierLoading.value = false;
    gudangLoading.value = false;
  }
};

const searchSupplier = async (query: string) => {
  supplierLoading.value = true;
  try {
    supplierOptions.value = await returFormApi.getSupplier(query || "");
  } catch { /* silent */ } finally { supplierLoading.value = false; }
};

// ✅ FIX UTAMA (duplikat): sumber data barang HANYA item invoice yang masih
// punya sisa qty (qtySisaEfektif > 0).
const remainingQtyForItem = (kode: string | number, excludeIdx: number | null) => {
  const opt = invoiceItemOptions.value.find(
    (o: any) => String(o.kode) === String(kode)
  );
  if (!opt) return 0;
  const qtySisaInvoice = Number(opt.qtySisa ?? opt.qtyInvoice ?? 0);

  const qtyDipakaiBarisLain = form.value.detail.reduce((sum, d, idx) => {
    if (idx === excludeIdx) return sum;
    if (String(d.brgKode) !== String(kode)) return sum;
    return sum + (Number(d.qty) || 0);
  }, 0);

  return qtySisaInvoice - qtyDipakaiBarisLain;
};

const openSearchBarang = (index: number) => {
  if (!form.value.invNomor) {
    toast.warning("Pilih Invoice terlebih dahulu sebelum menambahkan barang.");
    return;
  }
  activeDetailIndex.value = index;
  barangOptions.value = invoiceItemOptions.value.filter(
    (o: any) => remainingQtyForItem(o.kode, index) > 0
  );
  if (barangOptions.value.length === 0) {
    toast.warning("Semua item di invoice ini sudah habis kuotanya untuk diretur.");
  }
  showBarangModal.value = true;
};

const searchBarang = (q: string) => {
  const query = (q || "").toLowerCase().trim();
  const base = invoiceItemOptions.value.filter(
    (o: any) => remainingQtyForItem(o.kode, activeDetailIndex.value) > 0
  );
  barangOptions.value = !query
    ? base
    : base.filter((b: any) => {
        const nama = String(b.nama || b.Nama || "").toLowerCase();
        const kode = String(b.kode || b.Kode || b.barcode || "").toLowerCase();
        return nama.includes(query) || kode.includes(query);
      });
};

const searchGudang = async (q: string) => {
  gudangLoading.value = true;
  try { gudangOptions.value = await returFormApi.getGudang(q || ""); }
  catch { /* silent */ } finally { gudangLoading.value = false; }
};

const searchInvoice = async (q: string) => {
  invoiceLoading.value = true;
  try { invoiceOptions.value = await returFormApi.getInvoice(q || ""); }
  catch { /* silent */ } finally { invoiceLoading.value = false; }
};

const openInvoiceModal = () => {
  if (isEdit.value) return;
  showInvoiceModal.value = true;
  searchInvoice("");
};

// ✅ Pilih Invoice sumber retur: Supplier & Gudang ikut ter-otomatis-isi
// (Supplier terkunci total, Gudang tetap bisa diganti manual).
// ✅ FIX INTEGRASI: pajak (isTax) & diskon faktur (discFakturPr/discFaktur)
// SEKARANG ikut ter-auto-fill dari invoice ini juga, dan langsung dikunci
// (lihat computed taxLocked) — tidak lagi bebas dipilih manual seperti
// sebelumnya (yang membuat retur bisa punya term pajak beda dari invoice).
const selectInvoice = async (inv: any) => {
  if (!inv) return;
  form.value.invNomor = inv.nomor;
  form.value.supKode = inv.supKode || "";
  form.value.supNama = inv.supNama || "";

  if (inv.gdgKode) {
    form.value.gdgKode = inv.gdgKode;
    (form.value as any).gdgNama = inv.gdgNama || "";
  }

  form.value.isTax = Number(inv.isTax) || 0;
  form.value.discFakturPr = Number(inv.discFakturPr) || 0;
  form.value.discFaktur = Number(inv.discFaktur) || 0;

  showInvoiceModal.value = false;
  form.value.detail = [];
  calcTotal();

  try {
    const excludeRet = isEdit.value ? form.value.nomor : undefined;
    invoiceItemOptions.value = await returFormApi.getInvoiceDetail(inv.nomor);

    if (invoiceItemOptions.value.length === 0) {
      toast.warning(`Invoice ${inv.nomor} tidak punya detail barang.`);
    } else {
      const adaSisa = invoiceItemOptions.value.some(
        (b: any) => Number(b.qtySisa ?? b.qtyInvoice ?? 0) > 0
      );
      if (!adaSisa) {
        toast.warning(`Semua item pada invoice ${inv.nomor} sudah habis kuota returnya.`);
      } else {
        toast.success(`Invoice ${inv.nomor} dipilih (pajak & diskon mengikuti invoice ini). Klik "Tambah Baris" untuk menambahkan barang yang mau diretur.`);
      }
    }
  } catch (e: any) {
    invoiceItemOptions.value = [];
    toast.error(e.response?.data?.message || "Gagal memuat item barang dari invoice ini.");
  }
};

const selectGudang = (g: any) => {
  if (!g) return;
  form.value.gdgKode = g.kode;
  (form.value as any).gdgNama = g.nama;
  showGudangModal.value = false;
};

const selectBarang = (brg: any) => {
  if (!brg || activeDetailIndex.value < 0) return;
  const idx = activeDetailIndex.value;
  const d = form.value.detail[idx];
  if (d) {
    const kode = brg.kode || brg.Kode || brg.brgKode || "";
    const sisa = remainingQtyForItem(kode, idx);

    d.brgKode = kode;
    d.brgNama = brg.nama || brg.Nama || brg.brgNama || "";
    d.barcode = brg.barcode || brg.Barcode || "";
    d.satuan = brg.satuan || brg.Satuan || "";
    d.harga = Number(brg.hrgBeli || brg.harga_beli || brg.HargaBeli || brg.harga || 0);
    d.discPr = Number(brg.discPr ?? 0);
    (d as any).qtyMax = sisa;
    d.qty = Math.min(Number(d.qty) || 1, sisa || 1);
    (d as any).keterangan = "";
    // ✅ FIX: expired WAJIB ikut expired dari item invoice sumbernya (invd_expired),
    // bukan diisi manual — ini yang bikin backend nolak dgn error "Tanggal expired
    // ... tidak ditemukan" karena field ini sebelumnya selalu kosong.
    (d as any).expired = brg.expired || "";
    if (!(d as any).expired) {
      toast.warning(`Barang "${d.brgNama}" di invoice sumber tidak punya tanggal expired. Retur untuk barang ini tidak bisa diproses.`);
    }
  }
  showBarangModal.value = false;
  calcTotal();
};

const onQtyInput = (idx: number) => {
  const d = form.value.detail[idx] as any;
  if (!d) return;
  const max = Number(d.qtyMax);
  if (Number.isFinite(max) && max > 0 && Number(d.qty) > max) {
    d.qty = max;
    toast.warning(`Qty untuk "${d.brgNama}" tidak boleh melebihi sisa invoice (${max}).`);
  }
  if (Number(d.qty) < 1) d.qty = 1;
  calcTotal();
};

const canAddRow = computed(() => {
  if (!form.value.invNomor) return false;
  return invoiceItemOptions.value.some(
    (o: any) => remainingQtyForItem(o.kode, null) > 0
  );
});

// ── Manajemen Baris Tabel Detail ──────────────────────────────────────
const addRow = () => {
  if (!canAddRow.value) {
    toast.warning("Semua item pada invoice ini sudah dipakai penuh di tabel — tidak ada lagi yang bisa diretur.");
    return;
  }
  form.value.detail.push({
    no: form.value.detail.length + 1,
    brgKode: 0,
    brgNama: "",
    barcode: "",
    satuan: "",
    qty: 1,
    harga: 0,
    discPr: 0,
    keterangan: ""
  } as any);
};

const removeRow = (index: number) => {
  form.value.detail.splice(index, 1);
  form.value.detail.forEach((d, i) => (d.no = i + 1));
  calcTotal();
};

// ── Load Data Utama (Jika Mode Edit) ──────────────────────────────────
const loadData = async () => {
  const nomor = route.params.nomor as string;
  if (!nomor) {
    form.value.isEdit = false;
    return;
  }

  isLoading.value = true;
  try {
    form.value.isEdit = true;
    const res = await returFormApi.getDetailForm(decodeURIComponent(nomor));
    Object.assign(form.value, res);

    if (form.value.invNomor) {
      try {
        invoiceItemOptions.value = await returFormApi.getInvoiceDetail(
          form.value.invNomor
        );
        form.value.detail.forEach((d: any) => {
          const opt = invoiceItemOptions.value.find(
            (o: any) => String(o.kode) === String(d.brgKode)
          );
          if (opt) {
            d.qtyMax = Number(opt.qtySisa ?? opt.qtyInvoice ?? 0) + (Number(d.qty) || 0);
          }
        });
      } catch {
        // kalau gagal ambil ulang, biarkan tanpa qtyMax (fallback ke validasi backend saat simpan)
      }
    }

    calcTotal();
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal mengambil data Retur.");
    router.push({ name: "returBrowse" });
  } finally {
    isLoading.value = false;
  }
};

// ── Prosedur Validasi & Simpan Transaksi ─────────────────────────────
const validateSave = () => {
  if (!form.value.supKode) {
    toast.warning("Supplier harus dipilih.");
    return;
  }
  if (!form.value.gdgKode) {
    toast.warning("Pilih gudang tujuan.");
    return;
  }
  if (!form.value.invNomor) {
    toast.warning("Pilih Invoice sumber retur terlebih dahulu.");
    return;
  }
  if (form.value.detail.length === 0) {
    toast.warning("Detail barang tidak boleh kosong.");
    return;
  }

  for (const d of form.value.detail as any[]) {
    if (!d.brgNama) {
      toast.warning("Ada item barang yang belum dipilih.");
      return;
    }
    if ((d.qty || 0) <= 0) {
      toast.warning(`Qty untuk ${d.brgNama} harus lebih dari 0.`);
      return;
    }
    if (d.qtyMax != null && d.qty > d.qtyMax) {
      toast.warning(`Qty untuk ${d.brgNama} (${d.qty}) melebihi sisa yang boleh diretur (${d.qtyMax}).`);
      return;
    }
  }

  showSaveDialog.value = true;
};

const confirmSave = async () => {
  if (isSaving.value) return; // guard: cegah double-submit (spam klik)
  isSaving.value = true;
  try {
    const res = await returFormApi.save(form.value);
    toast.success("Transaksi Retur berhasil disimpan.");
    savedNomor.value = res?.nomor || form.value.nomor;
    showSaveDialog.value = false;
    showPrintDialog.value = true;
    const targetPath = route.path;
      router.push({ name: "returBrowse" });
       await nextTick();
    tabsStore.closeTab(targetPath);
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal menyimpan transaksi Retur.");
  } finally {
    isSaving.value = false;
  }
};

const confirmCancel = () => {
  showCancelDialog.value = false;
  if (isEdit.value) {
    loadData();
  } else {
    form.value = {
      isEdit: false, nomor: "", tanggal: today, supKode: "", supNama: "",
      gdgKode: "", invNomor: "", memo: "", isTax: 0, discFakturPr: 0,
      discFaktur: 0, amount: 0, taxAmount: 0, detail: [],
    };
    invoiceItemOptions.value = [];
    addRow();
  }
};

const confirmClose = async () => {
  showCloseDialog.value = false;
  const targetPath = route.path; // ✅ Ambil path halaman form aktif saat ini
  router.push({ name: "returBrowse" }); // Pindah ke halaman list/browse
  await nextTick();
  tabsStore.closeTab(targetPath); // ✅ Tutup tab berdasarkan path form tersebut
};

const afterPrintDialog = () => {
  showPrintDialog.value = false;
  router.push({ name: "returBrowse" });
};

const onPrintDirect = () => {
  const routeData = router.resolve({
    name: "returPrint",
    params: { nomor: form.value.nomor || savedNomor.value }
  });
  window.open(routeData.href, "_blank");
  afterPrintDialog();
};

onMounted(() => {
  loadData();
  loadSearchOptions();
});

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);
</script>

<template>
  <BaseForm
    :title="isEdit ? 'Ubah Retur Supplier' : 'Tambah Retur Supplier Baru'"
    :icon="IconTruckReturn"
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
    <div class="form-header-grid">
      <div class="header-fields">
        <div class="grid-fields-container">

          <div class="f-row">
            <label class="f-lbl">No. Retur</label>
            <input type="text" v-model="form.nomor" class="f-inp-native readonly-bg" placeholder="[ OTOMATIS ]" readonly />
          </div>

          <div class="f-row">
            <label class="f-lbl">Supplier</label>
            <div class="search-group">
              <input type="text" :value="form.supKode" class="f-inp-native w-30 readonly-bg" readonly placeholder="Kode" />
              <input type="text" :value="form.supNama" class="f-inp-native w-70 readonly-bg" readonly placeholder="Otomatis dari Invoice..." />
            </div>
          </div>

          <div class="f-row">
            <label class="f-lbl">Tanggal Retur</label>
            <input type="date" v-model="form.tanggal" class="f-inp-native" :disabled="isEdit" />
          </div>

          <div class="f-row">
            <label class="f-lbl">No Invoice Asal</label>
            <div class="search-group" @click="openInvoiceModal">
              <input type="text" :value="form.invNomor" class="f-inp-native readonly-bg" readonly placeholder="Klik untuk memilih Invoice..." />
              <button class="btn-search" type="button" :disabled="isEdit" @click.stop="openInvoiceModal">
                <IconSearch :size="14" />
              </button>
            </div>
          </div>

          <div class="f-row">
            <label class="f-lbl">Gudang</label>
            <div class="search-group" @click="showGudangModal = true">
              <input type="text" :value="form.gdgKode" class="f-inp-native w-30 readonly-bg" readonly placeholder="Kode" />
              <input type="text" :value="(form as any).gdgNama" class="f-inp-native w-70 readonly-bg" readonly placeholder="Pilih Gudang..." />
              <button class="btn-search" type="button" :disabled="isEdit" @click.stop="showGudangModal = true">
                <IconSearch :size="14" />
              </button>
            </div>
          </div>

          <div class="f-row">
            <label class="f-lbl">
              Opsi Pajak
              <IconLock v-if="taxLocked" :size="11" class="lock-icon" />
            </label>
            <select
              v-model.number="form.isTax"
              class="f-inp-native select-native"
              :class="{ 'readonly-bg': taxLocked }"
              :disabled="taxLocked"
              @change="calcTotal"
            >
              <option :value="0">Tanpa Pajak</option>
              <option :value="1">Include Pajak (PPN)</option>
              <option :value="2">Exclude Pajak (PPN)</option>
            </select>
          </div>
        </div>

        <div class="f-row align-start mt-1">
          <label class="f-lbl mt-1">Catatan / Memo</label>
          <textarea v-model="form.memo" class="f-txa-native" rows="2" placeholder="Catatan / Memo Retur..."></textarea>
        </div>
      </div>

      <div class="header-summary">
        <div class="summary-box">
          <div class="summary-lbl">GRAND TOTAL RETUR</div>
          <div class="summary-val">Rp {{ fmtCurrency(form.amount) }}</div>
        </div>
        <div class="summary-sub-rows">
          <div class="sub-total-item">
            <span>Subtotal Bruto :</span>
            <span class="font-weight-bold">Rp {{ fmtCurrency(subtotalBruto) }}</span>
          </div>
          <div class="sub-total-item">
            <span class="d-flex align-center">
              Diskon Faktur (%) :
              <IconLock v-if="taxLocked" :size="10" class="lock-icon" />
              <input
                type="number"
                v-model.number="form.discFakturPr"
                class="f-inp-native mx-1 text-center"
                style="width: 45px; height: 22px; padding: 0;"
                :class="{ 'readonly-bg': taxLocked }"
                :readonly="taxLocked"
                @input="calcTotal"
              />
            </span>
            <span class="d-flex align-center font-weight-bold">
              Rp
              <input
                type="number"
                v-model.number="form.discFaktur"
                class="f-inp-native ml-1 text-right"
                style="width: 90px; height: 22px; padding: 0 4px;"
                :class="{ 'readonly-bg': taxLocked }"
                :readonly="taxLocked"
                @input="form.discFakturPr = 0; calcTotal();"
              />
            </span>
          </div>
          <div class="sub-total-item" v-if="form.isTax > 0">
            <span>Nilai PPN Pajak :</span>
            <span class="font-weight-bold text-orange-darken-4">Rp {{ fmtCurrency(form.taxAmount) }}</span>
          </div>
        </div>
        <div v-if="taxLocked" class="tax-note">
          <IconLock :size="10" /> Pajak &amp; diskon faktur mengikuti Invoice {{ form.invNomor || "-" }}
        </div>
      </div>
    </div>

    <div class="detail-section mt-4">
      <div class="d-flex align-center justify-between mb-2">
        <div class="section-title">Detail Item Barang Retur</div>
        <v-btn size="x-small" color="green-darken-3" class="font-weight-bold text-white" :disabled="!canAddRow" @click="addRow">
          <IconPlus :size="12" class="mr-1" /> Tambah Baris
        </v-btn>
      </div>

      <div class="detail-table-wrap">
        <table class="detail-table">
          <thead>
            <tr>
              <th class="tc" style="width: 40px;">NO</th>
              <th style="width: 140px;">BARCODE / KODE</th>
              <th>NAMA ITEM BARANG</th>
              <th style="width: 90px;" class="tc">SATUAN</th>
              <th style="width: 80px;" class="tr">QTY</th>
              <th style="width: 120px;" class="tr">HARGA SATUAN</th>
              <th style="width: 80px;" class="tr">DISC (%)</th>
              <th style="width: 130px;" class="tr">SUBTOTAL</th>
              <th class="tc" style="width: 50px;">AKSI</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in form.detail" :key="idx">
              <td class="tc font-weight-bold color-grey">{{ idx + 1 }}</td>
              <td>
                <div class="cell-search-group" @click="openSearchBarang(idx)">
                  <input type="text" :value="row.brgKode || row.barcode" class="cell-inp readonly-bg" readonly placeholder="Klik cari..." />
                  <button class="cell-btn-search" type="button" @click.stop="openSearchBarang(idx)"><IconSearch :size="12" /></button>
                </div>
              </td>
              <td>
                <input type="text" v-model="row.brgNama" class="cell-inp font-weight-bold text-grey-darken-4" placeholder="Nama/Deskripsi Item..." />
              </td>
              <td>
                <input type="text" v-model="row.satuan" class="cell-inp tc readonly-bg" readonly placeholder="Pcs/Box" />
              </td>
              <td>
                <input
                  type="number"
                  v-model.number="row.qty"
                  class="cell-inp tr text-blue font-weight-bold"
                  @input="onQtyInput(idx)"
                  min="1"
                  :max="(row as any).qtyMax || undefined"
                />
              </td>
              <td>
                <input type="number" v-model.number="row.harga" class="cell-inp tr text-green-darken-4 font-weight-bold" @input="calcTotal" />
              </td>
              <td>
                <input type="number" v-model.number="row.discPr" class="cell-inp tr text-red font-weight-bold" @input="calcTotal" min="0" max="100" />
              </td>
              <td class="tr pr-2 font-weight-bold text-grey-darken-3">
                {{ fmtCurrency((row.qty * row.harga) - ((row.qty * row.harga * row.discPr) / 100)) }}
              </td>
              <td class="tc">
                <button class="cell-btn-delete" type="button" @click="removeRow(idx)">
                  <IconTrash :size="13" />
                </button>
              </td>
            </tr>
            <tr v-if="form.detail.length === 0">
              <td colspan="9" class="tc pa-4 text-grey style-italic">Belum ada item barang. Silakan klik tombol "Tambah Baris".</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <v-dialog v-model="showSaveDialog" max-width="320">
      <v-card rounded="lg">
        <v-card-title class="text-subtitle-1 font-weight-bold pa-3 bg-green-darken-4 text-white">Konfirmasi</v-card-title>
        <v-card-text class="pa-4 text-body-2">Apakah Anda yakin ingin menyimpan transaksi Retur Supplier ini?</v-card-text>
        <v-card-actions class="pa-2 bg-grey-lighten-4 justify-end">
          <v-btn size="small" variant="outlined" @click="showSaveDialog = false">Batal</v-btn>
          <v-btn size="small" color="success" variant="flat" class="px-4" :loading="isSaving" @click="confirmSave">Ya, Simpan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showPrintDialog" max-width="350" persistent>
      <v-card rounded="lg" class="text-center pa-2">
        <v-card-text class="pa-4">
          <v-avatar color="green-lighten-5" size="large" class="mb-3">
            <IconPrinter size="26" class="text-green-darken-3"/>
          </v-avatar>
          <div class="text-subtitle-1 font-weight-bold text-grey-darken-3">Retur Berhasil Disimpan</div>
          <div class="text-caption text-grey mt-1">Nomor: {{ savedNomor }}</div>
          <div class="text-body-2 mt-3">Apakah Anda ingin langsung mencetak dokumen Nota Retur ini?</div>
        </v-card-text>
        <v-card-actions class="justify-center gap-2 pb-3">
          <v-btn size="small" variant="outlined" class="px-3" @click="afterPrintDialog">Tidak, Kembali</v-btn>
          <v-btn size="small" color="green-darken-3" variant="flat" class="px-4" @click="onPrintDirect">Ya, Cetak Nota</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <SearchModal
      v-model="showBarangModal"
      title="Pilih Item Barang"
      :columns="[
        { key: 'kode', title: 'KODE BARANG', width: '120px' },
        { key: 'nama', title: 'NAMA ITEM BARANG' },
        { key: 'satuan', title: 'SATUAN', width: '80px', align: 'center' }
      ]"
      :items="barangOptions"
      :loading="barangLoading"
      :server-search="true"
      search-placeholder="Cari kode atau nama barang..."
      :search-keys="['kode', 'nama']"
      @select="selectBarang"
      @search="searchBarang"
    />

    <SearchModal
      v-model="showGudangModal"
      title="Pilih Gudang"
      :columns="[
        { key: 'kode', title: 'KODE',   width: '90px' },
        { key: 'nama', title: 'NAMA GUDANG' },
        { key: 'pj',   title: 'PJ',     width: '150px' },
      ]"
      :items="gudangOptions"
      :loading="gudangLoading"
      :server-search="true"
      search-placeholder="Cari kode atau nama gudang..."
      :search-keys="['kode', 'nama']"
      @select="selectGudang"
      @search="searchGudang"
    />

    <SearchModal
      v-model="showInvoiceModal"
      title="Pilih Invoice Sumber Retur"
      :columns="[
        { key: 'nomor', title: 'NOMOR INVOICE', width: '150px' },
        { key: 'tanggal', title: 'TANGGAL', width: '100px', align: 'center' },
        { key: 'bpbNomor', title: 'NOMOR BPB', width: '140px' },
        { key: 'supNama', title: 'SUPPLIER' },
      ]"
      :items="invoiceOptions"
      :loading="invoiceLoading"
      :server-search="true"
      search-placeholder="Cari nomor invoice atau supplier..."
      :search-keys="['nomor', 'supNama']"
      @select="selectInvoice"
      @search="searchInvoice"
    />

  </BaseForm>
</template>

<style scoped>
.form-header-grid {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 20px;
  align-items: start;
}

@media (max-width: 960px) {
  .form-header-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}

.header-fields {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.grid-fields-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 16px;
}

@media (max-width: 600px) {
  .grid-fields-container {
    grid-template-columns: 1fr;
  }
}

.f-row {
  display: flex;
  align-items: center;
}
.f-lbl {
  width: 110px;
  font-size: 11px;
  font-weight: 600;
  color: #4b5563;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 3px;
}
.lock-icon { color: #9ca3af; }
.f-inp-native, .f-txa-native {
  flex: 1;
  height: 28px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 0 8px;
  font-size: 11px;
  outline: none;
}
.select-native {
  background-color: white;
  cursor: pointer;
}
.f-txa-native {
  height: auto;
  padding: 4px 8px;
}
.f-inp-native:focus, .f-txa-native:focus {
  border-color: #3B5998;
}
.readonly-bg {
  background-color: #f3f4f6;
  color: #6b7280;
  cursor: not-allowed;
}

.search-group {
  display: flex;
  flex: 1;
  gap: 4px;
  cursor: pointer;
}
.btn-search {
  height: 28px;
  width: 32px;
  background: #3B5998;
  color: white;
  border: none;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.w-30 { width: 30%; flex: none !important; }
.w-70 { width: 70%; }

.header-summary {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 10px;
}
.summary-box {
  background: #3B5998;
  color: white;
  padding: 10px;
  border-radius: 4px;
  text-align: right;
}
.summary-lbl {
  font-size: 10px;
  font-weight: 600;
  opacity: 0.85;
}
.summary-val {
  font-size: 22px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.summary-sub-rows {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
}
.sub-total-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #4b5563;
  border-bottom: 1px dashed #e5e7eb;
  padding-bottom: 2px;
}
.tax-note {
  margin-top: 8px; font-size: 9.5px; color: #6b7280; display: flex; align-items: center; gap: 3px;
  border-top: 1px dashed #e5e7eb; padding-top: 6px;
}

.section-title {
  font-size: 11px;
  font-weight: 700;
  color: #3B5998;
  text-transform: uppercase;
}
.detail-table-wrap {
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  overflow: auto;
}
.detail-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.detail-table thead tr {
  background: #3B5998;
}
.detail-table th {
  color: white;
  font-weight: 700;
  padding: 6px;
  white-space: nowrap;
}
.detail-table td {
  padding: 3px 4px;
  border-bottom: 1px solid #f0f0f0;
  vertical-align: middle;
}
.detail-table tbody tr:hover td {
  background: rgba(46, 46, 125, 0.03);
}

.cell-inp {
  width: 100%;
  height: 24px;
  border: 1px solid #d1d5db;
  border-radius: 3px;
  padding: 0 4px;
  font-size: 11px;
  outline: none;
}
.cell-inp:focus { border-color: #3B5998; }

.cell-search-group {
  display: flex;
  gap: 2px;
  cursor: pointer;
}
.cell-btn-search {
  height: 24px;
  width: 24px;
  background: #3B5998;
  color: white;
  border: none;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cell-btn-delete {
  color: #ef4444;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
}

.tc { text-align: center; }
.tr { text-align: right; }
</style>
