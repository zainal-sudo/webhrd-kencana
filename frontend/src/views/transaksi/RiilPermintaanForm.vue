<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
import MsIcon from "@/components/MsIcon.vue";
import FText from "@/components/fields/FText.vue";
import FDate from "@/components/fields/FDate.vue";
import { api as sourceApi, getErrorMessage } from "@/api/axios";
import { useTransactionReset } from "@/composables/useTransactionReset";
import { useLiveSearch } from "@/composables/useLiveSearch";
import { useDialogFocus } from "@/composables/useDialogFocus";
import { todaySql, formatTanggal } from "@/utils/format";

/**
 * Form Realisasi Permintaan Karyawan — padanan `ufrmRiilPermintaanKaryawan`.
 *
 * Nomor NNN/HRD/RPK/MM/YYYY otomatis per tahun. Pilih Nomor Minta dari
 * permintaan yang belum penuh (jumlah > realisasi) -> info permintaan
 * terisi otomatis; simpan hanya menulis tanggal, jumlah & keterangan nama.
 */
// Each cached form owns its initial route, including the document ID.
const route = { ...useRoute(), query: { ...useRoute().query }, params: { ...useRoute().params } };
const toast = useToast();

const nomorEdit = computed(() => String(route.query.id ?? ""));
const isEdit = computed(() => !!nomorEdit.value);

const values = reactive<Record<string, any>>({
  nomor: "",
  tanggal: todaySql(),
  tpk_nomor: "",
  jumlah: "",
  keterangan_nama: "",
});
const info = reactive<Record<string, any>>({
  peminta: "", peminta_nama: "", jabatan_nama: "", bagian: "",
  jumlah_minta: "", jml_riil: "", sisa: "",
});
const memuat = ref(false);

const cariOpen = ref(false);
const cariLoading = ref(false);
const kataCari = ref("");
const hasilCari = ref<any[]>([]);
const resetState = useTransactionReset({ values, info }, {
  isEdit: () => isEdit.value,
  blocked: () => memuat.value || cariLoading.value,
  afterRestore: () => {
    cariOpen.value = false;
    kataCari.value = "";
    hasilCari.value = [];
  },
});
const api = resetState.trackApi(sourceApi);

async function muatNomor() {
  if (resetState.restoring.value || isEdit.value) return;
  try {
    const { data } = await api.get("/transaksi/realisasi-permintaan/nomor", { params: { tanggal: values.tanggal } });
    values.nomor = data.data?.nomor || "";
  } catch { /* abaikan */ }
}

async function muatEdit() {
  if (!isEdit.value) return;
  memuat.value = true;
  try {
    const { data } = await api.get("/transaksi/realisasi-permintaan/form", { params: { nomor: nomorEdit.value } });
    const d = data.data;
    Object.assign(values, {
      nomor: d.nomor, tanggal: String(d.tanggal || "").slice(0, 10),
      tpk_nomor: d.tpk_nomor || "", jumlah: String(d.jumlah ?? ""),
      keterangan_nama: d.keterangan_nama || "",
    });
    Object.assign(info, {
      peminta: d.peminta || "", peminta_nama: d.peminta_nama || "",
      jabatan_nama: d.jabatan_nama || "", bagian: d.bagian || "",
      jumlah_minta: d.jumlah_minta ?? "", jml_riil: d.jml_riil ?? "", sisa: d.sisa ?? "",
    });
    resetState.capture();
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat data"));
  } finally {
    memuat.value = false;
  }
}

let infoRequest = 0;
async function muatInfo() {
  const nomor = String(values.tpk_nomor || "").trim();
  const request = ++infoRequest;
  if (!nomor) {
    for (const k of Object.keys(info)) info[k] = "";
    return;
  }
  try {
    const { data } = await api.get("/transaksi/realisasi-permintaan/info-permintaan", { params: { nomor } });
    if (request !== infoRequest) return;
    const d = data.data;
    Object.assign(info, {
      peminta: d.peminta || "", peminta_nama: d.peminta_nama || "",
      jabatan_nama: d.jabatan_nama || "", bagian: d.bagian || "",
      jumlah_minta: d.jumlah ?? "", jml_riil: d.jml_riil ?? "", sisa: d.sisa ?? "",
    });
  } catch (e) {
    if (request === infoRequest) {
      for (const k of Object.keys(info)) info[k] = "";
      toast.error(getErrorMessage(e, "Nomor permintaan tidak ditemukan"));
    }
  }
}

