<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import { useToast } from "vue-toastification";
import MsIcon from "@/components/MsIcon.vue";
import { api, getErrorMessage } from "@/api/axios";
import { todaySql, firstDayOfMonth, formatTanggal } from "@/utils/format";

/**
 * Import Absensi — padanan `ufrmImportAbsensi`.
 *
 * Dua tahap, sama seperti program Delphi:
 *  1. Tarik hasil ekspor mesin absensi (Excel/CSV) ke tabel staging
 *     `tabsensi2`. Program Delphi membaca `absensi.mdb` langsung dari folder
 *     tiap mesin; karena Node tidak bisa membaca MDB, berkasnya diunggah.
 *  2. "Proses" menyalin staging ke `tabsensi` untuk periode terpilih sekaligus
 *     membuat baris kosong bagi karyawan aktif yang tidak scan.
 */
const toast = useToast();

interface PabrikRow {
  Kode: string;
  Nama: string;
  Path: string;
  pilih: boolean;
}

const pabrik = ref<PabrikRow[]>([]);
const periode = reactive({ start: firstDayOfMonth(), end: todaySql() });
const memuat = ref(false);
const mengunggah = ref(false);
const memproses = ref(false);
const ringkasan = ref<{ jml: number; karyawan: number; dari: string; sampai: string } | null>(null);
const perHari = ref<{ tanggal: string; jml: number }[]>([]);

async function muatPabrik() {
  try {
    const { data } = await api.get("/absensi/pabrik");
    pabrik.value = (data.data || []).map((p: any) => ({ ...p, pilih: true }));
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat daftar pabrik"));
  }
}

async function muatStaging() {
  try {
    const { data } = await api.get("/absensi/staging", {
      params: { start_date: periode.start, end_date: periode.end },
    });
    ringkasan.value = data.data?.ringkasan ?? null;
    perHari.value = data.data?.perHari ?? [];
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat data staging"));
  }
}

onMounted(async () => {
  memuat.value = true;
  await Promise.all([muatPabrik(), muatStaging()]);
  memuat.value = false;
});

function pilihSemua(v: boolean) {
  pabrik.value.forEach((p) => (p.pilih = v));
}

const fileInput = ref<HTMLInputElement | null>(null);
const namaFile = ref("");
const fileBody = ref<File | null>(null);

function pilihFile(ev: Event) {
  const el = ev.target as HTMLInputElement;
  const f = el.files?.[0] ?? null;
  fileBody.value = f;
  namaFile.value = f?.name ?? "";
}

async function unggah() {
  if (!fileBody.value) {
    toast.error("Pilih berkas hasil ekspor mesin absensi terlebih dahulu");
    return;
  }
  const path = pabrik.value.find((p) => p.pilih)?.Path ?? "";
  const fd = new FormData();
  fd.append("file", fileBody.value);
  fd.append("path", path);
  fd.append("start_date", periode.start);
  fd.append("end_date", periode.end);

  mengunggah.value = true;
  try {
    const { data } = await api.post("/absensi/staging", fd);
    toast.success(data.message || "Data masuk ke staging");
    namaFile.value = "";
    fileBody.value = null;
    if (fileInput.value) fileInput.value.value = "";
    await muatStaging();
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal mengunggah berkas"));
  } finally {
    mengunggah.value = false;
  }
}

async function proses() {
  const dipilih = pabrik.value.filter((p) => p.pilih);
  if (!dipilih.length) {
    toast.error("Pilih minimal satu pabrik untuk diproses");
    return;
  }
  memproses.value = true;
  try {
    const { data } = await api.post("/absensi/proses", {
      start_date: periode.start,
      end_date: periode.end,
    });
    toast.success(data.message || "Proses absensi selesai");
    await muatStaging();
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memproses absensi"));
  } finally {
    memproses.value = false;
  }
}

async function prosesSatuTanggal(tanggal: string) {
  memproses.value = true;
  try {
    const { data } = await api.post("/absensi/proses-tanggal", { tanggal });
    toast.success(data.message || "Selesai");
    await muatStaging();
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memproses tanggal"));
  } finally {
    memproses.value = false;
  }
}

async function bersihkan() {
  memproses.value = true;
  try {
    const { data } = await api.delete("/absensi/staging", {
      params: { start_date: periode.start, end_date: periode.end },
    });
    toast.success(data.message || "Staging dibersihkan");
    await muatStaging();
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal membersihkan staging"));
  } finally {
    memproses.value = false;
  }
}
</script>

