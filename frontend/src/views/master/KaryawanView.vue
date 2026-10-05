<script setup lang="ts">
import { ref } from "vue";
import { useToast } from "vue-toastification";
import BaseBrowse from "@/components/BaseBrowse.vue";
import type { BrowseColumn } from "@/types";
import { api, getErrorMessage } from "@/api/axios";
import { fotoUrl } from "@/utils/foto";
import { formatTanggal } from "@/utils/format";

const toast = useToast();
const endpoint = "/master/karyawan";
const formPath = "/master/karyawan/form";

const columns: BrowseColumn[] = [
  { key: "Foto", label: "Foto", type: "image", width: "50px", sortable: false, filterable: false },
  { key: "Nik", label: "NIK", width: "120px" },
  { key: "Kd_Abs", label: "Kode Absensi", width: "110px" },
  { key: "Nama", label: "Nama Lengkap" },
  { key: "Nama Pabrik", label: "Nama Pabrik", width: "130px" },
  { key: "Jabatan", label: "Jabatan", width: "150px" },
  { key: "Departemen", label: "Departemen", width: "150px" },
  { key: "Bagian", label: "Bagian", width: "120px" },
  { key: "Sistem", label: "Sistem Gaji", width: "100px" },
  { key: "Status Karyawan", label: "Status Kerja", width: "110px" },
  { key: "JenisKelamin", label: "L/P", width: "90px", align: "center" },
  { key: "TglMasuk", label: "Tgl Masuk", type: "date", width: "105px" },
  { key: "MasaKerja", label: "Masa Kerja", width: "95px", align: "center", type: "align-right" },
  { key: "Status", label: "Status", width: "90px", align: "center" },
];

interface DetailAnak {
  kara_nama_anak: string;
  kara_noidentitas: string;
  kara_anak_ke: number;
  kara_tgllahir: string;
  kara_ket_kerja: string;
}
interface DetailDidik {
  kard_jenjang: string;
  kard_nama: string;
  kard_jurusan: string;
  kard_fakultas: string;
  kard_ijazah: string;
  kard_tahunmasuk: string;
  kard_tahunlulus: string;
  kard_catatan: string;
}
interface DetailPengalaman {
  karp_namaperusahaan: string;
  karp_bidangusaha: string;
  karp_kota: string;
  karp_tglmasuk: string;
  karp_tglkeluar: string;
  karp_jabatanterakhir: string;
}
interface DetailKeahlian {
  kark_namakeahlian: string;
  kark_keterangan: string;
}
interface DetailJadwal {
  JdId: number;
  NamaShift: string;
  JamAwal: string;
  JamAkhir: string;
}
interface DetailPkwt {
  SkId: number;
  tgl1: string;
  tgl2: string;
}
interface DetailKaryawan {
  kar_Nik: string;
  kar_nama: string;
  jab_nama: string;
  dep_nama: string;
  pab_nama: string;
  kar_tgl_masuk: string;
  kar_tgl_keluar: string;
  kar_status_aktif: number;
  sk_keterangan: string;
  daftar_jadwal: string;
  kar_bagian: string;
  kar_kode_absensi: string;
  kar_notelp: string;
  kar_email: string;
  kar_alamat: string;
  kar_noidentitas: string;
  kar_rekeningbank: string;
  kar_no_bpjs: string;
  kar_no_NAKER: string;
  kar_pendidikanterakhir: string;
  kar_jurusan: string;
}

const dialog = ref(false);
const nikAktif = ref("");
const memuat = ref(false);
const k = ref<DetailKaryawan | null>(null);
const anak = ref<DetailAnak[]>([]);
const pendidikan = ref<DetailDidik[]>([]);
const pengalaman = ref<DetailPengalaman[]>([]);
const keahlian = ref<DetailKeahlian[]>([]);
const jadwal = ref<DetailJadwal[]>([]);
const pkwt = ref<DetailPkwt[]>([]);
const tabAktif = ref("anak");
let detailRequest = 0;

