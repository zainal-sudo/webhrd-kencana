<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from "vue";
import { useRoute } from "vue-router";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
import KaryawanLookupTable from "@/components/KaryawanLookupTable.vue";
import { useKaryawanLookup } from "@/composables/useKaryawanLookup";
import FText from "@/components/fields/FText.vue";
import FTime from "@/components/fields/FTime.vue";
import FDate from "@/components/fields/FDate.vue";
import FSelect from "@/components/fields/FSelect.vue";
import { api as sourceApi, getErrorMessage } from "@/api/axios";
import { useTransactionReset } from "@/composables/useTransactionReset";
import { todaySql } from "@/utils/format";
import { normJam, selisihHari, assertClockTime } from "@/utils/jam";

/**
 * Form Ijin — padanan `ufrmIjin`.
 *
 * Field: Nomor (otomatis IJN.YYYYMM.NNNN), Jenis Ijin, Tanggal s/d Tanggal2,
 * NIK (+lookup), Jam s/d Jam2, Keterangan (Sakit/Ijin/Alpha/Lain Lain), Alasan.
 *
 * Aturan Delphi yang diduplikasi:
 * - Jam akhir hanya untuk jenis 2,4,5 (1/2 Hari, Meninggalkan Pekerjaan,
 *   Dinas Luar); selain itu dikirim 00:00:00.
 * - Tanggal2 > Tanggal berarti simpan rentang: satu dokumen per hari, hari
 *   libur dilewati server, NIK yang sudah berijin hanya jadi peringatan.
 * - NIK+tanggal yang sudah ada pada mode 1 hari meminta konfirmasi LANJUT.
 * - Tanggal >= 3 hari lalu wajib otorisasi atasan (token JWT dari server).
 */
const route = useRoute();
const toast = useToast();
const karyawanLookup = useKaryawanLookup("/transaksi/ijin/karyawan");

const nomorEdit = computed(() => String(route.query.id ?? ""));
const isEdit = computed(() => !!nomorEdit.value);

const values = reactive<Record<string, any>>({
  nomor: "",
  jenis_id: "3",
  tanggal: todaySql(),
  tanggal2: todaySql(),
  nik: "",
  jam: "00:00:00",
  jam2: "00:00:00",
  keterangan: 3,
  alasan: "",
});

const info = reactive({ nama: "", jabatan: "" });
const jenisOptions = ref<{ label: string; value: string | number }[]>([]);
const memuat = ref(false);

const PAKAI_JAM2 = ["2", "4", "5"];
const pakaiJam2 = computed(() => PAKAI_JAM2.includes(String(values.jenis_id)));
const isRentang = computed(() => values.tanggal2 && values.tanggal2 !== values.tanggal);

const perluOtorisasi = computed(() => selisihHari(values.tanggal) >= 3);
const otorisasi = reactive({ user_kode: "", user_password: "" });
const otorisasiToken = ref("");
const otorisasiDiterima = ref(false);
const cekOtor = ref(false);

const cariOpen = ref(false);
const cariLoading = ref(false);
const kataCari = ref("");

const dialogDuplikat = ref(false);
const pesanDuplikat = ref("");
const resetState = useTransactionReset({ values, info }, {
  isEdit: () => isEdit.value,
  blocked: () => memuat.value || cariLoading.value || cekOtor.value || karyawanLookup.loading,
  afterRestore: () => {
    cariOpen.value = false;
    kataCari.value = "";
    karyawanLookup.clear();
    otorisasi.user_kode = "";
    otorisasi.user_password = "";
    otorisasiToken.value = "";
    otorisasiDiterima.value = false;
    dialogDuplikat.value = false;
    pesanDuplikat.value = "";
  },
});
const api = resetState.trackApi(sourceApi);

async function muatJenis() {
  try {
    const { data } = await api.get("/transaksi/ijin/jenis");
    jenisOptions.value = (data.data || []).map((r: any) => ({
      label: `${r.Kode} - ${r.Nama}`,
      value: String(r.Kode),
    }));
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat jenis ijin"));
  }
}

async function muatNomor() {
  if (resetState.restoring.value) return;
  if (isEdit.value) return;
  try {
    const { data } = await api.get("/transaksi/ijin/nomor", { params: { tanggal: values.tanggal } });
    values.nomor = data.data?.nomor || "";
  } catch {
    /* abaikan — nomor final dibuat server saat simpan */
  }
}

