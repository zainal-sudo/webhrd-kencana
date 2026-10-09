<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from "vue";
import { useRoute } from "vue-router";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
import KaryawanLookupTable from "@/components/KaryawanLookupTable.vue";
import { useKaryawanLookup } from "@/composables/useKaryawanLookup";
import FText from "@/components/fields/FText.vue";
import FDate from "@/components/fields/FDate.vue";
import FSelect from "@/components/fields/FSelect.vue";
import { api as sourceApi, getErrorMessage } from "@/api/axios";
import { useTransactionReset } from "@/composables/useTransactionReset";
import { todaySql } from "@/utils/format";
import { selisihHari } from "@/utils/jam";
import type { LookupItem } from "@/types";

/**
 * Form Penilaian 3 Bulan — padanan `ufrmPenilaian3Bulan`.
 *
 * Header: Nomor (PB3.YYYYMM.NNNN otomatis), Tanggal, Pabrik, Tahun,
 * Periode bulan awal–akhir. Grid: NIK (+lookup), Nama, Jabatan, Departemen,
 * Bagian, Nilai (angka), Kriteria (A–E otomatis dari nilai), Keterangan.
 * Tombol "Muat Karyawan" mengisi grid dari karyawan aktif pabrik terpilih.
 * Otorisasi atasan bila tanggal >= 2 hari.
 */
interface Baris {
  nik: string;
  nama: string;
  jabatan: string;
  departemen: string;
  bagian: string;
  nilai: string;
  kriteria: string;
  keterangan: string;
}

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function kriteriaDariNilai(v: string): string {
  const n = parseFloat(v);
  if (isNaN(n)) return "";
  if (n >= 46) return "A";
  if (n >= 36) return "B";
  if (n >= 26) return "C";
  if (n >= 16) return "D";
  return "E";
}

const route = useRoute();
const toast = useToast();
const karyawanLookup = useKaryawanLookup("/transaksi/penilaian-3-bulan/karyawan");

const nomorEdit = computed(() => String(route.query.id ?? ""));
const isEdit = computed(() => !!nomorEdit.value);

const values = reactive<Record<string, any>>({
  nomor: "",
  tanggal: todaySql(),
  pabrik: "",
  tahun: String(new Date().getFullYear()),
  periode: 1,
  periode2: 3,
});

const baris = ref<Baris[]>([{ nik: "", nama: "", jabatan: "", departemen: "", bagian: "", nilai: "", kriteria: "", keterangan: "" }]);
const memuat = ref(false);
const memuatKaryawan = ref(false);

const pabrikOptions = ref<{ label: string; value: string | number }[]>([]);

const perluOtorisasi = computed(() => selisihHari(values.tanggal) >= 2);
const otorisasi = reactive({ user_kode: "", user_password: "" });
const otorisasiToken = ref("");
const otorisasiDiterima = ref(false);
const cekOtor = ref(false);

const cariOpen = ref(false);
const cariBaris = ref(-1);
const cariLoading = ref(false);
const kataCari = ref("");
const resetState = useTransactionReset({ values, baris }, {
  isEdit: () => isEdit.value,
  blocked: () => memuat.value || memuatKaryawan.value || cariLoading.value || cekOtor.value || karyawanLookup.loading,
  afterRestore: () => {
    cariOpen.value = false;
    cariBaris.value = -1;
    kataCari.value = "";
    karyawanLookup.clear();
    otorisasi.user_kode = "";
    otorisasi.user_password = "";
    otorisasiToken.value = "";
    otorisasiDiterima.value = false;
  },
});
const api = resetState.trackApi(sourceApi);

async function muatLookup() {
  try {
    const { data } = await api.get("/master/lookup");
    const d = data.data || {};
    pabrikOptions.value = ((d.pabrik || []) as LookupItem[]).map((r) => ({
      label: `${r.Kode} - ${r.Nama}`,
      value: String(r.Kode),
    }));
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat opsi pabrik"));
  }
}

async function muatNomor() {
  if (resetState.restoring.value) return;
  if (isEdit.value) return;
  try {
    const { data } = await api.get("/transaksi/penilaian-3-bulan/nomor", { params: { tanggal: values.tanggal } });
    values.nomor = data.data?.nomor || "";
  } catch {
    /* abaikan */
  }
}