async function lihatDetail(nik: string) {
  const request = ++detailRequest;
  nikAktif.value = nik;
  tabAktif.value = "anak";
  k.value = null;
  anak.value = [];
  pendidikan.value = [];
  pengalaman.value = [];
  keahlian.value = [];
  jadwal.value = [];
  pkwt.value = [];
  memuat.value = true;
  dialog.value = true;
  try {
    const { data } = await api.get(`/master/karyawan/${encodeURIComponent(nik)}`);
    if (request !== detailRequest) return;
    const d = data.data;
    k.value = d.karyawan;
    anak.value = d.anak || [];
    pendidikan.value = d.pendidikan || [];
    pengalaman.value = d.pengalaman || [];
    keahlian.value = d.keahlian || [];
    jadwal.value = d.jadwal || [];
    pkwt.value = d.pkwt || [];
  } catch (e) {
    if (request !== detailRequest) return;
    toast.error(getErrorMessage(e, "Gagal memuat detail karyawan"));
  } finally {
    if (request === detailRequest) memuat.value = false;
  }
}
</script>

<template>
  <BaseBrowse
    module-title="Master Karyawan"
    module-subtitle="Data induk karyawan beserta riwayat jabatan, pendidikan, keluarga dan jadwal kerja"
    :endpoint="endpoint"
    :columns="columns"
    primary-key="Nik"
    add-label="Tambah Karyawan"
    :add-form-path="formPath"
    :edit-form-path="formPath"
    search-placeholder="Cari NIK / nama / kode absensi..."
    :per-page="25"
  >
    <template #row-actions="{ row }">
      <div class="row-actions">
        <button class="lnk" title="Lihat detail" @click.stop="lihatDetail(row.Nik)">Detail</button>
      </div>
    </template>
  </BaseBrowse>

  <v-dialog v-model="dialog" max-width="900" scrollable>
    <v-card class="dlg">
      <v-card-title class="dlg-head">
        <span>Detail Karyawan — {{ nikAktif }}</span>
        <v-btn icon="close" size="small" variant="text" @click="dialog = false" />
      </v-card-title>
      <v-card-text class="dlg-body">
        <div v-if="memuat" class="loading">Memuat data...</div>
        <template v-else-if="k">
          <div class="top">
            <div class="foto-box">
              <img :src="fotoUrl(k.kar_Nik)" :alt="k.kar_nama" @error="($event.target as HTMLImageElement).style.display = 'none'" />
            </div>
            <div class="info">
              <div class="row"><span>NIK</span><b>{{ k.kar_Nik }}</b></div>
              <div class="row"><span>Kode Absensi</span><b>{{ k.kar_kode_absensi || "-" }}</b></div>
              <div class="row"><span>Nama</span><b>{{ k.kar_nama }}</b></div>
              <div class="row"><span>Jabatan</span><b>{{ k.jab_nama || "-" }}</b></div>
              <div class="row"><span>Departemen</span><b>{{ k.dep_nama || "-" }}</b></div>
              <div class="row"><span>Pabrik</span><b>{{ k.pab_nama || "-" }}</b></div>
              <div class="row"><span>Bagian</span><b>{{ k.kar_bagian || "-" }}</b></div>
              <div class="row"><span>Tanggal Masuk</span><b>{{ formatTanggal(k.kar_tgl_masuk) }}</b></div>
              <div class="row"><span>Status Aktif</span><b>{{ Number(k.kar_status_aktif) === 1 ? "Aktif" : "Non Aktif" }}</b></div>
              <div class="row"><span>Status Kerja</span><b>{{ k.sk_keterangan || "-" }}</b></div>
              <div class="row"><span>Jadwal</span><b>{{ k.daftar_jadwal || "-" }}</b></div>
            </div>
          </div>

          <v-tabs v-model="tabAktif" density="compact" class="mt-3">
            <v-tab value="anak">Anak ({{ anak.length }})</v-tab>
            <v-tab value="didik">Pendidikan ({{ pendidikan.length }})</v-tab>
            <v-tab value="peng">Pengalaman ({{ pengalaman.length }})</v-tab>
            <v-tab value="keah">Keahlian ({{ keahlian.length }})</v-tab>
            <v-tab value="pkwt">PKWT ({{ pkwt.length }})</v-tab>
          </v-tabs>
          <v-divider />
          <v-window v-model="tabAktif">
            <v-window-item value="anak">
              <table class="mini">
                <thead>
                  <tr><th>Anak ke</th><th>Nama</th><th>No. Identitas</th><th>Tgl Lahir</th><th>Keterangan</th></tr>
                </thead>
                <tbody>
                  <tr v-for="(a, i) in anak" :key="i">
                    <td>{{ a.kara_anak_ke }}</td>
                    <td>{{ a.kara_nama_anak }}</td>
                    <td>{{ a.kara_noidentitas }}</td>
                    <td>{{ formatTanggal(a.kara_tgllahir) }}</td>
                    <td>{{ a.kara_ket_kerja }}</td>
                  </tr>
                  <tr v-if="!anak.length"><td colspan="5" class="empty">Belum ada data anak</td></tr>
                </tbody>
              </table>
            </v-window-item>

            <v-window-item value="didik">
              <table class="mini">
                <thead>
                  <tr><th>Jenjang</th><th>Nama Sekolah</th><th>Fakultas</th><th>Jurusan</th><th>Ijazah</th><th>Masuk</th><th>Lulus</th></tr>
                </thead>
                <tbody>
                  <tr v-for="(d, i) in pendidikan" :key="i">
                    <td>{{ d.kard_jenjang }}</td>
                    <td>{{ d.kard_nama }}</td>
                    <td>{{ d.kard_fakultas }}</td>
                    <td>{{ d.kard_jurusan }}</td>
                    <td>{{ d.kard_ijazah }}</td>
                    <td>{{ d.kard_tahunmasuk }}</td>
                    <td>{{ d.kard_tahunlulus }}</td>
                  </tr>
                  <tr v-if="!pendidikan.length"><td colspan="7" class="empty">Belum ada riwayat pendidikan</td></tr>
                </tbody>
              </table>
            </v-window-item>

            <v-window-item value="peng">
              <table class="mini">
                <thead>
                  <tr><th>Perusahaan</th><th>Bidang Usaha</th><th>Kota</th><th>Masuk</th><th>Keluar</th><th>Jabatan Terakhir</th></tr>
                </thead>
                <tbody>
                  <tr v-for="(p, i) in pengalaman" :key="i">
                    <td>{{ p.karp_namaperusahaan }}</td>
                    <td>{{ p.karp_bidangusaha }}</td>
                    <td>{{ p.karp_kota }}</td>
                    <td>{{ formatTanggal(p.karp_tglmasuk) }}</td>
                    <td>{{ formatTanggal(p.karp_tglkeluar) }}</td>
                    <td>{{ p.karp_jabatanterakhir }}</td>
                  </tr>
                  <tr v-if="!pengalaman.length"><td colspan="6" class="empty">Belum ada pengalaman kerja</td></tr>
                </tbody>
              </table>
            </v-window-item>

            <v-window-item value="keah">
              <table class="mini">
                <thead><tr><th>Keahlian</th><th>Keterangan</th></tr></thead>
                <tbody>
                  <tr v-for="(x, i) in keahlian" :key="i">
                    <td>{{ x.kark_namakeahlian }}</td>
                    <td>{{ x.kark_keterangan }}</td>
                  </tr>
                  <tr v-if="!keahlian.length"><td colspan="2" class="empty">Belum ada keahlian</td></tr>
                </tbody>
              </table>
            </v-window-item>

            <v-window-item value="pkwt">
              <table class="mini">
                <thead><tr><th>SK</th><th>Tanggal 1</th><th>Tanggal 2</th></tr></thead>
                <tbody>
                  <tr v-for="(x, i) in pkwt" :key="i">
                    <td>{{ x.SkId }}</td>
                    <td>{{ formatTanggal(x.tgl1) }}</td>
                    <td>{{ formatTanggal(x.tgl2) }}</td>
                  </tr>
                  <tr v-if="!pkwt.length"><td colspan="3" class="empty">Belum ada data PKWT</td></tr>
                </tbody>
              </table>
            </v-window-item>
          </v-window>
        </template>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.row-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}
.lnk {
  border: none;
  background: none;
  color: var(--ds-primary, #3b5998);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  text-decoration: underline;
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
.dlg-body {
  background: #fff;
  padding: 12px 14px;
}
.loading {
  padding: 24px;
  text-align: center;
  font-size: 12px;
  color: #6b7a90;
}
.top {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 14px;
}
.foto-box {
  width: 110px;
  height: 150px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: var(--ds-surface, #f0f3f8);
  overflow: hidden;
}
.foto-box img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.info .row {
  display: grid;
  grid-template-columns: 130px 1fr;
  padding: 3px 0;
  border-bottom: 1px dotted #d5dbe3;
  font-size: 12px;
}
.info .row span {
  color: #6b7a90;
  font-weight: 700;
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
  color: var(--ds-on-surface, #12324f);
}
table.mini td {
  border: 1px solid #d5dbe3;
  padding: 4px 7px;
}
table.mini .empty {
  text-align: center;
  color: #8995a6;
  padding: 10px;
}
</style>
