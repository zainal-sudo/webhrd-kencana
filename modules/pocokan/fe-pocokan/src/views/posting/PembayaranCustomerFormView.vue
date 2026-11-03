<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { isAuthExpiredError } from "@/api/axios";
import BaseForm from "@/components/BaseForm.vue";
import { IconFileInvoice, IconRefresh } from "@tabler/icons-vue";
import {
  pembayaranCustomerFormApi,
  type DataPostingRow,
} from "@/api/posting/pembayaranCustomerFormApi";

const router = useRouter();
const toast = useToast();
const MENU_ID = "51";

// ── Periode ───────────────────────────────────────────────────────────
const getLocal = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

const now = new Date();
const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
const startDate = ref(getLocal(firstDay));
const endDate = ref(getLocal(now));

// ── State ─────────────────────────────────────────────────────────────
const isLoading = ref(false);
const isPosting = ref(false);
const showPostingDialog = ref(false);
const showCloseDialog = ref(false);
// BaseForm juga butuh ini meski tidak semua dipakai
const showSaveDialog = ref(false);
const showCancelDialog = ref(false);

const items = ref<DataPostingRow[]>([]);

// ── Load data ─────────────────────────────────────────────────────────
// Delphi: klik Refresh baru muncul, di web langsung load + watch tanggal
const loadData = async () => {
  isLoading.value = true;
  try {
    items.value = await pembayaranCustomerFormApi.getDataPosting(
      startDate.value,
      endDate.value
    );
  } catch (e: any) {
    if (isAuthExpiredError(e)) return;
    toast.error(e.response?.data?.message ?? "Gagal memuat data.");
  } finally {
    isLoading.value = false;
  }
};

onMounted(loadData);

// Watch perubahan tanggal → auto reload
watch([startDate, endDate], () => {
  loadData();
});

// ── Computed ──────────────────────────────────────────────────────────
const displayItems = computed(() => items.value.filter((d) => d.Status === ""));

const totalNominal = computed(() =>
  displayItems.value.reduce((s, d) => s + Number(d.Nominal), 0)
);

// Tambah dua computed yang hilang:
const pendingItems = computed(() => displayItems.value);

const totalPending = computed(() =>
  pendingItems.value.reduce((s, d) => s + Number(d.Nominal), 0)
);
// ── Validasi & Posting ────────────────────────────────────────────────
// Delphi: cek grid kosong → warning, confirm → proses per baris
const onValidatePosting = () => {
  if (items.value.length === 0) {
    toast.warning(
      "Tidak ada data yang akan di posting. Silahkan di refresh dulu."
    );
    return;
  }
  if (pendingItems.value.length === 0) {
    toast.warning("Semua data sudah diposting.");
    return;
  }
  showPostingDialog.value = true;
};

const doPosting = async () => {
  isPosting.value = true;
  showPostingDialog.value = false;
  try {
    // Kirim semua item, backend hanya proses yang status=''
    const res = await pembayaranCustomerFormApi.doPosting(items.value);
    toast.success(res.message);

    // Update status di grid sesuai hasil — Delphi: CDSGrid.fieldbyname('status')='Sukses'
    const resultMap = new Map(res.data.map((r) => [r.nomor, r]));
    items.value = items.value.map((d) => {
      const result = resultMap.get(d.Nomor);
      if (result?.status === "Sukses") return { ...d, Status: "Sukses" };
      return d;
    });
  } catch (e: any) {
    if (isAuthExpiredError(e)) return;
    toast.error(e.response?.data?.message ?? "Gagal posting.");
  } finally {
    isPosting.value = false;
  }
};

const onConfirmClose = () => {
  showCloseDialog.value = false;
  router.back();
};

const fmt = (v: number) => new Intl.NumberFormat("id-ID").format(v || 0);

// ── Row class berdasarkan status ──────────────────────────────────────
const rowClass = (status: string) => {
  if (status === "Sukses") return "row-sukses";
  if (status === "Sudah") return "row-sudah";
  return "";
};
</script>

