<script setup lang="ts">
import { ref } from "vue";
import { useToast } from "vue-toastification";
import BaseBrowse from "@/components/BaseBrowse.vue";
import PinjamanSchedule from "@/components/PinjamanSchedule.vue";
import MsIcon from "@/components/MsIcon.vue";
import { api, getErrorMessage } from "@/api/axios";
import { useAuthStore } from "@/stores/authStore";
import { rupiah } from "@/utils/pinjaman";
import type { BrowseColumn } from "@/types";

const auth = useAuthStore();
const toast = useToast();
const browse = ref<{ refreshAfterDelete: () => void } | null>(null);
const deleteTarget = ref<Record<string, any> | null>(null);
const deleteOpen = ref(false);
const deleteLoading = ref(false);
const deleting = ref(false);
const deleteVerification = ref("");
let deleteRequest = 0;
const summary = ref<{ plafon: number; outstanding: number; sisa_plafon: number } | null>(null);
const summaryError = ref(false);
const summaryLoading = ref(false);
let summaryRequest = 0;
const detail = ref<Record<string, any> | null>(null);
const detailOpen = ref(false);
const detailLoading = ref(false);
let detailRequest = 0;
const money = new Set(["Pinjam", "NominalCicilan", "Bayar", "SisaBayar"]);
const columns: BrowseColumn[] = [
  { key: "Nik", label: "NIK", width: "112px" },
  { key: "Nama", label: "NAMA KARYAWAN", width: "155px" },
  { key: "Pabrik", label: "UNIT", width: "65px" },
  { key: "Bagian", label: "BAGIAN", width: "90px" },
  { key: "Bank", label: "BANK", width: "65px" },
  { key: "Norek", label: "NO REK", width: "110px" },
  { key: "Pinjam", label: "PINJAMAN UANG KOPERASI", align: "right", width: "200px" },
  { key: "Cicilan", label: "ANGSURAN", width: "100px" },
  { key: "Bayar", label: "POTONGAN", align: "right", width: "110px" },
  { key: "SisaBayar", label: "SALDO POTONGAN", align: "right", width: "145px" },
];
async function refreshSummary() {
  const request = ++summaryRequest;
  summary.value = null;
  summaryError.value = false;
  summaryLoading.value = true;
  try {
    const { data } = await api.get("/transaksi/pinjaman/ringkasan");
    if (request === summaryRequest) { summary.value = data.data; summaryError.value = false; }
  } catch (e) {
    if (request === summaryRequest) { summary.value = null; summaryError.value = true; toast.error(getErrorMessage(e)); }
  }
  finally { if (request === summaryRequest) summaryLoading.value = false; }
}
function browseFailed() {
  ++summaryRequest; // Ignore a summary response still in flight for this failed browse.
  summary.value = null;
  summaryLoading.value = false;
  summaryError.value = true;
}
async function openDetail(row: Record<string, any>) {
  const request = ++detailRequest;
  detailOpen.value = true; detailLoading.value = true; detail.value = null;
  try {
    const { data } = await api.get("/transaksi/pinjaman/detail", { params: { nomor: row.Nomor } });
    if (request === detailRequest) detail.value = data.data;
  } catch (e) { if (request === detailRequest) toast.error(getErrorMessage(e)); }
  finally { if (request === detailRequest) detailLoading.value = false; }
}
function closeDetail() { ++detailRequest; detailOpen.value = false; detailLoading.value = false; }
async function requestDelete(row: Record<string, any>) {
  if (!auth.can("frmPinjam", "delete") || deleting.value) return;
  const request = ++deleteRequest;
  deleteOpen.value = true; deleteLoading.value = true; deleteTarget.value = null; deleteVerification.value = "";
  try {
    const { data } = await api.get("/transaksi/pinjaman/detail", { params: { nomor: row.Nomor } });
    if (request === deleteRequest) deleteTarget.value = data.data;
  } catch (e) { if (request === deleteRequest) toast.error(getErrorMessage(e)); }
  finally { if (request === deleteRequest) deleteLoading.value = false; }
}
function closeDelete() {
  if (deleting.value) return;
  ++deleteRequest; deleteOpen.value = false; deleteLoading.value = false; deleteTarget.value = null;
}
async function confirmPermanentDelete() {
  const doc = deleteTarget.value;
  if (!auth.can("frmPinjam", "delete") || deleting.value || deleteLoading.value || !doc || deleteVerification.value !== doc.Nomor) return;
  if (!window.confirm(`PERINGATAN: Hapus permanen pinjaman ${doc.Nomor} milik ${doc.Nama || doc.Nik}? Histori akan hilang dan tidak dapat dipulihkan. Pastikan dampaknya terhadap potongan gaji sudah diverifikasi.`)) return;
  deleting.value = true;
  try {
    await api.delete(`/transaksi/pinjaman/${encodeURIComponent(doc.Nomor)}`, { data: { konfirmasi: deleteVerification.value, revision: doc.revision } });
    toast.success(`Pinjaman ${doc.Nomor} dihapus permanen.`);
    deleteOpen.value = false; deleteTarget.value = null;
    browse.value?.refreshAfterDelete();
  } catch (e) { toast.error(getErrorMessage(e)); }
  finally { deleting.value = false; }
}
function display(row: Record<string, any>, column: BrowseColumn, text?: string) {
  const value = row[column.key];
  if (column.key === 'NominalCicilan' && row.Potongan?.length) {
    return [...new Set(row.Potongan.map((item: { nominal: number | null }) => rupiah(item.nominal)))].join(' / ');
  }
  if (money.has(column.key)) return rupiah(value);
  if (value == null || value === "") return "—";
  if (column.key === "Cicilan") return `${value}x`;
  return text ?? String(value);
}
</script>