function bukaCari() {
  kataCari.value = String(values.tpk_nomor || "");
  cariOpen.value = true;
  cari();
}

let searchRequest = 0;
async function cari() {
  const request = ++searchRequest;
  cariLoading.value = true;
  try {
    const { data } = await api.get("/transaksi/realisasi-permintaan/permintaan-terbuka", { params: { search: kataCari.value } });
    if (request === searchRequest) hasilCari.value = data.data || [];
  } catch (e) {
    if (request === searchRequest) toast.error(getErrorMessage(e, "Gagal mencari"));
  } finally {
    if (request === searchRequest) cariLoading.value = false;
  }
}

function pilih(row: Record<string, any>) {
  values.tpk_nomor = String(row.Nomor ?? "");
  cariOpen.value = false;
  muatInfo();
}

async function simpan(): Promise<string> {
  if (!values.tpk_nomor) throw new Error("Nomor permintaan (Minta) wajib diisi");
  if (!values.jumlah) throw new Error("Jumlah belum diisi");
  const body: Record<string, any> = {
    tpk_nomor: String(values.tpk_nomor).trim(),
    tanggal: String(values.tanggal).slice(0, 10),
    jumlah: parseInt(String(values.jumlah), 10),
    keterangan_nama: values.keterangan_nama || "",
  };
  if (isEdit.value) body.nomor = nomorEdit.value;
  const { data } = isEdit.value
    ? await api.put("/transaksi/realisasi-permintaan", body)
    : await api.post("/transaksi/realisasi-permintaan", body);
  return data.message;
}

onMounted(async () => {
  await muatEdit();
  if (!isEdit.value) await muatNomor();
  await resetState.initialize();
});
const liveSearch = useLiveSearch(cari, {
  enabled: () => cariOpen.value,
  invalidate: () => { ++searchRequest; hasilCari.value = []; cariLoading.value = false; },
});
// Fokuskan kotak pencarian saat dialog dibuka — bisa langsung ketik tanpa klik dulu.
const cariInput = useDialogFocus(() => cariOpen.value);
</script>

