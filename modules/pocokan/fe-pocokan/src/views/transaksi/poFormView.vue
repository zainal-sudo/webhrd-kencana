<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import BaseForm from "@/components/BaseForm.vue";
import { useTabsStore } from "@/stores/tabsStore";
import SearchModal from "@/components/SearchModal.vue";
import { nextTick } from "vue"; // Pastikan sudah di-import
import {
  IconShoppingCart,
  IconSearch,
  IconPlus,
  IconTrash,
  IconMapPin,
  IconPhone,
} from "@tabler/icons-vue";
import { poFormApi, type PoForm, type PoDetail } from "@/api/transaksi/poFormApi";

const route = useRoute();
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();

const MENU_ID = "15";
const isEdit = computed(() => !!route.params.nomor);
const isLoading = ref(false);
const isSaving = ref(false);
const isSavingNew = ref(false);

const showSaveDialog = ref(false);
const showCancelDialog = ref(false);
const showCloseDialog = ref(false);
const savedNomor = ref("");
const saveMode = ref<"normal" | "new">("normal");
const tabsStore = useTabsStore();
const today = new Date().toISOString().slice(0, 10);

const emptyForm = (): PoForm => ({
  isEdit: false,
  nomor: "",
  tanggal: today,
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
  dateline: today,
  supTop: 0,
  pemesan: "",
  detail: [],
});

const form = ref<PoForm>(emptyForm());

const supplierOptions = ref<any[]>([]);
const barangOptions = ref<any[]>([]);
const supplierLoading = ref(false);
const barangLoading = ref(false);

const showSupplierModal = ref(false);
const showBarangModal = ref(false);
const activeDetailIndex = ref<number>(-1);

const hasSupplierDetail = computed(() => !!(form.value.supAlamat || form.value.supTelp));

// ── Subtotal per baris (setelah disc % per item) & Subtotal Bruto ─────
const rowSubtotal = (d: PoDetail) => {
  const qty = Number(d.qty) || 0;
  const harga = Number(d.harga) || 0;
  const discPr = Number(d.discPr) || 0;
  const total = qty * harga;
  const nilaiDisc = (total * discPr) / 100;
  return total - nilaiDisc;
};

const subtotalBruto = computed(() => {
  return form.value.detail.reduce((sum, d) => sum + rowSubtotal(d), 0);
});

// ── Total Qty & Total Item (kotak info di bawah grid) ────
const totalQty = computed(() => {
  return form.value.detail.reduce((sum, d) => sum + (Number(d.qty) || 0), 0);
});
const totalBaris = computed(() => form.value.detail.length);

// ── Diskon Faktur: % dan Rp DIJUMLAHKAN ──────
const totalDiskonFaktur = computed(() => {
  const bruto = subtotalBruto.value;
  const dariPersen = Math.round((bruto * (form.value.discFakturPr || 0)) / 100);
  const dariNominal = Number(form.value.discFaktur) || 0;
  return dariPersen + dariNominal;
});

const calcTotal = () => {
  const bruto = subtotalBruto.value;
  const totalDiskon = totalDiskonFaktur.value;
  const setelahDiskonFaktur = bruto - totalDiskon;

  if (form.value.isTax > 0) {
    if (form.value.isTax === 2) {
      // Exclude Pajak
      form.value.taxAmount = Math.round((setelahDiskonFaktur * 11) / 100);
      form.value.amount = setelahDiskonFaktur + form.value.taxAmount;
    } else {
      // Include Pajak
      form.value.taxAmount = Math.round((setelahDiskonFaktur * 11) / 111);
      form.value.amount = setelahDiskonFaktur;
    }
  } else {
    form.value.taxAmount = 0;
    form.value.amount = setelahDiskonFaktur;
  }
};

const loadSearchOptions = async () => {
  supplierLoading.value = true;
  barangLoading.value = true;
  try {
    const [resSupplier, resBarang] = await Promise.all([
      poFormApi.getSupplier(""),
      poFormApi.getBarang(""),
    ]);
    supplierOptions.value = resSupplier || [];
    barangOptions.value = resBarang || [];
  } catch (e) {
    console.error("Gagal memuat opsi pencarian:", e);
  } finally {
    supplierLoading.value = false;
    barangLoading.value = false;
  }
};

