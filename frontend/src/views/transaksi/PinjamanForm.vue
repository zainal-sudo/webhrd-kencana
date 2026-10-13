<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
import PinjamanSchedule from "@/components/PinjamanSchedule.vue";
import MsIcon from "@/components/MsIcon.vue";
import FText from "@/components/fields/FText.vue";
import FDate from "@/components/fields/FDate.vue";
import FSelect from "@/components/fields/FSelect.vue";
import KaryawanLookupTable from "@/components/KaryawanLookupTable.vue";
import { useKaryawanLookup } from "@/composables/useKaryawanLookup";
import { useLiveSearch } from "@/composables/useLiveSearch";
import { useTransactionReset } from "@/composables/useTransactionReset";
import { api as sourceApi, getErrorMessage } from "@/api/axios";
import { useAuthStore } from "@/stores/authStore";
import { todaySql, formatTanggal } from "@/utils/format";
import { periodePinjaman, rupiah } from "@/utils/pinjaman";

const auth = useAuthStore();
// Each cached tab owns its document ID; do not follow another tab's route query.
const nomorEdit = String(useRoute().query.id || "");
const isEdit = !!nomorEdit;
const original = ref<Record<string, any> | null>(null);
const toast = useToast();
const values = reactive({ nomor: "", tanggal: todaySql(), nik: "", pinjam: null as string | number | null, angsuran: null as string | number | null, bank: "", norek: "" });
const info = ref<Record<string, any>>({});
const options = ref<{ nominal: number[]; angsuran: number[]; bank: string[] }>({ nominal: [], angsuran: [], bank: [] });
const lookup = useKaryawanLookup("/transaksi/pinjaman/karyawan");
const cariOpen = ref(false);
const keyword = ref("");
const loading = ref(true);
const saving = ref(false);
const ready = ref(false);
const saved = ref(false);
let nomorRequest = 0;
let infoRequest = 0;
const resetState = useTransactionReset({ values, info }, {
  isEdit: () => isEdit,
  blocked: () => loading.value || saving.value || lookup.loading || !ready.value || saved.value,
  afterRestore: () => { ++nomorRequest; ++infoRequest; cariOpen.value = false; keyword.value = ""; lookup.clear(); },
});
const api = resetState.trackApi(sourceApi);
const nominalOptions = computed(() => {
  const list = options.value.nominal.map(value => ({ label: rupiah(value), value }));
  if (isEdit && original.value?.Pinjam != null && !options.value.nominal.includes(Number(original.value.Pinjam))) list.push({ label: `${rupiah(original.value.Pinjam)} (existing)`, value: Number(original.value.Pinjam) });
  return list;
});
const angsuranOptions = computed(() => {
  const list = options.value.angsuran.map(value => ({ label: `${value}x`, value }));
  if (isEdit && original.value?.Cicilan != null && !options.value.angsuran.includes(Number(original.value.Cicilan))) list.push({ label: `${original.value.Cicilan}x (existing)`, value: Number(original.value.Cicilan) });
  return list;
});
const bankOptions = computed(() => {
  const list = options.value.bank.map(value => ({ label: value, value }));
  if (isEdit && original.value) {
    const bank = original.value.Bank ?? "";
    if (!options.value.bank.includes(bank)) list.push({ label: bank || "— (existing)", value: bank });
  }
  return list;
});
const bayar = computed(() => isEdit ? original.value?.Bayar : 0);
const sisa = computed(() => values.pinjam == null || bayar.value == null ? null : Math.max(Number(values.pinjam) - Number(bayar.value), 0));
const processed = computed(() => original.value?.potong1_diproses_pada != null || original.value?.potong2_diproses_pada != null);
const status = computed(() => sisa.value == null ? '—' : sisa.value > 0 ? 'Belum Lunas' : 'Lunas');
const potongan = computed<Array<{ periode: string | null; nominal: number | null }>>(() => {
  const doc = original.value;
  if (doc && values.tanggal === doc.Tanggal && Number(values.pinjam) === Number(doc.Pinjam)
      && Number(values.angsuran) === Number(doc.Cicilan) && Array.isArray(doc.Potongan)) return doc.Potongan;
  const count = Number(values.angsuran);
  if (!Number.isInteger(count) || count <= 0 || count > 1200) return [];
  const labels = periodePinjaman(values.tanggal, count);
  return labels ? labels.split(', ').map(periode => ({ periode, nominal: values.pinjam == null ? null : Number(values.pinjam) / count })) : [];
});
const canSave = computed(() => auth.can("frmPinjam", isEdit ? "edit" : "insert"));
const disabled = computed(() => loading.value || saving.value || saved.value || !ready.value || !canSave.value);

