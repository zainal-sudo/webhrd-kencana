<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from "vue";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
import FText from "@/components/fields/FText.vue";
import FDate from "@/components/fields/FDate.vue";
import FSelect from "@/components/fields/FSelect.vue";
import { api, getErrorMessage } from "@/api/axios";
import { todaySql } from "@/utils/format";
import { normJam, selisihHari } from "@/utils/jam";
import type { LookupItem } from "@/types";

/**
 * Form Ijin V2 kolektif — padanan `ufrmIjin2`.
 *
 * Satu tanggal + satu jenis ijin + satu jam + satu keterangan & alasan
 * untuk BANYAK NIK (grid). Tiap NIK mendapat nomor IJN.YYYYMM.NNNN
 * sendiri berurutan. Beda penting vs V1:
 * - tanggal >= 3 hari DITOLAK mentah-mentah (tanpa jalur otorisasi);
 * - satu NIK duplikat membatalkan SELURUH batch;
 * - tidak ada mode ubah (dokumen tersimpan dikelola lewat browse Ijin).
 */
interface Baris {
  nik: string;
  nama: string;
}

const toast = useToast();

const values = reactive<Record<string, any>>({
  nomor: "",
  tanggal: todaySql(),
  pabrik: "",
  departemen: "",
  jabatan: "",
  bagian: "",
  jenis_id: "3",
  keterangan: 3,
  alasan: "",
  jam: "00:00:00",
  jam2: "00:00:00",
});

const allDep = ref(false);
const allJab = ref(false);
const allBag = ref(false);

const baris = ref<Baris[]>([{ nik: "", nama: "" }]);
const memuatKaryawan = ref(false);

const jenisOptions = ref<{ label: string; value: string | number }[]>([]);
const pabrikOptions = ref<{ label: string; value: string | number }[]>([]);
const jabatanOptions = ref<{ label: string; value: string | number }[]>([]);
const departemenOptions = ref<{ label: string; value: string | number }[]>([]);
const bagianOptions = ref<string[]>([]);

const PAKAI_JAM2 = ["2", "4", "5"];
const pakaiJam2 = computed(() => PAKAI_JAM2.includes(String(values.jenis_id)));
const terlaluLama = computed(() => selisihHari(values.tanggal) >= 3);

const cariOpen = ref(false);
const cariBaris = ref(-1);
const hasilCari = ref<any[]>([]);
const cariLoading = ref(false);
const kataCari = ref("");

async function muatAwal() {
  try {
    const [jenis, lookup] = await Promise.all([
      api.get("/transaksi/ijin/jenis"),
      api.get("/master/lookup"),
    ]);
    jenisOptions.value = (jenis.data.data || []).map((r: any) => ({
      label: `${r.Kode} - ${r.Nama}`,
      value: String(r.Kode),
    }));
    const d = lookup.data.data || {};
    pabrikOptions.value = ((d.pabrik || []) as LookupItem[]).map((r) => ({
      label: `${r.Kode} - ${r.Nama}`,
      value: String(r.Kode),
    }));
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat opsi form"));
  }
}

async function muatNomor() {
  try {
    const { data } = await api.get("/transaksi/ijin2/nomor", { params: { tanggal: values.tanggal } });
    values.nomor = data.data?.nomor || "";
  } catch {
    /* abaikan — nomor final dibuat server */
  }
}

async function muatFilterOptions() {
  if (!values.pabrik) return;
  try {
    const [dep, jab, bag] = await Promise.all([
      api.get("/transaksi/ijin2/departemen-options", { params: { pabrik: values.pabrik } }),
      api.get("/transaksi/ijin2/jabatan-options", {
        params: { pabrik: values.pabrik, departemen: allDep.value ? "" : values.departemen },
      }),
      api.get("/transaksi/ijin2/bagian-options", {
        params: {
          pabrik: values.pabrik,
          jabatan: allJab.value ? "" : values.jabatan,
          departemen: allDep.value ? "" : values.departemen,
        },
      }),
    ]);
    departemenOptions.value = (dep.data.data || []).map((r: any) => ({ label: `${r.Kode} - ${r.Departemen}`, value: String(r.Kode) }));
    jabatanOptions.value = (jab.data.data || []).map((r: any) => ({ label: `${r.Kode} - ${r.Jabatan}`, value: String(r.Kode) }));
    bagianOptions.value = bag.data.data || [];
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat opsi filter"));
  }
}