const searchSupplier = async (query: string) => {
  supplierLoading.value = true;
  try {
    supplierOptions.value = await poFormApi.getSupplier(query || "");
  } catch {
    /* silent */
  } finally {
    supplierLoading.value = false;
  }
};

const searchBarang = async (query: string) => {
  barangLoading.value = true;
  try {
    barangOptions.value = await poFormApi.getBarang(query || "");
  } catch {
    /* silent */
  } finally {
    barangLoading.value = false;
  }
};

const recalcDateline = () => {
  const top = Number(form.value.supTop) || 0;
  if (!top || !form.value.tanggal) return;
  const base = new Date(form.value.tanggal);
  if (isNaN(base.getTime())) return;
  base.setDate(base.getDate() + top);
  form.value.dateline = base.toISOString().slice(0, 10);
};

const selectSupplier = (sup: any) => {
  if (!sup) return;
  form.value.supKode = sup.kode || sup.Kode || sup.supKode || "";
  form.value.supNama = sup.nama || sup.Nama || sup.supNama || "";
  form.value.supAlamat = sup.alamat || sup.Alamat || "";
  form.value.supTelp = sup.telp || sup.Telp || "";
  form.value.supTop = Number(sup.top ?? sup.Top ?? sup.supTop ?? 0);
  showSupplierModal.value = false;
  recalcDateline();
};

const onTanggalChange = () => {
  recalcDateline();
};

const openSearchBarang = (index: number) => {
  activeDetailIndex.value = index;
  showBarangModal.value = true;
};

const openAddBarang = () => {
  const last = form.value.detail[form.value.detail.length - 1];
  if (last && !last.brgNama) {
    activeDetailIndex.value = form.value.detail.length - 1;
    showBarangModal.value = true;
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
    keterangan: "",
    isiCrt: 1,
    isiLsn: 1,
  });

  activeDetailIndex.value = form.value.detail.length - 1;
  showBarangModal.value = true;
};

const selectBarang = (brg: any) => {
  if (!brg || activeDetailIndex.value < 0) return;
  const idx = activeDetailIndex.value;
  const d = form.value.detail[idx];
  if (d) {
    d.brgKode = brg.kode || brg.Kode || brg.brgKode || "";
    d.brgNama = brg.nama || brg.Nama || brg.brgNama || "";
    d.barcode = brg.barcode || brg.Barcode || "";
    d.satuan = brg.satuan || brg.Satuan || "";
    d.harga = Number(brg.hrgBeli ?? 0);
    d.discPr = 0;
    d.isiCrt = brg.isiCrt || 1;
    d.isiLsn = brg.isiLsn || 1;
  }
  showBarangModal.value = false;
  activeDetailIndex.value = -1;
  calcTotal();
};

const onBarangModalClose = () => {
  const idx = activeDetailIndex.value;
  if (idx >= 0) {
    const d = form.value.detail[idx];
    if (d && !d.brgNama) {
      form.value.detail.splice(idx, 1);
      form.value.detail.forEach((row, i) => (row.no = i + 1));
    }
  }
  activeDetailIndex.value = -1;
};

watch(showBarangModal, (val) => {
  if (!val) onBarangModalClose();
});

const removeRow = (index: number) => {
  form.value.detail.splice(index, 1);
  form.value.detail.forEach((d, i) => (d.no = i + 1));
  calcTotal();
};

const loadData = async () => {
  const nomor = route.params.nomor as string;
  if (!nomor) {
    form.value.isEdit = false;
    return;
  }

  isLoading.value = true;
  try {
    form.value.isEdit = true;
    const res = await poFormApi.getDetailForm(decodeURIComponent(nomor));
    Object.assign(form.value, res);
    calcTotal();
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal mengambil data PO.");
    router.push({ name: "poBrowse" });
  } finally {
    isLoading.value = false;
  }
};

