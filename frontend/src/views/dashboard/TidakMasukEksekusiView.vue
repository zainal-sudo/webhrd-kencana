<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { pickError, safeGet, safePost } from "@/api";
import { useToast } from "vue-toastification";
import MsIcon from "@/components/MsIcon.vue";
import {
  PUKUL_DEFAULT,
  PENANDATANGAN,
  besok,
  catatSuratTerbit,
  nomorDariUrut,
  nomorSuratDefault,
  sqlTanggal,
  tanggalDariSql,
  tanggalPanjang,
  teksTujuan,
  unduhSuratPanggilan,
  type SuratPanggilan,
} from "@/utils/suratPanggilan";

/**
 * Halaman "Eksekusi Tidak Masuk" — dibuka tombol Eksekusi pada card Dashboard
 * "Tidak Masuk 3–4 Hari Berturut-turut". Daftar penuh calon Surat Panggilan
 * Karyawan dari sumber tunggal `GET /dashboard/tidak-masuk-berurut` (aturan
 * & tahap identik dengan card).
 *
 * Klik "Buat Surat" → dialog pratinjau (nomor surat, tanggal surat, hari/
 * tanggal panggilan, pukul) lalu **Unduh PDF** — dibuat di sini dengan jsPDF
 * mengikuti template Word `SURAT PANGGILAN KARYAWAN develop.docx`
 * (lihat `src/utils/suratPanggilan.ts`). Data karyawan/absensi tidak disimpan;
 * yang disimpan hanya NOMOR SURAT, di dua tabel:
 *   · `tnomor_surat_panggilan` — counter urut per bulan (nomor unik lintas
 *     komputer HRD);
 *   · `tsurat_panggilan_terbit` — nomor yang sudah terbit DILEKATKAN pada
 *     NIK + nama + rentang tanggal tidak masuk. Membuka ulang surat untuk
 *     data yang sama memakai nomor yang SAMA; data lain dapat nomor baru.
 * Lihat `kunciNomor()`: nomor dikunci saat klik Unduh pertama, dipakai ulang
 * sepanjang dialog, dan gagal server → cadangan hitungan lokal browser.
 */

interface TidakMasukRow {
  Kode_Absensi: string;
  Nik: string;
  Nama: string;
  Bagian: string | null;
  Pabrik: string | null;
  Alamat: string | null;
  Nama_Pabrik: string | null;
  Induk_Pabrik: string | null;
  /** 3 = Surat Panggilan 1, 4 = Surat Panggilan 2 (MANGKIR). */
  Hari: number;
}

const rows = ref<TidakMasukRow[]>([]);
/** 4 tanggal kerja acuan (urut naik) dari endpoint yang sama. */
const acuan = ref<string[]>([]);
const loading = ref(false);
const gagal = ref("");
const cari = ref("");
const toast = useToast();

const filtered = computed<TidakMasukRow[]>(() => {
  const q = cari.value.trim().toLowerCase();
  if (!q) return rows.value;
  return rows.value.filter((r) =>
    `${r.Nik} ${r.Nama} ${r.Pabrik || ""} ${r.Bagian || ""} ${r.Nama_Pabrik || ""}`.toLowerCase().includes(q)
  );
});
const jumlahTahap = computed(() => ({
  tiga: rows.value.filter((r) => Number(r.Hari) === 3).length,
  empat: rows.value.filter((r) => Number(r.Hari) === 4).length,
}));
const acuanTampil = computed(() => acuan.value.map(tglPendek).join(", "));
const tahapTeks = (h: number) => (Number(h) === 4 ? "4 hari · Panggilan 2" : "3 hari · Panggilan 1");

function tglPendek(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d || "");
}

async function load() {
  loading.value = true;
  gagal.value = "";
  try {
    const data = await safeGet<{ rows: TidakMasukRow[]; tanggal?: string[] }>("/dashboard/tidak-masuk-berurut");
    rows.value = Array.isArray(data?.rows) ? data.rows : [];
    acuan.value = Array.isArray(data?.tanggal) ? data.tanggal : [];
  } catch (e) {
    gagal.value = pickError(e);
    toast.error(gagal.value);
  } finally {
    loading.value = false;
  }
}

/* ── Dialog pratinjau → unduh PDF ── */
const dialog = ref(false);
const menyusun = ref(false);
const sumber = ref<TidakMasukRow | null>(null);
const nomor = ref("");
/** True setelah HR mengetik nomor sendiri — otomatis tak lagi menimpanya. */
const nomorDisentuh = ref(false);
/** Nomor yang SUDAH dikunci (diambil dari database) saat klik Unduh pertama;
 *  unduh ulang di dialog yang sama memakai nomor yang sama. */
