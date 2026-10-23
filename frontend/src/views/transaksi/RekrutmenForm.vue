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
import { todaySql, formatTanggal } from "@/utils/format";
import type { LookupItem } from "@/types";

/**
 * Form Rekruitmen (Panggilan) — padanan `ufrmCalonKaryawan`.
 *
 * Nomor NNN/HRD/CK/MM/yy otomatis per tahun. Baris pelamar diambil dari
 * Bank Pelamar (status selain Ditolak); duplikat dalam satu dokumen
 * ditolak. Klik baris untuk mengisi Nilai tes (tombol tersendiri Delphi).
 */
// Each cached form owns its initial route, including the document ID.
const route = { ...useRoute(), query: { ...useRoute().query }, params: { ...useRoute().params } };
const toast = useToast();

const nomorEdit = computed(() => String(route.query.id ?? ""));
const isEdit = computed(() => !!nomorEdit.value);

const STATUS_PANGGIL = [
  "Belum Diputuskan", "Diterima", "Ditolak", "Dipanggil Tidak Datang",
  "Pelatihan", "Diterima Tapi Tidak Datang", "Tes Psikotes/skill",
  "Interview User", "Interview HRD",
];

const values = reactive<Record<string, any>>({
  nomor: "", tanggal: todaySql(), tanggal_panggil: todaySql(), keterangan: "",
});
const baris = ref<Record<string, any>[]>([barisBaru()]);
const pabrikOptions = ref<{ label: string; value: string }[]>([]);
const memuat = ref(false);

function barisBaru() {
  return { nopelamar: "", nama: "", posisi: "", jam: "", unit: "", status: "Belum Diputuskan" };
}

const cariOpen = ref(false);
const cariLoading = ref(false);
const kataCari = ref("");
const hasilCari = ref<any[]>([]);
const cariIndex = ref(0);

const tesRkt = ref("");
const tesRows = ref<any[]>([]);
const tesLoading = ref(false);
const tesSaving = ref(false);

const resetState = useTransactionReset({ values, baris }, {
  isEdit: () => isEdit.value,
  blocked: () => memuat.value || cariLoading.value || tesSaving.value,
  afterRestore: () => {
    cariOpen.value = false;
    kataCari.value = "";
    hasilCari.value = [];
    tesRkt.value = "";
    tesRows.value = [];
  },
});
const api = resetState.trackApi(sourceApi);

async function muatNomor() {
  if (resetState.restoring.value || isEdit.value) return;
  try {
    const { data } = await api.get("/transaksi/rekrutmen/nomor", { params: { tanggal: values.tanggal } });
    values.nomor = data.data?.nomor || "";
  } catch { /* abaikan */ }
}

async function muatPabrik() {
  try {
    const { data } = await api.get("/master/lookup");
    pabrikOptions.value = ((data.data?.pabrik || []) as LookupItem[]).map((r) => ({
      label: `${r.Kode} - ${r.Nama}`,
      value: String(r.Kode),
    }));
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat pabrik"));
  }
}

async function muatEdit() {
  if (!isEdit.value) return;
  memuat.value = true;
  try {
    const { data } = await api.get("/transaksi/rekrutmen/form", { params: { nomor: nomorEdit.value } });
    const d = data.data;
    Object.assign(values, {
      nomor: d.nomor, tanggal: String(d.tanggal || "").slice(0, 10),
      tanggal_panggil: String(d.tanggal_panggil || "").slice(0, 10),
      keterangan: d.keterangan || "",
    });
    baris.value = (d.detail?.length ? d.detail : [barisBaru()]).map((r: any) => ({
      nopelamar: r.nopelamar || "", nama: r.nama || "", posisi: r.posisi || "",
      jam: r.jam || "", unit: r.unit || "", status: r.status || "Belum Diputuskan",
    }));
    resetState.capture();
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat data"));
  } finally {
    memuat.value = false;
  }
}

