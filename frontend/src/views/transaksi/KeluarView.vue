<script setup lang="ts">
import { ref } from "vue";
import { useToast } from "vue-toastification";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { useAuthStore } from "@/stores/authStore";
import { api, getErrorMessage } from "@/api/axios";
import { firstDayOfMonth } from "@/utils/format";
import type { BrowseColumn } from "@/types";

const auth = useAuthStore();
const toast = useToast();
const columns: BrowseColumn[] = [
  { key: "Nomor", label: "Nomor", width: "145px" },
  { key: "Tanggal", label: "Tanggal", type: "date", width: "100px" },
  { key: "Alasan", label: "Alasan", width: "190px" },
  { key: "Keterangan", label: "Keterangan", width: "240px" },
  { key: "Nik", label: "NIK", width: "120px" },
  { key: "Nama", label: "Nama Lengkap", width: "220px" },
  { key: "Pabrik", label: "Pabrik", width: "85px" },
  { key: "Jabatan", label: "Jabatan", width: "150px" },
  { key: "Bagian", label: "Bagian", width: "150px" },
  { key: "Status", label: "Status", width: "100px" },
];

const suratOpen = ref(false);
const surat = ref<Record<string, any> | null>(null);

async function cetak(row: Record<string, any>) {
  try {
    const { data } = await api.get("/transaksi/keluar/surat", { params: { nomor: row.Nomor } });
    surat.value = data.data;
    suratOpen.value = true;
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat surat pengalaman kerja"));
  }
}