const resetForm = () => {
  form.value = emptyForm();
  router.replace({ name: "poCreate" }).catch(() => {});
};

const validateSave = (): boolean => {
  if (!form.value.supKode) {
    toast.warning("Supplier harus dipilih.");
    return false;
  }
  if (form.value.detail.length === 0) {
    toast.warning("Detail barang tidak boleh kosong.");
    return false;
  }
  for (const d of form.value.detail) {
    if (!d.brgNama) {
      toast.warning("Ada item barang yang belum dipilih.");
      return false;
    }
    if ((d.qty || 0) <= 0) {
      toast.warning(`Qty untuk ${d.brgNama} harus lebih dari 0.`);
      return false;
    }
  }
  return true;
};

const onValidateSave = () => {
  if (!validateSave()) return;
  saveMode.value = "normal";
  showSaveDialog.value = true;
};

const onValidateSaveAndNew = () => {
  if (!validateSave()) return;
  saveMode.value = "new";
  showSaveDialog.value = true;
};

const confirmSave = async () => {
  if (isSaving.value || isSavingNew.value) return;
  const isNewMode = saveMode.value === "new";
  isNewMode ? (isSavingNew.value = true) : (isSaving.value = true);
  
  try {
    const res = await poFormApi.save(form.value);
    toast.success("Purchase Order berhasil disimpan.");
    savedNomor.value = res?.nomor || form.value.nomor;
    showSaveDialog.value = false;
  
    if (isNewMode) {
      resetForm();
      toast.info(`PO ${savedNomor.value} tersimpan. Form siap untuk entri baru.`);
    } else {
      const targetPath = route.path;
      await router.push({ name: "poBrowse" });
      await nextTick();
      tabsStore.closeTab(targetPath);

    }
   
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal menyimpan Purchase Order.");
  } finally {
    isSaving.value = false;
    isSavingNew.value = false;
  }
};

const confirmCancel = () => {
  showCancelDialog.value = false;
  router.push({ name: "poBrowse" });
};

const confirmClose = async () => {
  showCloseDialog.value = false;
  const targetPath = route.path; // ✅ Ambil path halaman form aktif saat ini
  await router.push({ name: "poBrowse" }); // Pindah ke halaman list/browse
  await nextTick();
  tabsStore.closeTab(targetPath); // ✅ Tutup tab berdasarkan path form tersebut
};

onMounted(() => {
  loadData();
  loadSearchOptions();
});

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);
const fmtNumber = (v: number) => new Intl.NumberFormat("id-ID").format(v || 0);
</script>