const nomorKunci = ref("");
/** True bila nomor sudah pernah TERBIT untuk data ini (nama + rentang tanggal)
 *  → nomor melekat dan dipakai ulang, tidak menambah urut. */
const nomorTersimpan = ref(false);
const tglSurat = ref("");
const tglPanggilan = ref("");
const pukul = ref(PUKUL_DEFAULT);

/** Endpoint counter nomor urut di database (lihat
 *  backend/src/controllers/suratPanggilanController.js). */
const NOMOR_API = "/dashboard/surat-panggilan/nomor";

/** Tanggal surat final dari isian dialog. */
function tanggalSurat(): Date {
  return tanggalDariSql(tglSurat.value || sqlTanggal(new Date()));
}
/** Kunci bulan counter "YYYY-MM" — ikut TANGGAL SURAT yang dipilih HR. */
function bulanSurat(): string {
  return sqlTanggal(tanggalSurat()).slice(0, 7);
}

/** Nomor otomatis (cadangan lokal): urut per bulan (mulai 1) + romawi + tahun
 *  mengikuti TANGGAL SURAT yang dipilih. */
function nomorOtomatis(): string {
  return nomorSuratDefault(tanggalSurat());
}

/** Rentang tanggal TIDAK MASUK untuk satu baris — dasar nomor yang melekat.
 *  4 tanggal kerja acuan (`acuan`, urut naik): tahap 4 hari = keempatnya,
 *  tahap 3 hari = 3 tanggal terbaru (aturan yang sama dengan backend). */
function rentangTidakMasuk(r: TidakMasukRow): { awal: string; akhir: string } {
  const n = Math.max(1, Number(r.Hari) || 3);
  const dipakai = acuan.value.slice(-Math.min(n, acuan.value.length || n));
  return { awal: dipakai[0] || "", akhir: dipakai[dipakai.length - 1] || "" };
}

/** Rentang tampil di dialog, mis. "16/11/2026 – 18/11/2026". */
const rentangTampil = computed(() => {
  const r = sumber.value;
  if (!r) return "";
  const { awal, akhir } = rentangTidakMasuk(r);
  if (!awal || !akhir) return "";
  return awal === akhir ? tglPendek(awal) : `${tglPendek(awal)} – ${tglPendek(akhir)}`;
});

/** Identitas surat yang dikirim ke server — nomor melekat pada data ini. */
function identitasSurat(r: TidakMasukRow): Record<string, string | number> {
  const { awal, akhir } = rentangTidakMasuk(r);
  return {
    nik: String(r.Nik || ""),
    nama: String(r.Nama || ""),
    tgl_awal: awal,
    tgl_akhir: akhir,
    tahap: Number(r.Hari) === 4 ? 2 : 1,
  };
}

/** Peek nomor: bila data ini sudah pernah terbit → nomor lama (tersimpan);
 *  bila belum → urut berikutnya. Gagal/DB mati → null (pakai hitungan lokal). */
async function peekNomorDatabase(
  bulan: string,
  r: TidakMasukRow
): Promise<{ urut?: number; nomor?: string; tersimpan?: boolean } | null> {
  try {
    const d = await safeGet<{ urut?: number; nomor?: string; tersimpan?: boolean }>(NOMOR_API, {
      params: { bulan, ...identitasSurat(r) },
    });
    return d ?? null;
  } catch {
    return null;
  }
}

/** KUNCI nomor di server (increment atomik atau pakai nomor yang sudah
 *  terbit). Gagal → null → pemanggil memakai cadangan lokal. */
async function kunciNomorDatabase(
  body: Record<string, unknown>
): Promise<{ urut?: number; nomor?: string; tersimpan?: boolean } | null> {
  try {
    const d = await safePost<{ urut?: number; nomor?: string; tersimpan?: boolean }>(NOMOR_API, body);
    return d ?? null;
  } catch {
    return null;
  }
}

/** Tampilkan nomor untuk data yang sedang dibuka:
 *  · sudah pernah terbit → nomor LAMA (melekat, tidak menambah urut);
 *  · belum → urut berikutnya dari counter bulan. */