async function muatEdit() {
  if (!isEdit.value) return;
  memuat.value = true;
  try {
    const { data } = await api.get("/transaksi/ijin/form", { params: { nomor: nomorEdit.value } });
    const d = data.data;
    values.nomor = d.nomor;
    values.jenis_id = String(d.jenis_id);
    values.tanggal = String(d.tanggal).slice(0, 10);
    values.tanggal2 = String(d.tanggal2 || d.tanggal).slice(0, 10);
    values.nik = d.nik;
    values.jam = d.jam || "00:00:00";
    values.jam2 = d.jam2 || "00:00:00";
    values.keterangan = d.keterangan ?? 3;
    values.alasan = d.alasan || "";
    info.nama = d.nama || "";
    info.jabatan = d.jabatan || "";
    resetState.capture();
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat data ijin"));
  } finally {
    memuat.value = false;
  }
}

async function infoKaryawan() {
  if (resetState.restoring.value) return;
  const nik = String(values.nik || "").trim();
  if (!nik) return;
  try {
    const { data } = await api.get("/transaksi/ijin/karyawan-info", { params: { nik } });
    info.nama = data.data?.nama || "";
    info.jabatan = data.data?.jabatan || "";
  } catch {
    info.nama = "";
    info.jabatan = "";
  }
}

async function bukaCari() {
  cariOpen.value = true;
  kataCari.value = String(values.nik || "");
  await cariNik();
}

async function cariNik() {
  cariLoading.value = true;
  try {
    await karyawanLookup.search(kataCari.value);
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal mencari karyawan"));
  } finally {
    cariLoading.value = false;
  }
}

function pilihKaryawan(row: Record<string, any>) {
  values.nik = String(row.Nik ?? "");
  info.nama = row.Nama || "";
  info.jabatan = row.Jabatan || "";
  cariOpen.value = false;
}

async function cekOtorisasi() {
  if (!otorisasi.user_kode || !otorisasi.user_password) {
    toast.error("Kode user dan password atasan wajib diisi");
    return;
  }
  cekOtor.value = true;
  try {
    const { data } = await api.post("/transaksi/ijin/otorisasi", {
      user_kode: otorisasi.user_kode,
      user_password: otorisasi.user_password,
    });
    otorisasiToken.value = data.data?.token || "";
    otorisasiDiterima.value = !!otorisasiToken.value;
    otorisasi.user_password = "";
    toast.success(`Otorisasi diterima oleh ${otorisasi.user_kode}`);
  } catch (e) {
    otorisasiDiterima.value = false;
    otorisasiToken.value = "";
    toast.error(getErrorMessage(e, "Otorisasi ditolak"));
  } finally {
    cekOtor.value = false;
  }
}

async function kirim(konfirmasiDuplikat: boolean): Promise<string> {
  if (!values.jenis_id) throw new Error("Jenis ijin wajib dipilih");
  if (!values.nik) throw new Error("NIK wajib diisi");
  if (!values.tanggal) throw new Error("Tanggal wajib diisi");
  if (values.tanggal > values.tanggal2) throw new Error("Tanggal pertama tidak boleh lebih besar dari tanggal kedua");
  if (perluOtorisasi.value && !otorisasiToken.value)
    throw new Error("Data lebih dari 3 hari memerlukan otorisasi atasan");

  const body: Record<string, any> = {
    jenis_id: parseInt(String(values.jenis_id), 10),
    tanggal: String(values.tanggal).slice(0, 10),
    tanggal2: String(values.tanggal2 || values.tanggal).slice(0, 10),
    nik: String(values.nik).trim(),
    jam: normJam(values.jam),
    jam2: pakaiJam2.value ? normJam(values.jam2) : "00:00:00",
    keterangan: Number(values.keterangan ?? 3),
    alasan: values.alasan || "",
    konfirmasi_duplikat: konfirmasiDuplikat,
  };
  if (isEdit.value) body.nomor = nomorEdit.value;
  if (otorisasiToken.value) body.otorisasi_token = otorisasiToken.value;

  const { data } = isEdit.value ? await api.put("/transaksi/ijin", body) : await api.post("/transaksi/ijin", body);
  const d = data.data || {};
  const daftar = Array.isArray(d.nomor) ? d.nomor.join(", ") : d.nomor;
  return `${data.message || "Ijin berhasil disimpan"}${d.otorisasi_by ? ` (disetujui ${d.otorisasi_by})` : ""} — ${daftar}`;
}

async function simpan(): Promise<string> {
  assertClockTime(values.jam, "Jam");
  if (pakaiJam2.value) assertClockTime(values.jam2, "Jam s/d");
  try {
    return await kirim(false);
  } catch (e: any) {
    if (e?.response?.status === 409) {
      pesanDuplikat.value = e.response.data?.message || "Data sudah ada";
      dialogDuplikat.value = true;
      throw new Error("Menunggu konfirmasi duplikat (LANJUT?)");
    }
    throw e instanceof Error ? e : new Error(getErrorMessage(e));
  }
}