function tambahBaris() {
  baris.value.push(barisBaru());
}
function hapusBaris(i: number) {
  if (baris.value.length <= 1) {
    baris.value[0] = barisBaru();
    if (tesRkt.value && !baris.value.some((b) => b.nopelamar === tesRkt.value)) {
      tesRkt.value = "";
      tesRows.value = [];
    }
    return;
  }
  const [buang] = baris.value.splice(i, 1);
  if (buang?.nopelamar === tesRkt.value) {
    tesRkt.value = "";
    tesRows.value = [];
  }
}

function bukaCari(i: number) {
  cariIndex.value = i;
  kataCari.value = String(baris.value[i]?.nopelamar || "");
  cariOpen.value = true;
  cari();
}

let searchRequest = 0;
async function cari() {
  const request = ++searchRequest;
  cariLoading.value = true;
  try {
    const { data } = await api.get("/transaksi/rekrutmen/pelamar", { params: { search: kataCari.value } });
    if (request === searchRequest) hasilCari.value = data.data || [];
  } catch (e) {
    if (request === searchRequest) toast.error(getErrorMessage(e, "Gagal mencari"));
  } finally {
    if (request === searchRequest) cariLoading.value = false;
  }
}

function pilih(row: Record<string, any>) {
  const b = baris.value[cariIndex.value];
  if (!b) return;
  const nomor = String(row.Nomor ?? "");
  if (baris.value.some((r, i) => i !== cariIndex.value && r.nopelamar === nomor)) {
    toast.error(`Pelamar ini sudah dimasukkan`);
    return;
  }
  b.nopelamar = nomor;
  b.nama = String(row.Nama ?? "");
  b.posisi = String(row.Posisi ?? "");
  if (!b.status) b.status = "Belum Diputuskan";
  cariOpen.value = false;
}

async function muatTes(rkt: string) {
  if (!rkt || !values.nomor) return;
  tesRkt.value = rkt;
  tesLoading.value = true;
  try {
    const { data } = await api.get("/transaksi/rekrutmen/tes", {
      params: { ck_nomor: values.nomor, rkt_nomor: rkt },
    });
    tesRows.value = data.data?.tes || [];
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat nilai tes"));
  } finally {
    tesLoading.value = false;
  }
}

async function simpanTes() {
  if (!tesRkt.value) return;
  tesSaving.value = true;
  try {
    await api.post("/transaksi/rekrutmen/tes", {
      ck_nomor: values.nomor,
      rkt_nomor: tesRkt.value,
      tes: tesRows.value,
    });
    toast.success("Nilai berhasil disimpan");
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal menyimpan nilai"));
  } finally {
    tesSaving.value = false;
  }
}

async function simpan(): Promise<string> {
  const detail = baris.value.filter((b) => String(b.nopelamar || "").trim() !== "");
  const body: Record<string, any> = {
    tanggal: String(values.tanggal).slice(0, 10),
    tanggal_panggil: String(values.tanggal_panggil).slice(0, 10),
    keterangan: values.keterangan || "",
    detail,
  };
  if (isEdit.value) body.nomor = nomorEdit.value;
  const { data } = isEdit.value
    ? await api.put("/transaksi/rekrutmen", body)
    : await api.post("/transaksi/rekrutmen", body);
  return data.message;
}

onMounted(async () => {
  await muatPabrik();
  await muatEdit();
  if (!isEdit.value) await muatNomor();
  await resetState.initialize();
});
const liveSearch = useLiveSearch(cari, {
  enabled: () => cariOpen.value,
  invalidate: () => { ++searchRequest; hasilCari.value = []; cariLoading.value = false; },
});
</script>

