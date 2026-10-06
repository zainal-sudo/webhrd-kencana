<script setup lang="ts">
import BaseBrowse from "@/components/BaseBrowse.vue";
import type { BrowseColumn } from "@/types";
import { firstDayOfMonth } from "@/utils/format";
import { ref } from "vue";
import { useToast } from "vue-toastification";
import { api, getErrorMessage } from "@/api/axios";

/**
 * Browse SP — padanan `ufrmBrowseSP`.
 *
 * Tombol cetak memakai query report Delphi (cxButton3Click -> `SP.fr3`)
 * via GET /transaksi/sp/surat. Tampilan surat di dialog maupun cetakan
 * meniru `D:\program\hrd\report\SP.fr3` dan contoh hasil cetak Delphi:
 * kop logo, judul SURAT PEMBINAAN (bila tingkatan Pembinaan) atau
 * SURAT PERINGATAN + nomor, paragraf pembuka, tabel data karyawan,
 * kalimat pelanggaran + masa berlaku + Boyolali, dan tabel tanda tangan
 * 3 kolom (karyawan / pemberi peringatan = atasan / mengetahui = HRD).
 */
const toast = useToast();
const columns: BrowseColumn[] = [
  { key: "Nomor", label: "Nomor", width: "170px" },
  { key: "Tanggal", label: "Tanggal", type: "date", width: "95px" },
  { key: "Nik", label: "NIK", width: "110px" },
  { key: "Nama", label: "Nama Lengkap" },
  { key: "Pabrik", label: "Pabrik", width: "80px" },
  { key: "Jabatan", label: "Jabatan" },
  { key: "Bagian", label: "Bagian" },
  { key: "Periode1", label: "Periode Awal", type: "date", width: "95px" },
  { key: "Periode2", label: "Periode Akhir", type: "date", width: "95px" },
  { key: "Keterangan", label: "Keterangan" },
  { key: "Tingkatan", label: "Tingkatan", width: "90px", align: "center" },
];

const suratOpen = ref(false);
const surat = ref<Record<string, any> | null>(null);

async function cetak(row: Record<string, any>) {
  try {
    const { data } = await api.get("/transaksi/sp/surat", { params: { nomor: row.Nomor } });
    surat.value = data.data;
    suratOpen.value = true;
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat surat SP"));
  }
}

/** Judul surat ala template: Pembinaan -> SURAT PEMBINAAN. */
function judulSurat(s: Record<string, any> | null): string {
  return s && String(s.sp_ke || "") === "Pembinaan" ? "SURAT PEMBINAAN" : "SURAT PERINGATAN";
}

