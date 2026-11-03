<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
import { useTabsStore } from "@/stores/tabsStore";
import SearchModal from "@/components/SearchModal.vue";
import { nextTick } from "vue"; // Pastikan sudah di-import
import { watch } from "vue"; // Pastikan watch sudah ter-import
import { useAuthStore } from "@/stores/authStore";
import {
  IconReceipt2,
  IconSearch,
  IconMapPin,
  IconPhone,
  IconLock,
} from "@tabler/icons-vue";
import { invFormApi, type InvForm, type InvDetail } from "@/api/transaksi/invFormApi";

const route = useRoute();
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "12";
const isEdit = computed(() => !!route.params.nomor);
const isLoading = ref(false);
const isSaving = ref(false);
const tabsStore = useTabsStore();
const showSaveDialog = ref(false);
const showCancelDialog = ref(false);

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const emptyForm = (): InvForm => ({
  isEdit: false,
  nomor: "",
  tanggal: todayLocal(),
  jthtempo: todayLocal(),
  bpbNomor: "",
  poNomor: "",
  supKode: "",
  supNama: "",
  supAlamat: "",
  supTelp: "",
  memo: "",
  isTax: 0,
  discFakturPr: 0,
  discFaktur: 0,
  amount: 0,
  taxAmount: 0,
  nobukti: 0,
  detail: [],
  freight: 0,
  isPajak: 0
});
const resetForm = () => {
  form.value = emptyForm();
  router.replace({ name: "poCreate" }).catch(() => {});
};
const form = ref<InvForm>(emptyForm());
const hasSupplierDetail = computed(() => !!(form.value.supAlamat || form.value.supTelp));

// ── Sumber PAJAK & DISKON: mengikuti PO (via BPB) ──────────────────────
// ✅ FIX: sebelumnya isTax/discFakturPr bisa diketik bebas tanpa
// nyambung ke setting PO. Sekarang field ini otomatis terisi begitu
// user memilih BPB, dan dikunci (readonly) selama BPB masih terkunci —
// backend juga sudah memvalidasi ulang nilai ini (bukan sekadar UI).
const taxLocked = computed(() => bpbLockedRef());
function bpbLockedRef() {
  return bpbLocked.value && !isEdit.value ? true : (isEdit.value || bpbLocked.value);
}

// ── BPB Search Modal ────────────────────────────────────────────────
const showBpbModal = ref(false);
const bpbOptions = ref<any[]>([]);
const bpbLoading = ref(false);
const bpbLocked = ref(false);

const searchBpb = async (q: string) => {
  bpbLoading.value = true;
  try {
    bpbOptions.value = await invFormApi.getBpbOptions(q || "");
  } catch { /* silent */ } finally { bpbLoading.value = false; }
};

const openBpbModal = () => {
  if (bpbLocked.value || isEdit.value) return;
  showBpbModal.value = true;
  searchBpb("");
};

const selectBpb = async (bpb: any) => {
  const nomor = bpb.nomor || bpb.Nomor;
  if (!nomor) return toast.error("Nomor BPB tidak terbaca.");

  showBpbModal.value = false;
  isLoading.value = true;
  try {
    const res = await invFormApi.getBpbDetail(nomor);
    form.value.bpbNomor = nomor;
    form.value.poNomor = res.poNomor;
    form.value.supKode = res.supKode;
    form.value.supNama = res.supNama;
    form.value.supAlamat = res.supAlamat;
    form.value.supTelp = res.supTelp;
    form.value.jthtempo = res.poDateline || form.value.tanggal || todayLocal();

    // ✅ Auto-fill pajak & diskon faktur dari PO — tidak lagi manual.
    form.value.isTax = Number(res.isTax) || 0;
    form.value.discFakturPr = Number(res.discFakturPr) || 0;
    form.value.discFaktur = Number(res.discFaktur) || 0;

    form.value.detail = (res.detail || []).map((d: any): InvDetail => ({
      brgKode: d.brgKode,
      brgNama: d.brgNama || "Tanpa Nama",
      barcode: d.barcode || "",
      satuan: d.satuan || "-",
      qty: Number(d.qty) || 0,
      harga: Number(d.harga) || 0,
      discPr: Number(d.discPr) || 0,
      expired: d.expired || null,
    }));

    bpbLocked.value = true;
    calcTotal();
    toast.success(`Berhasil memuat ${form.value.detail.length} item dari BPB ${nomor} (pajak & diskon mengikuti PO ${res.poNomor || "-"})`);
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal memuat detail BPB.");
  } finally {
    isLoading.value = false;
  }
};