<template>
  <BaseForm
    title="Posting Pembayaran Customer"
    :icon="IconFileInvoice"
    :menu-id="MENU_ID"
    :is-loading="false"
    :is-saving="isPosting"
    :is-edit-mode="false"
    v-model:show-save-dialog="showSaveDialog"
    v-model:show-cancel-dialog="showCancelDialog"
    v-model:show-close-dialog="showCloseDialog"
    @validate-save="onValidatePosting"
    @confirm-save="doPosting"
    @confirm-cancel="loadData"
    @confirm-close="onConfirmClose"
  >
    <!-- Override tombol header — ganti "Simpan" jadi "Posting" -->
    <template #header-actions>
      <v-btn
        size="small"
        color="primary"
        variant="flat"
        :loading="isPosting"
        @click="onValidatePosting"
      >
        <template #prepend>
          <IconFileInvoice :size="14" :stroke-width="1.8" />
        </template>
        Posting
      </v-btn>
      <v-btn
        size="small"
        variant="outlined"
        :loading="isLoading"
        @click="loadData"
      >
        <template #prepend>
          <IconRefresh :size="14" :stroke-width="1.8" />
        </template>
        Refresh
      </v-btn>
      <v-btn
        size="small"
        variant="tonal"
        color="error"
        @click="showCloseDialog = true"
      >
        Tutup
      </v-btn>
    </template>

    <!-- Full layout — satu area tanpa left/right split -->
    <div class="pbc-layout">
      <!-- ── Filter periode ── -->
      <div class="desktop-form-section header-section pbc-filter">
        <div class="filter-row">
          <span class="filter-lbl">Periode</span>
          <input v-model="startDate" type="date" class="date-inp" />
          <span class="filter-lbl">s/d</span>
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
          <div class="summary-pill">
            <span class="pill-lbl">Pending:</span>
            <span class="pill-val">{{ pendingItems.length }} data</span>
          </div>
          <div class="summary-pill">
            <span class="pill-lbl">Total Pending:</span>
            <span class="pill-val">Rp {{ fmt(totalPending) }}</span>
          </div>
        </div>
      </div>

      <!-- ── Grid data ── -->
      <div class="desktop-form-section pbc-grid">
        <!-- Loading overlay -->
        <div v-if="isLoading" class="grid-loading">
          <v-progress-circular indeterminate color="primary" size="36" />
          <span>Memuat data...</span>
        </div>

        <div v-else class="grid-wrap">
          <table class="form-tbl">
            <thead>
              <tr>
                <th style="width: 36px">No</th>
                <th style="width: 105px">Tanggal</th>
                <th style="min-width: 200px">Nomor</th>
                <th style="width: 95px">Account</th>
                <th style="min-width: 220px">Nama Account</th>
                <th style="width: 55px">Jenis</th>
                <th style="width: 140px">Nominal</th>
                <th style="min-width: 280px">Uraian</th>
                <th style="min-width: 160px">Customer</th>
                <th style="width: 80px">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(d, idx) in displayItems"
                :key="d.Nomor"
                :class="rowClass(d.Status)"
              >
                <td class="tc">{{ idx + 1 }}</td>
                <td class="tc">{{ d.Tanggal }}</td>
                <td>{{ d.Nomor }}</td>
                <td>{{ d.RekKode }}</td>
                <td>{{ d.RekNama }}</td>
                <td class="tc">{{ d.Jenis }}</td>
                <td class="tr">{{ fmt(d.Nominal) }}</td>
                <td>{{ d.Uraian }}</td>
                <td>{{ d.Customer }}</td>
                <td class="tc">
                  <span v-if="d.Status === 'Sukses'" class="badge-sukses"
                    >Sukses</span
                  >
                  <span v-else-if="d.Status === 'Sudah'" class="badge-sudah"
                    >Sudah</span
                  >
                  <span v-else class="badge-pending">—</span>
                </td>
              </tr>
              <tr v-if="!displayItems.length && !isLoading">
                <td
                  colspan="10"
                  class="tc"
                  style="color: #9e9e9e; font-style: italic; padding: 20px"
                >
                  Tidak ada data pending. Semua sudah diposting atau ubah filter
                  periode.
                </td>
              </tr>
            </tbody>
            <tfoot v-if="displayItems.length">
              <tr class="tfoot-row">
                <td colspan="6" class="tr tfoot-lbl">Total</td>
                <td class="tr tfoot-val">{{ fmt(totalNominal) }}</td>
                <td colspan="3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <!-- ── Legend ── -->
      <div class="pbc-legend">
        <span class="badge-sukses">Sukses</span>
        <span class="legend-lbl">Berhasil diposting sesi ini</span>
        <span class="badge-sudah" style="margin-left: 12px">Sudah</span>
        <span class="legend-lbl">Sudah ada di database</span>
        <span class="badge-pending" style="margin-left: 12px">—</span>
        <span class="legend-lbl">Belum diposting</span>
      </div>
    </div>
  </BaseForm>

  <!-- ── Dialog Konfirmasi Posting ── -->
  <v-dialog v-model="showPostingDialog" max-width="420" persistent>
    <v-card rounded="lg">
      <v-card-title class="text-body-1 font-weight-bold pa-4">
        Konfirmasi Posting
      </v-card-title>
      <v-card-text class="pa-4 pt-0" style="font-size: 12px">
        Akan memposting
        <strong>{{ pendingItems.length }} data</strong>
        dengan total nominal
        <strong>Rp {{ fmt(totalPending) }}</strong
        >. <br /><br />
        Yakin akan di Posting?
      </v-card-text>
      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn variant="text" @click="showPostingDialog = false">Batal</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="isPosting"
          @click="doPosting"
        >
          Ya, Posting
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.pbc-layout {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: #f1f1f8;
}