/** Format `05 Oct 2026` (singkatan bulan Inggris seperti hasil Delphi). */
function fmtSurat(sql: string | null | undefined): string {
  if (!sql) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(sql));
  if (!m) return String(sql).slice(0, 10);
  const bulan = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${m[3]} ${bulan[Number(m[2]) - 1]} ${m[1]}`;
}

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
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${judulSurat(s)} ${s.sp_nomor}</title>
<style>
  @page { size: A4 portrait; margin: 1cm; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12.5px; line-height: 1.45; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .kop { text-align: right; margin-bottom: 4px; }
  .kop img { width: 250px; height: auto; }
  h1 { text-align: center; font-size: 15px; text-decoration: underline; margin: 8px 0 2px; }
  .nomor { text-align: center; font-weight: bold; }
  p { margin: 6px 0; }
  p.just { text-align: justify; }
  .b { font-weight: bold; }
  table.data { margin: 2px 0 2px 32px; border: 0; border-collapse: collapse; table-layout: fixed; width: calc(100% - 32px); }
  table.data col.lbl { width: 3.4cm; }
  table.data col.sep { width: 0.5cm; }
  table.data td { padding: 1px 4px; vertical-align: top; white-space: nowrap; overflow: hidden; }
  .ttd-kota { margin: 20px 0 0 0; font-weight: bold; font-style: italic; }
  table.ttd { width: 100%; border-collapse: collapse; margin-top: 10px; }
  table.ttd td { border: 1px solid #000; padding: 4px 8px; vertical-align: top; width: 33.33%; }
  table.ttd .peran { font-weight: bold; font-style: italic; text-decoration: underline; }
  table.ttd .spasi { height: 64px; }
  table.ttd .nama { font-weight: bold; text-decoration: underline; text-align: center; }
  table.ttd .jab { font-weight: bold; text-align: center; }
</style></head><body>
  <div class="kop"><img id="logo" src="${logo}" alt="Kencana Print" /></div>
  <h1>${judulSurat(s)}</h1>
  <div class="nomor">${s.sp_nomor}</div>
  <p class="just">Berdasarkan verifikasi terhadap fakta-fakta yang ada, maka Manajemen memberikan peringatan ${s.sp_ke || ""} kepada :</p>
  <table class="data">
    <colgroup><col class="lbl" /><col class="sep" /><col /></colgroup>
    <tr><td>Nama</td><td>:</td><td>${up(s.kar_nama)}</td></tr>
    <tr><td>NIK</td><td>:</td><td>${up(s.sp_nik)}</td></tr>
    <tr><td>Jabatan</td><td>:</td><td>${up(s.jab_nama)}</td></tr>
    <tr><td>Departemen</td><td>:</td><td>${up(s.kar_bagian)}</td></tr>
  </table>
  <p class="b">Pelanggaran yang dilakukan adalah sebagai berikut :</p>
  <p class="b">${s.sp_keterangan || ""}</p>
  <p class="just">Hal tersebut di atas melanggar peraturan perusahaan tentang sanksi dan peringatan.</p>
  <p class="b">Masa Berlaku Surat Peringatan ini adalah sejak&nbsp;&nbsp;${fmtSurat(s.sp_periode1)} s/d ${fmtSurat(s.sp_periode2)}</p>
  <div class="ttd-kota">Boyolali, ${fmtSurat(s.sp_tanggal)}</div>
  <table class="ttd">
    <tr><td class="peran">Karyawan yang Bersangkutan,</td><td class="peran">Yang Memberi Peringatan,</td><td class="peran">Mengetahui,</td></tr>
    <tr><td class="spasi"></td><td class="spasi"></td><td class="spasi"></td></tr>
    <tr><td><div class="nama">${up(s.kar_nama)}</div><div class="jab">${up(s.jab_nama)}</div></td><td><div class="nama">${up(s.nama_atasan)}</div><div class="jab">${up(s.jab_atasan)}</div></td><td><div class="nama">ANDI WAHYU NUGROHO</div><div class="jab">HRD</div></td></tr>
  </table>
  <script>
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
    module-title="Surat Peringatan"
    module-subtitle="SP karyawan per periode + cetak surat"
    endpoint="/transaksi/sp"
    :columns="columns"
    primary-key="Nomor"
    has-period
    :default-start="firstDayOfMonth()"
    add-form-path="/transaksi/sp/form"
    edit-form-path="/transaksi/sp/form"
    search-placeholder="Cari nomor / NIK / nama / keterangan..."
    :per-page="50"
    printable
    @print="cetak"
  />

  <v-dialog v-model="suratOpen" max-width="800" scrollable>
    <v-card rounded="false">
      <v-card-title class="dlg-head">
        <span>{{ judulSurat(surat) }} — {{ surat?.sp_nomor }}</span>
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
        <h1>{{ judulSurat(surat) }}</h1>
        <div class="nomor">{{ surat.sp_nomor }}</div>
        <p class="just">Berdasarkan verifikasi terhadap fakta-fakta yang ada, maka Manajemen memberikan peringatan {{ surat.sp_ke }} kepada :</p>
        <table class="data">
          <colgroup><col class="lbl" /><col class="sep" /><col /></colgroup>
          <tr><td>Nama</td><td>:</td><td>{{ up(surat.kar_nama) }}</td></tr>
          <tr><td>NIK</td><td>:</td><td>{{ up(surat.sp_nik) }}</td></tr>
          <tr><td>Jabatan</td><td>:</td><td>{{ up(surat.jab_nama) }}</td></tr>
          <tr><td>Departemen</td><td>:</td><td>{{ up(surat.kar_bagian) }}</td></tr>
        </table>
        <p class="b">Pelanggaran yang dilakukan adalah sebagai berikut :</p>
        <p class="b">{{ surat.sp_keterangan }}</p>
        <p class="just">Hal tersebut di atas melanggar peraturan perusahaan tentang sanksi dan peringatan.</p>
        <p class="b">Masa Berlaku Surat Peringatan ini adalah sejak&nbsp;&nbsp;{{ fmtSurat(surat.sp_periode1) }} s/d {{ fmtSurat(surat.sp_periode2) }}</p>
        <div class="ttd-kota">Boyolali, {{ fmtSurat(surat.sp_tanggal) }}</div>
        <table class="ttd">
          <tr><td class="peran">Karyawan yang Bersangkutan,</td><td class="peran">Yang Memberi Peringatan,</td><td class="peran">Mengetahui,</td></tr>
          <tr><td class="spasi"></td><td class="spasi"></td><td class="spasi"></td></tr>
          <tr>
            <td><div class="nama">{{ up(surat.kar_nama) }}</div><div class="jab">{{ up(surat.jab_nama) }}</div></td>
            <td><div class="nama">{{ up(surat.nama_atasan) }}</div><div class="jab">{{ up(surat.jab_atasan) }}</div></td>
            <td><div class="nama">ANDI WAHYU NUGROHO</div><div class="jab">HRD</div></td>
          </tr>
        </table>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.dlg-head { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 800; padding: 8px 12px; background: var(--ds-surface-variant, #e0e4ea); }
.dlg-aksi { display: flex; align-items: center; gap: 6px; }
/* Kertas surat — meniru SP.fr3 (Arial) */
.kertas { background: #fff; padding: 1cm; font-family: Arial, sans-serif; font-size: 13px; color: #000; max-width: 210mm; margin: 0 auto; }
.print-hint { background: #fff8e6; border: 1px solid #d9a441; color: #7a5b16; font-size: 11px; padding: 6px 10px; margin-bottom: 12px; }
.kop { text-align: right; margin-bottom: 6px; }
.kop .logo { width: 250px; height: auto; }
.kertas h1 { text-align: center; font-size: 16px; text-decoration: underline; margin: 10px 0 2px; }
.nomor { text-align: center; font-weight: bold; }
.just { text-align: justify; }
.b { font-weight: bold; }
table.data { margin: 4px 0 4px 32px; table-layout: fixed; width: calc(100% - 32px); border-collapse: collapse; }
table.data col.lbl { width: 3.4cm; }
table.data col.sep { width: 0.5cm; }
table.data td { padding: 2px 4px; vertical-align: top; white-space: nowrap; overflow: hidden; }
.ttd-kota { margin: 20px 0 0; font-weight: bold; font-style: italic; }
table.ttd { width: 100%; border-collapse: collapse; margin-top: 10px; }
table.ttd td { border: 1px solid #000; padding: 4px 8px; vertical-align: top; width: 33.33%; }
table.ttd .peran { font-weight: bold; font-style: italic; text-decoration: underline; }
table.ttd .spasi { height: 64px; }
table.ttd .nama { font-weight: bold; text-decoration: underline; text-align: center; }
table.ttd .jab { font-weight: bold; text-align: center; }
</style>