async function previewNomor(required = false) {
  if (isEdit || resetState.restoring.value || saved.value) return;
  const request = ++nomorRequest;
  values.nomor = "";
  if (!values.tanggal) return;
  try {
    const { data } = await api.get("/transaksi/pinjaman/nomor", { params: { tanggal: values.tanggal } });
    if (request === nomorRequest) values.nomor = data.data.nomor;
  } catch (e) {
    if (required) throw e;
    if (request === nomorRequest) toast.error(getErrorMessage(e));
  }
}
async function search() {
  try { await lookup.search(keyword.value, { tanggal: values.tanggal }); } catch { /* Lookup renders its own retry/error. */ }
}
async function selectEmployee(row: Record<string, any>) {
  if (disabled.value || row.BisaDipilih !== true) return;
  const request = ++infoRequest;
  info.value = {}; values.nik = "";
  try {
    const { data } = await api.get("/transaksi/pinjaman/karyawan-info", { params: { nik: row.Nik, tanggal: values.tanggal } });
    if (request !== infoRequest) return;
    info.value = isEdit ? { ...data.data, pinjaman_aktif: (data.data.pinjaman_aktif || []).filter((doc: Record<string, any>) => doc.Nomor !== nomorEdit) } : data.data;
    values.nik = data.data.Nik; cariOpen.value = false;
  } catch (e) { if (request === infoRequest) toast.error(getErrorMessage(e)); }
}
function inputRekening(event: Event) {
  const input = event.target as HTMLInputElement;
  const digits = input.value.replace(/[^0-9]/g, '').slice(0, 50);
  input.value = digits;
  values.norek = digits;
}

async function simpan() {
  if (disabled.value || !ready.value) throw new Error("Form belum siap atau pinjaman sudah disimpan.");
  if (!values.nik) throw new Error("Pilih karyawan aktif terlebih dahulu.");
  if (!periodePinjaman(values.tanggal, 1)) throw new Error("Tanggal pinjaman wajib valid.");
  const pinjam = values.pinjam == null ? null : Number(values.pinjam);
  const angsuran = values.angsuran == null ? null : Number(values.angsuran);
  const bank = isEdit && values.bank === (original.value?.Bank ?? "") ? original.value?.Bank : values.bank;
  const norek = isEdit && values.norek === (original.value?.Norek ?? "") ? original.value?.Norek : values.norek.trim();
  if (!(isEdit && pinjam === original.value?.Pinjam) && !options.value.nominal.includes(Number(pinjam))) throw new Error("Pilih nominal pinjaman.");
  if (!(isEdit && angsuran === original.value?.Cicilan) && !options.value.angsuran.includes(Number(angsuran))) throw new Error("Pilih cicilan 1x atau 2x.");
  if (!(isEdit && bank === original.value?.Bank) && !options.value.bank.includes(bank)) throw new Error("Pilih bank BSI atau CIMB.");
  if (!(isEdit && norek === original.value?.Norek) && (!norek || [...norek].length > 50)) throw new Error("No. rekening wajib diisi, maksimal 50 karakter.");
  if (isEdit && !window.confirm(`Simpan perubahan pinjaman ${nomorEdit}? Nomor dan jumlah yang sudah dibayar tetap. Perubahan nominal/cicilan memengaruhi sisa pinjaman dan rencana potongan; pastikan sudah diverifikasi.`)) throw new Error("Perubahan dibatalkan.");
  saving.value = true;
  try {
    const payload = { nik: values.nik, tanggal: values.tanggal, pinjam, angsuran, bank, norek };
    const { data } = isEdit
      ? await api.put(`/transaksi/pinjaman/${encodeURIComponent(nomorEdit)}`, { ...payload, revision: original.value?.revision })
      : await api.post("/transaksi/pinjaman", payload);
    original.value = { ...original.value, ...data.data, Bayar: data.data.bayar, Tanggal: values.tanggal, Pinjam: pinjam, Cicilan: angsuran,
      Potongan: data.data.Potongan ?? [1, 2].filter(i => data.data[`periode_potong${i}`] != null || data.data[`nilai_potong${i}`] != null)
        .map(i => ({ periode: data.data[`periode_potong${i}`], nominal: data.data[`nilai_potong${i}`] })) };
    ++nomorRequest;
    values.nomor = data.data.nomor; saved.value = true;
    return `Pinjaman ${data.data.nomor} berhasil ${isEdit ? "diubah" : "disimpan"}.`;
  } finally { saving.value = false; }
}
watch(() => values.tanggal, () => {
  if (!resetState.restoring.value) { ++infoRequest; cariOpen.value = false; lookup.clear(); }
  void previewNomor();
});
onMounted(async () => {
  try {
    const { data } = await api.get("/transaksi/pinjaman/options");
    options.value = data.data;
    if (isEdit) {
      const { data: response } = await api.get("/transaksi/pinjaman/detail", { params: { nomor: nomorEdit } });
      const doc = response.data;
      original.value = doc;
      Object.assign(values, { nomor: doc.Nomor, tanggal: doc.Tanggal || "", nik: doc.Nik || "", pinjam: doc.Pinjam,
        angsuran: doc.Cicilan, bank: doc.Bank ?? "", norek: doc.Norek ?? "" });
      info.value = { Nama: doc.Nama, Bagian: doc.Bagian, Pabrik: doc.Pabrik };
    } else await previewNomor(true);
    ready.value = true;
    if (isEdit) resetState.capture();
    await resetState.initialize();
  } catch (e) { toast.error(getErrorMessage(e)); }
  finally { loading.value = false; }
});
const liveSearch = useLiveSearch(search, { enabled: () => cariOpen.value, invalidate: () => lookup.invalidate() });
</script>