<template>
  <BaseForm
    :title="isEdit ? 'Ubah Purchase Order (PO)' : 'Tambah Purchase Order Baru'"
    :icon="IconShoppingCart"
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
    <template #extra-actions v-if="!isEdit">
      <v-btn
        size="small"
        variant="outlined"
        color="primary"
        :loading="isSavingNew"
        @click="onValidateSaveAndNew"
      >
        Simpan &amp; Baru
      </v-btn>
    </template>

    <div class="form-header-grid">
      <div class="header-fields">
        <div class="grid-fields-container">
          <div class="f-row">
            <label class="f-lbl">No. PO</label>
            <input type="text" v-model="form.nomor" class="f-inp-native readonly-bg" placeholder="[ OTOMATIS ]" readonly />
          </div>

          <div class="f-row">
            <label class="f-lbl">Supplier</label>
            <div class="search-group" @click="showSupplierModal = true">
              <input type="text" :value="form.supKode" class="f-inp-native w-30 readonly-bg" readonly placeholder="Kode" />
              <input type="text" :value="form.supNama" class="f-inp-native w-70 readonly-bg" readonly placeholder="Pilih Supplier..." />
              <button class="btn-search" type="button" :disabled="isEdit" @click.stop="showSupplierModal = true">
                <IconSearch :size="14" />
              </button>
            </div>
          </div>

          <div class="f-row">
            <label class="f-lbl">Tanggal PO</label>
            <input type="date" v-model="form.tanggal" class="f-inp-native" :disabled="isEdit" @change="onTanggalChange" />
          </div>

          <div class="f-row">
            <label class="f-lbl">Tanggal Jt. Tempo</label>
            <input type="date" v-model="form.dateline" class="f-inp-native" />
          </div>

          <div class="f-row">
            <label class="f-lbl">Nama Pemesan</label>
            <input type="text" v-model="form.pemesan" class="f-inp-native" placeholder="Masukkan nama pemesan..." />
          </div>

          <div class="f-row">
            <label class="f-lbl">Opsi Pajak</label>
            <select v-model.number="form.isTax" class="f-inp-native select-native" @change="calcTotal">
              <option :value="0">Tanpa Pajak</option>
              <option :value="2">Pajak (PPN)</option>
            </select>
          </div>
        </div>

        <div class="supplier-info-card" v-if="hasSupplierDetail">
          <div class="supplier-info-row" v-if="form.supAlamat">
            <IconMapPin :size="13" class="supplier-info-icon" />
            <span>{{ form.supAlamat }}</span>
          </div>
          <div class="supplier-info-row" v-if="form.supTelp">
            <IconPhone :size="13" class="supplier-info-icon" />
            <span>{{ form.supTelp }}</span>
          </div>
        </div>

        <div class="f-row align-start mt-1">
          <label class="f-lbl mt-1">Catatan / Memo</label>
          <textarea v-model="form.memo" class="f-txa-native" rows="2" placeholder="Catatan / Memo Faktur..."></textarea>
        </div>
      </div>

      <div class="header-summary">
        <div class="summary-box">
          <div class="summary-lbl">GRAND TOTAL PO</div>
          <div class="summary-val" :class="form.amount < 0 ? 'val-red-dark-bg' : 'val-green-dark-bg'">
            Rp {{ fmtCurrency(form.amount) }}
          </div>
        </div>
        <div class="summary-sub-rows">
          <div class="sub-total-item">
            <span>Subtotal Bruto :</span>
            <span class="font-weight-bold" :class="subtotalBruto < 0 ? 'val-red' : 'val-green'">
              Rp {{ fmtCurrency(subtotalBruto) }}
            </span>
          </div>

          <div class="sub-total-item disc-row">
            <span>Diskon Faktur :</span>
            <div class="disc-inputs">
              <input
                type="number"
                v-model.number="form.discFakturPr"
                class="f-inp-native disc-pr-inp"
                min="0"
                max="100"
                @input="calcTotal"
              />
              <span class="disc-unit">%</span>
              <span class="disc-plus">+</span>
              <span class="disc-unit">Rp</span>
              <input
                type="number"
                v-model.number="form.discFaktur"
                class="f-inp-native disc-nom-inp"
                min="0"
                @input="calcTotal"
              />
            </div>
          </div>
          <div class="sub-total-item">
            <span>= Total Diskon :</span>
            <span class="font-weight-bold text-red">- Rp {{ fmtCurrency(totalDiskonFaktur) }}</span>
          </div>

          <div class="sub-total-item" v-if="form.isTax > 0">
            <span>Nilai PPN Pajak :</span>
            <span class="font-weight-bold text-orange-darken-4">Rp {{ fmtCurrency(form.taxAmount) }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="detail-section mt-4">
      <div class="d-flex align-center justify-between mb-2">
        <div class="section-title">Detail Item Barang / Jasa</div>
        <v-btn size="x-small" color="green-darken-3" class="font-weight-bold text-white" @click="openAddBarang">
          <IconPlus :size="12" class="mr-1" /> Tambah Barang
        </v-btn>
      </div>

      <div class="detail-table-wrap">
        <table class="detail-table">
          <thead>
            <tr>
              <th class="tc" style="width: 40px;">NO</th>
              <th style="width: 130px;">BARCODE / KODE</th>
              <th style="min-width: 180px;">NAMA ITEM BARANG</th>
              <th style="width: 80px;" class="tc">SATUAN</th>
              <th style="width: 70px;" class="tr">QTY</th>
              <th style="width: 120px;" class="tr">HARGA BELI</th>
              <th style="width: 70px;" class="tr">DISC (%)</th>
              <th style="min-width: 150px;">KETERANGAN</th>
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
                  <button class="cell-btn-search" type="button" @click.stop="openSearchBarang(idx)">
                    <IconSearch :size="12" />
                  </button>
                </div>
              </td>
              <td>
                <input type="text" v-model="row.brgNama" class="cell-inp font-weight-bold text-grey-darken-4" placeholder="Nama/Deskripsi Item..." />
              </td>
              <td>
                <input type="text" v-model="row.satuan" class="cell-inp tc readonly-bg" readonly placeholder="Pcs/Box" />
              </td>
              <td>
                <input type="number" v-model.number="row.qty" class="cell-inp tr text-blue font-weight-bold" @input="calcTotal" min="1" />
              </td>
              <td>
                <div class="cell-currency-wrap">
                  <span class="cell-currency-prefix">Rp</span>
                  <input type="number" v-model.number="row.harga" class="cell-inp cell-inp-currency tr text-green-darken-4 font-weight-bold" @input="calcTotal" placeholder="0" />
                </div>
              </td>
              <td>
                <input type="number" v-model.number="row.discPr" class="cell-inp tr text-red font-weight-bold" @input="calcTotal" min="0" max="100" />
              </td>
              <td>
                <input type="text" v-model="row.keterangan" class="cell-inp text-grey-darken-2" placeholder="Catatan item..." />
              </td>
              <td class="tr pr-2 font-weight-bold" :class="rowSubtotal(row) < 0 ? 'val-red' : 'val-green'">
                Rp {{ fmtCurrency(rowSubtotal(row)) }}
              </td>
              <td class="tc">
                <button class="cell-btn-delete" type="button" @click="removeRow(idx)">
                  <IconTrash :size="13" />
                </button>
              </td>
            </tr>
            <tr v-if="form.detail.length === 0">
              <td colspan="10" class="tc pa-4 text-grey style-italic">Belum ada item barang. Silakan klik tombol "Tambah Barang".</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="grid-total-bar" v-if="form.detail.length > 0">
        <span>Total Item: <strong>{{ totalBaris }}</strong></span>
        <span class="divider">|</span>
        <span>Total Qty: <strong>{{ fmtNumber(totalQty) }}</strong></span>
        <span class="divider">|</span>
        <span>Total Subtotal Bruto: <strong :class="subtotalBruto < 0 ? 'val-red' : 'val-green'">Rp {{ fmtCurrency(subtotalBruto) }}</strong></span>
      </div>
    </div>

    <v-dialog v-model="showSaveDialog" max-width="320">
      <v-card rounded="lg">
        <v-card-title class="text-subtitle-1 font-weight-bold pa-3 bg-green-darken-4 text-white">Konfirmasi</v-card-title>
        <v-card-text class="pa-4 text-body-2">
          {{ saveMode === "new"
            ? "Simpan PO ini dan langsung buka form baru untuk entri berikutnya?"
            : "Apakah Anda yakin ingin menyimpan transaksi Purchase Order ini?" }}
        </v-card-text>
        <v-card-actions class="pa-2 bg-grey-lighten-4 justify-end">
          <v-btn size="small" variant="outlined" @click="showSaveDialog = false">Batal</v-btn>
          <v-btn size="small" color="success" variant="flat" class="px-4" :loading="isSaving || isSavingNew" @click="confirmSave">
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
          <v-btn size="small" color="error" variant="flat" @click="router.push({ name: 'poBrowse' })">Ya, Keluar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <SearchModal
      v-model="showSupplierModal"
      title="Pilih Supplier"
      :columns="[
        { key: 'kode', title: 'KODE', width: '100px' },
        { key: 'nama', title: 'NAMA SUPPLIER' },
      ]"
      :items="supplierOptions"
      :loading="supplierLoading"
      :server-search="true"
      search-placeholder="Cari kode atau nama supplier..."
      :search-keys="['kode', 'nama']"
      @select="selectSupplier"
      @search="searchSupplier"
    />

    <SearchModal
      v-model="showBarangModal"
      title="Pilih Item Barang"
      :columns="[
        { key: 'kode', title: 'KODE BARANG', width: '120px' },
        { key: 'nama', title: 'NAMA ITEM BARANG' },
        { key: 'satuan', title: 'SATUAN', width: '80px', align: 'center' },
      ]"
      :items="barangOptions"
      :loading="barangLoading"
      :server-search="true"
      search-placeholder="Cari kode atau nama barang..."
      :search-keys="['kode', 'nama']"
      @select="selectBarang"
      @search="searchBarang"
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
}
.f-inp-native,
.f-txa-native {
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
.f-inp-native:focus,
.f-txa-native:focus {
  border-color: #3B5998;
}
.readonly-bg {
  background-color: #f3f4f6;
  color: #6b7280;
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

.w-30 {
  width: 30%;
  flex: none !important;
}
.w-70 {
  width: 70%;
}

.supplier-info-card {
  margin-left: 110px;
  margin-top: -2px;
  padding: 6px 10px;
  background: #eef2ff;
  border: 1px solid #e0e7ff;
  border-radius: 5px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  animation: fadeInInfo 0.2s ease-in;
}
.supplier-info-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10.5px;
  color: #4b5563;
  line-height: 1.3;
}
.supplier-info-icon {
  color: #6366f1;
  flex-shrink: 0;
}
@keyframes fadeInInfo {
  from {
    opacity: 0;
    transform: translateY(-2px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@media (max-width: 600px) {
  .supplier-info-card {
    margin-left: 0;
  }
}

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

.disc-row {
  align-items: center;
}
.disc-inputs {
  display: flex;
  align-items: center;
  gap: 4px;
}
.disc-pr-inp {
  width: 42px;
  height: 22px;
  padding: 0 2px;
  text-align: center;
}
.disc-nom-inp {
  width: 80px;
  height: 22px;
  padding: 0 4px;
  text-align: right;
  font-weight: 700;
}
.disc-unit {
  font-size: 10px;
  color: #9ca3af;
}
.disc-plus {
  font-size: 10px;
  color: #d1d5db;
}
.text-red {
  color: #ef4444;
}

.section-title {
  font-size: 11px;
  font-weight: 700;
  color: #3B5998;
  text-transform: uppercase;
}
.detail-table-wrap {
  border: 1px solid #e0e0e0;
  border-radius: 4px 4px 0 0;
  overflow-x: auto;
}
.detail-table {
  width: 100%;
  min-width: 1020px;
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
.cell-inp:focus {
  border-color: #3B5998;
}

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

.grid-total-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #f3f4f6;
  border: 1px solid #e0e0e0;
  border-top: none;
  border-radius: 0 0 4px 4px;
  padding: 6px 12px;
  font-size: 11px;
  color: #4b5563;
}
.grid-total-bar strong {
  color: #1f2937;
}
.grid-total-bar .divider {
  color: #d1d5db;
}

.tc {
  text-align: center;
}
.tr {
  text-align: right;
}

.val-green { color: #15803d; }
.val-red { color: #dc2626; }

.val-green-dark-bg { color: #86efac; }
.val-red-dark-bg { color: #fca5a5; }

.cell-currency-wrap {
  display: flex;
  align-items: center;
  height: 24px;
  border: 1px solid #d1d5db;
  border-radius: 3px;
  overflow: hidden;
  background: white;
}
.cell-currency-wrap:focus-within {
  border-color: #3B5998;
}
.cell-currency-prefix {
  flex-shrink: 0;
  padding: 0 4px;
  font-size: 10px;
  font-weight: 700;
  color: #6b7280;
  background: #f3f4f6;
  height: 100%;
  display: flex;
  align-items: center;
  border-right: 1px solid #d1d5db;
}
.cell-inp-currency {
  border: none !important;
  height: 100%;
}
</style>