const resetBpb = () => {
  form.value.bpbNomor = "";
  form.value.poNomor = "";
  form.value.supKode = "";
  form.value.supNama = "";
  form.value.supAlamat = "";
  form.value.supTelp = "";
  form.value.detail = [];
  form.value.isTax = 0;
  form.value.discFakturPr = 0;
  form.value.discFaktur = 0;
  bpbLocked.value = false;
};

// ── Kalkulasi ─────────────────────────────────────────────────────────
const rowSubtotal = (d: InvDetail) => {
  const qty = Number(d.qty) || 0;
  const harga = Number(d.harga) || 0;
  const discPr = Number(d.discPr) || 0;
  const total = qty * harga;
  return total - (total * discPr) / 100;
};

const subtotalBruto = computed(() => form.value.detail.reduce((s, d) => s + rowSubtotal(d), 0));
const totalQty = computed(() => form.value.detail.reduce((s, d) => s + (Number(d.qty) || 0), 0));

const totalDiskonFaktur = computed(() => {
  const bruto = subtotalBruto.value;
  const dariPersen = Math.round((bruto * (form.value.discFakturPr || 0)) / 100);
  const dariNominal = Number(form.value.discFaktur) || 0;
  return dariPersen + dariNominal;
});

const calcTotal = () => {
  const bruto = subtotalBruto.value;
  const setelahDiskon = bruto - totalDiskonFaktur.value;

  if (form.value.isTax > 0) {
    if (form.value.isTax === 2) {
      // Exclude Pajak
      form.value.taxAmount = Math.round((setelahDiskon * 11) / 100);
      form.value.amount = setelahDiskon + form.value.taxAmount;
    } else {
      // Include Pajak
      form.value.taxAmount = Math.round((setelahDiskon * 11) / 111);
      form.value.amount = setelahDiskon;
    }
  } else {
    form.value.taxAmount = 0;
    form.value.amount = setelahDiskon;
  }
};

// ── Load data ─────────────────────────────────────────────────────────
const loadData = async () => {
  const nomor = route.params.nomor as string;
  if (!nomor) {
    form.value = emptyForm(); // ✅ Pastikan form dikosongkan jika mode tambah baru
    bpbLocked.value = false;   // ✅ Buka kembali kunci BPB
    return;
  }
  isLoading.value = true;
  try {
    form.value.isEdit = true;
    const res = await invFormApi.getDetailForm(decodeURIComponent(nomor));
    Object.assign(form.value, res);
    bpbLocked.value = true;
    calcTotal();
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal mengambil data invoice.");
    router.push({ name: "invBrowse" });
  } finally {
    isLoading.value = false;
  }
};
watch(
  () => route.params.nomor,
  () => {
    loadData();
  }
);

onMounted(() => loadData());

// ── Simpan ────────────────────────────────────────────────────────────
const validateSave = (): boolean => {
  if (!form.value.bpbNomor) {
    toast.warning("Pilih BPB (Bukti Penerimaan Barang) terlebih dahulu.");
    return false;
  }
  if (form.value.detail.length === 0) {
    toast.warning("Tidak ada item barang pada BPB ini.");
    return false;
  }
  if (!form.value.jthtempo) {
    toast.warning("Tanggal jatuh tempo harus diisi.");
    return false;
  }
  return true;
};

const onValidateSave = () => {
  if (!validateSave()) return;
  showSaveDialog.value = true;
};

const confirmSave = async () => {
  if (isSaving.value) return; // guard: cegah double-submit (spam klik)
  isSaving.value = true;
  try {
    // ✅ Sertakan kode cabang dari authStore ke payload yang dikirim ke backend
    const payload = {
      ...form.value,
      cabang: authStore.userCabang,
    };

    const res = await invFormApi.save(payload);
    toast.success(`Invoice ${res.data?.nomor || ""} berhasil disimpan.`);
    showSaveDialog.value = false;
    resetBpb();
    const targetPath = route.path;
    router.push({ name: "invBrowse" });
    await nextTick();
    tabsStore.closeTab(targetPath);
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal menyimpan invoice.");
  } finally {
    isSaving.value = false;
  }
};