<template>
  <BaseForm :title="isEdit ? 'Edit Pinjaman' : 'Tambah Pinjaman'" :subtitle="isEdit ? 'Koreksi data pinjaman · nomor dan jumlah dibayar tetap' : 'Pinjaman untuk karyawan aktif dengan masa kerja minimal 6 bulan dari tanggal masuk sampai tanggal pinjaman.'" icon="account_balance"
    return-path="/transaksi/pinjaman" :save-fn="canSave ? simpan : undefined"
    new-form-path="/transaksi/pinjaman/form" transaction-module="frmPinjam"
    :show-save="canSave" :save-disabled="disabled"
    :reset-fn="resetState.reset" :reset-disabled="resetState.disabled.value"
    :hint="isEdit ? 'Nomor dan jumlah yang sudah dibayar tetap. Verifikasi koreksi sebelum Simpan.' : 'Nomor hanya preview; nomor final dibuat saat Simpan. Periode merupakan rencana potongan, bukan pembayaran.'">
    <template #form-content>
    <section class="loan-card">
      <p v-if="loading" role="status">Memuat form…</p>
      <p v-else-if="!ready" role="alert">Form gagal dimuat. Tutup dan buka kembali untuk mencoba lagi.</p>
       <div class="loan-layout">
       <div class="loan-data">
       <div class="loan-fields">
        <FText :label="isEdit ? 'Nomor Pinjaman' : 'Nomor Pinjaman (preview)'" :model-value="values.nomor" disabled />
        <FDate label="Tanggal Pinjaman" v-model="values.tanggal" required :disabled="disabled || processed" />
         <div class="employee-field">
           <label class="employee-label" for="pinjaman-employee-selector">Karyawan <span class="req">*</span></label>
           <button id="pinjaman-employee-selector" type="button" class="employee-selector" :class="{ selected: !!values.nik }"
             :disabled="disabled" aria-haspopup="dialog" :aria-expanded="cariOpen" aria-describedby="pinjaman-employee-help"
             :aria-label="values.nik ? `Karyawan: ${info.Nama || 'Nama tidak tersedia'} · ${values.nik}. Ganti karyawan` : 'Karyawan: cari / pilih karyawan aktif'"
             @click="cariOpen = true; search()">
             <MsIcon :name="values.nik ? 'person' : 'search'" :size="18" class="employee-icon" />
             <span v-if="values.nik" class="employee-value" :title="`${info.Nama || 'Nama tidak tersedia'} · ${values.nik}`">
               <span class="employee-name">{{ info.Nama || 'Nama tidak tersedia' }}</span><span class="employee-nik">· {{ values.nik }}</span>
             </span>
             <span v-else class="employee-placeholder">Cari / pilih karyawan aktif...</span>
             <span v-if="values.nik" class="employee-change">Ganti</span>
             <MsIcon v-else name="expand_more" :size="18" class="employee-chevron" />
           </button>
           <small id="pinjaman-employee-help" class="employee-help">Hanya karyawan aktif dengan masa kerja minimal 6 bulan yang dapat dipilih.</small>
         </div>
         <dl class="employee-info-card" aria-label="Informasi karyawan terpilih">
           <div><dt>NIK</dt><dd class="employee-info-nik">{{ values.nik || '—' }}</dd></div>
           <div><dt>Pabrik</dt><dd>{{ info.Pabrik || '—' }}</dd></div>
           <div><dt>Nama</dt><dd>{{ info.Nama || '—' }}</dd></div>
           <div><dt>Bagian</dt><dd>{{ info.Bagian || '—' }}</dd></div>
         </dl>
        <FSelect label="Nominal Pinjaman" v-model="values.pinjam" :options="nominalOptions" required :disabled="disabled || processed" />
        <FSelect label="Bank" v-model="values.bank" :options="bankOptions" required :disabled="disabled" />
        <FSelect label="Jumlah Cicilan" v-model="values.angsuran" :options="angsuranOptions" required :disabled="disabled || processed" />
        <div class="rekening">
          <label for="pinjaman-norek">No. Rekening <span class="req">*</span></label>
           <input id="pinjaman-norek" :value="values.norek" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="50" :disabled="disabled" @input="inputRekening" />
        </div>
      </div>
      <p v-if="processed" class="warning">Jadwal pinjaman tidak dapat diubah karena sudah ada potongan yang diproses.</p>
      <p v-if="isEdit" class="warning">Jumlah yang sudah dibayar tetap. Perubahan nominal mengubah sisa pinjaman; verifikasi koreksi dengan pengelola potongan gaji sebelum Simpan.</p>
      <p v-if="info.pinjaman_aktif?.length" class="warning" role="alert">Karyawan masih memiliki pinjaman yang belum lunas.</p>
      <p v-if="saved" role="status">Pinjaman berhasil disimpan. Kembali ke Browse untuk melihat histori.</p>
       </div>
       <aside class="loan-summary" aria-label="Periode potongan dan ringkasan pinjaman">
         <PinjamanSchedule class="form-schedule" :rows="potongan" :show-title="false" />
         <dl class="payment-summary" aria-live="polite">
           <div class="summary-row">
             <dt>Bayar</dt>
             <dd><span class="summary-badge" :class="bayar != null && Number(bayar) > 0 ? 'paid' : 'neutral'">{{ rupiah(bayar) }}</span></dd>
           </div>
           <div class="summary-row">
             <dt>Sisa Pinjaman</dt>
             <dd><span class="summary-badge" :class="sisa == null ? 'neutral' : sisa > 0 ? 'pending' : 'paid'">{{ rupiah(sisa) }}</span></dd>
           </div>
           <div class="summary-row">
             <dt>Status</dt>
             <dd><span class="summary-badge" :class="sisa == null ? 'neutral' : sisa > 0 ? 'pending' : 'paid'">{{ status }}</span></dd>
           </div>
         </dl>
       </aside>
       </div>
    </section>
    <Teleport to="body">
      <div v-if="cariOpen" class="loan-overlay" @click.self="cariOpen = false" @keydown.esc="cariOpen = false">
        <section class="loan-dialog" role="dialog" aria-modal="true" aria-labelledby="loan-lookup-title">
          <header><h2 id="loan-lookup-title">Cari Karyawan Aktif</h2><button type="button" class="close-button" aria-label="Tutup Cari Karyawan" title="Tutup" @click="cariOpen = false"><MsIcon name="close" :size="22" /></button></header>
          <p class="lookup-notice"><MsIcon name="info" :size="16" />Pinjaman hanya dapat diajukan untuk karyawan aktif dengan masa kerja minimal 6 bulan. Masa kerja dihitung sampai tanggal pinjaman {{ formatTanggal(values.tanggal) || '—' }}.</p>
          <form class="lookup-search" @submit.prevent="liveSearch.run"><input v-model="keyword" aria-label="Cari NIK, nama, jabatan, bagian, pabrik" placeholder="NIK / nama / jabatan / bagian / pabrik" @input="liveSearch.schedule" /><button type="submit">Cari</button></form>
          <KaryawanLookupTable :lookup="lookup" :columns="['Nik', 'Nama', 'Jabatan', 'Bagian', 'Pabrik', 'MasaKerja', 'StatusKelayakan']"
            :unsortable-columns="['MasaKerja', 'StatusKelayakan']" :row-selectable="row => row.BisaDipilih === true && !disabled" @select="selectEmployee">
            <template #cell="{ row, column }"><span v-if="column === 'StatusKelayakan'" class="eligibility-status" :class="{ eligible: row.BisaDipilih }">{{ row[column] }}</span><template v-else>{{ /^(Tgl|Tanggal)/i.test(column) ? formatTanggal(row[column]) : row[column] }}</template></template>
          </KaryawanLookupTable>
        </section>
      </div>
    </Teleport>
    </template>
  </BaseForm>
