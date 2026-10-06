<script setup lang="ts">
import BaseBrowse from "@/components/BaseBrowse.vue";
import type { BrowseColumn } from "@/types";
import { firstDayOfMonth } from "@/utils/format";
import { ref } from "vue";
import { useToast } from "vue-toastification";
import { api, getErrorMessage } from "@/api/axios";

/**
 * Browse Mutasi Karyawan — padanan `ufrmBrowseMutasiKaryawan`.
 *
 * Tombol cetak memakai query report Delphi (cxButton3Click -> `Mutasi.fr3`)
 * via GET /transaksi/mutasi/surat. Tampilan surat di dialog maupun cetakan
 * meniru `D:\program\hrd\report\Mutasi.fr3` titik per titik: kop Kencana
 * Print, SURAT KEPUTUSAN + nomor + Tentang + alasan (uppercase),
 * MENIMBANG / MENGINGAT / MEMUTUSKAN, tabel data karyawan, dua paragraf
 * penutup, tanda tangan Boyolali + CV. Kencana Print + ANDI WAHYU NUGROHO,
 * dan tembusan (semuanya hardcode di template Delphi, ikut di-hardcode).
 */
const toast = useToast();
const columns: BrowseColumn[] = [
  { key: "Nomor", label: "Nomor", width: "130px" },
  { key: "Tanggal", label: "Tanggal", type: "date", width: "95px" },
  { key: "Keterangan", label: "Keterangan", width: "90px" },
  { key: "Nik", label: "NIK", width: "110px" },
  { key: "Nama", label: "Nama Lengkap" },
  { key: "Pabrik Lama", label: "Pabrik Lama", width: "90px" },
  { key: "Bagian Lama", label: "Bagian Lama" },
  { key: "Jabatan_Lama", label: "Jabatan Lama" },
  { key: "Pabrik Baru", label: "Pabrik Baru", width: "90px" },
  { key: "Bagian Baru", label: "Bagian Baru" },
  { key: "Jabatan_Baru", label: "Jabatan Baru" },
  { key: "Lapor", label: "Melapor Kepada" },
];

const suratOpen = ref(false);
const surat = ref<Record<string, any> | null>(null);

async function cetak(row: Record<string, any>) {
  try {
    const { data } = await api.get("/transaksi/mutasi/surat", { params: { nomor: row.Nomor } });
    surat.value = data.data;
    suratOpen.value = true;
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat surat mutasi"));
  }
}