async function muatNomorPeek() {
  const r = sumber.value;
  if (!r) return;
  const bulan = bulanSurat();
  const d = await peekNomorDatabase(bulan, r);
  if (!d || sumber.value !== r || bulanSurat() !== bulan) return; // dialog/tanggal berubah
  const urut = Number(d.urut);
  const nomorDb =
    String(d.nomor || "") ||
    (Number.isFinite(urut) && urut > 0 ? nomorDariUrut(urut, tanggalSurat()) : "");
  if (!nomorDb) return;
  if (d.tersimpan) {
    nomorTersimpan.value = true;
    if (!nomorDisentuh.value && !nomorKunci.value) nomor.value = nomorDb;
    return;
  }
  if (nomorKunci.value || nomorDisentuh.value) return;
  nomorTersimpan.value = false;
  nomor.value = nomorDb;
}

/** Isi surat final dari isian dialog + data baris terpilih. */
const isiSurat = computed<SuratPanggilan | null>(() => {
  const r = sumber.value;
  if (!r) return null;
  return {
    tahap: Number(r.Hari) === 4 ? 2 : 1,
    nomor: nomor.value.trim() || nomorOtomatis(),
    nama: String(r.Nama || ""),
    alamat: String(r.Alamat || ""),
    indukPabrik: String(r.Induk_Pabrik || r.Pabrik || ""),
    namaPabrik: String(r.Nama_Pabrik || r.Pabrik || ""),
    tanggalPanggilan: tanggalDariSql(tglPanggilan.value || sqlTanggal(besok())),
    tanggalSurat: tanggalDariSql(tglSurat.value || sqlTanggal(new Date())),
    pukul: pukul.value.trim() || PUKUL_DEFAULT,
  };
});

function buatSurat(row: TidakMasukRow) {
  sumber.value = row;
  tglSurat.value = sqlTanggal(new Date());
  nomorDisentuh.value = false;
  nomorKunci.value = "";
  nomorTersimpan.value = false;
  nomor.value = nomorOtomatis();
  tglPanggilan.value = sqlTanggal(besok());
  pukul.value = PUKUL_DEFAULT;
  dialog.value = true;
  void muatNomorPeek(); // tampilkan nomor yang sudah melekat / urut database
}

/* Ganti tanggal surat → bulan/tahun nomor ikut menyesuaikan
 * (selama HR belum mengetik & belum mengunci nomornya). Nomor yang sudah
 * MELEKAT pada data tidak berubah. */
watch(tglSurat, () => {
  if (nomorKunci.value) return; // nomor sudah diambil → tidak berubah lagi
  if (!nomorTersimpan.value && !nomorDisentuh.value) nomor.value = nomorOtomatis();
  void muatNomorPeek();
});

/** Kunci nomor — dipanggil tepat sebelum PDF dibuat:
 *  · data sudah pernah terbit → server mengembalikan nomor LAMA (tanpa naik urut);
 *  · HR mengetik nomor sendiri → disimpan apa adanya (counter tidak dipakai);
 *  · belum → ambil urut baru dari database (atomik); gagal → hitungan lokal.
 *  Nomor dikunci per dialog: unduh ulang tidak menambah urut. */
async function kunciNomor(): Promise<void> {
  const r = sumber.value;
  if (!r) return;
  if (nomorKunci.value && nomor.value.trim() === nomorKunci.value) return; // unduh ulang
  const manual = nomorDisentuh.value ? nomor.value.trim() : "";
  const hasil = await kunciNomorDatabase({
    bulan: bulanSurat(),
    ...identitasSurat(r),
    ...(manual ? { nomor: manual } : {}),
  });
  if (hasil?.nomor) {
    nomorKunci.value = String(hasil.nomor);
    nomorTersimpan.value = !!hasil.tersimpan;
  } else if (manual) {
    nomorKunci.value = manual; // server tak terjangkau — pakai tulisan HR
    toast.warning("Server nomor surat tidak tersedia — nomor tidak tersimpan di database");
  } else {
    // Cadangan: server nomor tidak terjangkau → hitungan lokal browser.
    nomorKunci.value = nomorOtomatis();
    toast.warning("Server nomor surat tidak tersedia — memakai hitungan lokal browser");
  }
  nomor.value = nomorKunci.value;
}

