<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
import { useTabsStore } from "@/stores/tabsStore";
import SearchModal from "@/components/SearchModal.vue";
import { nextTick } from "vue"; // Pastikan sudah di-import
import { IconPackageImport, IconSearch } from "@tabler/icons-vue";
import { bpbFormApi, type BpbForm } from "@/api/transaksi/bpbFormApi";

const route = useRoute();
const router = useRouter();
const toast = useToast();

const MENU_ID = "31";
const isEdit = computed(() => !!route.params.nomor);
const isLoading = ref(false);
const isSaving = ref(false);
const tabsStore = useTabsStore();
const showSaveDialog = ref(false);
const showCancelDialog = ref(false);
const showCloseDialog = ref(false);

// ── Tanggal hari ini (safe, no toISOString) ──────────────────────────
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
};

// ── Form State ────────────────────────────────────────────────────────
const form = ref<BpbForm>({
  isEdit: false,
  nomor: "",
  tanggal: todayLocal(),
  poNomor: "",
  gdgKode: "",
  gdgNama: "",
  memo: "",
  detail: [],
});

// ── PO Modal ──────────────────────────────────────────────────────────
const showPoModal = ref(false);
const poOptions = ref<any[]>([]);
const poLoading = ref(false);
const poLocked = ref(false);

const searchPo = async (q: string) => {
  poLoading.value = true;
  try {
    poOptions.value = await bpbFormApi.getPoOptions(q || "");
  } catch {
    /* silent */
  } finally {
    poLoading.value = false;
  }
};

const openPoModal = () => {
  if (poLocked.value || isEdit.value) return;
  showPoModal.value = true;
  searchPo("");
};

const selectPo = async (po: any) => {
  // Ambil nomor PO dari modal secara fleksibel
  const poNo = po.nomor || po.po_nomor || po.poNomor;

  if (!poNo) {
    toast.error("Nomor PO tidak terbaca.");
    return;
  }

  form.value.poNomor = poNo;
  showPoModal.value = false;

  try {
    isLoading.value = true;

    // Menembak API getPoDetail
    const res = await bpbFormApi.getPoDetail(poNo);

    // bpbFormApi.ts langsung mengembalikan 'r.data.data' yang berisi array
    if (res && res.length > 0) {
      form.value.detail = res.map((item: any, index: number) => {
        // Ambil data snapshot kuantitas dari backend
        const qPo = Number(item.qtyPo || 0);
        const qBpb = Number(item.qtySudahTerima || 0); // Sesuai properti bpbFormService.js
        const qSisa = qPo - qBpb; // Sisa yang belum dikirim supplier

        // Ambil nominal keuangan
        const harga = Number(item.harga || 0);
        const discPr = Number(item.discPr || 0);

        // Kalkulasi diskon rupiah per unit item
        const discRp = discPr > 0 ? (harga * discPr) / 100 : 0;

        // Subtotal awal berdasarkan Qty Sisa yang diterima
        const subtotal = qSisa * (harga - discRp);

        return {
          nourut: index + 1,
          brgKode: item.brgKode,
          brgNama: item.brgNama || "Tanpa Nama",
          barcode: item.barcode || "",
          satuan: item.satuan || "PCS",
          qtyPo: qPo,
          qtySudahTerima: qBpb,
          qty: qSisa > 0 ? qSisa : 0, // Default input Qty Terima otomatis diisi sisa PO
          tglExpired: "0000-00-00",
          podNourut: item.podNourut || index + 1, // Referensi untuk tpo_dtl

          // Properti tambahan pembantu kalkulasi di tabel layout
          harga: harga,
          discPr: discPr,
          discRp: discRp,
          subtotal: subtotal,
        };
      });

      toast.success(
        `Berhasil memuat ${form.value.detail.length} item dari PO ${poNo}`
      );
    } else {
      toast.warning(
        "PO ditemukan, tetapi tidak ada item yang tersisa untuk diterima."
      );
      form.value.detail = [];
    }
  } catch (error: any) {
    console.error("Gagal mengambil detail PO:", error);
    toast.error("Gagal memuat detail item dari PO terpilih.");
  } finally {
    isLoading.value = false;
  }
};

const resetPo = () => {
  form.value.poNomor = "";
  form.value.detail = [];
  poLocked.value = false;
};