async function lanjutDuplikat() {
  dialogDuplikat.value = false;
  try {
    const msg = await kirim(true);
    toast.success(msg);
  } catch (e) {
    toast.error(getErrorMessage(e));
  }
}

onMounted(async () => {
  await muatJenis();
  await muatEdit();
  if (isEdit.value) { await resetState.initialize(); return; }
  // Prefill dari menu popup laporan (tidak masuk / keterlambatan / pulang dulu):
  // ?nik=...&tanggal=...&jenis_id=... (Delphi: ransaksiIjin1Click).
  const qNik = String(route.query.nik ?? "").trim();
  const qTanggal = String(route.query.tanggal ?? "").slice(0, 10);
  const qJenis = String(route.query.jenis_id ?? "").trim();
  if (qNik) values.nik = qNik;
  if (/^\d{4}-\d{2}-\d{2}$/.test(qTanggal)) {
    values.tanggal = qTanggal;
    values.tanggal2 = qTanggal;
  }
  if (qJenis) values.jenis_id = qJenis;
  await muatNomor();
  await resetState.initialize();
});

watch(
  () => values.tanggal,
  () => {
    otorisasiDiterima.value = false;
    otorisasiToken.value = "";
    if (!isEdit.value) muatNomor();
  }
);

watch(
  () => values.nik,
  () => infoKaryawan()
);
</script>

