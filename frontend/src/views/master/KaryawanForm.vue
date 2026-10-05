<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
import FText from "@/components/fields/FText.vue";
import FSelect from "@/components/fields/FSelect.vue";
import FDate from "@/components/fields/FDate.vue";
import FNumber from "@/components/fields/FNumber.vue";
import FTextarea from "@/components/fields/FTextarea.vue";
import { api, getErrorMessage } from "@/api/axios";
import {
  OPSI_AGAMA,
  OPSI_BPJS,
  OPSI_GOLONGAN_DARAH,
  OPSI_JENKEL,
  OPSI_SISTEM_GAJI,
  OPSI_STATUS_KL,
  OPSI_STATUS_TINGGAL,
  OPSI_WARGA_NEGARA,
} from "@/config/masterSimple";

const route = useRoute();
const toast = useToast();

const nik = computed(() => (route.query.nik as string) || (route.query.id as string) || "");
const isEdit = computed(() => nik.value !== "");

const values = reactive<Record<string, any>>({});
const anak = ref<any[]>([]);
const pendidikan = ref<any[]>([]);
const pengalaman = ref<any[]>([]);
const keahlian = ref<any[]>([]);
const jadwalTerpilih = ref<number[]>([]);
const pkwt = ref<any[]>([]);
const fotoBase64 = ref("");
const memuat = ref(false);

interface OptRow {
  Kode: string | number;
  Nama: string;
  JamAwal?: string;
  JamAkhir?: string;
}

const opt = reactive<Record<string, OptRow[]>>({
  pabrik: [],
  jabatan: [],
  departemen: [],
  statusKerja: [],
  pekerjaan: [],
  pendidikan: [],
  jadwal: [],
  bagian: [],
  atasan: [],
});

const toOptions = (rows: OptRow[] | undefined) =>
  (rows || []).map((r) => ({ label: r.Nama, value: r.Kode }));

const opsiPabrik = computed(() => toOptions(opt.pabrik));
const opsiJabatan = computed(() => toOptions(opt.jabatan));
const opsiDepartemen = computed(() => toOptions(opt.departemen));
const opsiStatusKerja = computed(() => toOptions(opt.statusKerja));
const opsiPekerjaan = computed(() => toOptions(opt.pekerjaan));
const opsiPendidikan = computed(() => toOptions(opt.pendidikan));
const opsiBagian = computed(() => toOptions(opt.bagian));
const opsiAtasan = computed(() => toOptions(opt.atasan));

onMounted(async () => {
  memuat.value = true;
  try {
    const { data } = await api.get("/master/karyawan/form-options");
    Object.assign(opt, data.data);
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat opsi form"));
  }

  if (isEdit.value) {
    try {
      const { data } = await api.get(`/master/karyawan/${encodeURIComponent(nik.value)}`);
      const d = data.data;
      for (const [k, v] of Object.entries(d.karyawan)) values[k] = v;
      anak.value = d.anak || [];
      pendidikan.value = d.pendidikan || [];
      pengalaman.value = d.pengalaman || [];
      keahlian.value = d.keahlian || [];
      jadwalTerpilih.value = (d.jadwal || []).map((j: any) => Number(j.JdId));
      pkwt.value = d.pkwt || [];
    } catch (e) {
      toast.error(getErrorMessage(e, "Gagal memuat data karyawan"));
    }
  }
  memuat.value = false;
});

function tambahBaris(list: any[], template: any) {
  list.push({ ...template });
}
function hapusBaris(list: any[], index: number) {
  list.splice(index, 1);
}

function toggleJadwal(id: number) {
  const list = jadwalTerpilih.value;
  const i = list.indexOf(id);
  if (i === -1) list.push(id);
  else list.splice(i, 1);
}