// ── Gudang Modal ──────────────────────────────────────────────────────
const showGudangModal = ref(false);
const gudangOptions = ref<any[]>([]);
const gudangLoading = ref(false);

const searchGudang = async (q: string) => {
  gudangLoading.value = true;
  try {
    gudangOptions.value = await bpbFormApi.getGudang(q || "");
  } catch {
    /* silent */
  } finally {
    gudangLoading.value = false;
  }
};

const openGudangModal = () => {
  showGudangModal.value = true;
  searchGudang("");
};

const selectGudang = (g: any) => {
  if (!g) return;
  form.value.gdgKode = g.kode;
  form.value.gdgNama = g.nama;
  showGudangModal.value = false;
};

// ── Computed totals ───────────────────────────────────────────────────
const totalQty = computed(() =>
  form.value.detail.reduce((s, d) => s + (Number(d.qty) || 0), 0)
);
const activeRows = computed(
  () => form.value.detail.filter((d) => (d.qty || 0) > 0).length
);

// ── Load data edit ────────────────────────────────────────────────────
const loadData = async () => {
  const nomor = route.params.nomor as string;
  if (!nomor) return;
  isLoading.value = true;
  try {
    form.value.isEdit = true;
    const res = await bpbFormApi.getDetailForm(decodeURIComponent(nomor));
    Object.assign(form.value, res);
    poLocked.value = true;
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal mengambil data BPB.");
    router.push({ name: "bpbBrowse" });
  } finally {
    isLoading.value = false;
  }
};

// ── Validasi & Simpan ─────────────────────────────────────────────────
const validateSave = () => {
  if (!form.value.poNomor) {
    toast.warning("Pilih Nomor PO terlebih dahulu.");
    return;
  }
  if (!form.value.gdgKode) {
    toast.warning("Pilih gudang tujuan.");
    return;
  }
  if (form.value.detail.length === 0) {
    toast.warning("Tidak ada item dari PO.");
    return;
  }
  if (activeRows.value === 0) {
    toast.warning("Minimal satu item harus memiliki qty > 0.");
    return;
  }
  for (const d of form.value.detail) {
    const sisa = d.qtyPo - d.qtySudahTerima;
    if ((d.qty || 0) > sisa) {
      toast.warning(
        `Qty terima "${d.brgNama}" (${d.qty}) melebihi sisa PO (${sisa}).`
      );
      return;
    }
  }
  showSaveDialog.value = true;
};

const confirmSave = async () => {
  if (isSaving.value) return; // guard: cegah double-submit (spam klik)
  isSaving.value = true;
  try {
    const res = await bpbFormApi.save(form.value);
    toast.success(`BPB ${res.data?.nomor || ""} berhasil disimpan.`);
    showSaveDialog.value = false;
    const targetPath = route.path;
    router.push({ name: "bpbBrowse" });
    await nextTick();
    tabsStore.closeTab(targetPath);
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal menyimpan BPB.");
  } finally {
    isSaving.value = false;
  }
};

const confirmCancel = () => {
  showCancelDialog.value = false;
  router.push({ name: "bpbBrowse" });
};

onMounted(() => loadData());

const fmtQty = (v: number) =>
  new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(v || 0);

const confirmClose = async () => {
  showCloseDialog.value = false;
  const targetPath = route.path; // ✅ Ambil path halaman form aktif saat ini
  router.push({ name: "bpbBrowse" }); // Pindah ke halaman list/browse
  await nextTick();
  tabsStore.closeTab(targetPath); // ✅ Tutup tab berdasarkan path form tersebut
};
</script>