/** Tombol Bagian Delphi: muat semua karyawan sesuai filter ke grid. */
async function muatKaryawanBtn() {
  if (!values.pabrik) {
    toast.error("Pabrik wajib dipilih dulu");
    return;
  }
  memuatKaryawan.value = true;
  try {
    const { data } = await api.get("/transaksi/ijin2/muat-karyawan", {
      params: {
        pabrik: values.pabrik,
        departemen: allDep.value ? "" : values.departemen,
        jabatan: allJab.value ? "" : values.jabatan,
        bagian: allBag.value ? "" : values.bagian,
        all_departemen: allDep.value ? 1 : 0,
        all_jabatan: allJab.value ? 1 : 0,
        all_bagian: allBag.value ? 1 : 0,
      },
    });
    const rows = data.data || [];
    if (!rows.length) {
      toast.error("Tidak ada karyawan aktif untuk filter ini");
      return;
    }
    baris.value = rows.map((r: any) => ({ nik: r.nik, nama: r.nama || "" }));
    toast.success(`${rows.length} karyawan dimuat ke grid`);
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat karyawan"));
  } finally {
    memuatKaryawan.value = false;
  }
}

function tambahBaris() {
  baris.value.push({ nik: "", nama: "" });
}

function hapusBaris(i: number) {
  if (baris.value.length <= 1) {
    baris.value[0] = { nik: "", nama: "" };
    return;
  }
  baris.value.splice(i, 1);
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
    const { data } = await api.get("/transaksi/ijin2/karyawan", {
      params: { search: kataCari.value, pabrik: values.pabrik, per_page: 25 },
    });
    hasilCari.value = data.data || [];
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
  baris.value[cariBaris.value] = { nik, nama: row.Nama || "" };
  cariOpen.value = false;
}

async function simpan(): Promise<string> {
  const niks = baris.value.map((b) => String(b.nik || "").trim()).filter(Boolean);
  if (!values.tanggal) throw new Error("Tanggal wajib diisi");
  if (!values.jenis_id) throw new Error("Jenis ijin wajib dipilih");
  if (!niks.length) throw new Error("Minimal satu NIK harus diisi");
  if (new Set(niks).size !== niks.length) throw new Error("Ada NIK yang dimasukkan dua kali");
  if (terlaluLama.value) throw new Error("Tanggal terlalu lama tidak bisa menggunakan modul ini");

  try {
    const { data } = await api.post("/transaksi/ijin2", {
      tanggal: String(values.tanggal).slice(0, 10),
      jenis_id: parseInt(String(values.jenis_id), 10),
      keterangan: Number(values.keterangan ?? 3),
      alasan: values.alasan || "",
      jam: normJam(values.jam),
      jam2: pakaiJam2.value ? normJam(values.jam2) : "00:00:00",
      niks,
    });
    baris.value = [{ nik: "", nama: "" }];
    muatNomor();
    return `${data.message} untuk tanggal ${values.tanggal}`;
  } catch (e) {
    throw new Error(getErrorMessage(e));
  }
}

onMounted(async () => {
  await muatAwal();
  await muatNomor();
});

watch(
  () => values.tanggal,
  () => muatNomor()
);

watch(
  () => values.pabrik,
  () => muatFilterOptions()
);
</script>