async function muatEdit() {
  if (!isEdit.value) return;
  memuat.value = true;
  try {
    const { data } = await api.get("/transaksi/penilaian-3-bulan/form", { params: { nomor: nomorEdit.value } });
    const d = data.data;
    Object.assign(values, {
      nomor: d.nomor, tanggal: String(d.tanggal).slice(0, 10), pabrik: d.pabrik || "",
      tahun: String(d.tahun ?? new Date().getFullYear()), periode: d.periode ?? 1, periode2: d.periode2 ?? 3,
    });
    baris.value = (d.detail || []).map((r: any) => ({
      nik: r.nik, nama: r.nama || "", jabatan: r.jabatan || "", departemen: r.departemen || "",
      bagian: r.bagian || "", nilai: String(r.nilai ?? ""), kriteria: r.kriteria || "", keterangan: r.keterangan || "",
    }));
    if (!baris.value.length) tambahBaris();
    resetState.capture();
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat data"));
  } finally {
    memuat.value = false;
  }
}

async function muatKaryawanBtn() {
  if (!values.pabrik) {
    toast.error("Pabrik wajib dipilih dulu");
    return;
  }
  memuatKaryawan.value = true;
  try {
    const { data } = await api.get("/transaksi/penilaian-3-bulan/muat-karyawan", { params: { pabrik: values.pabrik } });
    const rows = data.data || [];
    if (!rows.length) {
      toast.error("Tidak ada karyawan aktif untuk pabrik ini");
      return;
    }
    baris.value = rows.map((r: any) => ({
      nik: r.nik, nama: r.nama || "", jabatan: r.jabatan || "", departemen: r.departemen || "",
      bagian: r.bagian || "", nilai: "", kriteria: "", keterangan: "",
    }));
    toast.success(`${rows.length} karyawan dimuat ke grid`);
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat karyawan"));
  } finally {
    memuatKaryawan.value = false;
  }
}

function tambahBaris() {
  baris.value.push({ nik: "", nama: "", jabatan: "", departemen: "", bagian: "", nilai: "", kriteria: "", keterangan: "" });
}

function hapusBaris(i: number) {
  if (baris.value.length <= 1) {
    baris.value[0] = { nik: "", nama: "", jabatan: "", departemen: "", bagian: "", nilai: "", kriteria: "", keterangan: "" };
    return;
  }
  baris.value.splice(i, 1);
}

function onNilai(i: number) {
  baris.value[i].kriteria = kriteriaDariNilai(baris.value[i].nilai);
}

function bukaCari(i: number) {
  cariBaris.value = i;
  kataCari.value = baris.value[i]?.nik || "";
  cariOpen.value = true;
  cariNik();
}

async function cariNik() {
  cariLoading.value = true;
  try {
    await karyawanLookup.search(kataCari.value, { pabrik: values.pabrik });
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal mencari karyawan"));
  } finally {
    cariLoading.value = false;
  }
}

function pilihKaryawan(row: Record<string, any>) {
  if (cariBaris.value < 0) return;
  const nik = String(row.Nik ?? "");
  if (baris.value.some((b, i) => i !== cariBaris.value && b.nik === nik)) {
    toast.error("Karyawan ini sudah dimasukkan pada baris lain");
    return;
  }
  Object.assign(baris.value[cariBaris.value], { nik, nama: row.Nama || "", jabatan: row.Jabatan || "", bagian: row.Bagian || "" });
  cariOpen.value = false;
}