<template>
  <div class="panel">
    <div class="toolbar">
      <div class="tb-left">
        <span class="tool-icon"><MsIcon name="upload_file" :size="16" /></span>
        <span class="tool-title">Import Absensi</span>
        <span class="tool-sub">Tarik data mesin absensi ke staging, lalu salin ke tabel absensi</span>
      </div>
      <div class="tb-right">
        <div class="periode">
          <label>Dari</label>
          <input v-model="periode.start" type="date" @change="muatStaging" />
          <label>Sampai</label>
          <input v-model="periode.end" type="date" @change="muatStaging" />
        </div>
        <button class="tool-btn ghost" title="Muat ulang" @click="muatStaging">
          <MsIcon name="refresh" :size="15" />
        </button>
      </div>
    </div>

    <div class="body">
      <div v-if="memuat" class="loading">Memuat data...</div>

      <template v-else>
        <!-- ── Tahap 1: staging ──────────────────────────────────── -->
        <fieldset class="fs">
          <legend>Tahap 1 — Ambil Data Mesin Absensi</legend>
          <p class="note">
            Daftar di bawah adalah folder mesin absensi tiap pabrik (dari Master Pabrik) sebagai panduan
            saat mengambil berkas ekspor. Unggah hasil ekspor (Excel atau CSV) yang kolomnya memuat
            <strong>NIK karyawan</strong> (<code>kar_Nik</code>), tanggal, jam scan, dan tipe
            <code>I</code>/<code>O</code>; isinya masuk ke tabel staging <code>tabsensi2</code>. Pada tahap
            proses, NIK dipetakan ke Kode Absensi sesuai Master Karyawan.
          </p>

          <table class="mini">
            <thead>
              <tr>
                <th style="width: 40px">#</th>
                <th style="width: 60px">Pakai</th>
                <th style="width: 90px">Kode</th>
                <th style="width: 190px">Nama Pabrik</th>
                <th>Folder Mesin Absensi</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(p, i) in pabrik" :key="p.Kode">
                <td class="ctr">{{ i + 1 }}</td>
                <td class="ctr">
                  <input v-model="p.pilih" type="checkbox" />
                </td>
                <td>{{ p.Kode }}</td>
                <td>{{ p.Nama }}</td>
                <td class="path">{{ p.Path || "(tidak diisi di Master Pabrik)" }}</td>
              </tr>
              <tr v-if="!pabrik.length"><td colspan="5" class="empty">Tidak ada pabrik aktif</td></tr>
            </tbody>
          </table>

          <div class="upload-row">
            <input ref="fileInput" type="file" accept=".xlsx,.xls,.csv" @change="pilihFile" />
            <span class="fname">{{ namaFile || "Belum ada berkas dipilih" }}</span>
            <button class="btn-mini primary" type="button" :disabled="mengunggah" @click="unggah">
              {{ mengunggah ? "Mengunggah..." : "Unggah ke Staging" }}
            </button>
          </div>
        </fieldset>

        <!-- ── Isi staging ─────────────────────────────────────────── -->
        <fieldset class="fs">
          <legend>Isi Data Staging ({{ periode.start }} s/d {{ periode.end }})</legend>
          <div class="ringkasan">
            <div class="kotak">
              <b>{{ ringkasan?.jml ?? 0 }}</b>
              <span>baris scan</span>
            </div>
            <div class="kotak">
              <b>{{ ringkasan?.karyawan ?? 0 }}</b>
              <span>karyawan</span>
            </div>
            <div class="kotak">
              <b>{{ ringkasan?.dari ? formatTanggal(ringkasan.dari) : "-" }}</b>
              <span>tanggal awal</span>
            </div>
            <div class="kotak">
              <b>{{ ringkasan?.sampai ? formatTanggal(ringkasan.sampai) : "-" }}</b>
              <span>tanggal akhir</span>
            </div>
          </div>

          <table v-if="perHari.length" class="mini mt">
            <thead>
              <tr><th>Tanggal</th><th style="width: 110px">Jumlah Scan</th><th style="width: 150px">Aksi</th></tr>
            </thead>
            <tbody>
              <tr v-for="d in perHari" :key="d.tanggal">
                <td>{{ formatTanggal(d.tanggal) }}</td>
                <td class="ctr">{{ d.jml }}</td>
                <td>
                  <button class="btn-mini" type="button" :disabled="memproses" @click="prosesSatuTanggal(d.tanggal)">
                    Proses tanggal ini
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else class="empty">Belum ada data staging pada periode ini.</p>
        </fieldset>

        <!-- ── Tahap 2: proses ────────────────────────────────────── -->
        <fieldset class="fs accent">
          <legend>Tahap 2 — Proses ke Tabel Absensi</legend>
          <p class="note">
            Menyalin seluruh staging pada periode tersebut ke tabel <code>tabsensi</code> (baris lama per
            kode+tanggal dihapus dulu) lalu membuat baris kosong bagi karyawan aktif yang tidak absen.
            Proses berlaku untuk seluruh periode, bukan hanya pabrik yang dicentang.
          </p>
          <div class="aksi-row">
            <button class="btn-mini primary" type="button" :disabled="memproses" @click="proses">
              {{ memproses ? "Memproses..." : "Proses Absensi" }}
            </button>
            <button class="btn-mini danger" type="button" :disabled="memproses" @click="bersihkan">
              Bersihkan Staging Periode Ini
            </button>
          </div>
        </fieldset>
      </template>
    </div>
  </div>
