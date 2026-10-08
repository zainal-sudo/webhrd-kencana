<script setup lang="ts">
import { ref, shallowRef, reactive, computed, onMounted, onUnmounted } from "vue";
import { useRoute } from "vue-router";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
import FText from "@/components/fields/FText.vue";
import FSelect from "@/components/fields/FSelect.vue";
import FDate from "@/components/fields/FDate.vue";
import FNumber from "@/components/fields/FNumber.vue";
import FTextarea from "@/components/fields/FTextarea.vue";
import TableTextInput from "@/components/fields/TableTextInput.vue";
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

const values = reactive<Record<string, any>>({ kar_status_aktif: null });
const anak = ref<any[]>([]);
const pendidikan = ref<any[]>([]);
const pengalaman = ref<any[]>([]);
const keahlian = ref<any[]>([]);
const jadwalTerpilih = ref<number[]>([]);
const pkwt = ref<any[]>([]);
const fotoBase64 = ref("");
const fotoInput = ref<HTMLInputElement | null>(null);
let fotoReader: FileReader | null = null;

interface FormSnapshot {
  values: Record<string, any>;
  anak: any[];
  pendidikan: any[];
  pengalaman: any[];
  keahlian: any[];
  jadwal: number[];
  pkwt: any[];
  foto: string;
}

function captureForm(): FormSnapshot {
  // Data form berasal dari JSON API; clone agar snapshot tidak ikut berubah.
  return JSON.parse(JSON.stringify({
    values,
    anak: anak.value,
    pendidikan: pendidikan.value,
    pengalaman: pengalaman.value,
    keahlian: keahlian.value,
    jadwal: jadwalTerpilih.value,
    pkwt: pkwt.value,
    foto: fotoBase64.value,
  }));
}

const resetSnapshot = shallowRef<FormSnapshot | null>(isEdit.value ? null : captureForm());

function resetForm(): boolean {
  const snapshot = resetSnapshot.value;
  if (memuat.value || !snapshot) return false;
  const changed = JSON.stringify(captureForm()) !== JSON.stringify(snapshot)
    || !!fotoInput.value?.files?.length;
  if (changed && !window.confirm(isEdit.value
    ? "Batalkan seluruh perubahan yang belum disimpan dan kembalikan data awal karyawan?"
    : "Hapus seluruh input dan kembalikan form Tambah Karyawan ke kondisi awal?")) return false;

  // Jangan biarkan pembacaan foto yang belum selesai mengisi preview lagi.
  const reader = fotoReader;
  fotoReader = null;
  reader?.abort();
  const restored: FormSnapshot = JSON.parse(JSON.stringify(snapshot));
  for (const key of Object.keys(values)) delete values[key];
  Object.assign(values, restored.values);
  anak.value = restored.anak;
  pendidikan.value = restored.pendidikan;
  pengalaman.value = restored.pengalaman;
  keahlian.value = restored.keahlian;
  jadwalTerpilih.value = restored.jadwal;
  pkwt.value = restored.pkwt;
  fotoBase64.value = restored.foto;
  if (fotoInput.value) fotoInput.value.value = "";
  jadwalMenu.value = false;
  cariJadwal.value = "";
  return true;
}
const memuat = ref(false);
const activeTab = ref("pribadi");
const tabContent = ref<HTMLElement | null>(null);
const jadwalMenu = ref(false);
const cariJadwal = ref("");
const formTabs = [
  { key: "pribadi", label: "Data Pribadi" },
  { key: "karyawan", label: "Data Karyawan" },
  { key: "keluarga", label: "Data Keluarga" },
  { key: "cv", label: "Curriculum Vitae" },
];
const tabId = (key: string) => `karyawan-${nik.value || "baru"}-${key}`;

function pilihTab(key: string) {
  activeTab.value = key;
  if (tabContent.value) tabContent.value.scrollTop = 0;
}

function navigasiTab(event: KeyboardEvent, index: number) {
  let next = index;
  if (event.key === "ArrowRight") next = (index + 1) % formTabs.length;
  else if (event.key === "ArrowLeft") next = (index + formTabs.length - 1) % formTabs.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = formTabs.length - 1;
  else return;
  event.preventDefault();
  pilihTab(formTabs[next]!.key);
  document.getElementById(tabId(formTabs[next]!.key))?.focus();
}

