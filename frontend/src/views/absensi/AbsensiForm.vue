<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
import KaryawanLookupTable from "@/components/KaryawanLookupTable.vue";
import OtorisasiKode from "@/components/OtorisasiKode.vue";
import { useKaryawanLookup } from "@/composables/useKaryawanLookup";
import FText from "@/components/fields/FText.vue";
import FTime from "@/components/fields/FTime.vue";
import FDate from "@/components/fields/FDate.vue";
import { api, getErrorMessage } from "@/api/axios";
import { todaySql } from "@/utils/format";
import { normJam, selisihHari, assertClockTime } from "@/utils/jam";

/**
 * Form absensi — padanan `ufrmAbsensi`.
 *
 * Field: Kode Absensi (bukan NIK), Tanggal, Jam Masuk/Keluar (jadwal) dan
 * Scan Masuk/Keluar (hasil mesin). Bila tanggal lebih dari 2 hari lalu,
 * penyimpanan meminta otorisasi atasan model kode ala Delphi
 * (backend menolak dengan 403 bila tanpa token).
 */
const route = useRoute();
const router = useRouter();
const toast = useToast();
const karyawanLookup = useKaryawanLookup("/absensi/karyawan");

const nik = computed(() => String(route.query.nik ?? ""));
const tanggal = computed(() => String(route.query.tanggal ?? "").slice(0, 10));
const isEdit = computed(() => !!route.query.nik);

const values = reactive<Record<string, any>>({
  nik: nik.value,
  tanggal: tanggal.value || todaySql(),
  masuk: "08:00:00",
  scan1: "00:00:00",
  keluar: "16:30:00",
  scan2: "00:00:00",
  status: 0,
  verifikasi: 0,
});

const info = reactive({ nama: "", jabatan: "", bagian: "", pabrik: "", nikKaryawan: "" });
const memuat = ref(false);
const adaRecord = ref(false);
const cariKaryawan = ref(false);
const kataCariKaryawan = ref("");
const cariLoading = ref(false);

const perluOtorisasi = computed(() => selisihHari(values.tanggal) >= 2);
const diformat = computed(() => !perluOtorisasi.value || otorisasiDiterima.value);

const otorisasiDiterima = ref(false);
const otorisasiToken = ref("");

function otorisasiOke(payload: { token: string; pemberi: string }) {
  // Token inilah yang membuktikan ke server bahwa otorisasi benar-benar
  // dijalankan; flag di sisi klien tidak dipercaya.
  otorisasiToken.value = payload.token;
  otorisasiDiterima.value = true;
}

async function muatData() {
  const kode = String(values.nik ?? "").trim();
  if (!kode) return;
  memuat.value = true;
  try {
    const { data } = await api.get("/absensi/form", { params: { nik: kode, tanggal: values.tanggal } });
    const d = data.data;
    adaRecord.value = !!d.ada;
    if (d.ada) {
      values.masuk = d.masuk || "08:00:00";
      values.scan1 = d.scan1 || "00:00:00";
      values.keluar = d.keluar || "16:30:00";
      values.scan2 = d.scan2 || "00:00:00";
      values.status = d.status ?? 0;
      values.verifikasi = d.verifikasi ?? 0;
    } else {
      const def = d.defaults || {};
      values.masuk = def.masuk || "08:00:00";
      values.scan1 = def.scan1 || "00:00:00";
      values.keluar = def.keluar || "16:30:00";
      values.scan2 = def.scan2 || "00:00:00";
      values.status = 0;
      values.verifikasi = 0;
    }
    const k = d.karyawan || {};
    info.nama = k.kar_nama || d.nama || "";
    info.jabatan = k.jab_nama || d.jabatan || "";
    info.bagian = k.kar_bagian || d.bagian || "";
    info.pabrik = k.pab_nama || d.pabrik || "";
    info.nikKaryawan = k.kar_Nik || d.nikKaryawan || "";
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat data absensi"));
  } finally {
    memuat.value = false;
  }
}

onMounted(muatData);

watch(
  () => values.tanggal,
  () => {
    otorisasiDiterima.value = false;
    otorisasiToken.value = "";
    if (values.nik) muatData();
  }
);

function bukaCariKaryawan() {
  kataCariKaryawan.value = String(values.nik || "");
  cariKaryawan.value = true;
  cariNik();
}

async function cariNik() {
  cariLoading.value = true;
  try {
    await karyawanLookup.search(kataCariKaryawan.value, { aktif: 1 });
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal mencari karyawan"));
  } finally {
    cariLoading.value = false;
  }
}

