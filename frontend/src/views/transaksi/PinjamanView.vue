<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useToast } from "vue-toastification";
import BaseBrowse from "@/components/BaseBrowse.vue";
import DateInput from "@/components/fields/DateInput.vue";
import PinjamanSchedule from "@/components/PinjamanSchedule.vue";
import MsIcon from "@/components/MsIcon.vue";
import { api, getErrorMessage } from "@/api/axios";
import { downloadFile } from "@/api";
import { useAuthStore } from "@/stores/authStore";
import { rupiah } from "@/utils/pinjaman";
import { pinjamanRevision } from "@/utils/pinjamanRefresh";
import { formatTanggal } from "@/utils/format";
import type { BrowseColumn } from "@/types";

const auth = useAuthStore();
const toast = useToast();
const exporting = ref(false);
const exportStart = ref("");
const exportEnd = ref("");
const allDateRange = ref<{ start: string; end: string }>({ start: "", end: "" });
const appliedPeriod = ref<{ start_date: string; end_date: string } | null>(null);
const periodQuery = computed(() => appliedPeriod.value ?? {});
function validExportDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1000-01-01') return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
const exportPeriodValid = computed(() => validExportDate(exportStart.value) && validExportDate(exportEnd.value) && exportStart.value <= exportEnd.value);
const canExport = computed(() => exportPeriodValid.value);
function showAllDateRange() {
  exportStart.value = allDateRange.value.start;
  exportEnd.value = allDateRange.value.end;
}
function browseLoaded(pagination?: Record<string, any>) {
  if (appliedPeriod.value) return;
  const start = String(pagination?.date_start ?? '').slice(0, 10);
  const end = String(pagination?.date_end ?? '').slice(0, 10);
  allDateRange.value = { start: validExportDate(start) ? start : '', end: validExportDate(end) ? end : '' };
  showAllDateRange();
}
async function applyPeriod() {
  if (!exportPeriodValid.value || exporting.value) return;
  appliedPeriod.value = { start_date: exportStart.value, end_date: exportEnd.value };
  await nextTick();
  browse.value?.refresh();
}
async function allDates() {
  if (exporting.value) return;
  appliedPeriod.value = null;
  showAllDateRange();
  await nextTick();
  browse.value?.refresh();
}
async function exportPengajuan() {
  if (exporting.value || !canExport.value) return;
  exporting.value = true;
  try {
    const params = new URLSearchParams({ start_date: exportStart.value, end_date: exportEnd.value });
    await downloadFile(`/transaksi/pinjaman/export-pengajuan?${params}`, "Pengajuan-Pinjaman.xlsx");
    toast.success("Excel pengajuan pinjaman berhasil diunduh.");
  } catch (err) {
    let message = getErrorMessage(err, "Gagal mengunduh pengajuan pinjaman.");
    const body = (err as { response?: { data?: unknown } }).response?.data;
    if (body instanceof Blob) {
      try { message = JSON.parse(await body.text()).message || message; } catch { /* Non-JSON download error. */ }
    }
    toast.error(message);
  } finally { exporting.value = false; }
}
const browse = ref<{ refresh: () => void; refreshAfterDelete: () => void } | null>(null);
// Keep cached browse rows and its load-start summary fresh even while a form is open.
watch(pinjamanRevision, () => browse.value?.refresh());
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
  { key: "Tanggal", label: "TGL", width: "105px", type: "date" },
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
  if (column.key === "Tanggal") {
    return formatTanggal(value);
  }
  if (column.key === "Cicilan") return `${value}x`;
  return text ?? String(value);
}
</script>