<template>
  <BaseForm
    title="Tambah Ijin Kolektif (V2)"
    subtitle="Satu tanggal & jenis untuk banyak NIK — tiap NIK dapat nomor sendiri"
    icon="group_add"
    :crumbs="[{ label: 'Ijin', path: '/transaksi/ijin' }, { label: 'Kolektif (V2)' }]"
    :save-fn="simpan"
    return-path="/transaksi/ijin"
    save-label="Simpan Kolektif"
  >
    <template #form-content>
      <fieldset class="fs">
        <legend>Dokumen & Filter Karyawan</legend>
        <div class="grid">
          <FText v-model="values.nomor" label="Nomor Awal" disabled placeholder="Otomatis" />
          <FDate v-model="values.tanggal" label="Tanggal" required />
          <FSelect v-model="values.pabrik" label="Pabrik" required :options="pabrikOptions" />
          <FSelect v-model="values.jenis_id" label="Jenis Ijin" required :options="jenisOptions" />
          <FSelect v-model="values.departemen" label="Departemen (filter)" :options="departemenOptions" :disabled="allDep" />
          <label class="chk"><input v-model="allDep" type="checkbox" /> All Departemen</label>
          <FSelect v-model="values.jabatan" label="Jabatan (filter)" :options="jabatanOptions" :disabled="allJab" />
          <label class="chk"><input v-model="allJab" type="checkbox" /> All Jabatan</label>
          <div class="bagian-wrap">
            <FText v-model="values.bagian" label="Bagian (filter)" placeholder="Ketik / pilih" :disabled="allBag" />
            <div v-if="bagianOptions.length && !allBag" class="bagian-list">
              <button v-for="b in bagianOptions" :key="b" type="button" @click="values.bagian = b">{{ b }}</button>
            </div>
          </div>
          <label class="chk"><input v-model="allBag" type="checkbox" /> All Bagian</label>
        </div>
        <div class="aksi-row">
          <button class="btn-mini" type="button" :disabled="memuatKaryawan" @click="muatKaryawanBtn">
            {{ memuatKaryawan ? "Memuat..." : "Muat Karyawan (tombol Bagian)" }}
          </button>
        </div>
        <p v-if="terlaluLama" class="note warn-note">
          Tanggal {{ values.tanggal }} sudah ≥ 3 hari — modul V2 menolaknya (tanpa otorisasi).
          Pakai Ijin V1 bila perlu otorisasi atasan.
        </p>
      </fieldset>

      <fieldset class="fs">
        <legend>Jenis, Waktu & Keterangan (berlaku untuk semua NIK)</legend>
        <div class="grid">
          <FSelect
            v-model="values.keterangan"
            label="Keterangan"
            :options="[
              { label: 'Sakit', value: 0 },
              { label: 'Ijin', value: 1 },
              { label: 'Alpha', value: 2 },
              { label: 'Lain Lain', value: 3 },
            ]"
          />
          <FText v-model="values.alasan" label="Alasan" placeholder="Alasan ijin" />
          <FText v-model="values.jam" label="Jam" placeholder="00:00:00" />
          <FText v-if="pakaiJam2" v-model="values.jam2" label="Jam s/d" placeholder="00:00:00" />
        </div>
        <p v-if="!pakaiJam2" class="note">Jenis ijin ini tidak memakai jam akhir (disimpan 00:00:00).</p>
      </fieldset>

      <fieldset class="fs">
        <legend>Daftar NIK ({{ baris.filter((b) => b.nik).length }} orang)</legend>
        <table class="grid-tbl">
          <thead>
            <tr><th style="width: 30px">No</th><th>NIK</th><th>Nama</th><th style="width: 60px">Aksi</th></tr>
          </thead>
          <tbody>
            <tr v-for="(b, i) in baris" :key="i">
              <td class="ctr">{{ i + 1 }}</td>
              <td>
                <div class="nik-sel">
                  <input v-model="b.nik" placeholder="NIK" />
                  <button class="btn-mini" type="button" @click="bukaCari(i)">...</button>
                </div>
              </td>
              <td><input v-model="b.nama" placeholder="Nama" /></td>
              <td class="ctr"><button class="btn-mini del" type="button" @click="hapusBaris(i)">×</button></td>
            </tr>
          </tbody>
        </table>
        <div class="aksi-row">
          <button class="btn-mini" type="button" @click="tambahBaris">+ Tambah baris</button>
        </div>
        <p class="note">Bila satu NIK saja sudah berijin pada tanggal ini, seluruh batch dibatalkan (seperti Delphi).</p>
      </fieldset>
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
          <input v-model="kataCari" placeholder="NIK / nama..." @keyup.enter="cariNik" />
          <button class="btn-mini primary" type="button" :disabled="cariLoading" @click="cariNik">
            {{ cariLoading ? "Mencari..." : "Cari" }}
          </button>
        </div>
        <table class="mini">
          <thead><tr><th>NIK</th><th>Nama</th><th>Jabatan</th><th>Bagian</th><th>Pabrik</th><th>Status</th></tr></thead>
          <tbody>
            <tr v-for="(r, i) in hasilCari" :key="i" class="klik" @click="pilihKaryawan(r)">
              <td>{{ r.Nik }}</td><td>{{ r.Nama }}</td><td>{{ r.Jabatan }}</td>
              <td>{{ r.Bagian }}</td><td>{{ r.Pabrik }}</td><td>{{ r.Status }}</td>
            </tr>
            <tr v-if="!hasilCari.length"><td colspan="6" class="empty">Karyawan tidak ditemukan</td></tr>
          </tbody>
        </table>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.fs { border: 1px solid var(--ds-border, #b0b8c4); background: #fff; padding: 10px 12px 14px; margin-bottom: 12px; }
.fs > legend { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; color: var(--ds-primary, #3b5998); padding: 0 6px; }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 14px; }
.chk { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--ds-primary, #3b5998); padding-top: 20px; }
.note { font-size: 12px; color: #7a5b16; margin: 8px 0 0; }
.warn-note { font-weight: 700; background: #fffaef; border: 1px solid #d9a441; padding: 6px 10px; }
.aksi-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.btn-mini { height: 26px; padding: 0 10px; border: 1px solid var(--ds-border, #b0b8c4); background: #fff; font-family: "Plus Jakarta Sans", sans-serif; font-size: 11px; font-weight: 700; cursor: pointer; color: var(--ds-on-surface, #1b2d4a); }
.btn-mini.primary { background: var(--ds-primary, #3b5998); border-color: var(--ds-primary-dark, #2c4472); color: #fff; }
.btn-mini.del { color: #dc2626; }
.btn-mini:disabled { opacity: 0.6; cursor: not-allowed; }
.bagian-list { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; max-height: 72px; overflow: auto; }
.bagian-list button { font-size: 10px; border: 1px solid var(--ds-border, #b0b8c4); background: #f4f6f9; padding: 2px 6px; cursor: pointer; font-family: "Plus Jakarta Sans", sans-serif; }
.bagian-list button:hover { background: #dbe4f3; }
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
