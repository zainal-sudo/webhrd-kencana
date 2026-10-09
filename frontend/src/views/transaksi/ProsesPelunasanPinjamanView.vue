<script setup lang="ts">
import { computed, onActivated, onMounted, ref, watch } from 'vue';
import { useToast } from 'vue-toastification';
import MsIcon from '@/components/MsIcon.vue';
import { api, getErrorMessage } from '@/api/axios';
import { useAuthStore } from '@/stores/authStore';
import { rupiah } from '@/utils/pinjaman';

interface PotonganRow {
  Key: string; Nomor: string; Nik: string; Nama: string | null;
  Pinjam: number | null; Bayar: number | null; SisaBayar: number | null;
  PotonganKe: number; Potongan: number; DiprosesPada: string | null; StatusProses: string;
}
const auth = useAuthStore(), toast = useToast();
const bulanNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const now = new Date();
const bulan = ref(now.getMonth() + 1), tahun = ref(now.getFullYear());
const years = Array.from({ length: now.getFullYear() + 6 - 2000 }, (_, i) => now.getFullYear() + 5 - i);
const search = ref(''), rows = ref<PotonganRow[]>([]), selected = ref(new Set<string>());
const page = ref(1), lastPage = ref(1), total = ref(0);
const loading = ref(false), processing = ref(false), ready = ref(false), loadError = ref(false);
const canProcess = computed(() => auth.can('frmBayar', 'insert'));
const periode = computed(() => `${bulanNames[bulan.value - 1]} ${tahun.value}`);
let request = 0, firstActivation = true;
function eligible(row: PotonganRow) {
  return row.DiprosesPada == null && row.Bayar != null && Number(row.Bayar) >= 0
    && row.SisaBayar != null && Number.isFinite(Number(row.Potongan)) && Number(row.Potongan) > 0
    && Number(row.Potongan) <= Number(row.SisaBayar);
}
const available = computed(() => rows.value.filter(eligible));
const chosen = computed(() => rows.value.filter(row => selected.value.has(row.Key) && eligible(row)));
const amount = computed(() => chosen.value.reduce((sum, row) => sum + Number(row.Potongan), 0));
const allSelected = computed(() => available.value.length > 0 && available.value.every(row => selected.value.has(row.Key)));
function toggle(row: PotonganRow) {
  if (!canProcess.value || processing.value || loading.value || !ready.value || !eligible(row)) return;
  const next = new Set(selected.value);
  if (next.has(row.Key)) next.delete(row.Key); else next.add(row.Key);
  selected.value = next;
}
function selectAll() {
  if (!canProcess.value || processing.value || loading.value || !ready.value) return;
  selected.value = allSelected.value ? new Set() : new Set(available.value.map(row => row.Key));
}
async function load(target = 1) {
  const current = ++request;
  selected.value = new Set(); ready.value = false; loading.value = true; loadError.value = false;
  try {
    const { data } = await api.get('/transaksi/pinjaman/pelunasan', { params: { bulan: bulan.value, tahun: tahun.value, search: search.value, page: target, per_page: 25 } });
    if (current !== request) return;
    rows.value = data.data || []; page.value = data.pagination.page;
    lastPage.value = data.pagination.last_page; total.value = data.pagination.total; ready.value = true;
    if (!rows.value.length && total.value > 0 && target > lastPage.value) await load(lastPage.value);
  } catch (e) {
    if (current === request) { rows.value = []; total.value = 0; loadError.value = true; toast.error(getErrorMessage(e)); }
  } finally { if (current === request) loading.value = false; }
}
function invalidate() {
  ++request; rows.value = []; selected.value = new Set(); ready.value = false;
  loading.value = false; total.value = 0; page.value = 1; lastPage.value = 1;
}
watch([bulan, tahun, search], invalidate);
async function processSelected() {
  if (!canProcess.value || loading.value || processing.value || !ready.value || !chosen.value.length) return;
  const items = chosen.value.map(row => ({ nomor_pinjam: row.Nomor, potongan_ke: row.PotonganKe }));
  const loans = new Set(items.map(item => item.nomor_pinjam)).size;
  if (!window.confirm(`Proses pelunasan ${periode.value} sebesar ${rupiah(amount.value)} untuk ${loans} pinjaman (${items.length} potongan)?\n\nSisa pinjaman akan berkurang dan sisa plafon perusahaan akan bertambah sesuai pembayaran yang berhasil diproses. Plafon maksimum tetap Rp30 juta.`)) return;
  processing.value = true;
  try {
    const { data } = await api.post('/transaksi/pinjaman/pelunasan/proses', { bulan: bulan.value, tahun: tahun.value, items });
    toast.success(`Pelunasan ${data.data.periode} berhasil: ${rupiah(data.data.total)}.`);
    await load(page.value);
  } catch (e) { toast.error(getErrorMessage(e)); await load(page.value); }
  finally { processing.value = false; }
}
onMounted(() => load());
onActivated(() => { if (firstActivation) { firstActivation = false; return; } if (!processing.value) load(page.value); });
</script>