<template>
  <BaseForm
    :title="isEdit ? `Ubah Ijin ${nomorEdit}` : 'Tambah Ijin'"
    subtitle="Surat ijin / tidak masuk — nomor IJN.YYYYMM.NNNN dibuat otomatis per bulan"
    icon="event_available"
    :crumbs="[{ label: 'Ijin', path: '/transaksi/ijin' }, { label: isEdit ? 'Ubah' : 'Tambah' }]"
    :save-fn="simpan"
    :reset-fn="resetState.reset"
    :reset-disabled="resetState.disabled.value"
    return-path="/transaksi/ijin"
    save-label="Simpan Ijin"
  >
    <template #form-content>
      <div v-if="memuat" class="loading">Memuat data...</div>
      <template v-else>
        <fieldset class="fs">
          <legend>Dokumen</legend>
          <div class="grid">
            <FText v-model="values.nomor" label="Nomor" disabled placeholder="Otomatis" />
            <FSelect v-model="values.jenis_id" label="Jenis Ijin" required :options="jenisOptions" />
            <FDate v-model="values.tanggal" label="Tanggal" required />
            <FDate v-model="values.tanggal2" label="Tanggal s/d" required />
          </div>
          <p v-if="isRentang" class="note">
            Rentang {{ values.tanggal }} s/d {{ values.tanggal2 }}: server membuat satu dokumen per hari,
            hari libur dilewati, NIK yang sudah berijin hanya dicatat sebagai peringatan.
          </p>
        </fieldset>

        <fieldset class="fs">
          <legend>Karyawan</legend>
          <div class="grid">
            <FText v-model="values.nik" label="NIK" required placeholder="Ketik NIK lalu Enter / Cari" />
            <FText :model-value="info.nama" label="Nama" disabled @update:model-value="() => {}" />
            <FText :model-value="info.jabatan" label="Jabatan" disabled @update:model-value="() => {}" />
          </div>
          <div class="aksi-row">
            <button class="btn-mini" type="button" @click="bukaCari">Cari karyawan</button>
          </div>
        </fieldset>

        <fieldset class="fs">
          <legend>Waktu & Keterangan</legend>
          <div class="grid">
            <FTime v-model="values.jam" label="Jam" placeholder="00:00:00" />
            <FTime v-if="pakaiJam2" v-model="values.jam2" label="Jam s/d" placeholder="00:00:00" />
            <FSelect
              v-model="values.keterangan"
              label="Keterangan"
              :options="[
                { label: 'Sakit', value: 0 },
                { label: 'Ijin', value: 1 },
                { label: 'Alpha', value: 2 },
                { label: 'Lain Lain', value: 3 },
              ]"
            />
            <FText v-model="values.alasan" label="Alasan" placeholder="Alasan ijin" />
          </div>
          <p v-if="!pakaiJam2" class="note">Jenis ijin ini tidak memakai jam akhir (disimpan 00:00:00).</p>
        </fieldset>

        <fieldset v-if="perluOtorisasi" class="fs warn">
          <legend>Otorisasi Atasan</legend>
          <p class="note">
            Tanggal <strong>{{ values.tanggal }}</strong> berjarak
            <strong>{{ selisihHari(values.tanggal) }} hari</strong> dari hari ini. Program Delphi meminta
            persetujuan atasan sebelum ijin lama boleh disimpan.
          </p>
          <div class="grid">
            <FText v-model="otorisasi.user_kode" label="Kode User Atasan" placeholder="mis. ADMIN" />
            <FText v-model="otorisasi.user_password" label="Password Atasan" type="password" />
          </div>
          <div class="aksi-row">
            <button class="btn-mini primary" type="button" :disabled="cekOtor" @click="cekOtorisasi">
              {{ cekOtor ? "Memeriksa..." : "Verifikasi Otorisasi" }}
            </button>
            <span v-if="otorisasiDiterima" class="ok">Otorisasi diterima oleh {{ otorisasi.user_kode }}</span>
          </div>
        </fieldset>
      </template>
    </template>
  </BaseForm>

  <v-dialog v-model="cariOpen" max-width="760" scrollable>
    <v-card rounded="false">
      <v-card-title class="dlg-head">
        <span>Cari Karyawan</span>
        <v-btn icon="close" size="small" variant="text" @click="cariOpen = false" />
      </v-card-title>
      <v-card-text class="dlg-body">
        <div class="cari-bar">
          <input v-model="kataCari" placeholder="NIK / nama / jabatan / bagian / pabrik..." @keyup.enter="cariNik" />
          <button class="btn-mini primary" type="button" :disabled="cariLoading" @click="cariNik">
            {{ cariLoading ? "Mencari..." : "Cari" }}
          </button>
        </div>
        <KaryawanLookupTable :lookup="karyawanLookup" :columns="['Nik','Nama','Jabatan','Bagian','Pabrik','Status']" @select="pilihKaryawan" />
      </v-card-text>
    </v-card>
  </v-dialog>

  <v-dialog v-model="dialogDuplikat" max-width="440" persistent>
    <v-card rounded="false">
      <v-card-title class="dlg-head"><span>Duplikat Ijin</span></v-card-title>
      <v-card-text class="dlg-body">
        <p class="dup-msg">{{ pesanDuplikat }}</p>
        <p class="dup-q">NIK ini dengan tanggal ini sudah dibuatkan ijin — LANJUT?</p>
      </v-card-text>
      <v-card-actions class="pa-4 pt-2">
        <v-spacer />
        <v-btn variant="text" color="grey-darken-2" @click="dialogDuplikat = false">Batal</v-btn>
        <v-btn color="primary" variant="flat" @click="lanjutDuplikat">Lanjut</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.fs { border: 1px solid var(--ds-border, #b0b8c4); background: #fff; padding: 10px 12px 14px; margin-bottom: 12px; }
.fs > legend { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; color: var(--ds-primary, #3b5998); padding: 0 6px; }
.fs.warn { border-color: #d9a441; background: #fffaef; }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 14px; }
.note { font-size: 12px; color: #7a5b16; margin: 8px 0 0; }
.aksi-row { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.ok { font-size: 12px; font-weight: 700; color: #15803d; }
.btn-mini { height: 26px; padding: 0 10px; border: 1px solid var(--ds-border, #b0b8c4); background: #fff; font-family: "Plus Jakarta Sans", sans-serif; font-size: 11px; font-weight: 700; cursor: pointer; color: var(--ds-on-surface, #1b2d4a); }
.btn-mini.primary { background: var(--ds-primary, #3b5998); border-color: var(--ds-primary-dark, #2c4472); color: #fff; }
.btn-mini:disabled { opacity: 0.6; cursor: not-allowed; }
.loading { padding: 24px; text-align: center; font-size: 12px; color: #6b7a90; }
.dlg-head { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 800; padding: 8px 12px; background: var(--ds-surface-variant, #e0e4ea); }
.dlg-body { background: #fff; padding: 12px 14px; }
.cari-bar { display: flex; gap: 6px; margin-bottom: 10px; }
.cari-bar input { flex: 1; height: 28px; border: 1px solid var(--ds-border, #b0b8c4); padding: 0 8px; font-size: 12px; font-family: "Plus Jakarta Sans", sans-serif; }
table.mini { width: 100%; border-collapse: collapse; font-size: 11px; }
table.mini th { background: var(--ds-surface-variant, #e0e4ea); border: 1px solid var(--ds-border, #b0b8c4); padding: 5px 7px; text-align: left; font-weight: 800; }
table.mini td { border: 1px solid #d5dbe3; padding: 4px 7px; }
table.mini tr.klik:hover { background: var(--ds-primary-lighten-1, #dbe4f3); cursor: pointer; }
table.mini .empty { text-align: center; color: #8995a6; padding: 10px; }
.dup-msg { font-size: 12px; color: #7a5b16; margin: 0 0 6px; }
.dup-q { font-size: 13px; font-weight: 700; margin: 0; }
</style>