/* Filter bar */
.pbc-filter {
  flex-shrink: 0;
}
.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.filter-lbl {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  white-space: nowrap;
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

/* Summary pills */
.summary-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #e8e8f5;
  border: 1px solid #c8c8e6;
  border-radius: 16px;
  padding: 3px 10px;
  white-space: nowrap;
}
.pill-lbl {
  font-size: 10px;
  color: #555;
  font-weight: 600;
}
.pill-val {
  font-size: 11px;
  color: #3B5998;
  font-weight: 700;
}

/* Grid section */
.pbc-grid {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.grid-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 200px;
  font-size: 12px;
  color: #9e9e9e;
}

/* Scrollable wrapper — horizontal + vertical */
.grid-wrap {
  flex: 1;
  overflow: auto; /* ← both axes */
  min-height: 0;
}

.form-tbl {
  width: max-content; /* ← paksa tabel lebih lebar dari container */
  min-width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.form-tbl thead tr {
  background: #3B5998;
}
.form-tbl th {
  color: white;
  font-weight: 700;
  padding: 5px 8px;
  text-align: left;
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 1;
  background: #3B5998; /* ← sticky header butuh background eksplisit */
}
.form-tbl td {
  padding: 3px 8px;
  border-bottom: 1px solid #f0f0f0;
  white-space: nowrap;
}
.form-tbl tbody tr:hover td {
  background: rgba(46, 46, 125, 0.04);
}

/* Row status */
.row-sukses td {
  background: #f0f0fd !important;
  color: #3B5998;
}
.row-sudah td {
  background: #f5f5f5 !important;
  color: #bdbdbd;
}

/* Footer */
.tfoot-row td {
  background: #f0f0fd;
  border-top: 2px solid #3B5998;
  padding: 5px 8px;
  position: sticky;
  bottom: 0;
}
.tfoot-lbl {
  font-size: 11px;
  font-weight: 700;
  color: #374151;
}
.tfoot-val {
  font-size: 11px;
  font-weight: 700;
  color: #3B5998;
  font-variant-numeric: tabular-nums;
}

/* Status badges */
.badge-sukses {
  background: #e8e8f5;
  color: #3B5998;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
}
.badge-sudah {
  background: #f5f5f5;
  color: #9e9e9e;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
}
.badge-pending {
  color: #9e9e9e;
  font-size: 11px;
}

/* Legend */
.pbc-legend {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 4px 2px;
  font-size: 11px;
}
.legend-lbl {
  color: #6b7280;
}

.tc {
  text-align: center;
}
.tr {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