<template>
  <section class="pinjaman-page">
    <div class="loan-summary" aria-live="polite">
      <div><span>Plafon Perusahaan</span><strong>{{ rupiah(summary?.plafon ?? 30000000) }}</strong></div>
      <div><span>Pinjaman Berjalan</span><strong>{{ rupiah(summary?.outstanding) }}</strong></div>
      <div><span>Sisa Plafon</span><strong>{{ rupiah(summary?.sisa_plafon) }}</strong></div>
    </div>
    <p v-if="summaryError" role="alert">Ringkasan gagal dimuat. Klik Refresh untuk mencoba kembali.</p>
    <p v-else-if="summaryLoading" role="status">Memuat ringkasan…</p>
    <BaseBrowse ref="browse" module-title="Pinjaman" endpoint="/transaksi/pinjaman"
      :columns="columns" :extra-query="periodQuery" primary-key="Nomor" refresh-on-activate compact expandable row-number-label="NO" row-number-after-first-column :can-delete="false" :exportable="false"
      :add-form-path="auth.can('frmPinjam', 'insert') ? '/transaksi/pinjaman/form' : undefined"
      :edit-form-path="auth.can('frmPinjam', 'edit') ? '/transaksi/pinjaman/form' : undefined"
      search-placeholder="Cari nomor / NIK / nama / bagian / bank / rekening..." @load-start="refreshSummary" @load-error="browseFailed" @loaded="browseLoaded">
      <template #toolbar-before-search>
        <div class="loan-period">
          <div class="period-fields" role="group" aria-label="Periode pinjaman">
            <div class="date-field"><label for="loan-export-start">DARI</label><DateInput id="loan-export-start" v-model="exportStart" :max="exportEnd || undefined" :disabled="exporting" @change="applyPeriod" /></div>
            <div class="date-field"><label for="loan-export-end">SAMPAI</label><DateInput id="loan-export-end" v-model="exportEnd" :min="exportStart || undefined" :disabled="exporting" @change="applyPeriod" /></div>
            <button type="button" class="all-dates-button" :class="{ active: !appliedPeriod }" :aria-pressed="!appliedPeriod" :disabled="exporting" @click="allDates"><MsIcon v-if="!appliedPeriod" name="check" :size="14" />Semua periode</button>
          </div>
          <span v-if="(exportStart || exportEnd) && !exportPeriodValid" class="period-error" role="alert">Rentang tanggal tidak valid.</span>
        </div>
      </template>
      <template #toolbar-actions="{ addNew, addFormPath, addLabel }">
        <div class="loan-toolbar-actions" role="group" aria-label="Aksi pinjaman">
          <button type="button" class="export-button" :disabled="exporting || !canExport" :title="canExport ? 'Export seluruh pinjaman dalam rentang DARI–SAMPAI; pencarian dan filter kolom tidak diterapkan' : 'Pilih rentang tanggal yang valid terlebih dahulu'" @click="exportPengajuan"><MsIcon name="download" :size="16" />{{ exporting ? 'Menyiapkan…' : 'Export Pengajuan' }}</button>
          <button v-if="addFormPath" type="button" class="tool-btn primary" @click="addNew"><MsIcon name="add" :size="15" /><span>{{ addLabel }}</span></button>
        </div>
      </template>
      <template #cell="{ row, column, text }">
        <span v-if="money.has(column.key) && display(row, column, text).startsWith('Rp')" class="loan-money-cell"><span>Rp</span><span>{{ display(row, column, text).slice(2) }}</span></span>
        <template v-else>{{ display(row, column, text) }}</template>
      </template>
      <template #expanded-row="{ row }"><PinjamanSchedule :rows="row.Potongan || []" :show-title="false" /></template>
      <template #row-actions="{ row }">
        <button type="button" class="detail-button" @click="openDetail(row)">Detail</button>
      </template>
      <template #row-actions-end="{ row }">
        <button v-if="auth.can('frmPinjam', 'delete')" type="button" class="delete-button" :title="row.potong1_diproses_pada != null || row.potong2_diproses_pada != null ? 'Pinjaman sudah memiliki pelunasan yang diproses' : 'Hapus permanen'" aria-label="Hapus permanen pinjaman" :disabled="deleting || row.potong1_diproses_pada != null || row.potong2_diproses_pada != null" @click="requestDelete(row)"><MsIcon name="delete" :size="14" /></button>
      </template>
    </BaseBrowse>
    <Teleport to="body">
      <div v-if="deleteOpen" class="loan-overlay" @click.self="closeDelete" @keydown.esc="closeDelete">
        <section class="loan-dialog loan-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="loan-delete-title" aria-describedby="loan-delete-warning" :aria-busy="deleteLoading || deleting">
          <header>
            <span class="delete-heading-icon"><MsIcon name="delete_forever" :size="24" /></span>
            <div class="delete-heading"><h2 id="loan-delete-title">Hapus pinjaman permanen?</h2><p>Periksa data pinjaman sebelum melanjutkan.</p></div>
            <button type="button" class="close-button" aria-label="Tutup verifikasi hapus" :disabled="deleting" @click="closeDelete"><MsIcon name="close" :size="20" /></button>
          </header>
          <div id="loan-delete-warning" class="delete-warning" role="alert">
            <MsIcon name="warning" :size="20" />
            <div><strong>Data yang dihapus tidak dapat dipulihkan.</strong><p>Seluruh histori pinjaman, termasuk pinjaman lunas, akan dihapus. Pastikan dampaknya terhadap potongan gaji sudah diverifikasi.</p></div>
          </div>
          <p v-if="deleteLoading" class="delete-state" role="status">Memuat data terbaru…</p>
          <template v-else-if="deleteTarget">
            <div class="delete-record">
              <dl class="delete-identity">
                <div><dt>Nomor pinjaman</dt><dd>{{ deleteTarget.Nomor }}</dd></div>
                <div><dt>Status</dt><dd><span class="status-badge" :class="{ 'status-outstanding': deleteTarget.Status === 'Belum Lunas', 'status-paid': deleteTarget.Status === 'Lunas' }">{{ deleteTarget.Status || '—' }}</span></dd></div>
                <div class="delete-employee"><dt>Karyawan</dt><dd>{{ deleteTarget.Nama || '—' }}<span>NIK {{ deleteTarget.Nik }}</span></dd></div>
              </dl>
              <dl class="delete-amounts">
                <div><dt>Nominal pinjaman</dt><dd>{{ rupiah(deleteTarget.Pinjam) }}</dd></div>
                <div><dt>Sudah dibayar</dt><dd>{{ rupiah(deleteTarget.Bayar) }}</dd></div>
                <div><dt>Sisa pinjaman</dt><dd>{{ rupiah(deleteTarget.SisaBayar) }}</dd></div>
              </dl>
            </div>
            <div class="delete-verification">
              <label for="loan-delete-verification">Ketik <strong>{{ deleteTarget.Nomor }}</strong> untuk konfirmasi</label>
              <input id="loan-delete-verification" v-model="deleteVerification" type="text" :placeholder="deleteTarget.Nomor" :disabled="deleting" autocomplete="off" autocapitalize="off" :spellcheck="false" aria-describedby="loan-delete-hint" />
              <p id="loan-delete-hint" :class="{ 'verification-matched': deleteVerification === deleteTarget.Nomor }" aria-live="polite"><MsIcon :name="deleteVerification === deleteTarget.Nomor ? 'check_circle' : 'info'" :size="15" />{{ deleteVerification === deleteTarget.Nomor ? 'Nomor sesuai. Penghapusan dapat dilanjutkan.' : 'Nomor harus sama persis untuk mengaktifkan tombol hapus.' }}</p>
            </div>
          </template>
          <p v-else class="delete-state" role="alert">Data tidak dapat dimuat. Tutup dialog dan coba kembali.</p>
          <footer class="delete-actions">
            <button type="button" class="delete-cancel" :disabled="deleting" @click="closeDelete">Batal</button>
            <button type="button" class="delete-confirm" :disabled="deleting || deleteLoading || !deleteTarget || deleteVerification !== deleteTarget.Nomor" @click="confirmPermanentDelete"><MsIcon name="delete_forever" :size="18" />{{ deleting ? 'Menghapus…' : 'Hapus Permanen' }}</button>
          </footer>
        </section>
      </div>
      <div v-if="detailOpen" class="loan-overlay" @click.self="closeDetail" @keydown.esc="closeDetail">
        <section class="loan-dialog loan-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="loan-detail-title" tabindex="-1">
          <header><h2 id="loan-detail-title">Detail Pinjaman</h2><button type="button" class="close-button" aria-label="Tutup Detail Pinjaman" title="Tutup" autofocus @click="closeDetail"><MsIcon name="close" :size="22" /></button></header>
          <p v-if="detailLoading" role="status">Memuat detail…</p>
           <template v-else-if="detail">
             <dl class="transaction-info" aria-label="Informasi transaksi">
               <div><dt>Nomor Pinjaman</dt><dd>{{ detail.Nomor || '—' }}</dd></div>
               <div v-for="col in columns.filter(item => item.key === 'Tanggal')" :key="col.key"><dt>Tanggal Pinjaman</dt><dd>{{ display(detail, col) }}</dd></div>
             </dl>
               <section class="employee-card" aria-label="Data karyawan">
                 <dl>
                   <div v-for="employeeCol in columns.filter(item => ['Nik', 'Nama', 'Pabrik', 'Bagian'].includes(item.key))" :key="employeeCol.key" class="employee-field">
                     <dt>{{ employeeCol.label }}</dt><dd>{{ display(detail, employeeCol) }}</dd>
                   </div>
                </dl>
              </section>
             <dl class="loan-data" aria-label="Data pinjaman">
               <div v-for="col in columns.filter(item => !['Tanggal', 'Nik', 'Nama', 'Pabrik', 'Bagian'].includes(item.key))" :key="col.key"><dt>{{ col.label }}</dt><dd>{{ display(detail, col) }}</dd></div>
               <div class="loan-status"><dt>Status</dt><dd><span class="status-badge" :class="{ 'status-outstanding': detail.Status === 'Belum Lunas', 'status-paid': detail.Status === 'Lunas' }">{{ detail.Status || '—' }}</span></dd></div>
             </dl>
           </template>
          <p v-else>Detail tidak dapat dimuat.</p>
          <PinjamanSchedule v-if="detail && !detailLoading" class="detail-schedule" :rows="detail.Potongan || []" />
           <small class="detail-footnote">Read-only. Periode adalah rencana potongan, bukan histori pembayaran.</small>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.loan-money-cell { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; width: 100%; white-space: nowrap; font-variant-numeric: tabular-nums; }