async function cekOtorisasi() {
  if (!otorisasi.user_kode || !otorisasi.user_password) {
    toast.error("Kode user dan password atasan wajib diisi");
    return;
  }
  cekOtor.value = true;
  try {
    const { data } = await api.post("/transaksi/penilaian-3-bulan/otorisasi", {
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

async function simpan(): Promise<string> {
  const terisi = baris.value.filter((b) => String(b.nik || "").trim());
  if (!values.tanggal) throw new Error("Tanggal wajib diisi");
  if (!values.pabrik) throw new Error("Pabrik wajib dipilih");
  if (!terisi.length) throw new Error("Minimal satu karyawan harus dinilai");
  for (const b of terisi) {
    if (b.nilai === "" || isNaN(parseFloat(b.nilai))) throw new Error(`Nilai ${b.nik} wajib diisi angka`);
  }
  if (perluOtorisasi.value && !otorisasiToken.value)
    throw new Error("Data lebih dari 2 hari memerlukan otorisasi atasan");

  const body: Record<string, any> = {
    tanggal: String(values.tanggal).slice(0, 10),
    pabrik: values.pabrik,
    tahun: parseInt(String(values.tahun), 10),
    periode: Number(values.periode),
    periode2: Number(values.periode2),
    detail: terisi.map((b) => ({
      nik: String(b.nik).trim(), jabatan: b.jabatan || "", bagian: b.bagian || "",
      nilai: parseFloat(b.nilai), keterangan: b.keterangan || "",
    })),
  };
  if (isEdit.value) body.nomor = nomorEdit.value;
  if (otorisasiToken.value) body.otorisasi_token = otorisasiToken.value;

  try {
    const { data } = isEdit.value
      ? await api.put("/transaksi/penilaian-3-bulan", body)
      : await api.post("/transaksi/penilaian-3-bulan", body);
    return `${data.message} — ${data.data?.jumlah || terisi.length} karyawan`;
  } catch (e) {
    throw new Error(getErrorMessage(e));
  }
}

onMounted(async () => {
  await muatLookup();
  await muatEdit();
  if (!isEdit.value) await muatNomor();
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
</script>

<template>
  <BaseForm
    :title="isEdit ? `Ubah Penilaian ${nomorEdit}` : 'Tambah Penilaian 3 Bulan'"
    subtitle="Nomor PB3.YYYYMM.NNNN dibuat otomatis per bulan — kriteria A–E dari nilai"
    icon="reviews"
    :crumbs="[{ label: 'Penilaian 3 Bulan', path: '/transaksi/penilaian-3-bulan' }, { label: isEdit ? 'Ubah' : 'Tambah' }]"
    :save-fn="simpan"
    :reset-fn="resetState.reset"
    :reset-disabled="resetState.disabled.value"
    return-path="/transaksi/penilaian-3-bulan"
    save-label="Simpan Penilaian"
  >
    <template #form-content>
      <div v-if="memuat" class="loading">Memuat data...</div>
      <template v-else>
        <fieldset class="fs">
          <legend>Dokumen</legend>
          <div class="grid">
            <FText v-model="values.nomor" label="Nomor" disabled placeholder="Otomatis" />
            <FDate v-model="values.tanggal" label="Tanggal" required />
            <FSelect v-model="values.pabrik" label="Pabrik" required :options="pabrikOptions" />
            <FText v-model="values.tahun" label="Tahun" required type="number" />
            <FSelect
              v-model="values.periode"
              label="Periode Bulan Awal"
              :options="BULAN.map((b, i) => ({ label: `${i + 1} - ${b}`, value: i + 1 }))"
            />
            <FSelect
              v-model="values.periode2"
              label="Periode Bulan Akhir"
              :options="BULAN.map((b, i) => ({ label: `${i + 1} - ${b}`, value: i + 1 }))"
            />
          </div>
          <div class="aksi-row">
            <button class="btn-mini" type="button" :disabled="memuatKaryawan" @click="muatKaryawanBtn">
              {{ memuatKaryawan ? "Memuat..." : "Muat Karyawan Pabrik" }}
            </button>
          </div>
          <p class="note">Kriteria: ≥46 A, ≥36 B, ≥26 C, ≥16 D, &lt;16 E (dihitung otomatis dari nilai).</p>
        </fieldset>

        <fieldset class="fs">
          <legend>Nilai Karyawan ({{ baris.filter((b) => b.nik).length }} orang)</legend>
          <table class="grid-tbl">
            <thead>
              <tr><th style="width: 30px; text-align: center">No</th><th>NIK</th><th>Nama</th><th>Jabatan</th><th>Bagian</th><th style="width: 70px">Nilai</th><th style="width: 60px">Krit.</th><th>Keterangan</th><th style="width: 50px; text-align: center">Aksi</th></tr>
            </thead>
            <tbody>
              <tr v-for="(b, i) in baris" :key="i">
                <td class="ctr">{{ i + 1 }}</td>
                <td><div class="nik-sel"><input v-model="b.nik" placeholder="NIK" /><button class="btn-mini" type="button" @click="bukaCari(i)">...</button></div></td>
                <td><input v-model="b.nama" placeholder="Nama" /></td>
                <td><input v-model="b.jabatan" placeholder="Jabatan" /></td>
                <td><input v-model="b.bagian" placeholder="Bagian" /></td>
                <td><input v-model="b.nilai" placeholder="0" @input="onNilai(i)" /></td>
                <td class="ctr"><b>{{ b.kriteria }}</b></td>
                <td><input v-model="b.keterangan" placeholder="Keterangan" /></td>
                <td class="ctr"><button class="btn-mini del" type="button" @click="hapusBaris(i)">×</button></td>
              </tr>
            </tbody>
          </table>
          <div class="aksi-row">
            <button class="btn-mini" type="button" @click="tambahBaris">+ Tambah baris</button>
          </div>
        </fieldset>

        <fieldset v-if="perluOtorisasi" class="fs warn">
          <legend>Otorisasi Atasan</legend>
          <p class="note">
            Tanggal <strong>{{ values.tanggal }}</strong> berjarak
            <strong>{{ selisihHari(values.tanggal) }} hari</strong> dari hari ini — perlu persetujuan atasan.
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
</template>

<style scoped>
.fs { border: 1px solid var(--ds-border, #b0b8c4); background: #fff; padding: 10px 12px 14px; margin-bottom: 12px; }
.fs > legend { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; color: var(--ds-primary, #3b5998); padding: 0 6px; }
.fs.warn { border-color: #d9a441; background: #fffaef; }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 14px; }
.note { font-size: 12px; color: #7a5b16; margin: 8px 0 0; }
.aksi-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.ok { font-size: 12px; font-weight: 700; color: #15803d; }
.btn-mini { height: 26px; padding: 0 10px; border: 1px solid var(--ds-border, #b0b8c4); background: #fff; font-family: "Plus Jakarta Sans", sans-serif; font-size: 11px; font-weight: 700; cursor: pointer; color: var(--ds-on-surface, #1b2d4a); }
.btn-mini.primary { background: var(--ds-primary, #3b5998); border-color: var(--ds-primary-dark, #2c4472); color: #fff; }
.btn-mini.del { color: #dc2626; }
.btn-mini:disabled { opacity: 0.6; cursor: not-allowed; }
.loading { padding: 24px; text-align: center; font-size: 12px; color: #6b7a90; }
table.grid-tbl { width: 100%; border-collapse: collapse; font-size: 11px; }
table.grid-tbl th { background: var(--ds-surface-variant, #e0e4ea); border: 1px solid var(--ds-border, #b0b8c4); padding: 5px 6px; text-align: left; font-weight: 800; }
table.grid-tbl td { border: 1px solid #d5dbe3; padding: 2px; }
table.grid-tbl td.ctr { text-align: center; }
table.grid-tbl input { width: 100%; border: 1px solid transparent; padding: 4px 6px; font-size: 11px; font-family: "Plus Jakarta Sans", sans-serif; }
table.grid-tbl input:focus { border-color: var(--ds-primary, #3b5998); outline: none; }
.nik-sel { display: flex; gap: 2px; }
.dlg-head { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 800; padding: 8px 12px; background: var(--ds-surface-variant, #e0e4ea); }
.dlg-body { background: #fff; padding: 12px 14px; }
.cari-bar { display: flex; gap: 6px; margin-bottom: 10px; }
.cari-bar input { flex: 1; height: 28px; border: 1px solid var(--ds-border, #b0b8c4); padding: 0 8px; font-size: 12px; font-family: "Plus Jakarta Sans", sans-serif; }
table.mini { width: 100%; border-collapse: collapse; font-size: 11px; }
table.mini th { background: var(--ds-surface-variant, #e0e4ea); border: 1px solid var(--ds-border, #b0b8c4); padding: 5px 7px; text-align: left; font-weight: 800; }
table.mini td { border: 1px solid #d5dbe3; padding: 4px 7px; }
table.mini tr.klik:hover { background: var(--ds-primary-lighten-1, #dbe4f3); cursor: pointer; }
table.mini .empty { text-align: center; color: #8995a6; padding: 10px; }
</style>