async function simpan(): Promise<string> {
  if (!values.kar_nama || !String(values.kar_nama).trim()) throw new Error("Nama karyawan wajib diisi");
  if (!values.kar_pab_kode) throw new Error("Pabrik wajib diisi");
  if (!values.kar_jab_kode) throw new Error("Jabatan wajib diisi");

  const body: Record<string, any> = { ...values };
  if (isEdit.value) body.kar_Nik = nik.value;
  body.anak = anak.value;
  body.pendidikan = pendidikan.value;
  body.pengalaman = pengalaman.value;
  body.keahlian = keahlian.value;
  body.jadwal = jadwalTerpilih.value.map((id) => ({ karj_jd_id: id }));
  body.pkwt = pkwt.value;
  if (fotoBase64.value) body.kar_foto_base64 = fotoBase64.value;

  if (isEdit.value) {
    await api.put(`/master/karyawan/${encodeURIComponent(nik.value)}`, body);
    return `Karyawan ${nik.value} berhasil diperbarui.`;
  }
  const { data } = await api.post("/master/karyawan", body);
  return `Karyawan baru berhasil disimpan dengan NIK ${data.data?.kar_Nik ?? "-"}.`;
}

function onPilihFoto(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 300 * 1024) {
    toast.error("Ukuran foto maksimal 300 KB");
    input.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    fotoBase64.value = String(reader.result || "");
  };
  reader.readAsDataURL(file);
}
</script>