<template>
  <section class="pelunasan-page">
    <header class="page-title"><MsIcon name="payments" :size="22" /><h1>Proses Pelunasan Pinjaman</h1></header>
    <form class="period-tools" @submit.prevent="load()">
      <label>Bulan<select v-model="bulan" :disabled="loading || processing"><option v-for="(name, i) in bulanNames" :key="name" :value="i + 1">{{ name }}</option></select></label>
      <label>Tahun<select v-model="tahun" :disabled="loading || processing"><option v-for="year in years" :key="year" :value="year">{{ year }}</option></select></label>
      <label class="search">Cari<input v-model="search" :disabled="loading || processing" placeholder="NIK / nama / nomor pinjaman" /></label>
      <button type="submit" :disabled="loading || processing"><MsIcon name="refresh" :size="16" />Tampilkan / Refresh</button>
    </form>
    <div class="selection-tools"><span>Dipilih: <strong>{{ chosen.length }}</strong> potongan · Total: <strong>{{ rupiah(amount) }}</strong></span>
      <button v-if="canProcess" class="process-btn" type="button" :disabled="!ready || loading || processing || !chosen.length" @click="processSelected">{{ processing ? 'Memproses…' : 'Proses' }}</button>
    </div>
    <p class="note">Pilihan berlaku untuk halaman ini. Hanya jadwal tersimpan yang dapat diproses; potongan yang sudah diproses tidak dapat dipilih lagi.</p>
    <p v-if="loadError" role="alert">Daftar gagal dimuat. Klik Tampilkan / Refresh untuk mencoba lagi.</p>
    <div class="table-scroll">
      <table><thead><tr>
        <th class="check"><input type="checkbox" aria-label="Pilih semua potongan yang dapat diproses pada halaman ini" :checked="allSelected" :indeterminate="chosen.length > 0 && !allSelected" :disabled="!canProcess || !ready || loading || processing || !available.length" @change="selectAll" /></th>
        <th>NIK</th><th>Nama Karyawan</th><th>Nomor Pinjaman</th><th class="money">Nominal Pinjaman</th><th class="money">Potongan</th><th class="money">Sudah Dibayar</th><th class="money">Sisa Pinjaman</th><th>Status Proses</th>
      </tr></thead><tbody>
        <tr v-if="loading"><td colspan="9" role="status">Memuat {{ periode }}…</td></tr>
        <tr v-else-if="!rows.length"><td colspan="9">{{ ready ? 'Tidak ada jadwal tersimpan untuk periode ini.' : 'Pilih periode lalu klik Tampilkan.' }}</td></tr>
        <tr v-for="row in rows" v-else :key="row.Key" :class="{ processed: row.DiprosesPada != null }">
          <td class="check"><input type="checkbox" :aria-label="`Pilih ${row.Nomor} potongan ke-${row.PotonganKe}`" :checked="selected.has(row.Key)" :disabled="!canProcess || processing || !ready || !eligible(row)" @change="toggle(row)" /></td>
          <td class="nowrap">{{ row.Nik }}</td><td>{{ row.Nama || '—' }}</td><td class="nowrap">{{ row.Nomor }}<small>Potongan ke-{{ row.PotonganKe }}</small></td>
          <td class="money">{{ rupiah(row.Pinjam) }}</td><td class="money">{{ rupiah(row.Potongan) }}</td><td class="money">{{ rupiah(row.Bayar) }}</td><td class="money">{{ rupiah(row.SisaBayar) }}</td>
          <td><span class="status">{{ row.StatusProses }}</span><small v-if="!eligible(row) && row.DiprosesPada == null">Saldo tidak valid / tidak mencukupi</small><small v-if="row.DiprosesPada">{{ row.DiprosesPada.replace('T', ' ').slice(0, 19) }}</small></td>
        </tr>
      </tbody></table>
    </div>
    <footer class="pager"><span>{{ total }} potongan · Halaman {{ page }} / {{ lastPage }}</span><div>
      <button type="button" :disabled="loading || processing || page <= 1" @click="load(page - 1)">Sebelumnya</button>
      <button type="button" :disabled="loading || processing || page >= lastPage" @click="load(page + 1)">Berikutnya</button>
    </div></footer>
  </section>