interface OptRow {
  Kode: string | number;
  Nama: string;
  JamAwal?: string;
  JamAkhir?: string;
}

interface AtasanRow {
  Nik: string;
  Nama: string;
}

const opt = reactive<Record<string, OptRow[]>>({
  pabrik: [],
  jabatan: [],
  departemen: [],
  statusKerja: [],
  pekerjaan: [],
  pendidikan: [],
  jadwal: [],
});
const bagian = ref<{ Nama: string }[]>([]);
const atasan = ref<AtasanRow[]>([]);

const toOptions = (rows: OptRow[] | undefined) =>
  (rows || []).map((r) => ({ label: r.Nama, value: r.Kode }));

const opsiPabrik = computed(() => toOptions(opt.pabrik));
const opsiJabatan = computed(() => toOptions(opt.jabatan));
const opsiDepartemen = computed(() => toOptions(opt.departemen));
const opsiStatusKerja = computed(() => toOptions(opt.statusKerja));
const opsiPekerjaan = computed(() => toOptions(opt.pekerjaan));
const opsiPendidikan = computed(() => toOptions(opt.pendidikan));
const opsiJenjang = computed(() => {
  const names = new Set(opt.pendidikan.map((p) => p.Nama));
  for (const row of pendidikan.value) {
    if (row.kard_jenjang !== null && row.kard_jenjang !== undefined && String(row.kard_jenjang).trim()) {
      names.add(String(row.kard_jenjang));
    }
  }
  return [...names].map((name) => ({ label: name, value: name }));
});
const opsiBagian = computed(() => bagian.value.map((r) => ({ label: r.Nama, value: r.Nama })));
const opsiAtasan = computed(() => atasan.value.map((r) => ({ label: r.Nama, value: r.Nik })));
const daftarJadwal = computed(() => {
  const q = cariJadwal.value.trim().toLowerCase();
  return opt.jadwal.filter((j) => !q || `${j.Kode} ${j.Nama}`.toLowerCase().includes(q));
});
const ringkasanJadwal = computed(() => jadwalTerpilih.value.map((id) => {
  const j = opt.jadwal.find((row) => Number(row.Kode) === id);
  return { id, label: j ? `${j.Kode} — ${j.Nama}` : `${id} — Jadwal tidak tersedia` };
}));

onMounted(async () => {
  memuat.value = true;
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
      resetSnapshot.value = captureForm();
    } catch (e) {
      toast.error(getErrorMessage(e, "Gagal memuat data karyawan"));
    }
  }
  try {
    const { data } = await api.get("/master/karyawan/form-options", {
      params: { atasan_nik: values.kar_nik_atasan || undefined },
    });
    const { bagian: daftarBagian, atasan: daftarAtasan, ...opsiLain } = data.data;
    Object.assign(opt, opsiLain);
    bagian.value = daftarBagian || [];
    atasan.value = daftarAtasan || [];
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat opsi form"));
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
  if (![0, 1, "0", "1"].includes(values.kar_status_aktif)) {
    throw new Error("Status Aktif wajib dipilih (Aktif atau Non Aktif)");
  }
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
  fotoReader?.abort();
  fotoReader = reader;
  reader.onload = () => {
    if (fotoReader === reader) {
      fotoBase64.value = String(reader.result || "");
      fotoReader = null;
    }
  };
  reader.readAsDataURL(file);
}
onUnmounted(() => {
  const reader = fotoReader;
  fotoReader = null;
  reader?.abort();
});
</script>