<template>
  <BaseForm
    :title="
      isEdit ? 'Ubah Bukti Penerimaan Barang' : 'Penerimaan Barang Baru (BPB)'
    "
    :icon="IconPackageImport"
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
    <!-- ── Header ──────────────────────────────────────────────────── -->
    <div class="form-header-grid">
      <div class="header-fields">
        <div class="grid-fields">
          <!-- No BPB -->
          <div class="f-row">
            <label class="f-lbl">No. BPB</label>
            <input
              type="text"
              v-model="form.nomor"
              class="f-inp readonly-bg"
              placeholder="[ OTOMATIS ]"
              readonly
            />
          </div>

          <!-- Tanggal -->
          <div class="f-row">
            <label class="f-lbl">Tanggal</label>
            <input type="date" v-model="form.tanggal" class="f-inp" />
          </div>

          <!-- Nomor PO (full width) -->
          <div class="f-row full-col">
            <label class="f-lbl">Nomor PO</label>
            <div class="search-group">
              <input
                type="text"
                :value="form.poNomor"
                class="f-inp readonly-bg po-inp"
                readonly
                placeholder="Klik untuk memilih PO..."
              />
              <button
                class="btn-srch btn-blue"
                type="button"
                @click="openPoModal"
                :disabled="isEdit || poLocked"
              >
                <IconSearch :size="14" />
              </button>
              <button
                v-if="poLocked && !isEdit"
                class="btn-reset"
                type="button"
                @click="resetPo"
              >
                ✕ Ganti
              </button>
            </div>
          </div>

          <!-- Gudang -->
          <div class="f-row full-col">
            <label class="f-lbl">Gudang Tujuan</label>
            <div class="search-group">
              <input
                type="text"
                :value="form.gdgKode"
                class="f-inp readonly-bg"
                style="width: 90px; flex: none"
                readonly
                placeholder="Kode"
              />
              <input
                type="text"
                :value="form.gdgNama"
                class="f-inp readonly-bg"
                readonly
                placeholder="Pilih gudang..."
              />
              <button
                class="btn-srch btn-green"
                type="button"
                @click="openGudangModal"
              >
                <IconSearch :size="14" />
              </button>
            </div>
          </div>
        </div>

        <!-- Memo -->
        <div class="f-row align-start mt-1">
          <label class="f-lbl mt-1">Keterangan</label>
          <textarea
            v-model="form.memo"
            class="f-txa"
            rows="2"
            placeholder="Catatan penerimaan..."
          ></textarea>
        </div>
      </div>

      <!-- Summary -->
      <div class="header-summary">
        <div class="summary-box">
          <div class="summary-lbl">TOTAL QTY DITERIMA</div>
          <div class="summary-val">{{ fmtQty(totalQty) }}</div>
          <div class="summary-sub">{{ activeRows }} baris aktif</div>
        </div>
        <div v-if="form.poNomor" class="ref-tag">
          <span>Ref PO:</span>
          <strong>{{ form.poNomor }}</strong>
        </div>
        <div v-else class="po-hint">← Pilih Nomor PO untuk memuat barang</div>
      </div>
    </div>

    <!-- ── Tabel Detail ────────────────────────────────────────────── -->
    <div class="detail-section mt-4">
      <div class="section-title mb-2">
        Detail Item Penerimaan
        <span v-if="form.poNomor" class="po-badge">{{ form.poNomor }}</span>
      </div>

      <div class="tbl-wrap">
        <table class="dtl-tbl">
          <thead>
            <tr>
              <th class="tc" style="width: 36px">NO</th>
              <th style="width: 130px">BARCODE</th>
              <th>NAMA BARANG</th>
              <th style="width: 70px" class="tc">SATUAN</th>
              <th style="width: 85px" class="tr">QTY PO</th>
              <th style="width: 85px" class="tr">SD. TERIMA</th>
              <th style="width: 85px" class="tr">SISA</th>
              <th style="width: 100px" class="tr th-terima">QTY TERIMA ✎</th>
              <th style="width: 120px" class="tc">TGL EXPIRED</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!form.poNomor">
              <td colspan="9" class="tc pa-6 text-grey italic">
                Pilih Nomor PO terlebih dahulu.
              </td>
            </tr>
            <tr v-else-if="form.detail.length === 0">
              <td colspan="9" class="tc pa-4 text-orange-darken-3">
                Tidak ada item dengan sisa qty di PO ini.
              </td>
            </tr>
            <tr
              v-for="(row, idx) in form.detail"
              :key="idx"
              :class="{ 'row-zero': !row.qty || row.qty <= 0 }"
            >
              <td class="tc text-grey-darken-1 font-weight-bold">
                {{ idx + 1 }}
              </td>
              <td>
                <span class="mono">{{ row.barcode || row.brgKode }}</span>
              </td>
              <td>
                <span class="font-weight-bold text-grey-darken-4">{{
                  row.brgNama
                }}</span>
              </td>
              <td class="tc">{{ row.satuan }}</td>
              <td class="tr text-grey">{{ fmtQty(row.qtyPo) }}</td>
              <td class="tr text-orange-darken-3">
                {{ fmtQty(row.qtySudahTerima) }}
              </td>
              <td class="tr text-blue-darken-2 font-weight-bold">
                {{ fmtQty(row.qtyPo - row.qtySudahTerima) }}
              </td>

              <!-- INPUT: qty terima -->
              <td>
                <input
                  type="number"
                  v-model.number="row.qty"
                  class="cell-inp tr qty-inp"
                  :class="{
                    'qty-over': row.qty > row.qtyPo - row.qtySudahTerima,
                  }"
                  :max="row.qtyPo - row.qtySudahTerima"
                  min="0"
                />
              </td>

              <!-- INPUT: tgl expired (opsional) -->
              <td>
                <input
                  type="date"
                  v-model="row.tglExpired"
                  class="cell-inp tc"
                  style="font-size: 10px"
                  placeholder="—"
                />
              </td>
            </tr>
          </tbody>
          <tfoot v-if="form.detail.length > 0">
            <tr class="tfoot-row">
              <td colspan="7" class="tr pr-2 text-caption text-grey">TOTAL</td>
              <td class="tr font-weight-bold text-green-darken-4 pr-2">
                {{ fmtQty(totalQty) }}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <!-- ── Dialog Simpan ───────────────────────────────────────────── -->
    <v-dialog v-model="showSaveDialog" max-width="340">
      <v-card rounded="lg">
        <v-card-title
          class="text-subtitle-1 font-weight-bold pa-3 bg-blue-darken-3 text-white"
        >
          Konfirmasi Simpan
        </v-card-title>
        <v-card-text class="pa-4 text-body-2">
          Simpan penerimaan barang dari PO
          <strong>{{ form.poNomor }}</strong> ke gudang
          <strong>{{ form.gdgNama }}</strong
          >?<br />
          <span class="text-caption text-grey"
            >Total qty: {{ fmtQty(totalQty) }} | {{ activeRows }} item</span
          >
        </v-card-text>
        <v-card-actions class="pa-2 bg-grey-lighten-4 justify-end">
          <v-btn size="small" variant="outlined" @click="showSaveDialog = false"
            >Batal</v-btn
          >
          <v-btn
            size="small"
            color="primary"
            variant="flat"
            class="px-4"
            :loading="isSaving"
            @click="confirmSave"
            >Ya, Simpan</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ── Dialog Batal ────────────────────────────────────────────── -->
    <v-dialog v-model="showCancelDialog" max-width="320">
      <v-card rounded="lg">
        <v-card-title
          class="text-subtitle-1 font-weight-bold pa-3 bg-red-darken-4 text-white"
        >
          Batalkan
        </v-card-title>
        <v-card-text class="pa-4 text-body-2">
          Keluar dari halaman ini? Perubahan yang belum disimpan akan hilang.
        </v-card-text>
        <v-card-actions class="pa-2 bg-grey-lighten-4 justify-end">
          <v-btn
            size="small"
            variant="outlined"
            @click="showCancelDialog = false"
            >Kembali</v-btn
          >
          <v-btn
            size="small"
            color="error"
            variant="flat"
            @click="confirmCancel"
            >Ya, Keluar</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ── SearchModal PO ──────────────────────────────────────────── -->
    <SearchModal
      v-model="showPoModal"
      title="Pilih Nomor PO"
      :columns="[
        { key: 'nomor', title: 'NOMOR PO', width: '160px' },
        { key: 'tanggal', title: 'TANGGAL', width: '100px', align: 'center' },
        { key: 'supNama', title: 'SUPPLIER' },
        { key: 'statusRec', title: 'STATUS', width: '80px', align: 'center' },
      ]"
      :items="poOptions"
      :loading="poLoading"
      :server-search="true"
      search-placeholder="Cari nomor PO atau nama supplier..."
      :search-keys="['nomor', 'supNama', 'memo']"
      @select="selectPo"
      @search="searchPo"
    />

    <!-- ── SearchModal Gudang ──────────────────────────────────────── -->
    <SearchModal
      v-model="showGudangModal"
      title="Pilih Gudang"
      :columns="[
        { key: 'kode', title: 'KODE', width: '90px' },
        { key: 'nama', title: 'NAMA GUDANG' },
        { key: 'pj', title: 'PJ', width: '150px' },
      ]"
      :items="gudangOptions"
      :loading="gudangLoading"
      :server-search="true"
      search-placeholder="Cari kode atau nama gudang..."
      :search-keys="['kode', 'nama']"
      @select="selectGudang"
      @search="searchGudang"
    />
  </BaseForm>