.pinjaman-page { height: 100%; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.pinjaman-page > .loan-summary, .pinjaman-page > p { flex-shrink: 0; }
.pinjaman-page > :deep(.browse-panel) { flex: 1; height: auto; min-height: 0; }
.loan-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 10px; }
.loan-period { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; min-width: 0; }
.period-fields { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 4px 6px; border: 1px solid var(--ds-border, #c3cad4); background: var(--ds-surface-raised, white); min-width: 0; }
.date-field { display: flex; align-items: center; gap: 4px; }
.loan-period label { font-size: 10px; font-weight: 700; color: var(--ds-text-secondary, #55637a); }
.loan-period :deep(input[type="text"]) { height: 32px; box-sizing: border-box; width: 130px; min-width: 0; padding: 0 28px 0 4px; color: var(--ds-text, #263238); background: var(--ds-surface-raised, white); border: 1px solid var(--ds-border, #c3cad4); border-radius: 8px; font: inherit; font-size: 11px; }
.all-dates-button { display: inline-flex; align-items: center; justify-content: center; gap: 4px; height: 32px; box-sizing: border-box; padding: 0 10px; cursor: pointer; border: 1px solid var(--ds-border, #dde3ec); border-radius: 999px; background: var(--ds-surface-raised, white); color: var(--ds-text-secondary, #55637a); font: inherit; font-size: 11px; font-weight: 600; white-space: nowrap; }
.all-dates-button.active { color: var(--ds-success, #15803d); border-color: color-mix(in srgb, var(--ds-success, #15803d) 65%, var(--ds-border)); background: color-mix(in srgb, var(--ds-success, #15803d) 10%, var(--ds-surface-raised, white)); }
/* Pengecualian lokal terhadap aturan global .app-shell * zero-radius. */
.pinjaman-page .all-dates-button { border-radius: 999px !important; }
.all-dates-button:not(:disabled):hover { border-color: var(--ds-success, #15803d); background: color-mix(in srgb, var(--ds-success, #15803d) 14%, var(--ds-surface-raised, white)); }
.loan-toolbar-actions { display: flex; align-items: center; flex-wrap: nowrap; flex: 0 0 auto; gap: 8px; margin-left: auto; }
.export-button, .loan-toolbar-actions .tool-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 32px; box-sizing: border-box; padding: 0 10px; cursor: pointer; border: 1px solid var(--ds-border, #dde3ec); border-radius: 8px; font: inherit; font-size: 11px; font-weight: 700; white-space: nowrap; }
.export-button { background: var(--ds-surface-raised, white); color: var(--ds-text, #263238); }
.export-button:not(:disabled):hover { background: var(--ds-surface-inset, #e8edf4); }
.loan-toolbar-actions .tool-btn.primary { background: var(--ds-action, #3b5998); border-color: var(--ds-action, #3b5998); color: white; }
.loan-toolbar-actions .tool-btn.primary:hover { background: var(--ds-primary-darken-1, #2c4472); }
.loan-period :deep(input:focus-visible), .all-dates-button:focus-visible, .export-button:focus-visible, .loan-toolbar-actions .tool-btn:focus-visible { outline: 2px solid var(--ds-primary, #3b5998); outline-offset: -2px; }
.export-button:disabled { opacity: .5; cursor: not-allowed; }
.period-error { color: var(--ds-error, #dc2626); font-size: 12px; }
:deep(.toolbar) { flex-direction: column; align-items: stretch; }
:deep(.toolbar-right) { justify-content: flex-start; align-items: center; flex-wrap: wrap; gap: 6px; min-width: 0; width: 100%; }
:deep(.search-box) { flex: 1 1 100px; min-width: 100px; height: 32px; box-sizing: border-box; background: var(--ds-surface-raised, white); }
:deep(.search-box input) { width: 100%; min-width: 0; color: var(--ds-text, #263238); }
:deep(.search-box:focus-within) { outline: none; border-color: var(--ds-primary, #3b5998); box-shadow: inset 0 0 0 1px var(--ds-primary, #3b5998); }
:deep(.toolbar-right > .tool-btn) { height: 32px; box-sizing: border-box; flex: 0 0 auto; }
:deep(.toolbar-right > .tool-btn:focus-visible) { outline: 2px solid var(--ds-primary, #3b5998); outline-offset: -2px; }
:deep(.toolbar-left) { flex-wrap: wrap; min-width: 0; }
:deep(.row-actions) { align-items: center; }
@media (max-width: 600px) {
  .loan-period { flex-basis: 100%; }
  .period-fields { flex-wrap: wrap; }
  .loan-toolbar-actions { margin-left: auto; }
}
.loan-summary > div { background: var(--ds-surface, white); border: 1px solid var(--ds-border, #dde3ec); padding: 8px 14px; }
/* Radius lokal tetap berlaku meskipun app-shell mengatur zero-radius global. */
.pinjaman-page .loan-summary > div { border-radius: 14px !important; }
.loan-summary span { display: block; font-size: 11px; line-height: 1.3; margin-bottom: 3px; }
.loan-summary strong { display: block; font-size: 18px; line-height: 1.3; overflow-wrap: anywhere; }
.detail-button, .loan-dialog button { cursor: pointer; padding: 6px 10px; border: 1px solid var(--ds-border, #dde3ec); border-radius: 5px; background: var(--ds-surface, white); color: inherit; }
.detail-button { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; box-sizing: border-box; height: 32px; padding: 0 10px; border-radius: 6px; font-size: 11px; line-height: 1; white-space: nowrap; }
.detail-button, .delete-button { transition: background-color 150ms ease; }
.detail-button:not(:disabled):is(:hover, :focus-visible) { background: rgba(59, 89, 152, 0.14); }
.delete-button:not(:disabled):is(:hover, :focus-visible) { background: rgba(220, 38, 38, 0.12); }
.detail-button:focus-visible, .delete-button:focus-visible { outline: 2px solid currentColor; outline-offset: 1px; }
@media (prefers-reduced-motion: reduce) {
  .detail-button, .delete-button { transition: none; }
}
.loan-overlay { position: fixed; inset: 0; background: #0008; z-index: 2000; display: grid; place-items: center; padding: 20px; }
.loan-dialog { background: var(--ds-surface, white); color: var(--ds-text, #263238); border-radius: 10px; padding: 24px; width: min(720px, 100%); max-height: 90vh; overflow: auto; }
.loan-dialog header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.loan-dialog h2 { font-size: 18px; }
.detail-schedule { margin: 12px 0; }
.delete-warning, .loan-dialog .delete-button, .delete-button { color: var(--ds-error, #dc2626); }
.delete-button { box-sizing: border-box; line-height: 1; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 36px; height: 32px; cursor: pointer; padding: 0; border: 1px solid currentColor; border-radius: 6px; background: var(--ds-surface, white); }
button:disabled { opacity: .5; cursor: not-allowed; }
.loan-dialog .close-button { display: inline-flex; align-items: center; justify-content: center; padding: 6px; color: var(--ds-error, #dc2626); border-color: transparent; background: transparent; }
.loan-dialog .close-button:hover { background: var(--ds-surface-inset, #fee2e2); }
.loan-dialog dl { display: grid; grid-template-columns: 160px 1fr; gap: 10px 16px; }
.loan-dialog dd { margin: 0; overflow-wrap: anywhere; }
.loan-dialog dt { font-weight: 600; }
@media (max-width: 600px) { .loan-summary { grid-template-columns: 1fr; } .loan-dialog dl { grid-template-columns: 1fr; } }
.loan-delete-dialog { box-sizing: border-box; width: min(560px, 100%); max-height: 90dvh; padding: 24px; font-size: 13px; line-height: 1.5; }
.loan-delete-dialog > header { align-items: flex-start; gap: 12px; }
.delete-heading-icon { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 44px; height: 44px; border-radius: 12px; color: var(--ds-error, #dc2626); background: color-mix(in srgb, var(--ds-error, #dc2626) 10%, var(--ds-surface-raised, white)); }
.delete-heading { flex: 1; min-width: 0; }
.delete-heading p { margin: 4px 0 0; color: var(--ds-text-secondary, #5a6a7e); font-size: 12px; }
.loan-delete-dialog .close-button { color: var(--ds-text-secondary, #5a6a7e); flex-shrink: 0; }
.loan-delete-dialog .delete-warning { display: flex; align-items: flex-start; gap: 10px; margin: 0 0 20px; padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--ds-error, #dc2626) 22%, transparent); border-radius: 10px; background: color-mix(in srgb, var(--ds-error, #dc2626) 6%, var(--ds-surface-raised, white)); color: var(--ds-text, #1b2d4a); }
.delete-warning > .ms-icon { margin-top: 1px; color: var(--ds-error, #dc2626); }
.delete-warning strong { font-size: 12px; }
.delete-warning p { margin: 4px 0 0; font-size: 12px; line-height: 1.6; color: var(--ds-text-secondary, #5a6a7e); }
.delete-record { overflow: hidden; border: 1px solid var(--ds-border-light, #dde3ec); border-radius: 12px; background: var(--ds-surface-raised, white); }
.loan-delete-dialog dl { margin: 0; gap: 16px; }
.loan-delete-dialog dt { margin: 0 0 4px; color: var(--ds-text-secondary, #5a6a7e); font-size: 11px; font-weight: 500; }
.loan-delete-dialog dd { font-weight: 650; font-size: 13px; }
.loan-delete-dialog .delete-identity { padding: 16px; grid-template-columns: minmax(0, 1fr) auto; align-items: start; }
.delete-employee { grid-column: 1 / -1; }
.delete-employee dd > span { display: block; margin-top: 2px; color: var(--ds-text-secondary, #5a6a7e); font-size: 11px; font-weight: 400; }
.loan-delete-dialog .delete-amounts { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; padding: 14px 16px; border-top: 1px solid var(--ds-border-light, #dde3ec); background: color-mix(in srgb, var(--ds-surface, #f0f3f8) 65%, var(--ds-surface-raised, white)); }
.delete-amounts dd { font-variant-numeric: tabular-nums; }
.delete-amounts > div:last-child dd { color: var(--ds-error, #dc2626); }
.delete-verification { display: flex; flex-direction: column; gap: 8px; margin: 20px 0 0; }
.delete-verification label { font-size: 12px; }
.delete-verification label strong { white-space: nowrap; }
.delete-verification input { box-sizing: border-box; width: 100%; min-width: 0; height: 42px; padding: 0 12px; background: var(--ds-surface-raised, white); color: inherit; border: 1px solid var(--ds-border, #a0aab8); border-radius: 8px; font: inherit; }
.delete-verification input::placeholder { color: var(--ds-text-muted, #8494a7); }
.delete-verification p { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 11px; color: var(--ds-text-secondary, #5a6a7e); }
.delete-verification .verification-matched { color: var(--ds-success, #15803d); }
.delete-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--ds-border-light, #dde3ec); }
.loan-delete-dialog .delete-actions button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 40px; padding: 8px 16px; border-radius: 8px; font: inherit; font-size: 12px; font-weight: 600; }
.loan-delete-dialog .delete-cancel { background: var(--ds-surface-raised, white); }
.loan-delete-dialog .delete-cancel:not(:disabled):hover { background: var(--ds-surface-inset, #e0e4ea); }
.loan-delete-dialog .delete-confirm { border-color: #dc2626; background: #dc2626; color: white; }
.loan-delete-dialog .delete-confirm:not(:disabled):hover { background: #b91c1c; border-color: #b91c1c; }
.loan-delete-dialog .delete-confirm:disabled { opacity: 1; background: var(--ds-surface-inset, #e0e4ea); border-color: var(--ds-border-light, #dde3ec); color: var(--ds-text-secondary, #5a6a7e); }
.loan-delete-dialog :is(input, button):focus-visible { outline: 2px solid var(--ds-primary, #1b5e9e); outline-offset: 3px; }
.delete-state { padding: 20px 0; color: var(--ds-text-secondary, #5a6a7e); }
@media (max-width: 480px) {
  .loan-delete-dialog { padding: 18px; }
  .delete-heading-icon { width: 36px; height: 36px; }
  .loan-delete-dialog .delete-identity { gap: 12px; }
  .loan-delete-dialog .delete-amounts { grid-template-columns: minmax(0, 1fr); gap: 10px; }
  .delete-amounts > div { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .delete-amounts dt { margin: 0; }
  .delete-actions > button { flex: 1; }
}
/* Detail-only layout: shared browse, delete dialog and schedule stay unchanged. */
.loan-detail-dialog { box-sizing: border-box; width: min(680px, 100%); max-height: 90dvh; padding: 20px; display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.loan-detail-dialog > header { flex-shrink: 0; }
.loan-detail-dialog h2 { margin: 0; font-size: 19px; line-height: 1.4; }
.loan-detail-dialog dl { margin: 0; min-width: 0; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 24px; }
.loan-detail-dialog dl > div { min-width: 0; }
.loan-detail-dialog dt { margin: 0 0 4px; font-size: 10px; line-height: 1.4; font-weight: 600; letter-spacing: .02em; color: var(--ds-text-secondary, #55637a); }
.loan-detail-dialog dd { font-size: 13px; line-height: 1.45; font-weight: 600; overflow-wrap: anywhere; }
.loan-detail-dialog .transaction-info { grid-template-columns: minmax(0, 1fr); gap: 8px; }
.transaction-info > div { display: grid; grid-template-columns: 140px minmax(0, 1fr); align-items: baseline; gap: 12px; }
.loan-detail-dialog .transaction-info dt { margin: 0; font-size: 12px; letter-spacing: 0; }
.loan-detail-dialog .employee-card { min-width: 0; padding: 12px 14px; border: 1px solid var(--ds-border-light, #dde3ec); border-radius: 12px; background: var(--ds-surface-raised, #fff); }
.loan-detail-dialog .employee-card dl { grid-template-rows: repeat(2, auto); grid-auto-flow: column; }
.loan-detail-dialog .loan-data { padding: 0 15px; }
.loan-status { grid-column: 1 / -1; }
.status-badge { display: inline-block; padding: 3px 9px; border: 1px solid var(--ds-border-light, #dde3ec); border-radius: 999px; background: var(--ds-surface-inset, #eef1f6); color: var(--ds-text-secondary, #55637a); font-size: 11px; line-height: 1.4; }
.status-badge.status-outstanding { background: #fef3c7; border-color: #f3d577; color: #854d0e; }
.status-badge.status-paid { background: #dcfce7; border-color: #86d5a0; color: #166534; }
:global(:root[data-theme="dark"]) .status-badge.status-outstanding { background: #443719; border-color: #79612b; color: #fde68a; }
:global(:root[data-theme="dark"]) .status-badge.status-paid { background: #193c2e; border-color: #30664a; color: #a7f3c1; }
.loan-detail-dialog .detail-schedule { margin: 0; }
.detail-schedule :deep(h3) { margin-bottom: 8px; font-size: 13px; }
.detail-schedule :deep(.schedule-scroll) { border-radius: 10px; box-shadow: 0 2px 8px rgb(0 0 0 / 5%); }
.detail-schedule :deep(table) { table-layout: fixed; }
.detail-schedule :deep(th), .detail-schedule :deep(td) { padding: 7px 12px; overflow-wrap: anywhere; }
.detail-schedule :deep(.amount) { white-space: normal; font-variant-numeric: tabular-nums; }
.detail-schedule :deep(thead), .detail-schedule :deep(tfoot) { background: var(--ds-surface-inset, #eef1f6); }
.detail-schedule :deep(tfoot td) { font-weight: 800; }
.detail-footnote { color: var(--ds-text-muted, #6b7a90); font-size: 10px; line-height: 1.5; }
@media (max-width: 600px) {
  .loan-detail-dialog { padding: 16px; gap: 14px; }
  .loan-detail-dialog dl { grid-template-columns: minmax(0, 1fr); }
  .loan-detail-dialog .employee-card dl { grid-template-rows: none; grid-auto-flow: row; }
  .transaction-info > div { grid-template-columns: minmax(0, 1fr); gap: 4px; }
  .loan-detail-dialog .loan-data { padding: 0 15px; }
  .detail-schedule :deep(th), .detail-schedule :deep(td) { padding: 7px 8px; }
}
</style>