<template>
  <BaseForm
    :title="isEdit ? `Edit Karyawan ${nik}` : 'Tambah Karyawan'"
    :subtitle="isEdit ? 'Perubahan data akan langsung disimpan' : 'Lengkapi data induk karyawan'"
    icon="badge"
    :crumbs="[
      { label: 'Master Karyawan', path: '/master/karyawan' },
      { label: isEdit ? 'Edit' : 'Tambah' },
    ]"
    :save-fn="simpan"
    return-path="/master/karyawan"
  >
    <template #form-content>
      <div v-if="memuat" class="loading">Memuat form...</div>

      <template v-else>
        <!-- ── Identitas utama ─────────────────────────────────── -->
        <fieldset class="fs">
          <legend>Identitas Utama</legend>
          <div class="grid">
            <FText v-model="values.kar_nama" label="Nama Lengkap" required :span="2" />
            <FSelect v-model="values.kar_pab_kode" label="Pabrik" :options="opsiPabrik" required />
            <FSelect v-model="values.kar_dep_kode" label="Departemen" :options="opsiDepartemen" />
            <FSelect v-model="values.kar_jab_kode" label="Jabatan" :options="opsiJabatan" required />
            <FSelect v-model="values.kar_bagian" label="Bagian" :options="opsiBagian" show-clear />
            <FSelect v-model="values.kar_status_kerja" label="Status Kerja" :options="opsiStatusKerja" />
            <FSelect v-model="values.kar_sistem_gaji" label="Sistem Gaji" :options="OPSI_SISTEM_GAJI" />
            <FSelect v-model="values.kar_nik_atasan" label="Atasan Langsung" :options="opsiAtasan" show-clear />
            <FSelect v-model="values.kar_pk_id" label="Pekerjaan" :options="opsiPekerjaan" />
            <FDate v-model="values.kar_tgl_masuk" label="Tanggal Masuk" />
            <FDate v-model="values.kar_tgl_keluar" label="Tanggal Keluar" />
            <FText v-model="values.kar_kode_absensi" label="Kode Absensi" :disabled="isEdit" />
            <FSelect
              v-model="values.kar_status_aktif"
              label="Status Aktif"
              :options="[
                { label: 'Aktif', value: 1 },
                { label: 'Non Aktif', value: 0 },
              ]"
            />
          </div>
        </fieldset>

        <!-- ── Data pribadi ────────────────────────────────────── -->
        <fieldset class="fs">
          <legend>Data Pribadi</legend>
          <div class="grid">
            <FText v-model="values.kar_tempatlahir" label="Tempat Lahir" />
            <FDate v-model="values.kar_tgllahir" label="Tanggal Lahir" />
            <FSelect v-model="values.kar_jenkel" label="Jenis Kelamin" :options="OPSI_JENKEL" />
            <FSelect v-model="values.kar_gol_darah" label="Golongan Darah" :options="OPSI_GOLONGAN_DARAH" show-clear />
            <FSelect v-model="values.kar_agama" label="Agama" :options="OPSI_AGAMA" show-clear />
            <FSelect v-model="values.kar_status_kawin" label="Status Kawin" :options="OPSI_STATUS_KL" show-clear />
            <FSelect v-model="values.kar_warganegara" label="Warga Negara" :options="OPSI_WARGA_NEGARA" show-clear />
            <FSelect v-model="values.kar_status_tinggal" label="Status Tinggal" :options="OPSI_STATUS_TINGGAL" show-clear />
            <FText v-model="values.kar_noidentitas" label="No. Identitas ( KTP/SIM )" />
            <FText v-model="values.kar_status_hidup" label="Status Hidup" />
            <FText v-model="values.kar_ibukandung" label="Ibu Kandung" />
            <FText v-model="values.kar_namapasangan" label="Nama Pasangan" />
          </div>
        </fieldset>

        <!-- ── Kontak & alamat ─────────────────────────────────── -->
        <fieldset class="fs">
          <legend>Kontak &amp; Alamat</legend>
          <div class="grid">
            <FTextarea v-model="values.kar_alamat" label="Alamat Domisili" :rows="2" :span="2" />
            <FText v-model="values.kar_notelp" label="No. Telp" />
            <FText v-model="values.kar_telp2" label="No. Telp 2" />
            <FText v-model="values.kar_email" label="Email" />
            <FText v-model="values.kar_rekeningbank" label="Rekening Bank" />
            <FText v-model="values.kar_hubungan" label="Hubungan Darurat" />
            <FText v-model="values.kar_no_NAKER" label="No. NAKER" />
            <FSelect v-model="values.kar_status_bpjs" label="Status BPJS" :options="OPSI_BPJS" />
            <FText v-model="values.kar_no_BPJS" label="No. BPJS" />
            <FText v-model="values.kar_size" label="Ukuran ( Size )" />
            <FDate v-model="values.kar_tglPKWT1" label="Tgl PKWT 1" />
            <FDate v-model="values.kar_tglPKWT2" label="Tgl PKWT 2" />
          </div>
        </fieldset>

        <!-- ── Pendidikan & jadwal ─────────────────────────────── -->
        <fieldset class="fs">
          <legend>Pendidikan &amp; Jadwal Kerja</legend>
          <div class="grid">
            <FSelect v-model="values.kar_pendidikanterakhir" label="Pendidikan Terakhir" :options="opsiPendidikan" />
            <FText v-model="values.kar_jurusan" label="Jurusan" />
            <div class="field">
              <label>Jadwal / Shift</label>
              <div class="shift-list">
                <label v-for="j in opt.jadwal" :key="String(j.Kode)" class="shift">
                  <input
                    type="checkbox"
                    :value="Number(j.Kode)"
                    :checked="jadwalTerpilih.includes(Number(j.Kode))"
                    @change="toggleJadwal(Number(j.Kode))"
                  />
                  <span>{{ j.Nama }} <em>{{ j.JamAwal ?? "-" }} - {{ j.JamAkhir ?? "-" }}</em></span>
                </label>
                <span v-if="!opt.jadwal.length" class="hint">Belum ada data jadwal</span>
              </div>
            </div>
            <FTextarea v-model="values.kar_keterangan_kerja" label="Keterangan Kerja" :rows="2" :span="2" />
          </div>
        </fieldset>

        <!-- ── Foto ────────────────────────────────────────────── -->
        <fieldset class="fs">
          <legend>Foto</legend>
          <div class="foto-row">
            <div v-if="fotoBase64" class="foto-prev">
              <img :src="fotoBase64" alt="preview foto" />
            </div>
            <div class="foto-info">
              <label class="flabel">Upload foto (maks. 300 KB, JPEG)</label>
              <input type="file" accept="image/*" class="file" @change="onPilihFoto" />
              <span class="hint">
                {{
                  isEdit
                    ? "Foto baru akan menimpa foto lama. Kosongkan bila tidak ingin mengubah."
                    : "Foto boleh dikosongkan dan bisa diunggah nanti."
                }}
              </span>
            </div>
          </div>
        </fieldset>

        <!-- ── Tabel anak ──────────────────────────────────────── -->
        <fieldset class="fs">
          <legend>Anak</legend>
          <table class="grid-table">
            <thead>
              <tr>
                <th style="width: 60px">Anak Ke</th>
                <th>Nama Anak</th>
                <th style="width: 160px">No. Identitas</th>
                <th style="width: 150px">Tanggal Lahir</th>
                <th style="width: 180px">Keterangan</th>
                <th style="width: 40px"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(a, i) in anak" :key="i">
                <td><FNumber v-model="a.kara_anak_ke" label="" /></td>
                <td><FText v-model="a.kara_nama_anak" label="" /></td>
                <td><FText v-model="a.kara_noidentitas" label="" /></td>
                <td><FDate v-model="a.kara_tgllahir" label="" /></td>
                <td><FText v-model="a.kara_ket_kerja" label="" /></td>
                <td><button type="button" class="del" @click="hapusBaris(anak, i)">x</button></td>
              </tr>
              <tr v-if="!anak.length">
                <td colspan="6" class="empty">Belum ada data anak</td>
              </tr>
            </tbody>
          </table>
          <button type="button" class="add" @click="tambahBaris(anak, { kara_anak_ke: anak.length + 1 })">
            + Tambah Anak
          </button>
        </fieldset>

        <!-- ── Pendidikan ──────────────────────────────────────── -->
        <fieldset class="fs">
          <legend>Riwayat Pendidikan</legend>
          <table class="grid-table">
            <thead>
              <tr>
                <th style="width: 120px">Jenjang</th>
                <th>Nama Sekolah</th>
                <th style="width: 160px">Fakultas</th>
                <th style="width: 160px">Jurusan</th>
                <th style="width: 110px">Ijazah</th>
                <th style="width: 90px">Masuk</th>
                <th style="width: 90px">Lulus</th>
                <th style="width: 40px"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(d, i) in pendidikan" :key="i">
                <td><FText v-model="d.kard_jenjang" label="" /></td>
                <td><FText v-model="d.kard_nama" label="" /></td>
                <td><FText v-model="d.kard_fakultas" label="" /></td>
                <td><FText v-model="d.kard_jurusan" label="" /></td>
                <td><FText v-model="d.kard_ijazah" label="" /></td>
                <td><FText v-model="d.kard_tahunmasuk" label="" /></td>
                <td><FText v-model="d.kard_tahunlulus" label="" /></td>
                <td><button type="button" class="del" @click="hapusBaris(pendidikan, i)">x</button></td>
              </tr>
              <tr v-if="!pendidikan.length">
                <td colspan="8" class="empty">Belum ada riwayat pendidikan</td>
              </tr>
            </tbody>
          </table>
          <button type="button" class="add" @click="tambahBaris(pendidikan, {})">+ Tambah Pendidikan</button>
        </fieldset>

        <!-- ── Pengalaman kerja ───────────────────────────────── -->
        <fieldset class="fs">
          <legend>Pengalaman Kerja</legend>
          <table class="grid-table">
            <thead>
              <tr>
                <th>Nama Perusahaan</th>
                <th style="width: 160px">Bidang Usaha</th>
                <th style="width: 130px">Kota</th>
                <th style="width: 145px">Tgl Masuk</th>
                <th style="width: 145px">Tgl Keluar</th>
                <th style="width: 170px">Jabatan Terakhir</th>
                <th style="width: 40px"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(p, i) in pengalaman" :key="i">
                <td><FText v-model="p.karp_namaperusahaan" label="" /></td>
                <td><FText v-model="p.karp_bidangusaha" label="" /></td>
                <td><FText v-model="p.karp_kota" label="" /></td>
                <td><FDate v-model="p.karp_tglmasuk" label="" /></td>
                <td><FDate v-model="p.karp_tglkeluar" label="" /></td>
                <td><FText v-model="p.karp_jabatanterakhir" label="" /></td>
                <td><button type="button" class="del" @click="hapusBaris(pengalaman, i)">x</button></td>
              </tr>
              <tr v-if="!pengalaman.length">
                <td colspan="7" class="empty">Belum ada pengalaman kerja</td>
              </tr>
            </tbody>
          </table>
          <button type="button" class="add" @click="tambahBaris(pengalaman, {})">+ Tambah Pengalaman</button>
        </fieldset>

        <!-- ── Keahlian ────────────────────────────────────────── -->
        <fieldset class="fs">
          <legend>Keahlian</legend>
          <table class="grid-table">
            <thead>
              <tr>
                <th style="width: 260px">Nama Keahlian</th>
                <th>Keterangan</th>
                <th style="width: 40px"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(x, i) in keahlian" :key="i">
                <td><FText v-model="x.kark_namakeahlian" label="" /></td>
                <td><FText v-model="x.kark_keterangan" label="" /></td>
                <td><button type="button" class="del" @click="hapusBaris(keahlian, i)">x</button></td>
              </tr>
              <tr v-if="!keahlian.length">
                <td colspan="3" class="empty">Belum ada keahlian</td>
              </tr>
            </tbody>
          </table>
          <button type="button" class="add" @click="tambahBaris(keahlian, {})">+ Tambah Keahlian</button>
        </fieldset>

        <!-- ── PKWT ───────────────────────────────────────────── -->
        <fieldset class="fs">
          <legend>Riwayat PKWT</legend>
          <table class="grid-table">
            <thead>
              <tr>
                <th style="width: 140px">Status PKWT ( SK )</th>
                <th>Tanggal 1</th>
                <th>Tanggal 2</th>
                <th style="width: 40px"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(p, i) in pkwt" :key="i">
                <td><FNumber v-model="p.SkId" label="" /></td>
                <td><FDate v-model="p.tgl1" label="" /></td>
                <td><FDate v-model="p.tgl2" label="" /></td>
                <td><button type="button" class="del" @click="hapusBaris(pkwt, i)">x</button></td>
              </tr>
              <tr v-if="!pkwt.length">
                <td colspan="4" class="empty">Belum ada riwayat PKWT</td>
              </tr>
            </tbody>
          </table>
          <button type="button" class="add" @click="tambahBaris(pkwt, { SkId: pkwt.length + 1 })">+ Tambah PKWT</button>
        </fieldset>
      </template>
    </template>
  </BaseForm>
