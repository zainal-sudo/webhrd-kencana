<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
import KaryawanLookupTable from "@/components/KaryawanLookupTable.vue";
import { useKaryawanLookup } from "@/composables/useKaryawanLookup";
import FText from "@/components/fields/FText.vue";
import FTime from "@/components/fields/FTime.vue";
import FDate from "@/components/fields/FDate.vue";
import { api, getErrorMessage } from "@/api/axios";
import { todaySql } from "@/utils/format";
import { normJam, assertClockTime } from "@/utils/jam";

/**
 * Form Lembur V2 per NIK — padanan `ufrmLembur2`.
 *
 * SATU karyawan (NIK + lookup, info jabatan/bagian/pabrik read-only) untuk
 * BANYAK tanggal. Tiap baris grid (tanggal + jam mulai/akhir + keterangan
 * + panggilan) menjadi dokumen SPL sendiri. Tanpa otorisasi & tanpa mode
 * ubah di Delphi — dokumen tersimpan dikelola lewat browse Lembur.
 */
interface Baris {
  tanggal: string;
  jam_mulai: string;
  jam_akhir: string;
  keterangan: string;
  panggilan: boolean;
}

const toast = useToast();
const karyawanLookup = useKaryawanLookup("/transaksi/lembur2/karyawan");

const values = reactive<Record<string, any>>({ nik: "" });
const info = reactive({ nama: "", pabrik: "", jab_kode: "", jabatan: "", bagian: "" });
const baris = ref<Baris[]>([{ tanggal: todaySql(), jam_mulai: "", jam_akhir: "", keterangan: "", panggilan: false }]);

const cariOpen = ref(false);
const cariLoading = ref(false);
const kataCari = ref("");

async function infoKaryawan() {
  const nik = String(values.nik || "").trim();
  if (!nik) return;
  try {
    const { data } = await api.get("/transaksi/lembur2/karyawan-info", { params: { nik } });
    const d = data.data || {};
    Object.assign(info, {
      nama: d.nama || "", pabrik: d.pabrik || "", jab_kode: d.jab_kode || "",
      jabatan: d.jabatan || "", bagian: d.bagian || "",
    });
  } catch {
    Object.assign(info, { nama: "", pabrik: "", jab_kode: "", jabatan: "", bagian: "" });
  }
}

async function bukaCari() {
  cariOpen.value = true;
  kataCari.value = String(values.nik || "");
  await cariNik();
}

async function cariNik() {
  cariLoading.value = true;
  try {
    await karyawanLookup.search(kataCari.value);
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal mencari karyawan"));
  } finally {
    cariLoading.value = false;
  }
}

function pilihKaryawan(row: Record<string, any>) {
  values.nik = String(row.Nik ?? "");
  cariOpen.value = false;
  infoKaryawan();
}

/** Tombol "Samakan Jam" Delphi: salin jam baris pertama ke semua baris. */
function samakanJam() {
  if (!baris.value.length) return;
  const awal = baris.value[0].jam_mulai;
  const akhir = baris.value[0].jam_akhir;
  for (let i = 1; i < baris.value.length; i += 1) {
    baris.value[i].jam_mulai = awal;
    baris.value[i].jam_akhir = akhir;
  }
  toast.success("Jam awal & akhir disamakan mengikuti baris pertama");
}

function tambahBaris() {
  baris.value.push({ tanggal: todaySql(), jam_mulai: "", jam_akhir: "", keterangan: "", panggilan: false });
}

function hapusBaris(i: number) {
  if (baris.value.length <= 1) {
    baris.value[0] = { tanggal: todaySql(), jam_mulai: "", jam_akhir: "", keterangan: "", panggilan: false };
    return;
  }
  baris.value.splice(i, 1);
}

async function simpan(): Promise<string> {
  const nik = String(values.nik || "").trim();
  const terisi = baris.value.filter((b) => String(b.tanggal || "").trim());
  terisi.forEach((b, i) => {
    assertClockTime(b.jam_mulai, `Baris ${i + 1} — Jam Mulai`);
    assertClockTime(b.jam_akhir, `Baris ${i + 1} — Jam Akhir`);
  });
  if (!nik) throw new Error("NIK wajib diisi");
  if (!terisi.length) throw new Error("Minimal satu tanggal harus diisi");

  try {
    const { data } = await api.post("/transaksi/lembur2", {
      nik,
      detail: terisi.map((b) => ({
        tanggal: String(b.tanggal).slice(0, 10),
        jam_mulai: normJam(b.jam_mulai),
        jam_akhir: normJam(b.jam_akhir),
        keterangan: b.keterangan || "",
        panggilan: b.panggilan ? 1 : 0,
      })),
    });
    baris.value = [{ tanggal: todaySql(), jam_mulai: "", jam_akhir: "", keterangan: "", panggilan: false }];
    return data.message;
  } catch (e) {
    throw new Error(getErrorMessage(e));
  }
}