</template>

<style scoped>
.form-header-grid {
  display: grid;
  grid-template-columns: 1fr 300px;
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
.grid-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 16px;
}
.full-col {
  grid-column: 1 / -1;
}
@media (max-width: 600px) {
  .grid-fields {
    grid-template-columns: 1fr;
  }
}

.f-row {
  display: flex;
  align-items: center;
}
.align-start {
  align-items: flex-start !important;
}
.f-lbl {
  width: 110px;
  font-size: 11px;
  font-weight: 600;
  color: #4b5563;
  flex-shrink: 0;
}
.f-inp,
.f-txa {
  flex: 1;
  height: 28px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 0 8px;
  font-size: 11px;
  outline: none;
}
.f-txa {
  height: auto;
  padding: 4px 8px;
}
.f-inp:focus,
.f-txa:focus {
  border-color: #1976d2;
}
.readonly-bg {
  background: #f3f4f6;
  color: #6b7280;
}
.select-inp {
  background: white;
  cursor: pointer;
}

.search-group {
  display: flex;
  flex: 1;
  gap: 4px;
}
.po-inp {
  font-weight: 700;
  color: #3B5998 !important;
}
.btn-srch {
  height: 28px;
  width: 32px;
  color: white;
  border: none;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}
.btn-blue {
  background: #3B5998;
}
.btn-blue:disabled {
  background: #9e9e9e;
  cursor: not-allowed;
}
.btn-green {
  background: #3B5998;
}
.btn-reset {
  height: 28px;
  padding: 0 8px;
  background: #ef5350;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
}