async function unduh() {
  if (menyusun.value) return;
  menyusun.value = true;
  try {
    await kunciNomor(); // ambil nomor database sekali per dialog
    const isi = isiSurat.value;
    if (!isi) return;
    const berkas = await unduhSuratPanggilan(isi);
    catatSuratTerbit(isi.tanggalSurat); // penanda cadangan lokal (fallback bila DB mati)
    toast.success(`Surat panggilan ${isi.nama} berhasil diunduh (${berkas})`);
    // Dialog DIBIARKAN TERBUKA supaya unduh ulang memakai nomor yang sama
    // (nomor sudah dikunci di `nomorKunci`); HR menutupnya bila sudah selesai.
  } catch (e) {
    toast.error(pickError(e) || "Gagal membuat PDF surat panggilan");
  } finally {
    menyusun.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="page tm-page">
    <div class="page-head">
      <div>
        <h2 class="module-title"><MsIcon name="person_off" :size="18" /> Eksekusi Tidak Masuk</h2>
        <p class="module-sub">
          Karyawan tidak masuk <b>3 hari</b> &rarr; Surat Panggilan 1; <b>4 hari</b> &rarr; Surat Panggilan 2
          (dianggap MANGKIR). PDF dibuat di browser mengikuti template Word
          <i>SURAT PANGGILAN KARYAWAN develop.docx</i> &mdash; nomor surat disimpan di database dan
          <b>melekat pada nama + rentang tanggal</b> tidak masuk (data yang sama memakai nomor yang sama).
        </p>
      </div>
      <button type="button" class="refresh-btn" :disabled="loading" @click="load">
        <MsIcon name="refresh" :size="15" /> Muat Ulang
      </button>
    </div>

    <div class="summary-info" aria-live="polite">
      <span v-if="loading">Memuat daftar...</span>
      <template v-else>
        <span>Total kandidat: {{ rows.length }}</span>
        <span class="dot">&middot;</span>
        <span>Tahap 3 hari (Panggilan 1): {{ jumlahTahap.tiga }}</span>
        <span class="dot">&middot;</span>
        <span>Tahap 4 hari (Panggilan 2): {{ jumlahTahap.empat }}</span>
        <template v-if="acuan.length">
          <span class="dot">&middot;</span>
          <span>Acuan 4 tanggal kerja: {{ acuanTampil }}</span>
        </template>
      </template>
    </div>

    <div class="list-card">
      <div class="card-tool">
        <form class="search-field" role="search" @submit.prevent>
          <input
            v-model="cari"
            type="search"
            class="cari-input"
            aria-label="Cari karyawan tidak masuk"
            placeholder="Cari NIK, nama, pabrik, atau bagian..."
          />
          <button type="submit" class="search-button" aria-label="Cari" title="Cari">
            <MsIcon name="search" :size="16" />
          </button>
        </form>
      </div>

      <div v-if="loading" class="keadaan"><MsIcon name="hourglass_top" :size="16" /> Memuat daftar...</div>
      <div v-else-if="gagal" class="keadaan err"><MsIcon name="error" :size="16" /> {{ gagal }}</div>

      <div v-else class="tbl-wrap">
        <table class="tbl">
          <thead>
            <tr>
              <th scope="col" class="num">No</th>
              <th scope="col" class="col-nik">NIK</th>
              <th scope="col">Nama</th>
              <th scope="col" class="col-pab">Pabrik</th>
              <th scope="col">Bagian</th>
              <th scope="col" class="col-tahap">Tahap</th>
              <th scope="col" class="col-aksi">Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="filtered.length === 0">
              <td colspan="7" class="empty-cell">
                {{ cari ? "Tidak ada karyawan yang cocok dengan pencarian." : "Tidak ada kandidat — tidak ada yang tidak masuk 3–4 hari tanpa ijin." }}
              </td>
            </tr>
            <tr v-for="(r, i) in filtered" :key="r.Nik">
              <td class="num">{{ i + 1 }}</td>
              <td class="col-nik">{{ r.Nik || "-" }}</td>
              <td class="cell-primary">{{ r.Nama || "-" }}</td>
              <td class="col-pab">{{ r.Pabrik || "-" }}</td>
              <td>{{ r.Bagian || "-" }}</td>
              <td class="col-tahap">
                <span class="badge-tahap" :class="Number(r.Hari) === 4 ? 't2' : 't1'">{{ tahapTeks(r.Hari) }}</span>
              </td>
              <td class="col-aksi">
                <button
                  type="button"
                  class="eksekusi-btn"
                  :title="`Buat Surat Panggilan ${Number(r.Hari) === 4 ? 2 : 1} untuk ${r.Nama}`"
                  @click="buatSurat(r)"
                >
                  <MsIcon name="description" :size="14" />
                  <span>Buat Surat</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Dialog pratinjau: nomor/tanggal/pukul lalu unduh PDF -->
    <v-dialog :model-value="dialog && !!sumber" max-width="560" persistent>
      <v-card v-if="sumber && isiSurat">
        <v-card-title class="text-body-1 font-weight-bold">
          Surat Panggilan {{ isiSurat.tahap }} &mdash; {{ sumber.Nama }}
        </v-card-title>
        <v-card-text>
          <div class="aksi-sumber">
            <div><span>Tahap:</span> {{ tahapTeks(sumber.Hari) }}</div>
            <div><span>NIK:</span> {{ sumber.Nik }}</div>
            <div><span>Pabrik:</span> {{ sumber.Pabrik }} &mdash; {{ sumber.Nama_Pabrik || "-" }}</div>
            <div><span>Alamat:</span> {{ sumber.Alamat || "-" }}</div>
            <div v-if="rentangTampil"><span>Tidak masuk:</span> {{ rentangTampil }}</div>
          </div>

          <div class="form-grid">
            <label class="fld fld-nomor">
              <span>Nomor surat</span>
              <input
                v-model="nomor"
                type="text"
                placeholder="urut per bulan, mis. 1/HRD&GA/XI/2026"
                @input="nomorDisentuh = true"
              />
              <em v-if="nomorTersimpan" class="hint-nomor">
                <MsIcon name="lock" :size="12" />
                Nomor sudah terbit untuk data ini &mdash; dipakai ulang, tidak menambah urut.
              </em>
            </label>
            <label class="fld">
              <span>Pukul</span>
              <input v-model="pukul" type="text" placeholder="07.50 WIB" />
            </label>
            <label class="fld">
              <span>Tanggal surat</span>
              <input v-model="tglSurat" type="date" />
            </label>
            <label class="fld">
              <span>Hari/tanggal dipanggil</span>
              <input v-model="tglPanggilan" type="date" />
            </label>
          </div>

          <div class="pratinjau">
            <div class="pratinjau-judul">Pratinjau isi surat</div>
            <p>
              Bersama dengan surat panggilan {{ isiSurat.tahap === 2 ? "2 (dua)" : "1 (satu)" }} ini, Divisi HR
              Kencana Print memanggil Anda sebagai karyawan CV. Kencana Print atas nama:
              <b>{{ isiSurat.nama }}</b>.
            </p>
            <p>
              Untuk masuk kerja kembali di <b>{{ teksTujuan(isiSurat) }}</b> pada:
              <b>{{ tanggalPanjang(isiSurat.tanggalPanggilan) }}</b>, pukul <b>{{ isiSurat.pukul }}</b>.
            </p>
            <p v-if="isiSurat.tahap === 2" class="ancaman">
              Penutup memuat ancaman: apabila tidak hadir dianggap mengundurkan diri tanpa prosedur (MANGKIR).
            </p>
            <p class="ttd">
              {{ PENANDATANGAN.kota }}, {{ tanggalPanjang(isiSurat.tanggalSurat) }} &mdash;
              {{ PENANDATANGAN.nama }} ({{ PENANDATANGAN.jabatan }}); ruang tengah untuk
              stempel/tanda tangan dikosongkan.
            </p>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="menyusun" @click="dialog = false">Batal</v-btn>
          <v-btn color="primary" variant="flat" :loading="menyusun" :disabled="menyusun" @click="unduh">
            <MsIcon name="download" :size="15" />&nbsp; Unduh PDF
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.tm-page {
  --tm-border: #e6eaf2;
  --tm-row-alt: #f8fafc;
  --tm-row-hover: #f0f4fa;
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
  padding: 8px 6px 0;
}
:global(:root[data-theme="dark"] .tm-page) {
  --tm-border: var(--ds-border-light);
  --tm-row-alt: var(--ds-row-alt);
  --tm-row-hover: var(--ds-row-hover);
}
.page-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.page-head > div { min-width: 0; }
.module-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 15px;
  font-weight: 800;
  color: #12224e;
  margin: 0 0 2px;
}
.module-sub {
  margin: 0;
  font-size: 10px;
  line-height: 1.5;
  color: var(--ds-text-secondary, #64748b);
}
.refresh-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid #dbe2ee;
  border-radius: 8px;
  background: #fff;
  color: #1b2d4a;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}
.refresh-btn:hover { background: #f3f6fb; }
.refresh-btn:disabled { opacity: 0.55; cursor: default; }
.summary-info {
  flex-shrink: 0;
  margin-bottom: 8px;
  font-size: 10px;
  color: var(--ds-text-secondary, #5a6a7e);
}
.summary-info .dot { margin: 0 6px; }
.list-card {
  flex: 1 0 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--ds-surface-raised, #fff);
  border: 1px solid var(--tm-border);
  border-radius: 10px;
  padding: 12px 14px;
  box-shadow: 0 1px 3px rgba(18, 34, 78, 0.05);
}
.card-tool {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding-bottom: 10px;
}
.cari-input {
  width: 100%;
  padding: 6px 38px 6px 10px;
  border: 1px solid #dbe2ee;
  border-radius: 7px;
  font-size: 11.5px;
  color: #1b2d4a;
}
.cari-input:focus { outline: none; border-color: #3b5998; }
.search-field { position: relative; width: 320px; max-width: 100%; }
.search-button {
  position: absolute;
  right: 3px;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 26px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--ds-text-secondary, #5a6a7e);
  cursor: pointer;
}
.search-button:hover { background: var(--ds-primary-50, #e8edf5); color: var(--ds-primary, #3b5998); }
.keadaan {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 18px 6px;
  font-size: 12px;
  color: var(--ds-text-secondary, #5a6a7e);
}
.keadaan.err { color: #b42318; }
.tbl-wrap {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  border: 1px solid var(--tm-border);
  border-radius: 8px;
  scrollbar-gutter: stable;
}
.tbl {
  width: 100%;
  min-width: 820px;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 12px;
}
.tbl th {
  position: sticky;
  top: 0;
  z-index: 2;
  height: 38px;
  padding: 9px 14px;
  background: #3b5998;
  color: #fff;
  font-weight: 700;
  text-align: left;
  white-space: nowrap;
}
.tbl th.num { width: 48px; }
.tbl th.col-nik { width: 110px; }
.tbl th.col-pab { width: 80px; }
.tbl th.col-tahap { width: 170px; }
.tbl th.col-aksi { width: 120px; }
.tbl td {
  height: 46px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--tm-border);
  color: var(--ds-text, #1b2d4a);
  vertical-align: middle;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.tbl tbody tr:last-child td { border-bottom: 0; }
.tbl .num,
.tbl .col-nik,
.tbl .col-pab,
.tbl .col-tahap,
.tbl .col-aksi { text-align: center; }
.tbl td.num { color: var(--ds-text-secondary, #5a6a7e); font-variant-numeric: tabular-nums; }
.tbl tbody tr:nth-child(even) { background: var(--tm-row-alt); }
.tbl tbody tr:hover { background: var(--tm-row-hover); }
.cell-primary { font-weight: 600; }
.empty-cell {
  padding: 22px 14px;
  text-align: center;
  color: var(--ds-text-secondary, #5a6a7e);
}
.badge-tahap {
  display: inline-block;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
  white-space: nowrap;
}
.badge-tahap.t1 { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
.badge-tahap.t2 { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
.eksekusi-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border: 1px solid #3b5998;
  border-radius: 7px;
  background: #3b5998;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.eksekusi-btn:hover { background: #2f4779; }
.aksi-sumber {
  display: grid;
  gap: 3px;
  margin-bottom: 12px;
  padding: 9px 11px;
  border: 1px solid var(--tm-border);
  border-radius: 8px;
  background: var(--ds-row-alt, #f8fafc);
  font-size: 11.5px;
}
.aksi-sumber span { color: var(--ds-text-secondary, #5a6a7e); display: inline-block; min-width: 68px; }
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 12px;
}
.fld { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--ds-text-secondary, #5a6a7e); }
.fld input {
  padding: 6px 8px;
  border: 1px solid #dbe2ee;
  border-radius: 6px;
  font-size: 12px;
  color: #1b2d4a;
  background: var(--ds-surface, #fff);
}
.fld input:focus { outline: none; border-color: #3b5998; }
.fld-nomor { grid-column: 1 / -1; }
.hint-nomor {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  font-size: 10px;
  font-style: normal;
  font-weight: 600;
  color: #1d6f42;
}
.pratinjau {
  padding: 10px 12px;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--ds-text, #1b2d4a);
}
.pratinjau p { margin: 0 0 6px; }
.pratinjau p:last-child { margin-bottom: 0; }
.pratinjau-judul {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--ds-text-secondary, #5a6a7e);
  margin-bottom: 6px;
}
.ancaman { color: #b42318; font-weight: 600; }
.ttd { color: var(--ds-text-secondary, #5a6a7e); }
@media (max-width: 640px) {
  .form-grid { grid-template-columns: 1fr; }
}
</style>