<template>
  <BaseForm
    :title="isEdit ? `Ubah Panggilan ${nomorEdit}` : 'Tambah Panggilan Rekruitmen'"
    subtitle="Nomor NNN/HRD/CK/MM/yy dibuat otomatis per tahun"
    icon="person_add"
    :crumbs="[{ label: 'Rekruitmen', path: '/transaksi/rekrutmen' }, { label: isEdit ? 'Ubah' : 'Tambah' }]"
    :save-fn="simpan"
    :reset-fn="resetState.reset"
    :reset-disabled="resetState.disabled.value"
    return-path="/transaksi/rekrutmen"
    new-form-path="/transaksi/rekrutmen/form" transaction-module="frmCalonKaryawan"
    save-label="Simpan Panggilan"
  >
    <template #form-content>
      <div v-if="memuat" class="loading">Memuat data...</div>
      <template v-else>
        <fieldset class="fs">
          <legend>Dokumen</legend>
          <div class="grid">
            <FText v-model="values.nomor" label="Nomor" disabled placeholder="Otomatis" />
            <FDate v-model="values.tanggal" label="Tanggal" required />
            <FDate v-model="values.tanggal_panggil" label="Tanggal Panggil" required />
            <FText v-model="values.keterangan" label="Keterangan" />
          </div>
        </fieldset>

        <fieldset class="fs">
          <legend>Pelamar Dipanggil</legend>
          <div class="table-wrap">
            <table class="mini">
              <thead><tr><th>No Pelamar</th><th></th><th>Nama</th><th>Posisi</th><th>Jam</th><th>Unit</th><th>Status</th><th></th></tr></thead>
              <tbody>
                <tr
                  v-for="(b, i) in baris" :key="i"
                  :class="{ aktif: b.nopelamar && b.nopelamar === tesRkt }"
                  @click="b.nopelamar && muatTes(b.nopelamar)"
                >
                  <td><input v-model="b.nopelamar" aria-label="Nomor pelamar" placeholder="RKT..." /></td>
                  <td class="aksi"><button class="row-btn" type="button" title="Cari pelamar" @click.stop="bukaCari(i)"><MsIcon name="search" :size="14" /></button></td>
                  <td>{{ b.nama || "-" }}</td>
                  <td>{{ b.posisi || "-" }}</td>
                  <td><input v-model="b.jam" aria-label="Jam panggilan" placeholder="HH:MM:SS" /></td>
                  <td>
                    <select v-model="b.unit" aria-label="Unit">
                      <option value="">- Unit -</option>
                      <option v-for="o in pabrikOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                  </td>
                  <td>
                    <select v-model="b.status" aria-label="Status">
                      <option v-for="s in STATUS_PANGGIL" :key="s" :value="s">{{ s }}</option>
                    </select>
                  </td>
                  <td class="aksi"><button class="row-btn del" type="button" title="Hapus baris" @click.stop="hapusBaris(i)"><MsIcon name="delete" :size="14" /></button></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="grid-actions">
            <button class="btn-mini" type="button" @click="tambahBaris"><MsIcon name="add" :size="14" /> Tambah baris</button>
            <span class="note">Klik baris untuk mengisi nilai tes di bawah.</span>
          </div>
        </fieldset>

        <fieldset v-if="tesRkt" class="fs">
          <legend>Nilai Tes — {{ tesRkt }}</legend>
          <div v-if="tesLoading" class="loading">Memuat nilai...</div>
          <div v-else class="table-wrap">
            <table class="mini">
              <thead><tr><th style="width:60px">ID</th><th>Alat Tes</th><th>Hasil</th></tr></thead>
              <tbody>
                <tr v-for="t in tesRows" :key="t.id">
                  <td>{{ t.id }}</td>
                  <td>{{ t.nama }}</td>
                  <td><input v-model="t.hasil" :aria-label="`Hasil ${t.nama}`" placeholder="Hasil tes..." /></td>
                </tr>
                <tr v-if="!tesRows.length"><td colspan="3" class="empty">Belum ada alat tes aktif</td></tr>
              </tbody>
            </table>
          </div>
          <button class="btn-mini primary" type="button" :disabled="tesSaving" @click="simpanTes">
            {{ tesSaving ? "Menyimpan..." : "Simpan Nilai" }}
          </button>
        </fieldset>
      </template>
    </template>
  </BaseForm>

  <v-dialog v-model="cariOpen" max-width="820" scrollable>
    <v-card rounded="false">
      <v-card-title class="dlg-head">
        <span>Cari Pelamar (Bank)</span>
        <v-btn icon="close" size="small" variant="text" @click="cariOpen = false" />
      </v-card-title>
      <v-card-text class="dlg-body">
        <div class="cari-bar">
          <input v-model="kataCari" placeholder="Nomor / nama / posisi / alamat..." @input="liveSearch.schedule" @keyup.enter="liveSearch.run" />
          <button class="btn-mini primary" type="button" :disabled="cariLoading" @click="liveSearch.run">
            {{ cariLoading ? "Mencari..." : "Cari" }}
          </button>
        </div>
        <table class="mini">
          <thead><tr><th>Nomor</th><th>Nama</th><th>Posisi</th><th>Tanggal</th><th>Alamat</th></tr></thead>
          <tbody>
            <tr v-for="(r, i) in hasilCari" :key="i" class="klik" @click="pilih(r)">
              <td>{{ r.Nomor }}</td>
              <td>{{ r.Nama }}</td>
              <td>{{ r.Posisi }}</td>
              <td>{{ formatTanggal(r.Tanggal) }}</td>
              <td>{{ r.Alamat }}</td>
            </tr>
            <tr v-if="!hasilCari.length"><td colspan="5" class="empty">Tidak ditemukan</td></tr>
          </tbody>
        </table>
        <p class="note">Hanya pelamar dengan status selain Ditolak.</p>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.fs { border: 1px solid var(--ds-border, #b0b8c4); border-radius: 12px; background: #fff; padding: 10px 12px 14px; margin-bottom: 12px; }
.fs > legend { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; color: var(--ds-primary, #3b5998); padding: 0 6px; }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 14px; }
.loading { padding: 24px; text-align: center; font-size: 12px; color: #6b7a90; }
.note { font-size: 11px; color: #64748b; margin: 0; }
.table-wrap { overflow: auto; margin-bottom: 8px; }
table.mini { width: 100%; border-collapse: collapse; font-size: 11px; }
table.mini th { background: var(--ds-surface-variant, #e0e4ea); border: 1px solid var(--ds-border, #b0b8c4); padding: 5px 7px; text-align: left; font-weight: 800; white-space: nowrap; }
table.mini td { border: 1px solid #d5dbe3; padding: 3px 5px; }
table.mini td input, table.mini td select { width: 100%; min-width: 80px; border: none; outline: none; font: inherit; background: transparent; }
table.mini td input:focus, table.mini td select:focus { background: #eef4fc; }
table.mini tbody tr.aktif td { background: #eef4fc; }
table.mini tbody tr { cursor: pointer; }
table.mini .empty { text-align: center; color: #8995a6; padding: 10px; }
table.mini td.aksi { width: 34px; text-align: center; }
.grid-actions { display: flex; align-items: center; gap: 10px; }
.row-btn { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: none; border-radius: 6px; background: transparent; color: var(--ds-primary, #3b5998); cursor: pointer; }
.row-btn.del { color: #dc2626; }
.btn-mini { display: inline-flex; align-items: center; gap: 6px; min-height: 28px; padding: 0 10px; border: 1px solid var(--ds-border, #b0b8c4); border-radius: 8px; background: #fff; font-family: "Plus Jakarta Sans", sans-serif; font-size: 11px; font-weight: 700; cursor: pointer; color: var(--ds-on-surface, #1b2d4a); }
.btn-mini.primary { background: var(--ds-primary, #3b5998); border-color: var(--ds-primary-dark, #2c4472); color: #fff; }
.btn-mini:disabled { opacity: 0.6; cursor: not-allowed; }
.dlg-head { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 800; padding: 8px 12px; background: var(--ds-surface-variant, #e0e4ea); }
.dlg-body { background: #fff; padding: 12px 14px; }
.cari-bar { display: flex; gap: 6px; margin-bottom: 10px; }
.cari-bar input { flex: 1; height: 28px; border: 1px solid var(--ds-border, #b0b8c4); border-radius: 8px; padding: 0 8px; font-size: 12px; font-family: "Plus Jakarta Sans", sans-serif; }
table.mini tr.klik:hover { background: var(--ds-primary-lighten-1, #dbe4f3); cursor: pointer; }
@media (max-width: 680px) { .grid { grid-template-columns: 1fr; } }
</style>