function pilihKaryawan(row: Record<string, any>) {
  values.nik = String(row.KodeAbsensi ?? "");
  info.nama = row.Nama || "";
  info.jabatan = row.Jabatan || "";
  info.bagian = row.Bagian || "";
  info.pabrik = row.Pabrik || "";
  cariKaryawan.value = false;
  muatData();
}

async function simpan(): Promise<string> {
  assertClockTime(values.masuk, "Jam Masuk");
  assertClockTime(values.keluar, "Jam Keluar");
  assertClockTime(values.scan1, "Scan Masuk");
  assertClockTime(values.scan2, "Scan Keluar");
  if (!values.nik) throw new Error("Kode absensi wajib diisi");
  if (!values.tanggal) throw new Error("Tanggal wajib diisi");
  if (!diformat.value) throw new Error("Otorisasi atasan belum diverifikasi");

  const body: Record<string, any> = {
    nik: String(values.nik).trim(),
    tanggal: String(values.tanggal).slice(0, 10),
    masuk: normJam(values.masuk),
    scan1: normJam(values.scan1),
    keluar: normJam(values.keluar),
    scan2: normJam(values.scan2),
    status: values.status,
    verifikasi: values.verifikasi,
  };
  if (otorisasiToken.value) {
    body.otorisasi_token = otorisasiToken.value;
    body.otorisasi_nomor = body.nik;
  }

  // `masuk`, `keluar`, dan `status` dihitung ulang oleh trigger database dari
  // jadwal karyawan, jadi pakai nilai yang benar-benar tersimpan.
  const { data } = adaRecord.value ? await api.put("/absensi", body) : await api.post("/absensi", body);
  const d = data.data || {};
  values.masuk = d.masuk ?? values.masuk;
  values.keluar = d.keluar ?? values.keluar;
  values.status = d.status ?? values.status;
  return d.otorisasi_by
    ? `Absensi ${body.nik} tanggal ${body.tanggal} tersimpan, disetujui oleh ${d.otorisasi_by}.`
    : `Absensi ${body.nik} tanggal ${body.tanggal} berhasil disimpan.`;
}

function kembali() {
  router.push("/absensi/browse");
}
</script>