</template>

<style scoped>
.loan-card { max-width: 1200px; margin: 0 auto; background: var(--ds-surface-raised); color: var(--ds-text); padding: 16px; border: 1px solid var(--ds-border); border-radius: 8px; }
.loan-layout { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 24px; align-items: start; }
.loan-data, .loan-summary { min-width: 0; }
.loan-summary { padding-left: 24px; border-left: 1px solid var(--ds-border); }
.loan-fields { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
.loan-fields :deep(.field) { gap: 3px; }
.loan-fields :deep(input), .loan-fields :deep(select) { height: 32px; border-radius: 4px; background: var(--ds-surface-raised); color: var(--ds-text); }
.loan-fields :deep(input:disabled), .loan-fields :deep(select:disabled) { background: var(--ds-surface); color: var(--ds-text-muted, var(--ds-text)); }
.form-schedule { margin: 0; }
.payment-summary { display: grid; gap: 12px; margin: 20px 0 0; }
.summary-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.summary-row dt { font-size: 12px; font-weight: 700; color: var(--ds-primary, #3b5998); }
.summary-row dd { margin: 0; }
.summary-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 120px; min-height: 32px; padding: 6px 16px; border-radius: 999px; font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
.summary-badge.paid { color: #166534; background: #dcfce7; }
.summary-badge.pending { color: #854d0e; background: #fef3c7; }
.summary-badge.neutral { color: var(--ds-text-muted, #64748b); background: var(--ds-surface, #f1f5f9); }
.employee-field { grid-column: 1 / -1; display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 4px 3px; align-items: center; min-width: 0; }
.employee-label { font-size: 11px; font-weight: 700; color: var(--ds-primary, #3b5998); }
.employee-label .req { color: var(--ds-error, #dc2626); }
.employee-field .employee-selector { display: flex; align-items: center; gap: 8px; width: 100%; min-width: 0; min-height: 36px; padding: 6px 10px; box-sizing: border-box; border: 1px solid var(--ds-primary, #3b5998); border-radius: 5px; background: var(--ds-surface); color: var(--ds-text); font: inherit; font-size: 12px; text-align: left; transition: background .15s, box-shadow .15s; }
.employee-field .employee-selector.selected { background: var(--ds-surface-raised); }
.employee-field .employee-selector:hover:not(:disabled) { background: var(--ds-surface-inset); box-shadow: 0 0 0 1px var(--ds-primary, #3b5998); }
.employee-field .employee-selector:focus-visible { outline: 2px solid var(--ds-primary, #3b5998); outline-offset: 2px; }
.employee-icon, .employee-chevron { flex-shrink: 0; color: var(--ds-primary, #3b5998); }
.employee-value { display: flex; align-items: center; gap: 4px; flex: 1; min-width: 0; }
.employee-name, .employee-placeholder { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.employee-name { font-weight: 600; }
.employee-nik { flex-shrink: 0; white-space: nowrap; }
.employee-placeholder { flex: 1; color: var(--ds-text-muted, var(--ds-text)); }
.employee-change { flex-shrink: 0; padding: 2px 6px; border-left: 1px solid var(--ds-border); color: var(--ds-primary, #3b5998); font-size: 11px; font-weight: 700; }
.employee-help { grid-column: 2; color: var(--ds-text-muted, var(--ds-text)); font-size: 10px; line-height: 1.5; }
.employee-info-card { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 16px; margin: 0 0 4px; padding: 12px; border: 1px solid var(--ds-border); background: var(--ds-surface); color: var(--ds-text); }
/* Local exception to the global .app-shell * zero-radius !important rule. */
.employee-info-card { border-radius: 8px !important; }
.employee-info-card > div { display: grid; grid-template-columns: 48px minmax(0, 1fr); gap: 8px; align-items: baseline; min-width: 0; }
.employee-info-card dt { font-size: 11px; color: var(--ds-text-muted, var(--ds-text)); }
.employee-info-card dd { margin: 0; min-width: 0; font-size: 12px; font-weight: 600; line-height: 1.5; overflow-wrap: anywhere; }
.employee-info-nik { font-variant-numeric: tabular-nums; }
@media (max-width: 600px) { .employee-info-card { grid-template-columns: minmax(0, 1fr); gap: 8px; } }
@media (max-width: 600px) { .employee-field { grid-template-columns: minmax(0, 1fr); gap: 4px; } .employee-help { grid-column: 1; } }
.rekening { display: flex; align-items: center; gap: 3px; }
.rekening label { flex: 0 0 140px; font-size: 11px; font-weight: 700; color: var(--ds-primary, #3b5998); }
.rekening .req { color: #dc2626; }
.rekening input { flex: 1; min-width: 0; font-family: "Plus Jakarta Sans", sans-serif; font-size: 12px; outline: none; }
.rekening input:focus { border-color: var(--ds-primary, #3b5998); }
.rekening input, .lookup-search input { padding: 0 9px; height: 32px; box-sizing: border-box; border: 1px solid var(--ds-border, #dde3ec); border-radius: 5px; background: var(--ds-surface-raised); color: inherit; }
.warning { color: var(--ds-error, #b42318); font-size: 11px; margin: 6px 0; }
.lookup-notice { display: flex; align-items: flex-start; gap: 6px; background: var(--ds-surface-inset); color: var(--ds-text); border-radius: 5px; padding: 8px 10px; font-size: 12px; line-height: 1.5; margin: 0 0 12px; }
.eligibility-status { font-size: 11px; font-weight: 600; }
.eligibility-status.eligible { color: var(--ds-primary); }
button { padding: 8px 12px; border-radius: 5px; border: 1px solid var(--ds-border, #dde3ec); background: var(--ds-surface, white); color: inherit; cursor: pointer; }
button:disabled { opacity: .5; cursor: not-allowed; }
.loan-dialog .close-button { display: inline-flex; align-items: center; justify-content: center; padding: 6px; color: var(--ds-error, #dc2626); border-color: transparent; background: transparent; }
.loan-dialog .close-button:hover { background: var(--ds-surface-inset, #fee2e2); }
.loan-overlay { position: fixed; inset: 0; background: #0008; z-index: 2000; display: grid; place-items: center; padding: 20px; }
.loan-dialog { background: var(--ds-surface, white); color: var(--ds-text, #263238); padding: 24px; border-radius: 10px; width: min(960px, 100%); max-height: 90vh; overflow: auto; }
.loan-dialog header, .lookup-search { display: flex; gap: 12px; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.loan-dialog h2 { font-size: 18px; }
.lookup-search input { flex: 1; min-width: 0; }
@media (max-width: 850px) {
  .loan-layout { grid-template-columns: minmax(0, 1fr); gap: 20px; }
  .loan-summary { padding: 20px 0 0; border-left: 0; border-top: 1px solid var(--ds-border); }
}
</style>