/** Format `dd MMM yyyy` ala template (`dd mmm yyyy`), mis. 06 Feb 2026. */
function fmtSurat(sql: string | null | undefined): string {
  if (!sql) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(sql));
  if (!m) return String(sql).slice(0, 10);
  const bulan = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${m[3]} ${bulan[Number(m[2]) - 1]} ${m[1]}`;
}

/** Huruf besar semua — meniru hasil cetak Delphi pada contoh surat. */
function up(v: unknown): string {
  return String(v ?? "").toUpperCase();
}
function logoAbsolut(): string {
  try {
    return new URL(`${import.meta.env.BASE_URL || "/"}img/kp.jpg`, window.location.href).href;
  } catch {
    return `${window.location.origin}/img/kp.jpg`;
  }
}

/** Cetak surat ke printer — dokumen mandiri agar rapi di kertas A4. */
function printSurat() {
  if (!surat.value) return;
  const s = surat.value;
  const logo = logoAbsolut();
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) {
    toast.error("Popup diblokir browser — izinkan popup untuk mencetak");
    return;
  }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Surat Keputusan ${s.mut_nomor}</title>
<style>
  @page { size: A4 portrait; margin: 1cm; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12.5px; line-height: 1.45; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .kop { text-align: right; margin-bottom: 4px; }
  .kop img { width: 250px; height: auto; }
  h1 { text-align: center; font-size: 15px; text-decoration: underline; margin: 8px 0 2px; }
  .nomor { text-align: center; font-weight: bold; }
  .tentang { text-align: center; margin: 6px 0 2px; }
  .alasan { text-align: center; font-weight: bold; font-size: 14px; margin-bottom: 10px; }
  p { margin: 6px 0; }
  p.just { text-align: justify; }
  p.putusan { font-weight: bold; margin-left: 32px; }
  table.data { margin: 2px 0 2px 32px; border: 0; border-collapse: collapse; table-layout: fixed; width: calc(100% - 32px); }
  table.data col.lbl { width: 4.4cm; }
  table.data col.sep { width: 0.5cm; }
  table.data td { padding: 1px 4px; vertical-align: top; white-space: nowrap; overflow: hidden; }
  .ttd { margin: 20px 0 0 40px; font-weight: bold; font-style: italic; }
  .ttd .cv { text-align: left; margin-top: 14px; }
  .ttd .nama { margin-top: 52px; text-decoration: underline; }
  .ttd .hrd { font-style: normal; }
  .tembusan { margin-top: 16px; font-size: 11px; }
</style></head><body>
  <div class="kop"><img id="logo" src="${logo}" alt="Kencana Print" /></div>
  <h1>SURAT KEPUTUSAN</h1>
  <div class="nomor">${s.mut_nomor}</div>
  <div class="tentang">Tentang</div>
  <div class="alasan">${String(s.mut_alasan || "").toUpperCase()}</div>
  <p class="just">MENIMBANG : ${String(s.mut_menimbang || "").toUpperCase()}</p>
  <p class="just">MENGINGAT : ${String(s.mut_mengingat || "").toUpperCase()}<br>maka dengan ini manajemen</p>
  <p class="putusan">MEMUTUSKAN :</p>
  <table class="data">
    <colgroup><col class="lbl" /><col class="sep" /><col /></colgroup>
    <tr><td>Nama</td><td>:</td><td>${String(s.kar_nama || "").toUpperCase()}</td></tr>
    <tr><td>No ID Karyawan</td><td>:</td><td>${String(s.kar_Nik || "").toUpperCase()}</td></tr>
    <tr><td>Jabatan Sebelumnya</td><td>:</td><td>${String(s.jabatan1 || "").toUpperCase()}</td></tr>
    <tr><td>Jabatan Baru</td><td>:</td><td>${String(s.jabatan2 || "").toUpperCase()}</td></tr>
    <tr><td>Departemen</td><td>:</td><td>${String(s.mut_departemen || "").toUpperCase()}</td></tr>
    <tr><td>Melapor Kepada</td><td>:</td><td>${String(s.lapor || "").toUpperCase()}</td></tr>
    <tr><td>Efektif Mulai</td><td>:</td><td>${fmtSurat(s.mut_tanggal)}</td></tr>
  </table>
  <p class="just">Dalam melaksanakan tugas, tanggungjawab dan wewenang jabatan tersebut, saudara berpedoman pada Job Description yang telah ditetapkan manajemen.</p>
  <p class="just">Demikian surat keputusan ini dibuat, diharapkan akan segera menyesuaikan kinerja saudara dengan jabatan yang baru dan meningkatkan semangat saudara untuk memberikan kinerja terbaik bagi kemajuan perusahaan.</p>
  <div class="ttd">Boyolali, ${fmtSurat(s.mut_tanggal)}<div class="cv">CV. Kencana Print</div><div class="nama">ANDI WAHYU NUGROHO</div><div class="hrd">HRD</div></div>
  <div class="tembusan">Tembusan :<br>1. Manager Produksi<br>2. Manager FA<br>3. Arsip</div>
  <script>
    // Tunggu logo selesai dimuat agar ikut tercetak, maksimal ~4 detik.
    var percobaan = 0;
    var sudah = false;
    function doPrint() { if (!sudah) { sudah = true; window.print(); } }
    function cobaCetak() {
      var g = document.getElementById('logo');
      percobaan += 1;
      if ((g && g.complete && g.naturalWidth > 0) || percobaan > 26) { doPrint(); }
      else { setTimeout(cobaCetak, 150); }
    }
    window.onload = function () { setTimeout(cobaCetak, 100); };
    setTimeout(doPrint, 4500);
  <\/script>
</body></html>`);
  w.document.close();
}
</script>