/* Summary */
.header-summary {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 12px;
}
.summary-box {
  background: #3B5998;
  color: white;
  padding: 12px;
  border-radius: 4px;
  text-align: right;
}
.summary-lbl {
  font-size: 10px;
  font-weight: 600;
  opacity: 0.85;
}
.summary-val {
  font-size: 26px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.summary-sub {
  font-size: 10px;
  opacity: 0.75;
  margin-top: 2px;
}
.ref-tag {
  margin-top: 10px;
  font-size: 11px;
  color: #4b5563;
  display: flex;
  gap: 6px;
  align-items: center;
}
.po-hint {
  margin-top: 10px;
  font-size: 10px;
  color: #9ca3af;
  text-align: center;
  font-style: italic;
}

/* Table */
.section-title {
  font-size: 11px;
  font-weight: 700;
  color: #3B5998;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: 8px;
}
.po-badge {
  font-size: 10px;
  font-weight: 600;
  color: #3B5998;
  background: #e8e8f5;
  padding: 1px 8px;
  border-radius: 10px;
  text-transform: none;
}
.tbl-wrap {
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  overflow: auto;
}
.dtl-tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.dtl-tbl thead tr {
  background: #3B5998;
}
.dtl-tbl th {
  color: white;
  font-weight: 700;
  padding: 6px;
  white-space: nowrap;
}
.th-terima {
  background: #3B5998 !important;
}
.dtl-tbl td {
  padding: 3px 4px;
  border-bottom: 1px solid #f0f0f0;
  vertical-align: middle;
}
.dtl-tbl tbody tr:hover td {
  background: rgba(21, 101, 192, 0.03);
}
.dtl-tbl tfoot .tfoot-row td {
  background: #f5f5f5;
  border-top: 2px solid #e0e0e0;
  padding: 5px 4px;
}

.row-zero td {
  color: #bdbdbd !important;
}
.mono {
  font-family: monospace;
  font-size: 10px;
  color: #6b7280;
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
.qty-inp {
  background: #e8e8f5;
  border-color: #a5a5d6;
  font-weight: 700;
  color: #3B5998;
}
.qty-inp:focus {
  border-color: #3B5998;
}
.qty-over {
  background: #ffebee !important;
  border-color: #ef9a9a !important;
  color: #c62828 !important;
}

.tc {
  text-align: center;
}
.tr {
  text-align: right;
}
.pr-2 {
  padding-right: 8px;
}
.mt-1 {
  margin-top: 4px;
}
.mt-4 {
  margin-top: 16px;
}
.mb-2 {
  margin-bottom: 8px;
}
.italic {
  font-style: italic;
}
.pa-4 {
  padding: 16px;
}
.pa-6 {
  padding: 24px;
}
</style>