<template>
  <section>
    <div class="loan-summary" aria-live="polite">
      <div><span>Plafon Perusahaan</span><strong>{{ rupiah(summary?.plafon ?? 30000000) }}</strong></div>
      <div><span>Pinjaman Berjalan</span><strong>{{ rupiah(summary?.outstanding) }}</strong></div>
      <div><span>Sisa Plafon</span><strong>{{ rupiah(summary?.sisa_plafon) }}</strong></div>
    </div>
    <p v-if="summaryError" role="alert">Ringkasan gagal dimuat. Klik Refresh untuk mencoba kembali.</p>
    <p v-else-if="summaryLoading" role="status">Memuat ringkasan…</p>
    <BaseBrowse ref="browse" module-title="Pinjaman" module-subtitle="Histori pinjaman · Bayar = jumlah yang sudah dibayar" endpoint="/transaksi/pinjaman"
      :columns="columns" primary-key="Nomor" refresh-on-activate compact expandable row-number-label="NO" :can-delete="false"
      :add-form-path="auth.can('frmPinjam', 'insert') ? '/transaksi/pinjaman/form' : undefined"
      :edit-form-path="auth.can('frmPinjam', 'edit') ? '/transaksi/pinjaman/form' : undefined"
      search-placeholder="Cari nomor / NIK / nama / bagian / bank / rekening..." @load-start="refreshSummary" @load-error="browseFailed">
      <template #cell="{ row, column, text }">{{ display(row, column, text) }}</template>
      <template #expanded-row="{ row }"><PinjamanSchedule :rows="row.Potongan || []" /></template>
      <template #row-actions="{ row }">
        <button type="button" class="detail-button" @click="openDetail(row)">Detail</button>
        <button v-if="auth.can('frmPinjam', 'delete')" type="button" class="delete-button" :title="row.potong1_diproses_pada != null || row.potong2_diproses_pada != null ? 'Pinjaman sudah memiliki pelunasan yang diproses' : 'Hapus permanen'" aria-label="Hapus permanen pinjaman" :disabled="deleting || row.potong1_diproses_pada != null || row.potong2_diproses_pada != null" @click="requestDelete(row)"><MsIcon name="delete" :size="18" /></button>
      </template>
    </BaseBrowse>
    <Teleport to="body">
      <div v-if="deleteOpen" class="loan-overlay" @click.self="closeDelete" @keydown.esc="closeDelete">
        <section class="loan-dialog" role="dialog" aria-modal="true" aria-labelledby="loan-delete-title">
          <header><h2 id="loan-delete-title">Verifikasi Hapus Permanen</h2><button type="button" class="close-button" aria-label="Tutup verifikasi hapus" :disabled="deleting" @click="closeDelete"><MsIcon name="close" :size="22" /></button></header>
          <p class="delete-warning" role="alert">Histori pinjaman akan dihapus permanen dan tidak dapat dipulihkan. Termasuk pinjaman lunas. Verifikasi dampaknya terhadap proses potongan gaji sebelum melanjutkan.</p>
          <p v-if="deleteLoading" role="status">Memuat data terbaru…</p>
          <template v-else-if="deleteTarget">
            <dl><dt>Nomor</dt><dd>{{ deleteTarget.Nomor }}</dd><dt>Karyawan</dt><dd>{{ deleteTarget.Nik }} · {{ deleteTarget.Nama || '—' }}</dd><dt>Nominal</dt><dd>{{ rupiah(deleteTarget.Pinjam) }}</dd><dt>Bayar</dt><dd>{{ rupiah(deleteTarget.Bayar) }}</dd><dt>Sisa Pinjaman</dt><dd>{{ rupiah(deleteTarget.SisaBayar) }}</dd><dt>Status</dt><dd>{{ deleteTarget.Status || '—' }}</dd></dl>
            <label class="delete-verification">Ketik <strong>{{ deleteTarget.Nomor }}</strong> untuk verifikasi<input v-model="deleteVerification" type="text" :disabled="deleting" autocomplete="off" /></label>
            <button type="button" class="delete-button" :disabled="deleting || deleteVerification !== deleteTarget.Nomor" @click="confirmPermanentDelete">{{ deleting ? 'Menghapus…' : 'Hapus Permanen' }}</button>
          </template>
          <p v-else>Data tidak dapat dimuat. Tutup dialog dan coba kembali.</p>
        </section>
      </div>
      <div v-if="detailOpen" class="loan-overlay" @click.self="closeDetail" @keydown.esc="closeDetail">
        <section class="loan-dialog" role="dialog" aria-modal="true" aria-labelledby="loan-detail-title" tabindex="-1">
          <header><h2 id="loan-detail-title">Detail Pinjaman</h2><button type="button" class="close-button" aria-label="Tutup Detail Pinjaman" title="Tutup" autofocus @click="closeDetail"><MsIcon name="close" :size="22" /></button></header>
          <p v-if="detailLoading" role="status">Memuat detail…</p>
          <dl v-else-if="detail">
            <dt>Nomor Pinjaman</dt><dd>{{ detail.Nomor || '—' }}</dd>
            <dt>Tanggal Pinjaman</dt><dd>{{ detail.Tanggal || '—' }}</dd>
            <template v-for="col in columns" :key="col.key"><dt>{{ col.label }}</dt><dd>{{ display(detail, col) }}</dd></template>
            <dt>Status</dt><dd>{{ detail.Status || '—' }}</dd>
          </dl>
          <p v-else>Detail tidak dapat dimuat.</p>
          <PinjamanSchedule v-if="detail && !detailLoading" class="detail-schedule" :rows="detail.Potongan || []" />
          <small>Read-only. Periode adalah rencana potongan, bukan histori pembayaran.</small>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.loan-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