onMounted(() => {
  /* form selalu mode tambah */
});
</script>

<template>
  <BaseForm
    title="Tambah Lembur Per NIK (V2)"
    subtitle="Satu karyawan untuk banyak tanggal — tiap baris menjadi SPL sendiri"
    icon="person_add"
    :crumbs="[{ label: 'Lembur', path: '/transaksi/lembur' }, { label: 'Per NIK (V2)' }]"
    :save-fn="simpan"
    return-path="/transaksi/lembur"
    save-label="Simpan Lembur"
  >
    <template #form-content>
      <fieldset class="fs">
        <legend>Karyawan</legend>
        <div class="grid">
          <FText v-model="values.nik" label="NIK" required placeholder="Ketik NIK / Cari" />
          <div class="cari-btn"><button class="btn-mini" type="button" @click="bukaCari">Cari karyawan</button></div>
          <FText :model-value="info.nama" label="Nama" disabled @update:model-value="() => {}" />
          <FText :model-value="info.pabrik" label="Pabrik" disabled @update:model-value="() => {}" />
          <FText :model-value="`${info.jab_kode} - ${info.jabatan}`" label="Jabatan" disabled @update:model-value="() => {}" />
          <FText :model-value="info.bagian" label="Bagian" disabled @update:model-value="() => {}" />
        </div>
        <p class="note">Bagian & pabrik SPL diambil dari master karyawan; jenis kerja = keterangan tiap baris.</p>
      </fieldset>

      <fieldset class="fs">
        <legend>Daftar Tanggal ({{ baris.filter((b) => b.tanggal).length }} SPL)</legend>
        <table class="grid-tbl">
          <thead>
            <tr><th style="width: 30px; text-align: center">No</th><th style="width: 130px">Tanggal</th><th style="width: 100px">Jam Mulai</th><th style="width: 100px">Jam Akhir</th><th>Keterangan (= Jenis Kerja)</th><th style="width: 70px">Panggil</th><th style="width: 50px; text-align: center">Aksi</th></tr>
          </thead>
          <tbody>
            <tr v-for="(b, i) in baris" :key="i">
              <td class="ctr">{{ i + 1 }}</td>
              <td><input v-model="b.tanggal" type="date" /></td>
              <td><FTime v-model="b.jam_mulai" label="Jam Mulai" compact placeholder="00:00:00" /></td>
              <td><FTime v-model="b.jam_akhir" label="Jam Akhir" compact placeholder="00:00:00" /></td>
              <td><input v-model="b.keterangan" placeholder="Uraian pekerjaan lembur" /></td>
              <td class="ctr"><input v-model="b.panggilan" type="checkbox" /></td>
              <td class="ctr"><button class="btn-mini del" type="button" @click="hapusBaris(i)">×</button></td>
            </tr>
          </tbody>
        </table>
        <div class="aksi-row">
          <button class="btn-mini" type="button" @click="tambahBaris">+ Tambah baris</button>
          <button class="btn-mini" type="button" @click="samakanJam">Samakan Jam Awal & Akhir</button>
        </div>
        <p class="note">Aturan Delphi: jam akhir maksimal 30 menit setelah scan keluar absensi hari itu.</p>
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
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 14px; }
.cari-btn { display: flex; align-items: flex-end; padding-bottom: 1px; }
.note { font-size: 12px; color: #7a5b16; margin: 8px 0 0; }
.aksi-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.btn-mini { height: 26px; padding: 0 10px; border: 1px solid var(--ds-border, #b0b8c4); background: #fff; font-family: "Plus Jakarta Sans", sans-serif; font-size: 11px; font-weight: 700; cursor: pointer; color: var(--ds-on-surface, #1b2d4a); }
.btn-mini.primary { background: var(--ds-primary, #3b5998); border-color: var(--ds-primary-dark, #2c4472); color: #fff; }
.btn-mini.del { color: #dc2626; }
.btn-mini:disabled { opacity: 0.6; cursor: not-allowed; }
table.grid-tbl { width: 100%; border-collapse: collapse; font-size: 11px; }
table.grid-tbl th { background: var(--ds-surface-variant, #e0e4ea); border: 1px solid var(--ds-border, #b0b8c4); padding: 5px 6px; text-align: left; font-weight: 800; }
table.grid-tbl td { border: 1px solid #d5dbe3; padding: 2px; }
table.grid-tbl td.ctr { text-align: center; }
table.grid-tbl input { width: 100%; border: 1px solid transparent; padding: 4px 6px; font-size: 11px; font-family: "Plus Jakarta Sans", sans-serif; }
table.grid-tbl input:focus { border-color: var(--ds-primary, #3b5998); outline: none; }
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
