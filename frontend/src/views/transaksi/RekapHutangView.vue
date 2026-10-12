<script setup lang="ts">
import { ref } from "vue";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { rupiah } from "@/utils/pinjaman";
import type { BrowseColumn } from "@/types";

type Totals = { jumlah: number; pinjam: number; bayar: number; sisa: number };
type Balance = Totals & { plafon: number; sisa_plafon: number; saldo_tidak_diketahui: number };
const balance = ref<Balance | null>(null);
const filtered = ref<Totals | null>(null);
const failed = ref(false);
function clearSummary() { balance.value = null; filtered.value = null; failed.value = false; }
function loaded(pagination?: Record<string, any>) {
  balance.value = pagination?.saldo_saat_ini ?? null;
  filtered.value = pagination?.hasil_filter ?? null;
}
function loadError() { clearSummary(); failed.value = true; }
const columns: BrowseColumn[] = [
  { key: "Nomor", label: "NOMOR PINJAMAN", width: "150px" },
  { key: "Tanggal", label: "TANGGAL", type: "date", width: "105px" },
  { key: "Nik", label: "NIK", width: "115px" },
  { key: "Nama", label: "NAMA KARYAWAN", width: "190px" },
  { key: "Pabrik", label: "PABRIK", width: "75px" },
  { key: "Bagian", label: "BAGIAN", width: "130px" },
  { key: "Pinjam", label: "NOMINAL PINJAMAN", align: "right", width: "155px" },
  { key: "Bayar", label: "SUDAH DIBAYAR", align: "right", width: "145px" },
  { key: "SisaBayar", label: "SISA HUTANG", align: "right", width: "145px" },
];
const money = new Set(["Pinjam", "Bayar", "SisaBayar"]);
</script>

<template>
  <section class="debt-report">
    <BaseBrowse class="debt-browse" module-title="Rekap Hutang" module-subtitle="Laporan read-only · saldo pinjaman terkini"
      endpoint="/transaksi/pinjaman/rekap-hutang" primary-key="Nomor" :columns="columns"
      search-placeholder="Cari nomor pinjaman, NIK, nama, pabrik, bagian..." :show-actions="false" :can-delete="false"
      compact scrollable-header row-number-label="NO" export-name="Rekap-Hutang" @load-start="clearSummary" @loaded="loaded" @load-error="loadError">
    <template #scroll-header>
    <section class="current-balance" aria-label="Saldo saat ini" aria-live="polite">
      <h2>Saldo saat ini — seluruh pinjaman aktif</h2>
      <p class="description">Per nomor pinjaman dengan sisa hutang &gt; 0, termasuk karyawan nonaktif. Bukan saldo historis per periode.</p>
      <p v-if="failed" role="alert">Saldo gagal dimuat. Klik Refresh untuk mencoba kembali.</p>
      <dl class="balance-grid">
        <div><dt>Pinjaman aktif</dt><dd>{{ balance?.jumlah ?? '—' }}</dd></div>
        <div><dt>Total nominal pinjaman aktif</dt><dd>{{ rupiah(balance?.pinjam) }}</dd></div>
        <div><dt>Sudah dibayar (pinjaman aktif)</dt><dd>{{ rupiah(balance?.bayar) }}</dd></div>
        <div class="outstanding"><dt>Sisa hutang saat ini</dt><dd>{{ rupiah(balance?.sisa) }}</dd></div>
        <div><dt>Plafon perusahaan</dt><dd>{{ rupiah(balance?.plafon) }}</dd></div>
        <div><dt>Sisa plafon perusahaan</dt><dd>{{ rupiah(balance?.sisa_plafon) }}</dd></div>
      </dl>
      <p v-if="balance?.saldo_tidak_diketahui" class="unknown" role="status">{{ balance.saldo_tidak_diketahui }} dokumen memiliki saldo tidak diketahui (nominal atau pembayaran kosong), tidak termasuk tabel dan total. Tidak dianggap lunas.</p>
    </section>
    </template>
      <template #toolbar-extra>
        <div v-if="filtered" class="filtered-total" aria-live="polite">
          <strong>Total hasil filter (seluruh halaman): {{ filtered.jumlah }} pinjaman</strong>
          <span>Nominal: {{ rupiah(filtered.pinjam) }}</span><span>Dibayar: {{ rupiah(filtered.bayar) }}</span>
          <span>Sisa hutang: <strong>{{ rupiah(filtered.sisa) }}</strong></span>
        </div>
      </template>
      <template #cell="{ row, column, text }"><span v-if="money.has(column.key)">{{ rupiah(row[column.key]) }}</span><template v-else>{{ text }}</template></template>
    </BaseBrowse>
  </section>
</template>

<style scoped>
.debt-report { display: flex; flex-direction: column; gap: 12px; height: 100%; min-height: 0; min-width: 0; overflow: hidden; color: var(--ds-text); }
/* Keep toolbar and pagination outside the table's existing scroll container. */
.debt-browse { flex: 1; height: auto; min-height: 0; }
.current-balance { box-sizing: border-box; padding: 14px 16px; background: var(--ds-surface-raised); border: 1px solid var(--ds-border); }
.current-balance h2 { font-size: 14px; margin: 0 0 4px; }
.description { font-size: 11px; color: var(--ds-text-muted, var(--ds-text)); margin: 0 0 12px; }
.balance-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px 20px; margin: 0; }
.balance-grid dt { font-size: 11px; color: var(--ds-text-muted, var(--ds-text)); }
.balance-grid dd { font-size: 15px; font-weight: 700; margin: 4px 0 0; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.outstanding dd { color: var(--ds-primary); }
.unknown { font-size: 11px; margin: 12px 0 0; color: var(--ds-text); }
.filtered-total { display: flex; gap: 8px 16px; flex-wrap: wrap; font-size: 11px; padding: 6px 0; }
@media (max-width: 700px) { .balance-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 420px) { .balance-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