.loan-summary > div { background: var(--ds-surface, white); border: 1px solid var(--ds-border, #dde3ec); padding: 16px; border-radius: 8px; }
.loan-summary span { display: block; font-size: 12px; margin-bottom: 8px; }
.loan-summary strong { font-size: 20px; }
.detail-button, .loan-dialog button { cursor: pointer; padding: 6px 10px; border: 1px solid var(--ds-border, #dde3ec); border-radius: 5px; background: var(--ds-surface, white); color: inherit; }
.detail-button { font-size: 11px; padding: 4px 6px; }
.loan-overlay { position: fixed; inset: 0; background: #0008; z-index: 2000; display: grid; place-items: center; padding: 20px; }
.loan-dialog { background: var(--ds-surface, white); color: var(--ds-text, #263238); border-radius: 10px; padding: 24px; width: min(720px, 100%); max-height: 90vh; overflow: auto; }
.loan-dialog header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.loan-dialog h2 { font-size: 18px; }
.detail-schedule { margin: 12px 0; }
.delete-warning, .loan-dialog .delete-button, .delete-button { color: var(--ds-error, #dc2626); }
.delete-button { cursor: pointer; padding: 6px 10px; border: 1px solid currentColor; border-radius: 5px; background: var(--ds-surface, white); }
button:disabled { opacity: .5; cursor: not-allowed; }
.delete-verification { display: flex; flex-direction: column; gap: 8px; margin: 16px 0; }
.delete-verification input { padding: 9px; background: var(--ds-surface, white); color: inherit; border: 1px solid var(--ds-border, #dde3ec); border-radius: 5px; }
.loan-dialog .close-button { display: inline-flex; align-items: center; justify-content: center; padding: 6px; color: var(--ds-error, #dc2626); border-color: transparent; background: transparent; }
.loan-dialog .close-button:hover { background: var(--ds-surface-inset, #fee2e2); }
.loan-dialog dl { display: grid; grid-template-columns: 160px 1fr; gap: 10px 16px; }
.loan-dialog dd { margin: 0; overflow-wrap: anywhere; }
.loan-dialog dt { font-weight: 600; }
@media (max-width: 600px) { .loan-summary { grid-template-columns: 1fr; } .loan-dialog dl { grid-template-columns: 1fr; } }
</style>