<template>
  <BaseBrowse
    module-title="Mutasi Karyawan"
    module-subtitle="Perpindahan pabrik / jabatan / bagian karyawan"
    endpoint="/transaksi/mutasi"
    :columns="columns"
    primary-key="Nomor"
    has-period
    :default-start="firstDayOfMonth()"
    add-form-path="/transaksi/mutasi/form"
    edit-form-path="/transaksi/mutasi/form"
    search-placeholder="Cari nomor / NIK / nama / bagian baru..."
    :per-page="50"
    printable
    @print="cetak"
  />

  <v-dialog v-model="suratOpen" max-width="800" scrollable>
    <v-card rounded="false">
      <v-card-title class="dlg-head">
        <span>Surat Keputusan {{ surat?.mut_nomor }}</span>
        <div class="dlg-aksi">
          <v-btn variant="flat" color="primary" size="small" prepend-icon="print" @click="printSurat">Cetak</v-btn>
          <v-btn icon="close" size="small" variant="text" @click="suratOpen = false" />
        </div>
      </v-card-title>
      <v-card-text v-if="surat" class="kertas">
        <div class="print-hint">
          Saat dialog Print muncul pilih: <b>Destination</b> printer kertas A4, <b>Margins = Default</b>,
          <b>Scale = 100%</b>, dan matikan <b>Headers and footers</b> — bila margin None, sisi kiri-kanan akan terpotong.
        </div>
        <div class="kop">
          <img class="logo" src="/img/kp.jpg" alt="Kencana Print" />
        </div>
        <h1>SURAT KEPUTUSAN</h1>
        <div class="nomor">{{ surat.mut_nomor }}</div>
        <div class="tentang">Tentang</div>
        <div class="alasan">{{ String(surat.mut_alasan || "").toUpperCase() }}</div>
        <p class="just">MENIMBANG : {{ up(surat.mut_menimbang) }}</p>
        <p class="just">MENGINGAT : {{ up(surat.mut_mengingat) }}<br />maka dengan ini manajemen</p>
        <p class="putusan">MEMUTUSKAN :</p>
        <table class="data">
          <colgroup><col class="lbl" /><col class="sep" /><col /></colgroup>
          <tr><td>Nama</td><td>:</td><td>{{ up(surat.kar_nama) }}</td></tr>
          <tr><td>No ID Karyawan</td><td>:</td><td>{{ up(surat.kar_Nik) }}</td></tr>
          <tr><td>Jabatan Sebelumnya</td><td>:</td><td>{{ up(surat.jabatan1) }}</td></tr>
          <tr><td>Jabatan Baru</td><td>:</td><td>{{ up(surat.jabatan2) }}</td></tr>
          <tr><td>Departemen</td><td>:</td><td>{{ up(surat.mut_departemen) }}</td></tr>
          <tr><td>Melapor Kepada</td><td>:</td><td>{{ up(surat.lapor) }}</td></tr>
          <tr><td>Efektif Mulai</td><td>:</td><td>{{ fmtSurat(surat.mut_tanggal) }}</td></tr>
        </table>
        <p class="just">Dalam melaksanakan tugas, tanggungjawab dan wewenang jabatan tersebut, saudara berpedoman pada Job Description yang telah ditetapkan manajemen.</p>
        <p class="just">Demikian surat keputusan ini dibuat, diharapkan akan segera menyesuaikan kinerja saudara dengan jabatan yang baru dan meningkatkan semangat saudara untuk memberikan kinerja terbaik bagi kemajuan perusahaan.</p>
        <div class="ttd">
          Boyolali, {{ fmtSurat(surat.mut_tanggal) }}
          <div class="cv">CV. Kencana Print</div>
          <div class="nama">ANDI WAHYU NUGROHO</div>
          <div class="hrd">HRD</div>
        </div>
        <div class="tembusan">Tembusan :<br />1. Manager Produksi<br />2. Manager FA<br />3. Arsip</div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.dlg-head { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 800; padding: 8px 12px; background: var(--ds-surface-variant, #e0e4ea); }
.dlg-aksi { display: flex; align-items: center; gap: 6px; }
/* Kertas surat — meniru Mutasi.fr3 (Arial, rata kanan-kiri) */
.kertas { background: #fff; padding: 1cm; font-family: Arial, sans-serif; font-size: 13px; color: #000; max-width: 210mm; margin: 0 auto; }
.print-hint { background: #fff8e6; border: 1px solid #d9a441; color: #7a5b16; font-size: 11px; padding: 6px 10px; margin-bottom: 12px; }
.kop { text-align: right; margin-bottom: 6px; }
.kop .logo { width: 250px; height: auto; }
.kertas h1 { text-align: center; font-size: 16px; text-decoration: underline; margin: 10px 0 2px; }
.nomor { text-align: center; font-weight: bold; }
.tentang { text-align: center; margin: 8px 0 2px; }
.alasan { text-align: center; font-weight: bold; font-size: 15px; margin-bottom: 12px; }
.just { text-align: justify; }
.putusan { font-weight: bold; margin-left: 32px; }
table.data { margin: 4px 0 4px 32px; table-layout: fixed; width: calc(100% - 32px); border-collapse: collapse; }
table.data col.lbl { width: 4.4cm; }
table.data col.sep { width: 0.5cm; }
table.data td { padding: 2px 4px; vertical-align: top; white-space: nowrap; overflow: hidden; }
.ttd { margin: 26px 0 0 32px; font-weight: bold; font-style: italic; }
.ttd .cv { margin-top: 18px; }
.ttd .nama { margin-top: 64px; text-decoration: underline; }
.ttd .hrd { font-style: normal; }
.tembusan { margin-top: 22px; font-size: 11px; }
</style>