const confirmCancel = () => {
  showCancelDialog.value = false;
  router.push({ name: "invBrowse" });
};

const showCloseDialog = ref(false);
const confirmClose = async () => {
  showCloseDialog.value = false;
  const targetPath = route.path; // ✅ Ambil path halaman form aktif saat ini
  router.push({ name: "invBrowse" }); // Pindah ke halaman list/browse
  await nextTick();
  tabsStore.closeTab(targetPath); // ✅ Tutup tab berdasarkan path form tersebut
};
const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);
const fmtNumber = (v: number) => new Intl.NumberFormat("id-ID").format(v || 0);
</script>

<template>
  <BaseForm
  :title="isEdit ? 'Ubah Invoice' : 'Buat Invoice Baru'"
  :icon="IconReceipt2"
  :menu-id="MENU_ID"
  :is-loading="isLoading"
  :is-saving="isSaving"
  :is-edit-mode="isEdit"
  v-model:show-save-dialog="showSaveDialog"
  v-model:show-cancel-dialog="showCancelDialog"
  v-model:show-close-dialog="showCloseDialog"
  @validate-save="onValidateSave"
  @confirm-save="confirmSave"
  @confirm-cancel="confirmCancel"
  @confirm-close="confirmClose"
>
    <div class="form-header-grid">
      <div class="header-fields">
        <div class="grid-fields-container">
          <div class="f-row">
            <label class="f-lbl">No. Invoice</label>
            <input type="text" v-model="form.nomor" class="f-inp readonly-bg" placeholder="[ OTOMATIS ]" readonly />
          </div>

          <div class="f-row">
            <label class="f-lbl">No. Bukti</label>
            <input type="number" v-model.number="form.nobukti" class="f-inp" placeholder="0" />
          </div>

          <div class="f-row full-col">
            <label class="f-lbl">Sumber BPB</label>
            <div class="search-group">
              <input type="text" :value="form.bpbNomor" class="f-inp readonly-bg" readonly placeholder="Klik untuk memilih BPB..." />
              <button class="btn-srch" type="button" @click="openBpbModal" :disabled="isEdit || bpbLocked">
                <IconSearch :size="14" />
              </button>
              <button v-if="bpbLocked && !isEdit" class="btn-reset" type="button" @click="resetBpb">✕ Ganti</button>
            </div>
          </div>

          <div class="f-row">
            <label class="f-lbl">Tanggal Invoice</label>
            <input type="date" v-model="form.tanggal" class="f-inp" />
          </div>

          <div class="f-row">
            <label class="f-lbl">Jatuh Tempo</label>
            <input type="date" v-model="form.jthtempo" class="f-inp" />
          </div>

          <div class="f-row">
            <label class="f-lbl">
              Opsi Pajak
              <IconLock v-if="taxLocked" :size="11" class="lock-icon" />
            </label>
            <select
              v-model.number="form.isTax"
              class="f-inp select-inp"
              :class="{ 'readonly-bg': taxLocked }"
              :disabled="taxLocked"
              @change="calcTotal"
            >
              <option :value="0">Tanpa Pajak</option>
              <option :value="2">Pajak (PPN)</option>
            </select>
          </div>
          </div> <!-- grid-fields-container -->

        <div class="supplier-info-card" v-if="hasSupplierDetail">
          <div class="supplier-info-row" v-if="form.supAlamat">
            <IconMapPin :size="13" class="supplier-info-icon" /><span>{{ form.supAlamat }}</span>
          </div>
          <div class="supplier-info-row" v-if="form.supTelp">
            <IconPhone :size="13" class="supplier-info-icon" /><span>{{ form.supTelp }}</span>
          </div>
          <div class="supplier-info-row" v-if="form.poNomor">
            <span class="text-caption">Ref. PO: <strong>{{ form.poNomor }}</strong></span>
          </div>
        </div>

        <div class="f-row align-start mt-1">
          <label class="f-lbl mt-1">Catatan / Memo</label>
          <textarea v-model="form.memo" class="f-txa" rows="2" placeholder="Catatan invoice..."></textarea>
        </div>
      </div>

      <div class="header-summary">
        <div class="summary-box">
          <div class="summary-lbl">GRAND TOTAL INVOICE</div>
          <div class="summary-val">Rp {{ fmtCurrency(form.amount) }}</div>
        </div>
        <div class="summary-sub-rows">
          <div class="sub-total-item">
            <span>Supplier :</span>
            <span class="font-weight-bold">{{ form.supNama || "-" }}</span>
          </div>
          <div class="sub-total-item">
            <span>Subtotal Bruto :</span>
            <span class="font-weight-bold">Rp {{ fmtCurrency(subtotalBruto) }}</span>
          </div>

          <div class="sub-total-item disc-row">
            <span>
              Diskon Faktur :
              <IconLock v-if="taxLocked" :size="10" class="lock-icon" />
            </span>
            <div class="disc-inputs">
              <input
                type="number"
                v-model.number="form.discFakturPr"
                class="f-inp disc-pr-inp"
                :class="{ 'readonly-bg': taxLocked }"
                :readonly="taxLocked"
                min="0" max="100" @input="calcTotal"
              />
              <span class="disc-unit">%</span>
              <span class="disc-plus">+</span>
              <span class="disc-unit">Rp</span>
              <input
                type="number"
                v-model.number="form.discFaktur"
                class="f-inp disc-nom-inp"
                min="0" @input="calcTotal"
                title="Nominal diskon tambahan bisa disesuaikan kalau tagihan riil dari supplier beda dari estimasi PO"
              />
            </div>
          </div>
          <div class="sub-total-item">
            <span>= Total Diskon :</span>
            <span class="font-weight-bold text-red">- Rp {{ fmtCurrency(totalDiskonFaktur) }}</span>
          </div>
          <div class="sub-total-item" v-if="form.freight > 0">
            <span>Biaya Kirim :</span>
            <span class="font-weight-bold">+ Rp {{ fmtCurrency(form.freight) }}</span>
          </div>
          <div class="sub-total-item" v-if="form.isTax > 0">
            <span>Nilai PPN Pajak :</span>
            <span class="font-weight-bold text-orange-darken-4">Rp {{ fmtCurrency(form.taxAmount) }}</span>
          </div>
        </div>
        <div v-if="taxLocked" class="tax-note">
          <IconLock :size="10" /> Pajak &amp; % diskon faktur mengikuti PO {{ form.poNomor || "-" }}
        </div>
      </div>
    </div>

    <div class="detail-section mt-4">
      <div class="section-title mb-2">
        Detail Item Barang (dari BPB)
        <span v-if="form.bpbNomor" class="po-badge">{{ form.bpbNomor }}</span>
      </div>

      <div class="detail-table-wrap">
        <table class="detail-table">
          <thead>
            <tr>
              <th class="tc" style="width:40px;">NO</th>
              <th style="width:130px;">KODE BAHAN</th>
              <th style="min-width:180px;">NAMA BAHAN</th>
              <th style="width:80px;" class="tc">SATUAN</th>
              <th style="width:80px;" class="tr">QTY</th>
              <th style="width:120px;" class="tr">HARGA TAGIHAN</th>
              <th style="width:70px;" class="tr">DISC (%)</th>
              <th style="width:130px;" class="tr">SUBTOTAL</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!form.bpbNomor">
              <td colspan="8" class="tc pa-6 text-grey italic">Pilih BPB terlebih dahulu untuk memuat item barang.</td>
            </tr>
            <tr v-for="(row, idx) in form.detail" :key="idx">
              <td class="tc font-weight-bold color-grey">{{ idx + 1 }}</td>
              <td><span class="mono">{{ row.barcode || row.brgKode }}</span></td>
              <td class="font-weight-bold text-grey-darken-4">{{ row.brgNama }}</td>
              <td class="tc">{{ row.satuan }}</td>
              <td class="tr text-blue font-weight-bold">{{ fmtNumber(row.qty) }}</td>
              <td>
                <input type="number" v-model.number="row.harga" class="cell-inp tr text-green-darken-4 font-weight-bold" @input="calcTotal" min="0" />
              </td>
              <td>
                <input type="number" v-model.number="row.discPr" class="cell-inp tr text-red font-weight-bold" @input="calcTotal" min="0" max="100" />
              </td>
              <td class="tr pr-2 font-weight-bold text-grey-darken-3">{{ fmtCurrency(rowSubtotal(row)) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="grid-total-bar" v-if="form.detail.length > 0">
        <span>Total Item: <strong>{{ form.detail.length }}</strong></span>
        <span class="divider">|</span>
        <span>Total Qty: <strong>{{ fmtNumber(totalQty) }}</strong></span>
        <span class="divider">|</span>
        <span>Subtotal Bruto: <strong>Rp {{ fmtCurrency(subtotalBruto) }}</strong></span>
      </div>
    </div>

    <v-dialog v-model="showSaveDialog" max-width="340">
      <v-card rounded="lg">
        <v-card-title class="text-subtitle-1 font-weight-bold pa-3 bg-blue-darken-3 text-white">Konfirmasi</v-card-title>
        <v-card-text class="pa-4 text-body-2">
          Simpan invoice dari BPB <strong>{{ form.bpbNomor }}</strong> senilai
          <strong>Rp {{ fmtCurrency(form.amount) }}</strong>?
        </v-card-text>
        <v-card-actions class="pa-2 bg-grey-lighten-4 justify-end">
          <v-btn size="small" variant="outlined" @click="showSaveDialog = false">Batal</v-btn>
          <v-btn size="small" color="success" variant="flat" class="px-4" :loading="isSaving" @click="confirmSave">
            Ya, Simpan
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showCancelDialog" max-width="320">
      <v-card rounded="lg">
        <v-card-title class="text-subtitle-1 font-weight-bold pa-3 bg-red-darken-4 text-white">Batalkan</v-card-title>
        <v-card-text class="pa-4 text-body-2">Keluar dari halaman ini? Perubahan yang belum disimpan akan hilang.</v-card-text>
        <v-card-actions class="pa-2 bg-grey-lighten-4 justify-end">
          <v-btn size="small" variant="outlined" @click="showCancelDialog = false">Kembali</v-btn>
          <v-btn size="small" color="error" variant="flat" @click="confirmCancel">Ya, Keluar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <SearchModal
      v-model="showBpbModal"
      title="Pilih BPB (Belum Di-invoice)"
      :columns="[
        { key: 'nomor', title: 'NOMOR BPB', width: '150px' },
        { key: 'tanggal', title: 'TANGGAL', width: '100px', align: 'center' },
        { key: 'poNomor', title: 'NOMOR PO', width: '140px' },
        { key: 'supNama', title: 'SUPPLIER' },
      ]"
      :items="bpbOptions"
      :loading="bpbLoading"
      :server-search="true"
      search-placeholder="Cari nomor BPB, PO, atau supplier..."
      :search-keys="['nomor', 'poNomor', 'supNama']"
      @select="selectBpb"
      @search="searchBpb"
    />
  </BaseForm>
</template>

<style scoped>
.form-header-grid { display: grid; grid-template-columns: 1fr 380px; gap: 20px; align-items: start; }
@media (max-width: 960px) { .form-header-grid { grid-template-columns: 1fr; gap: 12px; } }
.header-fields { display: flex; flex-direction: column; gap: 6px; }
.grid-fields-container { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
.full-col { grid-column: 1 / -1; }
@media (max-width: 600px) { .grid-fields-container { grid-template-columns: 1fr; } }

.f-row { display: flex; align-items: center; }
.align-start { align-items: flex-start !important; }
.f-lbl { width: 120px; font-size: 11px; font-weight: 600; color: #4b5563; flex-shrink: 0; display: flex; align-items: center; gap: 3px; }
.lock-icon { color: #9ca3af; }
.f-inp, .f-txa {
  flex: 1; height: 28px; border: 1px solid #d1d5db; border-radius: 4px;
  padding: 0 8px; font-size: 11px; outline: none;
}
.f-txa { height: auto; padding: 4px 8px; }
.f-inp:focus, .f-txa:focus { border-color: #3B5998; }
.readonly-bg { background: #f3f4f6; color: #6b7280; cursor: not-allowed; }
.select-inp { background: white; cursor: pointer; }

.search-group { display: flex; flex: 1; gap: 4px; }
.btn-srch {
  height: 28px; width: 32px; background: #3B5998; color: white; border: none;
  border-radius: 4px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.btn-srch:disabled { background: #9e9e9e; cursor: not-allowed; }
.btn-reset {
  height: 28px; padding: 0 8px; background: #ef5350; color: white; border: none;
  border-radius: 4px; font-size: 10px; font-weight: 700; cursor: pointer; flex-shrink: 0;
}

.supplier-info-card {
  margin-left: 120px; margin-top: -2px; padding: 6px 10px; background: #eef2ff;
  border: 1px solid #e0e7ff; border-radius: 5px; display: flex; flex-direction: column; gap: 3px;
}
.supplier-info-row { display: flex; align-items: center; gap: 6px; font-size: 10.5px; color: #4b5563; line-height: 1.3; }
.supplier-info-icon { color: #6366f1; flex-shrink: 0; }
@media (max-width: 600px) { .supplier-info-card { margin-left: 0; } }

.header-summary { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; }
.summary-box { background: #3B5998; color: white; padding: 10px; border-radius: 4px; text-align: right; }
.summary-lbl { font-size: 10px; font-weight: 600; opacity: 0.85; }
.summary-val { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; }
.summary-sub-rows { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; font-size: 11px; }
.sub-total-item { display: flex; justify-content: space-between; align-items: center; color: #4b5563; border-bottom: 1px dashed #e5e7eb; padding-bottom: 2px; }
.disc-row { align-items: center; }
.disc-inputs { display: flex; align-items: center; gap: 4px; }
.disc-pr-inp { width: 42px; height: 22px; padding: 0 2px; text-align: center; }
.disc-nom-inp { width: 80px; height: 22px; padding: 0 4px; text-align: right; font-weight: 700; }
.disc-unit { font-size: 10px; color: #9ca3af; }
.disc-plus { font-size: 10px; color: #d1d5db; }
.text-red { color: #ef4444; }
.tax-note {
  margin-top: 8px; font-size: 9.5px; color: #6b7280; display: flex; align-items: center; gap: 3px;
  border-top: 1px dashed #e5e7eb; padding-top: 6px;
}

.section-title { font-size: 11px; font-weight: 700; color: #3B5998; text-transform: uppercase; display: flex; align-items: center; gap: 8px; }
.po-badge { font-size: 10px; font-weight: 600; color: #3B5998; background: #e8e8f5; padding: 1px 8px; border-radius: 10px; text-transform: none; }
.detail-table-wrap { border: 1px solid #e0e0e0; border-radius: 4px 4px 0 0; overflow-x: auto; }
.detail-table { width: 100%; min-width: 900px; border-collapse: collapse; font-size: 11px; }
.detail-table thead tr { background: #3B5998; }
.detail-table th { color: white; font-weight: 700; padding: 6px; white-space: nowrap; }
.detail-table td { padding: 3px 4px; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }
.detail-table tbody tr:hover td { background: rgba(46, 46, 125, 0.03); }

.cell-inp { width: 100%; height: 24px; border: 1px solid #d1d5db; border-radius: 3px; padding: 0 4px; font-size: 11px; outline: none; }
.cell-inp:focus { border-color: #3B5998; }
.mono { font-family: monospace; font-size: 10px; color: #6b7280; }

.grid-total-bar {
  display: flex; align-items: center; gap: 10px; background: #f3f4f6; border: 1px solid #e0e0e0;
  border-top: none; border-radius: 0 0 4px 4px; padding: 6px 12px; font-size: 11px; color: #4b5563;
}
.grid-total-bar strong { color: #1f2937; }
.grid-total-bar .divider { color: #d1d5db; }

.tc { text-align: center; }
.tr { text-align: right; }
.pr-2 { padding-right: 8px; }
.mt-1 { margin-top: 4px; }
.mt-4 { margin-top: 16px; }
.mb-2 { margin-bottom: 8px; }
.italic { font-style: italic; }
.pa-6 { padding: 24px; }
</style>