<template>
  <BaseForm
    class="karyawan-form"
    :title="isEdit ? `Edit Karyawan ${nik}` : 'Tambah Karyawan'"
    :subtitle="isEdit ? 'Perubahan data akan langsung disimpan' : 'Lengkapi data induk karyawan'"
    icon="badge"
    :crumbs="[
      { label: 'Master Karyawan', path: '/master/karyawan' },
      { label: isEdit ? 'Edit' : 'Tambah' },
    ]"
    :save-fn="simpan"
    :reset-fn="resetForm"
    :reset-disabled="memuat || !resetSnapshot"
    return-path="/master/karyawan"
  >
    <template #form-content>
      <div v-if="memuat" class="loading">Memuat form...</div>

      <template v-else>
        <div ref="tabContent" class="employee-scroll">
        <!-- ── Identitas utama ─────────────────────────────────── -->
        <fieldset class="fs identity-main">
          <legend>Identitas Utama</legend>
          <div class="grid identity-grid">
            <div class="field nik-field">
              <label>NIK</label>
              <input :value="nik || 'Otomatis setelah disimpan'" readonly aria-label="NIK" />
            </div>
            <FText v-model="values.kar_nama" label="Nama Lengkap" required :span="2" />
            <FSelect
              v-model="values.kar_status_aktif"
              label="Status Aktif"
              required
              placeholder="Pilih Status Aktif..."
              :options="[
                { label: 'Aktif', value: 1 },
                { label: 'Non Aktif', value: 0 },
              ]"
            />
            <FText v-model="values.kar_kode_absensi" label="Kode Absensi" :disabled="isEdit" />
          </div>
        </fieldset>

        <div class="form-tabs" role="tablist" aria-label="Data Master Karyawan">
          <button v-for="(tab, index) in formTabs" :id="tabId(tab.key)" :key="tab.key"
            type="button" role="tab" :aria-selected="activeTab === tab.key"
            :aria-controls="`${tabId(tab.key)}-panel`" :tabindex="activeTab === tab.key ? 0 : -1"
            :class="{ active: activeTab === tab.key }" @click="pilihTab(tab.key)"
            @keydown="navigasiTab($event, index)">{{ tab.label }}</button>
        </div>

        <div class="tab-content">
        <section v-for="tab in formTabs" v-show="activeTab === tab.key" :id="`${tabId(tab.key)}-panel`"
          :key="tab.key" class="tab-panel" :class="`panel-${tab.key}`" role="tabpanel"
          :aria-labelledby="tabId(tab.key)">
        <template v-if="tab.key === 'karyawan'">
        <fieldset class="fs">
          <legend>Data Karyawan</legend>
          <div class="grid">
            <FSelect v-model="values.kar_pab_kode" label="Pabrik" :options="opsiPabrik" required />
            <FSelect v-model="values.kar_dep_kode" label="Departemen" :options="opsiDepartemen" />
            <FSelect v-model="values.kar_jab_kode" label="Jabatan" :options="opsiJabatan" required />
            <FSelect v-model="values.kar_bagian" label="Bagian" :options="opsiBagian" show-clear />
            <FSelect v-model="values.kar_status_kerja" label="Status Kerja" :options="opsiStatusKerja" />
            <FSelect v-model="values.kar_sistem_gaji" label="Sistem Gaji" :options="OPSI_SISTEM_GAJI" />
            <FSelect v-model="values.kar_nik_atasan" label="Atasan Langsung" :options="opsiAtasan" show-clear />
            <FDate v-model="values.kar_tgl_masuk" label="Tanggal Masuk" />
            <FDate v-model="values.kar_tgl_keluar" label="Tanggal Keluar" />
            <FText v-model="values.kar_no_NAKER" label="No. NAKER" />
            <FSelect v-model="values.kar_status_bpjs" label="Status BPJS" :options="OPSI_BPJS" />
            <FText v-model="values.kar_no_BPJS" label="No. BPJS" />
            <FDate v-model="values.kar_tglPKWT1" label="Tgl PKWT 1" />
            <FDate v-model="values.kar_tglPKWT2" label="Tgl PKWT 2" />
          </div>
        </fieldset>
        </template>

        <template v-if="tab.key === 'pribadi'">
        <div class="personal-details">
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
            <FText v-model="values.kar_size" label="Ukuran Kaos" />
          </div>
        </fieldset>

        <!-- ── Kontak & alamat ─────────────────────────────────── -->
        <fieldset class="fs">
          <legend>Kontak &amp; Alamat</legend>
          <div class="grid">
            <FTextarea v-model="values.kar_alamat" label="Alamat Domisili" :rows="2" :span="2" />
            <FText v-model="values.kar_notelp" label="No. Telp" />
            <FText v-model="values.kar_email" label="Email" />
            <FText v-model="values.kar_rekeningbank" label="Rekening Bank" />
          </div>
        </fieldset>

        <!-- ── Pendidikan & jadwal ─────────────────────────────── -->
        <fieldset class="fs">
          <legend>Pendidikan Terakhir</legend>
          <div class="grid">
            <FSelect v-model="values.kar_pendidikanterakhir" label="Pendidikan Terakhir" :options="opsiPendidikan" />
            <FText v-model="values.kar_jurusan" label="Jurusan" />
          </div>
        </fieldset>
        </div>
        </template>

        <template v-if="tab.key === 'karyawan'">
        <fieldset class="fs">
          <legend>Jadwal Kerja</legend>
          <div class="schedule-field">
            <label class="schedule-label">Jadwal Kerja</label>
            <v-menu v-model="jadwalMenu" :close-on-content-click="false" location="bottom start"
              :max-width="480" @update:model-value="cariJadwal = ''">
              <template #activator="{ props: menuProps }">
                <button v-bind="menuProps" type="button" class="schedule-select" aria-label="Pilih jadwal kerja">
                  <span>{{ jadwalTerpilih.length ? `${jadwalTerpilih.length} jadwal dipilih` : 'Pilih jadwal kerja...' }}</span>
                  <span aria-hidden="true">▾</span>
                </button>
              </template>
              <div class="schedule-menu">
                <input v-model="cariJadwal" class="schedule-search" type="search"
                  placeholder="Cari kode / nama jadwal..." aria-label="Cari jadwal kerja" />
                <div class="schedule-options">
                  <label v-for="j in daftarJadwal" :key="String(j.Kode)" class="schedule-option">
                    <input type="checkbox" :value="Number(j.Kode)"
                      :checked="jadwalTerpilih.includes(Number(j.Kode))"
                      @change="toggleJadwal(Number(j.Kode))" />
                    <span class="schedule-option-text">
                      <strong>{{ j.Kode }} — {{ j.Nama }}</strong>
                      <small>{{ j.JamAwal ?? '-' }} – {{ j.JamAkhir ?? '-' }}</small>
                    </span>
                  </label>
                  <p v-if="!daftarJadwal.length" class="schedule-empty">
                    {{ opt.jadwal.length ? 'Jadwal tidak ditemukan' : 'Belum ada data jadwal' }}
                  </p>
                </div>
              </div>
            </v-menu>
            <div v-if="ringkasanJadwal.length" class="schedule-chips" aria-label="Jadwal yang dipilih">
              <span v-for="j in ringkasanJadwal" :key="j.id" class="schedule-chip">
                {{ j.label }}
                <button type="button" :aria-label="`Hapus pilihan ${j.label}`" @click="toggleJadwal(j.id)">×</button>
              </span>
            </div>
          </div>
        </fieldset>
        </template>

        <template v-if="tab.key === 'pribadi'">
        <!-- ── Foto ────────────────────────────────────────────── -->
        <fieldset class="fs foto-section">
          <legend>Foto</legend>
          <div class="foto-row">
            <div class="foto-prev">
              <img v-if="fotoBase64" :src="fotoBase64" alt="preview foto" />
              <span v-else class="foto-placeholder">Preview foto baru</span>
            </div>
            <div class="foto-info">
              <label class="flabel">Upload foto (maks. 300 KB, JPEG)</label>
              <input ref="fotoInput" type="file" accept="image/*" class="file" @change="onPilihFoto" />
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
        </template>

        <template v-if="tab.key === 'keluarga'">
        <fieldset class="fs">
          <legend>Data Keluarga</legend>
          <div class="family-grid">
            <FText v-model="values.kar_ibukandung" label="Ibu Kandung" />
            <FText v-model="values.kar_namapasangan" label="Nama Pasangan" />
            <div class="family-spacer" aria-hidden="true"></div>
            <FSelect v-model="values.kar_status_hidup" label="Status Hidup"
              :options="[{ label: 'Masih Hidup', value: 1 }, { label: 'Meninggal', value: 0 }]" />
            <FSelect v-model="values.kar_hubungan" label="Hubungan"
              :options="[{ label: 'Suami', value: 0 }, { label: 'Istri', value: 1 }]" />
            <div class="family-spacer" aria-hidden="true"></div>
            <FDate v-model="values.kar_tgllahir2" label="Tanggal Lahir" />
            <FSelect v-model="values.kar_pk_id" label="Pekerjaan" :options="opsiPekerjaan" />
            <FTextarea v-model="values.kar_keterangan_kerja" class="family-work-note" label="Ket. Pekerjaan" :rows="2" />
            <FTextarea v-model="values.kar_alamat2" label="Alamat" :rows="2" />
            <FText v-model="values.kar_telp2" label="No. Telp" />
          </div>
        </fieldset>
        <!-- ── Tabel anak ──────────────────────────────────────── -->
        <fieldset class="fs">
          <legend>Anak</legend>
          <table class="grid-table children-table">
            <thead>
              <tr>
                <th>Anak Ke</th>
                <th>Nama Anak</th>
                <th>No. Identitas</th>
                <th>Tanggal Lahir</th>
                <th>Keterangan</th>
                <th v-if="anak.length" class="delete-heading">Hapus</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(a, i) in anak" :key="i">
                <td><FNumber v-model="a.kara_anak_ke" label="" /></td>
                <td><TableTextInput v-model="a.kara_nama_anak" label="Nama Anak" /></td>
                <td><TableTextInput v-model="a.kara_noidentitas" label="No. Identitas Anak" /></td>
                <td><FDate v-model="a.kara_tgllahir" label="" /></td>
                <td><TableTextInput v-model="a.kara_ket_kerja" label="Keterangan Anak" /></td>
                <td class="delete-cell"><button type="button" class="del" @click="hapusBaris(anak, i)">x</button></td>
              </tr>
              <tr v-if="!anak.length">
                <td colspan="5" class="empty">Belum ada data anak</td>
              </tr>
            </tbody>
          </table>
          <button type="button" class="add" @click="tambahBaris(anak, { kara_anak_ke: anak.length + 1 })">
            + Tambah Anak
          </button>
        </fieldset>
        </template>

        <template v-if="tab.key === 'cv'">
        <!-- ── Pendidikan ──────────────────────────────────────── -->
        <fieldset class="fs">
          <legend>Riwayat Pendidikan</legend>
          <table class="grid-table education-table">
            <thead>
              <tr>
                <th class="education-level-col">Jenjang Pendidikan</th>
                <th>Nama Sekolah</th>
                <th>Jurusan</th>
                <th>Fakultas</th>
                <th>Berijazah</th>
                <th>Tahun Masuk</th>
                <th>Tahun Lulus</th>
                <th>Catatan</th>
                <th v-if="pendidikan.length" class="delete-heading">Hapus</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(d, i) in pendidikan" :key="i">
                <td class="education-level-col"><FSelect v-model="d.kard_jenjang" label="" :options="opsiJenjang" show-clear /></td>
                <td><TableTextInput v-model="d.kard_nama" label="Nama Sekolah" /></td>
                <td><TableTextInput v-model="d.kard_jurusan" label="Jurusan" /></td>
                <td><TableTextInput v-model="d.kard_fakultas" label="Fakultas" /></td>
                <td><TableTextInput v-model="d.kard_ijazah" label="Berijazah" /></td>
                <td><TableTextInput v-model="d.kard_tahunmasuk" label="Tahun Masuk" /></td>
                <td><TableTextInput v-model="d.kard_tahunlulus" label="Tahun Lulus" /></td>
                <td><TableTextInput v-model="d.kard_catatan" label="Catatan Pendidikan" /></td>
                <td class="delete-cell"><button type="button" class="del" @click="hapusBaris(pendidikan, i)">x</button></td>
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
          <table class="grid-table experience-table">
            <thead>
              <tr>
                <th>Nama Perusahaan</th>
                <th>Bidang Usaha</th>
                <th>Kota</th>
                <th>Tgl Masuk</th>
                <th>Tgl Keluar</th>
                <th>Jabatan Terakhir</th>
                <th v-if="pengalaman.length" class="delete-heading">Hapus</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(p, i) in pengalaman" :key="i">
                <td><TableTextInput v-model="p.karp_namaperusahaan" label="Nama Perusahaan" /></td>
                <td><TableTextInput v-model="p.karp_bidangusaha" label="Bidang Usaha" /></td>
                <td><TableTextInput v-model="p.karp_kota" label="Kota" /></td>
                <td><FDate v-model="p.karp_tglmasuk" label="" /></td>
                <td><FDate v-model="p.karp_tglkeluar" label="" /></td>
                <td><TableTextInput v-model="p.karp_jabatanterakhir" label="Jabatan Terakhir" /></td>
                <td class="delete-cell"><button type="button" class="del" @click="hapusBaris(pengalaman, i)">x</button></td>
              </tr>
              <tr v-if="!pengalaman.length">
                <td colspan="6" class="empty">Belum ada pengalaman kerja</td>
              </tr>
            </tbody>
          </table>
          <button type="button" class="add" @click="tambahBaris(pengalaman, {})">+ Tambah Pengalaman</button>
        </fieldset>

        <!-- ── Keahlian ────────────────────────────────────────── -->
        <fieldset class="fs">
          <legend>Keahlian</legend>
          <table class="grid-table skills-table">
            <thead>
              <tr>
                <th>Nama Keahlian</th>
                <th>Keterangan</th>
                <th v-if="keahlian.length" class="delete-heading">Hapus</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(x, i) in keahlian" :key="i">
                <td><TableTextInput v-model="x.kark_namakeahlian" label="Nama Keahlian" /></td>
                <td><TableTextInput v-model="x.kark_keterangan" label="Keterangan Keahlian" /></td>
                <td class="delete-cell"><button type="button" class="del" @click="hapusBaris(keahlian, i)">x</button></td>
              </tr>
              <tr v-if="!keahlian.length">
                <td colspan="2" class="empty">Belum ada keahlian</td>
              </tr>
            </tbody>
          </table>
          <button type="button" class="add" @click="tambahBaris(keahlian, {})">+ Tambah Keahlian</button>
        </fieldset>
        </template>

        <template v-if="tab.key === 'karyawan'">
        <!-- ── PKWT ───────────────────────────────────────────── -->
        <fieldset class="fs">
          <legend>Riwayat PKWT</legend>
          <table class="grid-table pkwt-table">
            <thead>
              <tr>
                <th>Status PKWT ( SK )</th>
                <th>Tanggal 1</th>
                <th>Tanggal 2</th>
                <th v-if="pkwt.length" class="delete-heading">Hapus</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(p, i) in pkwt" :key="i">
                <td><FNumber v-model="p.SkId" label="" /></td>
                <td><FDate v-model="p.tgl1" label="" /></td>
                <td><FDate v-model="p.tgl2" label="" /></td>
                <td class="delete-cell"><button type="button" class="del" @click="hapusBaris(pkwt, i)">x</button></td>
              </tr>
              <tr v-if="!pkwt.length">
                <td colspan="3" class="empty">Belum ada riwayat PKWT</td>
              </tr>
            </tbody>
          </table>
          <button type="button" class="add" @click="tambahBaris(pkwt, { SkId: pkwt.length + 1 })">+ Tambah PKWT</button>
        </fieldset>
        </template>
        </section>
        </div>
        </div>
      </template>
    </template>
  </BaseForm>