</template>

<style scoped>
.panel {
  border: 1px solid var(--ds-border, #b0b8c4);
  background: var(--ds-surface, #f0f3f8);
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  background: var(--ds-surface-variant, #e0e4ea);
  border-bottom: 1px solid var(--ds-border, #b0b8c4);
  flex-wrap: wrap;
}
.tb-left,
.tb-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.tool-icon {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ds-primary, #3b5998);
  color: #fff;
}
.tool-title {
  font-size: 13px;
  font-weight: 800;
  color: var(--ds-on-surface, #1b2d4a);
}
.tool-sub {
  font-size: 11px;
  color: #6b7a90;
  border-left: 1px solid #b0b8c4;
  padding-left: 8px;
}
.periode {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
}
.periode label {
  font-size: 10px;
  font-weight: 700;
  color: #55637a;
  text-transform: uppercase;
}
.periode input {
  border: 1px solid #c3cad4;
  padding: 3px 6px;
  font-size: 11px;
  font-family: "Plus Jakarta Sans", sans-serif;
  background: #fff;
}
.tool-btn {
  height: 28px;
  display: flex;
  align-items: center;
  padding: 0 9px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  cursor: pointer;
  color: var(--ds-on-surface, #1b2d4a);
}
.body {
  padding: 12px;
}
.fs {
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  padding: 10px 12px 14px;
  margin-bottom: 12px;
}
.fs.accent {
  border-color: var(--ds-primary, #3b5998);
  box-shadow: inset 3px 0 0 var(--ds-primary, #3b5998);
}
.fs > legend {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--ds-primary, #3b5998);
  padding: 0 6px;
}
.note {
  font-size: 11.5px;
  color: #55637a;
  margin: 0 0 10px;
  line-height: 1.5;
}
.note code {
  background: #eef1f6;
  padding: 0 3px;
}
.pick-baris {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}
table.mini {
  width: 100%;
  border-collapse: collapse;
  font-size: 11.5px;
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
.ctr {
  text-align: center;
}
.path {
  font-family: Consolas, monospace;
  font-size: 11px;
  color: #6b7a90;
}
table.mini .empty {
  text-align: center;
  color: #8995a6;
  padding: 10px;
}
.upload-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.fname {
  font-size: 11.5px;
  color: #55637a;
}
.ringkasan {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.kotak {
  flex: 1;
  min-width: 110px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: var(--ds-surface, #f7f9fc);
  padding: 8px 10px;
  text-align: center;
}
.kotak b {
  display: block;
  font-size: 17px;
  color: var(--ds-primary, #3b5998);
}
.kotak span {
  font-size: 10.5px;
  text-transform: uppercase;
  color: #6b7a90;
  font-weight: 700;
}
table.mini.mt {
  margin-top: 10px;
}
.aksi-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.ket {
  font-size: 11px;
  color: #6b7a90;
}
.btn-mini {
  height: 27px;
  padding: 0 11px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
  color: var(--ds-on-surface, #1b2d4a);
}
.btn-mini.primary {
  background: var(--ds-primary, #3b5998);
  border-color: var(--ds-primary-dark, #2c4472);
  color: #fff;
}
.btn-mini.danger {
  background: #fff;
  border-color: #d98a8a;
  color: #b91c1c;
}
.btn-mini:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.loading {
  padding: 30px;
  text-align: center;
  font-size: 12px;
  color: #6b7a90;
}
</style>