<template>
  <BaseForm
    :title="isEdit ? `Ubah Realisasi ${nomorEdit}` : 'Tambah Realisasi Permintaan'"
    subtitle="Nomor NNN/HRD/RPK/MM/YYYY dibuat otomatis per tahun"
    icon="task_alt"
    :crumbs="[{ label: 'Realisasi Permintaan', path: '/transaksi/realisasi-permintaan' }, { label: isEdit ? 'Ubah' : 'Tambah' }]"
    :save-fn="simpan"
    :reset-fn="resetState.reset"
    :reset-disabled="resetState.disabled.value"
    return-path="/transaksi/realisasi-permintaan"
    new-form-path="/transaksi/realisasi-permintaan/form" transaction-module="frmRiilPermintaanKaryawan"
    save-label="Simpan Realisasi"
  >
    <template #form-content>
      <div v-if="memuat" class="loading">Memuat data...</div>
      <template v-else>
        <fieldset class="fs">
          <legend>Dokumen</legend>
          <div class="grid">
            <FText v-model="values.nomor" label="Nomor" disabled placeholder="Otomatis" />
            <FDate v-model="values.tanggal" label="Tanggal Realisasi" required />
            <div class="nik-cari">
              <FText v-model="values.tpk_nomor" label="Nomor Minta" required placeholder="Pilih via Cari" @change="muatInfo" />
              <button class="btn-mini cari-inline" type="button" @click="bukaCari">Cari permintaan</button>
            </div>
            <FText v-model="values.jumlah" label="Jumlah" required type="number" placeholder="0" />
          </div>
        </fieldset>

        <fieldset class="fs">
          <legend>Info Permintaan</legend>
          <div class="grid">
            <FText :model-value="info.peminta_nama" label="Peminta" disabled @update:model-value="() => {}" />
            <FText :model-value="info.jabatan_nama" label="Jabatan" disabled @update:model-value="() => {}" />
            <FText :model-value="info.bagian" label="Bagian" disabled @update:model-value="() => {}" />
            <FText :model-value="String(info.jumlah_minta ?? '')" label="Jumlah Minta" disabled @update:model-value="() => {}" />
            <FText :model-value="String(info.jml_riil ?? '')" label="Sudah Realisasi" disabled @update:model-value="() => {}" />
            <FText :model-value="String(info.sisa ?? '')" label="Sisa" disabled @update:model-value="() => {}" />
          </div>
        </fieldset>

        <fieldset class="fs">
          <legend>Keterangan Nama</legend>
          <div class="grid">
            <FText v-model="values.keterangan_nama" label="Nama-nama" placeholder="Nama karyawan yang diterima..." />
          </div>
        </fieldset>
      </template>
    </template>
  </BaseForm>

  <v-dialog v-model="cariOpen" max-width="860" scrollable>
    <v-card rounded="false">
      <v-card-title class="dlg-head">
        <span>Permintaan Belum Penuh</span>
        <v-btn icon="close" size="small" variant="text" @click="cariOpen = false" />
      </v-card-title>
      <v-card-text class="dlg-body">
        <div class="cari-bar">
          <input ref="cariInput" v-model="kataCari" placeholder="Nomor / peminta / jabatan / bagian..." @input="liveSearch.schedule" @keyup.enter="liveSearch.run" />
          <button class="btn-mini primary" type="button" :disabled="cariLoading" @click="liveSearch.run">
            {{ cariLoading ? "Mencari..." : "Cari" }}
          </button>
        </div>
        <table class="mini">
          <thead><tr><th>Nomor</th><th>Peminta</th><th>Jabatan</th><th>Bagian</th><th>Jumlah</th><th>Riil</th><th>Tgl Minta</th></tr></thead>
          <tbody>
            <tr v-for="(r, i) in hasilCari" :key="i" class="klik" @click="pilih(r)">
              <td>{{ r.Nomor }}</td>
              <td>{{ r.Peminta }}</td>
              <td>{{ r.Jabatan }}</td>
              <td>{{ r.Bagian }}</td>
              <td>{{ r.Jumlah }}</td>
              <td>{{ r.Jml_Riil }}</td>
              <td>{{ formatTanggal(r.Tanggal_Minta) }}</td>
            </tr>
            <tr v-if="!hasilCari.length"><td colspan="7" class="empty">Tidak ditemukan</td></tr>
          </tbody>
        </table>
        <p class="note">Hanya permintaan dengan jumlah &gt; realisasi.</p>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.fs { border: 1px solid var(--ds-border, #b0b8c4); border-radius: 12px; background: #fff; padding: 10px 12px 14px; margin-bottom: 12px; }
.fs > legend { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; color: var(--ds-primary, #3b5998); padding: 0 6px; }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 14px; }
.nik-cari { display: flex; gap: 8px; align-items: flex-end; min-width: 0; }
.nik-cari > :first-child { flex: 1; min-width: 0; }
.cari-inline { height: 30px; flex-shrink: 0; }
.btn-mini { height: 26px; padding: 0 10px; border: 1px solid var(--ds-border, #b0b8c4); border-radius: 8px; background: #fff; font-family: "Plus Jakarta Sans", sans-serif; font-size: 11px; font-weight: 700; cursor: pointer; color: var(--ds-on-surface, #1b2d4a); }
.btn-mini.primary { background: var(--ds-primary, #3b5998); border-color: var(--ds-primary-dark, #2c4472); color: #fff; }
.btn-mini:disabled { opacity: 0.6; cursor: not-allowed; }
.loading { padding: 24px; text-align: center; font-size: 12px; color: #6b7a90; }
.note { font-size: 11px; color: #64748b; margin: 8px 0 0; }
.dlg-head { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 800; padding: 8px 12px; background: var(--ds-surface-variant, #e0e4ea); }
.dlg-body { background: #fff; padding: 12px 14px; }
.cari-bar { display: flex; gap: 6px; margin-bottom: 10px; }
.cari-bar input { flex: 1; height: 28px; border: 1px solid var(--ds-border, #b0b8c4); border-radius: 8px; padding: 0 8px; font-size: 12px; font-family: "Plus Jakarta Sans", sans-serif; }
table.mini { width: 100%; border-collapse: collapse; font-size: 11px; }
table.mini th { background: var(--ds-surface-variant, #e0e4ea); border: 1px solid var(--ds-border, #b0b8c4); padding: 5px 7px; text-align: left; font-weight: 800; }
table.mini td { border: 1px solid #d5dbe3; padding: 4px 7px; }
table.mini tr.klik:hover { background: var(--ds-primary-lighten-1, #dbe4f3); cursor: pointer; }
table.mini .empty { text-align: center; color: #8995a6; padding: 10px; }
@media (max-width: 680px) { .grid { grid-template-columns: 1fr; } }
</style>