/** Format `21-March-2016` sesuai contoh cetakan. */
function fmtSurat(sql: string | null | undefined): string {
  if (!sql) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(sql));
  if (!m) return String(sql).slice(0, 10);
  const bulan = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${m[3]}-${bulan[Number(m[2]) - 1]}-${m[1]}`;
}

function up(v: unknown): string {
  return String(v ?? "").toUpperCase();
}

function deptKaryawan(): string {
  if (!surat.value) return "";
  return String(surat.value.departemen || surat.value.bagian || "");
}

function jabatanTerakhir(): string {
  if (!surat.value) return "";
  const jab = String(surat.value.jabatan || "").toUpperCase();
  const dep = deptKaryawan().toUpperCase();
  return [jab, dep].filter(Boolean).join(" ");
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
  const ttd = s.penandatangan || {};
  const dep = String(s.departemen || s.bagian || "");
  const jabAkhir = [String(s.jabatan || "").toUpperCase(), String(dep).toUpperCase()].filter(Boolean).join(" ");
  const logo = logoAbsolut();
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) {
    toast.error("Popup diblokir browser — izinkan popup untuk mencetak");
    return;
  }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Surat Pengalaman Kerja ${s.nomor}</title>
<style>
  @page { size: A4 portrait; margin: 1cm 1.2cm; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12.5px; line-height: 1.5; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .kop { text-align: right; margin-bottom: 6px; }
  .kop img { width: 250px; height: auto; }
  h1 { text-align: center; font-size: 15px; text-decoration: underline; margin: 12px 0 2px; }
  .nomor { text-align: center; font-weight: bold; margin-bottom: 18px; }
  p { margin: 10px 0; }
  p.just { text-align: justify; }
  table.data { margin: 4px 0 4px 48px; border: 0; border-collapse: collapse; table-layout: fixed; width: calc(100% - 48px); }
  table.data col.lbl { width: 3.2cm; }
  table.data col.sep { width: 0.5cm; }
  table.data td { padding: 1px 4px; vertical-align: top; }
  .ttd { display: flex; justify-content: flex-end; margin-top: 28px; }
  .ttd-inner { text-align: center; font-weight: bold; }
  .ttd .kota, .ttd .tahu { font-style: italic; text-decoration: underline; }
  .ttd .tahu { margin-top: 2px; }
  .ttd .nama { margin-top: 72px; text-decoration: underline; }
</style></head><body>
  <div class="kop"><img id="logo" src="${logo}" alt="Kencana Print" /></div>
  <h1>SURAT KETERANGAN PENGALAMAN KERJA</h1>
  <div class="nomor">${s.nomor}</div>
  <p>Yang bertandatangan dibawah ini :</p>
  <table class="data">
    <colgroup><col class="lbl" /><col class="sep" /><col /></colgroup>
    <tr><td>Nama</td><td>:</td><td>${String(ttd.nama ?? "")}</td></tr>
    <tr><td>NIK</td><td>:</td><td>${String(ttd.nik ?? "")}</td></tr>
    <tr><td>Jabatan</td><td>:</td><td>${String(ttd.jabatan ?? "")}</td></tr>
    <tr><td>Departemen</td><td>:</td><td>${String(ttd.departemen ?? "")}</td></tr>
  </table>
  <p>Menerangkan dengan sesungguhnya bahwa yang bersangkutan dibawah ini :</p>
  <table class="data">
    <colgroup><col class="lbl" /><col class="sep" /><col /></colgroup>
    <tr><td>Nama</td><td>:</td><td>${String(s.nama || "").toUpperCase()}</td></tr>
    <tr><td>NIK</td><td>:</td><td>${String(s.nik || "")}</td></tr>
    <tr><td>Jabatan</td><td>:</td><td>${String(s.jabatan || "").toUpperCase()}</td></tr>
    <tr><td>Departemen</td><td>:</td><td>${String(dep).toUpperCase()}</td></tr>
  </table>
  <p class="just">Benar-benar telah bekerja pada perusahaan CV. Kencana Print terhitung sejak ${fmtSurat(s.tgl_masuk)} sampai dengan ${fmtSurat(s.tgl_keluar)} , dengan jabatan terakhir ${jabAkhir} .</p>
  <p class="just">Kami berterimakasih atas dedikasinya dan berharap semoga yang bersangkutan dapat lebih sukses dimasa yang akan datang.<br>Demikian surat keterangan ini dibuat agar dapat digunakan dengan sebagaimana mestinya.</p>
  <div class="ttd"><div class="ttd-inner"><div class="kota">Boyolali, ${fmtSurat(s.tgl_keluar)}</div><div class="tahu">Mengetahui,</div><div class="nama">${String(ttd.nama ?? "").toUpperCase()}</div><div>${String(ttd.departemen ?? "")}</div></div></div>
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
    module-title="Karyawan Keluar"
    module-subtitle="Dokumen karyawan keluar per periode"
    endpoint="/transaksi/keluar"
    :columns="columns"
    primary-key="Nomor"
    has-period
    refresh-on-activate
    :default-start="firstDayOfMonth()"
    :add-form-path="auth.can('frmKeluar', 'insert') ? '/transaksi/keluar/form' : undefined"
    :edit-form-path="auth.can('frmKeluar', 'edit') ? '/transaksi/keluar/form' : undefined"
    :can-delete="auth.can('frmKeluar', 'delete')"
    search-placeholder="Cari nomor / NIK / nama / alasan / keterangan..."
    :per-page="50"
    printable
    @print="cetak"
  />

  <v-dialog v-model="suratOpen" max-width="800" scrollable>
    <v-card rounded="false">
      <v-card-title class="dlg-head">
        <span>Surat Pengalaman Kerja {{ surat?.nomor }}</span>
        <div class="dlg-aksi">
          <v-btn variant="flat" color="primary" size="small" prepend-icon="print" @click="printSurat">Cetak</v-btn>
          <v-btn icon="close" size="small" variant="text" @click="suratOpen = false" />
        </div>
      </v-card-title>
      <v-card-text v-if="surat" class="kertas">
        <div class="print-hint">
          Saat dialog Print muncul pilih: <b>Destination</b> printer kertas A4, <b>Margins = Default</b>,
          <b>Scale = 100%</b>, dan matikan <b>Headers and footers</b>.
        </div>
        <div class="kop">
          <img class="logo" src="/img/kp.jpg" alt="Kencana Print" />
        </div>
        <h1>SURAT KETERANGAN PENGALAMAN KERJA</h1>
        <div class="nomor">{{ surat.nomor }}</div>
        <p>Yang bertandatangan dibawah ini :</p>
        <table class="data">
          <colgroup><col class="lbl" /><col class="sep" /><col /></colgroup>
          <tr><td>Nama</td><td>:</td><td>{{ surat.penandatangan?.nama }}</td></tr>
          <tr><td>NIK</td><td>:</td><td>{{ surat.penandatangan?.nik }}</td></tr>
          <tr><td>Jabatan</td><td>:</td><td>{{ surat.penandatangan?.jabatan }}</td></tr>
          <tr><td>Departemen</td><td>:</td><td>{{ surat.penandatangan?.departemen }}</td></tr>
        </table>
        <p>Menerangkan dengan sesungguhnya bahwa yang bersangkutan dibawah ini :</p>
        <table class="data">
          <colgroup><col class="lbl" /><col class="sep" /><col /></colgroup>
          <tr><td>Nama</td><td>:</td><td>{{ up(surat.nama) }}</td></tr>
          <tr><td>NIK</td><td>:</td><td>{{ surat.nik }}</td></tr>
          <tr><td>Jabatan</td><td>:</td><td>{{ up(surat.jabatan) }}</td></tr>
          <tr><td>Departemen</td><td>:</td><td>{{ up(deptKaryawan()) }}</td></tr>
        </table>
        <p class="just">Benar-benar telah bekerja pada perusahaan CV. Kencana Print terhitung sejak {{ fmtSurat(surat.tgl_masuk) }} sampai dengan {{ fmtSurat(surat.tgl_keluar) }} , dengan jabatan terakhir {{ jabatanTerakhir() }} .</p>
        <p class="just">Kami berterimakasih atas dedikasinya dan berharap semoga yang bersangkutan dapat lebih sukses dimasa yang akan datang.<br />Demikian surat keterangan ini dibuat agar dapat digunakan dengan sebagaimana mestinya.</p>
        <div class="ttd">
          <div class="ttd-inner">
          <div class="kota">Boyolali, {{ fmtSurat(surat.tgl_keluar) }}</div>
          <div class="tahu">Mengetahui,</div>
          <div class="nama">{{ up(surat.penandatangan?.nama) }}</div>
          <div>{{ surat.penandatangan?.departemen }}</div>
          </div>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.dlg-head { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 800; padding: 8px 12px; background: var(--ds-surface-variant, #e0e4ea); }
.dlg-aksi { display: flex; align-items: center; gap: 6px; }
.kertas { background: #fff; padding: 1cm 1.2cm; font-family: Arial, sans-serif; font-size: 13px; color: #000; max-width: 210mm; margin: 0 auto; }
.print-hint { background: #fff8e6; border: 1px solid #d9a441; color: #7a5b16; font-size: 11px; padding: 6px 10px; margin-bottom: 12px; }
.kop { text-align: right; margin-bottom: 6px; }
.kop .logo { width: 250px; height: auto; }
.kertas h1 { text-align: center; font-size: 16px; text-decoration: underline; margin: 12px 0 2px; }
.nomor { text-align: center; font-weight: bold; margin-bottom: 18px; }
.just { text-align: justify; }
table.data { margin: 4px 0 4px 48px; table-layout: fixed; width: calc(100% - 48px); border-collapse: collapse; }
table.data col.lbl { width: 3.2cm; }
table.data col.sep { width: 0.5cm; }
table.data td { padding: 2px 4px; vertical-align: top; }
.ttd { display: flex; justify-content: flex-end; margin-top: 28px; }
.ttd-inner { text-align: center; font-weight: bold; }
.ttd .kota, .ttd .tahu { font-style: italic; text-decoration: underline; }
.ttd .tahu { margin-top: 2px; }
.ttd .nama { margin-top: 72px; text-decoration: underline; }
</style>