</template>

<style scoped>
.karyawan-form :deep(.form-body) {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
}
.karyawan-form :deep(.crumbs) { padding: 3px 10px; }
.karyawan-form :deep(.form-header) { padding: 4px 12px; }
.karyawan-form :deep(.header-icon) { width: 28px; height: 28px; }
.karyawan-form :deep(.form-footer) { padding: 6px 12px; }
.employee-scroll { flex: 1; min-height: 0; overflow: auto; padding: 8px 12px 0; scrollbar-gutter: stable; container-type: inline-size; }
.employee-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
.identity-main.fs { padding: 2px 10px 6px; margin-bottom: 6px; }
.identity-main :deep(.field input), .identity-main :deep(.field select) { height: 30px; }
.grid.identity-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.nik-field label { display: block; font-size: 11px; font-weight: 700; margin-bottom: 4px; color: var(--ds-primary, #3b5998); }
.nik-field input { width: 100%; height: 30px; padding: 4px 8px; border: 1px solid var(--ds-border, #b0b8c4); background: #eef1f6; font-size: 12px; color: #55637a; }
.form-tabs { position: sticky; top: 0; z-index: 5; display: flex; overflow-x: auto; background: var(--ds-surface, #f0f3f8); border-bottom: 2px solid var(--ds-primary, #3b5998); }
.form-tabs button { padding: 6px 14px; border: 1px solid var(--ds-border, #b0b8c4); border-bottom: none; background: var(--ds-surface-variant, #e0e4ea); color: var(--ds-on-surface, #1b2d4a); font: inherit; font-size: 12px; font-weight: 700; white-space: nowrap; cursor: pointer; }
.form-tabs button.active { background: var(--ds-primary, #3b5998); color: #fff; }
.form-tabs button:focus-visible { outline: 2px solid #e8871e; outline-offset: -3px; }
.tab-content { padding-top: 8px; }
.tab-panel > .fs { min-width: 0; }
.panel-pribadi { display: grid; grid-template-columns: minmax(0, 1fr) minmax(240px, 28%); gap: 0 12px; align-items: start; }
.panel-pribadi > .fs { grid-column: 1; overflow: visible; }
.panel-pribadi > .foto-section { grid-column: 2; grid-row: 1; }
.personal-details { grid-column: 1; }
.personal-details, .tab-panel:not(.panel-pribadi) { min-width: 0; background: #fff; border: 1px solid var(--ds-border, #b0b8c4); margin-bottom: 12px; padding: 4px 12px; }
.personal-details > .fs, .tab-panel:not(.panel-pribadi) > .fs { border: 0; background: transparent; margin: 0; padding: 8px 0 14px; }
.personal-details > .fs + .fs, .tab-panel:not(.panel-pribadi) > .fs + .fs { border-top: 1px solid #e3e8ef; }
.personal-details > .fs legend, .tab-panel:not(.panel-pribadi) > .fs legend { padding: 4px 0; font-size: 11px; }
.personal-details, .tab-panel.panel-karyawan, .tab-panel.panel-keluarga {
  background: transparent;
  border: 0;
  padding: 0;
}
.personal-details > .fs,
.tab-panel.panel-karyawan > .fs,
.tab-panel.panel-keluarga > .fs {
  background: #fff;
  border: 0;
  margin-bottom: 12px;
  padding: 12px;
}
.personal-details > .fs + .fs,
.tab-panel.panel-karyawan > .fs + .fs,
.tab-panel.panel-keluarga > .fs + .fs {
  border-top: 0;
}
.personal-details > .fs:nth-child(2),
.tab-panel.panel-karyawan > .fs:nth-child(2),
.tab-panel.panel-keluarga > .fs:nth-child(2) {
  background: #fff;
}
.personal-details > .fs:nth-child(3),
.tab-panel.panel-karyawan > .fs:nth-child(3) {
  background: #fff;
}
.personal-details > .fs legend,
.tab-panel.panel-karyawan > .fs legend,
.tab-panel.panel-keluarga > .fs legend {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.panel-pribadi > .foto-section {
  background: #fff;
}
.panel-pribadi .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.foto-placeholder { padding: 12px; text-align: center; font-size: 12px; color: #8995a6; }
.family-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px 12px; }
.family-grid > :deep(.field) { min-width: 0; }
@media (max-width: 900px) {
  .grid.identity-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .panel-pribadi { grid-template-columns: minmax(0, 1fr); }
  .panel-pribadi > .foto-section { grid-column: 1; grid-row: auto; }
  .tab-panel .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 600px) {
  .tab-panel .grid, .grid.identity-grid { grid-template-columns: minmax(0, 1fr); }
  .grid > :deep(.field) { grid-column: 1 !important; }
}
.loading {
  padding: 30px;
  text-align: center;
  font-size: 12px;
  color: #6b7a90;
}
.fs {
  min-width: 0;
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
  width: 100%;
  min-width: 0;
  display: flex;
  gap: 16px;
  align-items: center;
  flex-direction: column;
}
.foto-info { width: 100%; min-width: 0; }
.foto-info .flabel, .foto-info .hint { white-space: normal; overflow-wrap: anywhere; }
.foto-section legend { max-width: 100%; }
.foto-prev {
  width: 180px;
  max-width: 100%;
  height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
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
  display: block;
  width: 100%;
  min-width: 0;
  max-width: 100%;
}
.hint {
  display: block;
  margin-top: 6px;
  font-size: 10px;
  color: #8995a6;
}
table.grid-table {
  width: 100%;
  table-layout: fixed;
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
  white-space: normal;
  overflow-wrap: anywhere;
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
.schedule-field { max-width: 480px; }
.schedule-label { display: block; margin-bottom: 4px; font-size: 11px; font-weight: 700; color: var(--ds-primary, #3b5998); }
.schedule-select { width: 100%; min-height: 34px; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 9px; border: 1px solid var(--ds-border, #b0b8c4); background: #fff; color: var(--ds-on-surface, #1b2d4a); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.schedule-select:focus-visible { outline: 2px solid var(--ds-primary, #3b5998); }
.schedule-menu { width: 480px; max-width: calc(100vw - 24px); max-height: min(360px, 60vh); display: flex; flex-direction: column; padding: 10px; background: #fff; border: 1px solid var(--ds-border, #b0b8c4); box-shadow: 0 6px 18px #0f1a2e26; }
.schedule-search { flex-shrink: 0; width: 100%; min-width: 0; height: 32px; padding: 4px 8px; margin-bottom: 6px; border: 1px solid var(--ds-border, #b0b8c4); font: inherit; font-size: 12px; }
.schedule-options { min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.schedule-option { display: flex; align-items: center; gap: 10px; padding: 8px; cursor: pointer; }
.schedule-option:hover { background: #eef2f8; }
.schedule-option input { flex-shrink: 0; accent-color: var(--ds-primary, #3b5998); }
.schedule-option-text { display: flex; flex-direction: column; min-width: 0; overflow-wrap: anywhere; font-size: 12px; }
.schedule-option-text small { color: #6b7a90; }
.schedule-empty { padding: 12px; font-size: 12px; color: #6b7a90; }
.schedule-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.schedule-chip { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; padding: 4px 8px; background: #eaf0f8; color: var(--ds-on-surface, #1b2d4a); font-size: 11px; overflow-wrap: anywhere; }
.schedule-chip button { flex-shrink: 0; width: 20px; height: 20px; font-size: 16px; cursor: pointer; }
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
table.grid-table td.delete-cell {
  text-align: center;
  vertical-align: middle;
}
table.grid-table :deep(.field), table.grid-table :deep(.select-wrap) { width: 100%; min-width: 0; }
table.grid-table :deep(input), table.grid-table :deep(select) { width: 100%; min-width: 0; max-width: 100%; box-sizing: border-box; padding-left: 4px; font-size: 11px; }
table.grid-table :deep(input[type="date"]) { padding-right: 2px; }
table.grid-table .delete-heading { width: 6%; text-align: center; }
.children-table th:nth-child(1) { width: 8%; }
.children-table th:nth-child(2) { width: 24%; }
.children-table th:nth-child(3) { width: 20%; }
.children-table th:nth-child(4) { width: 18%; }
.children-table th:nth-child(5) { width: 24%; }
.education-table th:nth-child(1) { width: 12%; }
.education-table th:nth-child(2) { width: 23%; }
.education-table th:nth-child(3), .education-table th:nth-child(4) { width: 12%; }
.education-table th:nth-child(5), .education-table th:nth-child(6), .education-table th:nth-child(7) { width: 8%; }
.education-table th:nth-child(8) { width: 11%; }
.experience-table th:nth-child(1) { width: 22%; }
.experience-table th:nth-child(2) { width: 15%; }
.experience-table th:nth-child(3) { width: 11%; }
.experience-table th:nth-child(4), .experience-table th:nth-child(5) { width: 16%; }
.experience-table th:nth-child(6) { width: 14%; }
.skills-table th:nth-child(1) { width: 35%; }
.skills-table th:nth-child(2) { width: 59%; }
.pkwt-table th:nth-child(1) { width: 30%; }
.pkwt-table th:nth-child(2), .pkwt-table th:nth-child(3) { width: 32%; }
@container (max-width: 720px) {
  .family-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .family-spacer { display: none; }
  .family-grid > :deep(.family-work-note) { grid-column: 1 / -1; }
  .panel-pribadi { grid-template-columns: minmax(0, 1fr); }
  .panel-pribadi > .foto-section { grid-column: 1; grid-row: auto; }
  .foto-row { flex-direction: row; align-items: flex-start; }
  .foto-prev { flex-shrink: 0; width: 120px; height: 150px; }
}
@container (max-width: 420px) {
  .family-grid { grid-template-columns: minmax(0, 1fr); }
  .foto-row { flex-direction: column; align-items: center; }
}
</style>