</template>

<style scoped>
.pelunasan-page { display: flex; flex-direction: column; height: 100%; min-height: 0; gap: 10px; padding: 12px; background: var(--ds-surface-raised); color: var(--ds-text); }
.page-title, .period-tools, .selection-tools, .pager, .pager > div { display: flex; align-items: center; gap: 8px; }
h1 { font-size: 16px; margin: 0; }
.period-tools { flex-wrap: wrap; align-items: end; }
label { display: flex; flex-direction: column; gap: 3px; font-size: 11px; font-weight: 600; }
select, input:not([type=checkbox]) { height: 32px; padding: 0 8px; border: 1px solid var(--ds-border); border-radius: 4px; background: var(--ds-surface-raised); color: var(--ds-text); font-size: 12px; }
.search { flex: 1; min-width: 180px; max-width: 420px; }
button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 32px; padding: 5px 10px; border: 1px solid var(--ds-border); border-radius: 4px; background: var(--ds-surface); color: var(--ds-text); cursor: pointer; }
button:disabled { opacity: .5; cursor: not-allowed; }
.process-btn { background: var(--ds-primary); color: white; border-color: var(--ds-primary); }
.selection-tools, .pager { justify-content: space-between; font-size: 12px; flex-wrap: wrap; }
.note { font-size: 11px; color: var(--ds-text-muted, var(--ds-text)); margin: 0; }
.table-scroll { flex: 1; min-height: 120px; overflow: auto; border: 1px solid var(--ds-border); border-radius: 6px; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th { position: sticky; top: 0; z-index: 1; background: var(--ds-surface-inset); text-align: left; white-space: nowrap; }
th, td { padding: 8px; border-bottom: 1px solid var(--ds-border-light, var(--ds-border)); }
.money { text-align: right; white-space: nowrap; }
.nowrap { white-space: nowrap; }
.check { width: 32px; text-align: center; }
input[type=checkbox] { width: 16px; height: 16px; accent-color: var(--ds-primary); }
small { display: block; font-size: 10px; color: var(--ds-text-muted, var(--ds-text)); margin-top: 3px; }
.processed { background: var(--ds-surface); }
.status { font-size: 11px; font-weight: 600; }
@media (max-width: 600px) { .pelunasan-page { padding: 8px; } .search { max-width: none; flex-basis: 100%; } }
</style>