</template>

<style scoped>
.loading {
  padding: 30px;
  text-align: center;
  font-size: 12px;
  color: #6b7a90;
}
.fs {
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  margin-bottom: 12px;
  padding: 10px 12px 14px;
}
.fs legend {
  font-size: 12px;
  font-weight: 800;
  color: var(--ds-primary, #3b5998);
  padding: 0 6px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px 12px;
}
.grid > :deep(.field) {
  min-width: 0;
}
.foto-row {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}
.foto-prev {
  width: 96px;
  height: 128px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: var(--ds-surface, #f0f3f8);
  overflow: hidden;
}
.foto-prev img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.flabel {
  display: block;
  font-size: 11px;
  font-weight: 700;
  color: var(--ds-primary, #3b5998);
  margin-bottom: 4px;
}
.file {
  font-size: 12px;
}
.hint {
  display: block;
  margin-top: 6px;
  font-size: 10px;
  color: #8995a6;
}
table.grid-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 8px;
}
table.grid-table th {
  background: var(--ds-surface-variant, #e0e4ea);
  border: 1px solid var(--ds-border, #b0b8c4);
  padding: 5px 6px;
  font-size: 10px;
  font-weight: 800;
  text-align: left;
  color: var(--ds-on-surface, #12324f);
  white-space: nowrap;
}
table.grid-table td {
  border: 1px solid #d5dbe3;
  padding: 3px 4px;
  vertical-align: top;
}
table.grid-table .empty {
  text-align: center;
  color: #8995a6;
  padding: 10px;
  font-size: 11px;
}
table.grid-table :deep(label) {
  display: none;
}
.shift-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  padding: 4px 0;
}
.shift {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  cursor: pointer;
}
.shift em {
  color: #8995a6;
  font-style: normal;
  font-size: 10px;
}
.add {
  border: 1px solid var(--ds-primary, #3b5998);
  background: #fff;
  color: var(--ds-primary, #3b5998);
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  cursor: pointer;
}
.add:hover {
  background: var(--ds-primary, #3b5998);
  color: #fff;
}
.del {
  border: none;
  background: #b91c1c;
  color: #fff;
  width: 22px;
  height: 22px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}
</style>