<template>
  <BaseForm
    :title="adaRecord ? `Ubah Absensi ${nik}` : 'Tambah Absensi'"
    :subtitle="adaRecord ? 'Perubahan jam scan langsung berlaku pada rekap absensi' : 'Isi jam scan bila mesin absensi gagal mengirim data'"
    icon="how_to_reg"
    :crumbs="[
      { label: 'Browse Absensi', path: '/absensi/browse' },
      { label: adaRecord ? 'Ubah' : 'Tambah' },
    ]"
    :save-fn="simpan"
    return-path="/absensi/browse"
    save-label="Simpan Absensi"
  >
    <template #form-content>
      <div v-if="memuat" class="loading">Memuat data...</div>

      <template v-else>
        <fieldset class="fs">
          <legend>Identitas Absensi</legend>
          <div class="grid">
            <FText
              v-model="values.nik"
              label="Kode Absensi"
              required
              :disabled="isEdit"
              placeholder="Kode dari mesin absensi"
            />
            <FDate v-model="values.tanggal" label="Tanggal" required />
          </div>

          <div class="lookup-bar">
            <button class="btn-mini" type="button" :disabled="isEdit" @click="bukaCariKaryawan">
              Cari karyawan
            </button>
            <div class="info-box">
              <div><span>NIK</span><b>{{ info.nikKaryawan || "-" }}</b></div>
              <div><span>Nama</span><b>{{ info.nama || "-" }}</b></div>
              <div><span>Jabatan</span><b>{{ info.jabatan || "-" }}</b></div>
              <div><span>Bagian</span><b>{{ info.bagian || "-" }}</b></div>
              <div><span>Pabrik</span><b>{{ info.pabrik || "-" }}</b></div>
            </div>
          </div>
        </fieldset>

        <fieldset class="fs">
          <legend>Jam Kerja (dari Jadwal)</legend>
          <p class="note">
            Nilai jam masuk, jam keluar, dan status dihitung ulang oleh database dari jadwal
            karyawan (<em>tkaryawanjadwal</em>). Isi jam scan di bawah; kolom ini akan
            menyesuaikan sendiri setelah disimpan.
          </p>
          <div class="grid">
            <FTime v-model="values.masuk" label="Jam Masuk" placeholder="08:00:00" />
            <FTime v-model="values.keluar" label="Jam Keluar" placeholder="16:30:00" />
          </div>
        </fieldset>

        <fieldset class="fs">
          <legend>Hasil Scan Mesin</legend>
          <div class="grid">
            <FTime v-model="values.scan1" label="Scan Masuk" placeholder="00:00:00" />
            <FTime v-model="values.scan2" label="Scan Keluar" placeholder="00:00:00" />
            <FText v-model="values.status" label="Status (0/1/2)" type="number" />
            <FText v-model="values.verifikasi" label="Verifikasi (0/1)" type="number" />
          </div>
        </fieldset>

        <OtorisasiKode
          v-if="perluOtorisasi"
          modul="absensi"
          :tanggal="String(values.tanggal || '')"
          @verified="otorisasiOke"
        />
      </template>
    </template>

    <template #footer-left>
      <button class="btn-mini ghost" type="button" @click="kembali">&larr; Kembali ke daftar</button>
    </template>
  </BaseForm>

  <!-- Pencarian kode absensi -->
  <v-dialog v-model="cariKaryawan" max-width="760" scrollable>
    <v-card rounded="false">
      <v-card-title class="dlg-head">
        <span>Cari Karyawan</span>
        <v-btn icon="close" size="small" variant="text" @click="cariKaryawan = false" />
      </v-card-title>
      <v-card-text class="dlg-body">
        <div class="cari-bar">
          <input v-model="kataCariKaryawan" aria-label="Cari karyawan" placeholder="Kode absensi / NIK / nama / jabatan / bagian / pabrik..." @keyup.enter="cariNik" />
          <button class="btn-mini primary" type="button" :disabled="cariLoading" @click="cariNik">Cari</button>
        </div>
        <KaryawanLookupTable :lookup="karyawanLookup" :columns="['KodeAbsensi','Nama','Jabatan','Bagian','Pabrik','Status']" @select="pilihKaryawan" />
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.fs {
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  padding: 10px 12px 14px;
  margin-bottom: 12px;
}
.fs > legend {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--ds-primary, #3b5998);
  padding: 0 6px;
}
.fs.warn {
  border-color: #d9a441;
  background: #fffaef;
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 14px;
}
.lookup-bar {
  margin-top: 10px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.info-box {
  flex: 1;
  border: 1px dashed var(--ds-border, #b0b8c4);
  background: var(--ds-surface, #f7f9fc);
  padding: 6px 10px;
}
.info-box > div {
  display: grid;
  grid-template-columns: 90px 1fr;
  font-size: 12px;
  padding: 2px 0;
}
.info-box span {
  color: #6b7a90;
  font-weight: 700;
}
.note {
  font-size: 12px;
  color: #7a5b16;
  margin: 0 0 8px;
}
.aksi-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}
.ok {
  font-size: 12px;
  font-weight: 700;
  color: #15803d;
}
.btn-mini {
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  color: var(--ds-on-surface, #1b2d4a);
}
.btn-mini.primary {
  background: var(--ds-primary, #3b5998);
  border-color: var(--ds-primary-dark, #2c4472);
  color: #fff;
}
.btn-mini.ghost {
  background: transparent;
}
.btn-mini:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.loading {
  padding: 24px;
  text-align: center;
  font-size: 12px;
  color: #6b7a90;
}
.dlg-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 800;
  padding: 8px 12px;
  background: var(--ds-surface-variant, #e0e4ea);
}
.cari-bar { display: flex; gap: 6px; margin-bottom: 10px; }
.cari-bar input {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  font: inherit;
  font-size: 11px;
  color: var(--ds-text);
  background: var(--ds-surface-raised);
  border: 1px solid var(--ds-border);
}
.dlg-body {
  background: #fff;
  padding: 12px 14px;
}
table.mini {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
table.mini th {
  background: var(--ds-surface-variant, #e0e4ea);
  border: 1px solid var(--ds-border, #b0b8c4);
  padding: 5px 7px;
  text-align: left;
  font-weight: 800;
}
table.mini td {
  border: 1px solid #d5dbe3;
  padding: 4px 7px;
}
table.mini tr.klik:hover {
  background: var(--ds-primary-lighten-1, #dbe4f3);
  cursor: pointer;
}
table.mini .empty {
  text-align: center;
  color: #8995a6;
  padding: 10px;
}
</style>
