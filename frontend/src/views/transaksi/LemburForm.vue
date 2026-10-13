<script setup lang="ts">
import { ref, reactive, computed, nextTick, onMounted, watch } from "vue";
import { useRoute } from "vue-router";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
import KaryawanLookupTable from "@/components/KaryawanLookupTable.vue";
import OtorisasiKode from "@/components/OtorisasiKode.vue";
import { useKaryawanLookup } from "@/composables/useKaryawanLookup";
import { useLiveSearch } from "@/composables/useLiveSearch";
import FText from "@/components/fields/FText.vue";
import FTime from "@/components/fields/FTime.vue";
import FDate from "@/components/fields/FDate.vue";
import FSelect from "@/components/fields/FSelect.vue";
import { api as sourceApi, getErrorMessage } from "@/api/axios";
import { useTransactionReset } from "@/composables/useTransactionReset";
import { todaySql } from "@/utils/format";
import { normJam, selisihHari, assertClockTime } from "@/utils/jam";
import type { LookupItem } from "@/types";

/**
 * Form Lembur — padanan `ufrmLembur`.
 *
 * Header: Nomor (LEM.YYYYMM.NNNN otomatis), Tanggal, Pabrik, Departemen,
 * Jabatan, Bagian (masing-masing + checkbox All), Jenis Kerja.
 * Grid: NIK (+lookup per baris), Nama, Jam Mulai, Jam Akhir, Keterangan,
 * Panggilan (checkbox).
 *
 * Tombol Delphi yang diduplikasi:
 * - "Muat Karyawan" (edtBagianClickBtn/loaddata): isi grid dengan semua
 *   karyawan aktif sesuai filter.
 * - "Samakan Jam" (Button1Click): salin jam baris pertama ke semua baris.
 * - Validasi absensi (cekdata): jam akhir maksimal 30 menit setelah scan
 *   keluar; server menolak dengan 422 bila dilanggar.
 * - Otorisasi atasan model kode ala Delphi bila tanggal >= 2 hari.
 */
interface Baris {
  nik: string;
  nama: string;
  jam_mulai: string;
  jam_akhir: string;
  keterangan: string;
  panggilan: boolean;
}

const route = useRoute();
const toast = useToast();
const karyawanLookup = useKaryawanLookup("/transaksi/lembur/karyawan");

const nomorEdit = computed(() => String(route.query.id ?? ""));
const isEdit = computed(() => !!nomorEdit.value);

const values = reactive<Record<string, any>>({
  nomor: "",
  tanggal: todaySql(),
  pabrik: "",
  departemen: "",
  jabatan: "",
  bagian: "",
  jenis_kerja: "",
});

const allDep = ref(false);
const allJab = ref(false);
const allBag = ref(false);

const baris = ref<Baris[]>([{ nik: "", nama: "", jam_mulai: "", jam_akhir: "", keterangan: "", panggilan: false }]);
const memuat = ref(false);
const memuatKaryawan = ref(false);

const pabrikOptions = ref<{ label: string; value: string | number }[]>([]);
const jabatanOptions = ref<{ label: string; value: string | number }[]>([]);
const departemenOptions = ref<{ label: string; value: string | number }[]>([]);
const bagianOptions = ref<string[]>([]);

const perluOtorisasi = computed(() => selisihHari(values.tanggal) >= 2);
const otorisasiToken = ref("");

function otorisasiOke(payload: { token: string; pemberi: string }) {
  otorisasiToken.value = payload.token;
}

const cariOpen = ref(false);
const cariBaris = ref(-1);
const cariLoading = ref(false);
const kataCari = ref("");
const resetState = useTransactionReset({ values, baris, allDep, allJab, allBag, departemenOptions, jabatanOptions, bagianOptions }, {
  isEdit: () => isEdit.value,
  blocked: () => memuat.value || memuatKaryawan.value || cariLoading.value || karyawanLookup.loading,
  afterRestore: () => {
    cariOpen.value = false;
    cariBaris.value = -1;
    kataCari.value = "";
    karyawanLookup.clear();
    otorisasiToken.value = "";
  },
});
const api = resetState.trackApi(sourceApi);

async function muatLookup() {
  try {
    const { data } = await api.get("/master/lookup");
    const d = data.data || {};
    const keOpsi = (arr: LookupItem[]) => (arr || []).map((r) => ({ label: `${r.Kode} - ${r.Nama}`, value: String(r.Kode) }));
    pabrikOptions.value = keOpsi(d.pabrik);
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat opsi form"));
  }
}

async function muatNomor() {
  if (resetState.restoring.value) return;
  if (isEdit.value) return;
  try {
    const { data } = await api.get("/transaksi/lembur/nomor", { params: { tanggal: values.tanggal } });
    values.nomor = data.data?.nomor || "";
  } catch {
    /* abaikan */
  }
}

async function muatEdit() {
  if (!isEdit.value) return;
  memuat.value = true;
  try {
    const { data } = await api.get("/transaksi/lembur/form", { params: { nomor: nomorEdit.value } });
    const d = data.data;
    Object.assign(values, {
      nomor: d.nomor, tanggal: String(d.tanggal).slice(0, 10), bagian: d.bagian || "",
      pabrik: d.pabrik || "", jenis_kerja: d.jenis_kerja || "",
    });
    baris.value = (d.detail || []).map((r: any) => ({
      nik: r.nik, nama: r.nama || "", jam_mulai: r.jam_mulai || "",
      jam_akhir: r.jam_akhir || "", keterangan: r.keterangan || "", panggilan: !!r.panggilan,
    }));
    if (!baris.value.length) baris.value.push({ nik: "", nama: "", jam_mulai: "", jam_akhir: "", keterangan: "", panggilan: false });
    resetState.capture();
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat data lembur"));
  } finally {
    memuat.value = false;
  }
}

async function muatFilterOptions() {
  if (resetState.restoring.value) return;
  if (!values.pabrik) return;
  try {
    const [dep, jab, bag] = await Promise.all([
      api.get("/transaksi/lembur/departemen-options", { params: { pabrik: values.pabrik } }),
      api.get("/transaksi/lembur/jabatan-options", {
        params: { pabrik: values.pabrik, departemen: allDep.value ? "" : values.departemen },
      }),
      api.get("/transaksi/lembur/bagian-options", {
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
    const { data } = await api.get("/transaksi/lembur/muat-karyawan", {
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
    baris.value = rows.map((r: any) => ({
      nik: r.nik, nama: r.nama || "", jam_mulai: "", jam_akhir: "", keterangan: "", panggilan: false,
    }));
    toast.success(`${rows.length} karyawan dimuat ke grid`);
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat karyawan"));
  } finally {
    memuatKaryawan.value = false;
  }
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
  baris.value.push({ nik: "", nama: "", jam_mulai: "", jam_akhir: "", keterangan: "", panggilan: false });
}

const employeeGrid = ref<HTMLTableElement | null>(null);
let editingGridInput: HTMLInputElement | null = null;
function blurEmployeeGrid(event: FocusEvent) {
  if (event.target === editingGridInput) editingGridInput = null;
}
async function navigateEmployeeGrid(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.disabled) return;
  // Nama is read-only, but Enter there must still move/add an employee row.
  if (input.readOnly && event.key !== "Enter") return;
  const cell = input.closest<HTMLElement>("[data-grid-column]");
  const row = input.closest<HTMLElement>("[data-grid-row]");
  if (!row || (!cell && !input.readOnly)) return;
  if (event.key === "F2" && input.type !== "checkbox") {
    event.preventDefault();
    editingGridInput = input;
    return;
  }
  if (event.key === "Escape" && editingGridInput === input) {
    event.preventDefault();
    editingGridInput = null;
    input.select();
    return;
  }
  const column = cell ? Number(cell.dataset.gridColumn) : 0;
  const index = Number(row.dataset.gridRow);
  let nextRow = index;
  let nextColumn = column;
  if (event.key === "Enter") {
    event.preventDefault();
    // Holding Enter must not traverse the grid or append repeated blank rows.
    if (event.repeat) return;
    nextRow += event.shiftKey ? -1 : 1;
    if (nextRow === baris.value.length) {
      tambahBaris();
      await nextTick();
    }
  } else if (event.key === "Tab") {
    nextColumn += event.shiftKey ? -1 : 1;
    if (nextColumn < 0) { nextRow--; nextColumn = 4; }
    if (nextColumn > 4) { nextRow++; nextColumn = 0; }
    // At the outer edges, keep native Tab so keyboard users can leave the grid.
    if (nextRow < 0 || nextRow >= baris.value.length) return;
    event.preventDefault();
  } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    if (event.shiftKey || editingGridInput === input) return;
    event.preventDefault();
    nextRow += event.key === "ArrowUp" ? -1 : 1;
  } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    if (event.shiftKey || editingGridInput === input) return;
    nextColumn += event.key === "ArrowLeft" ? -1 : 1;
    event.preventDefault();
    if (nextColumn < 0 || nextColumn > 4) return;
  } else return;
  if (nextRow < 0 || nextRow >= baris.value.length) return;
  const target = employeeGrid.value?.querySelector<HTMLInputElement>(
    `[data-grid-row="${nextRow}"] [data-grid-column="${nextColumn}"] input:not(:disabled):not([readonly])`
  );
  target?.focus();
  if (target) {
    editingGridInput = null;
    if (target.type !== "checkbox") target.select();
  }
  target?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function hapusBaris(i: number) {
  if (baris.value.length <= 1) {
    baris.value[0] = { nik: "", nama: "", jam_mulai: "", jam_akhir: "", keterangan: "", panggilan: false };
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
  const duplikat = baris.value.some((b, i) => i !== cariBaris.value && b.nik === nik);
  if (duplikat) {
    toast.error("Karyawan ini sudah dimasukkan pada baris lain");
    return;
  }
  baris.value[cariBaris.value].nik = nik;
  baris.value[cariBaris.value].nama = row.Nama || "";
  cariOpen.value = false;
}

async function simpan(): Promise<string> {
  const terisi = baris.value.filter((b) => String(b.nik || "").trim());
  terisi.forEach((b, i) => {
    assertClockTime(b.jam_mulai, `Baris ${i + 1} — Jam Mulai`);
    assertClockTime(b.jam_akhir, `Baris ${i + 1} — Jam Akhir`);
  });
  if (!values.tanggal) throw new Error("Tanggal wajib diisi");
  if (!values.pabrik) throw new Error("Pabrik wajib dipilih");
  if (!terisi.length) throw new Error("Minimal satu karyawan harus diisi");
  if (perluOtorisasi.value && !otorisasiToken.value)
    throw new Error("Data lebih dari 2 hari memerlukan otorisasi atasan");

  const body: Record<string, any> = {
    tanggal: String(values.tanggal).slice(0, 10),
    bagian: values.bagian || "",
    pabrik: values.pabrik,
    jenis_kerja: values.jenis_kerja || "",
    detail: terisi.map((b) => ({
      nik: String(b.nik).trim(),
      jam_mulai: normJam(b.jam_mulai),
      jam_akhir: normJam(b.jam_akhir),
      keterangan: b.keterangan || "",
      panggilan: b.panggilan ? 1 : 0,
    })),
  };
  if (isEdit.value) body.nomor = nomorEdit.value;
  if (otorisasiToken.value) body.otorisasi_token = otorisasiToken.value;

  try {
    const { data } = isEdit.value
      ? await api.put("/transaksi/lembur", body)
      : await api.post("/transaksi/lembur", body);
    return `${data.message} — ${data.data?.jumlah || terisi.length} karyawan`;
  } catch (e: any) {
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
    otorisasiToken.value = "";
    if (!isEdit.value) muatNomor();
  }
);

watch(
  () => values.pabrik,
  () => muatFilterOptions()
);
const liveSearch = useLiveSearch(cariNik, { enabled: () => cariOpen.value, invalidate: () => karyawanLookup.invalidate() });
</script>

<template>
  <BaseForm
    :title="isEdit ? `Ubah Lembur ${nomorEdit}` : 'Tambah Lembur (SPL)'"
    subtitle="Nomor LEM.YYYYMM.NNNN dibuat otomatis per bulan"
    icon="more_time"
    :crumbs="[{ label: 'Lembur', path: '/transaksi/lembur' }, { label: isEdit ? 'Ubah' : 'Tambah' }]"
    :save-fn="simpan"
    :reset-fn="resetState.reset"
    :reset-disabled="resetState.disabled.value"
    return-path="/transaksi/lembur"
    new-form-path="/transaksi/lembur/form" transaction-module="frmLembur"
    save-label="Simpan Lembur"
  >
    <template #form-content>
      <div v-if="memuat" class="loading">Memuat data...</div>
      <template v-else>
        <fieldset class="fs">
          <legend>Header SPL</legend>
          <div class="grid">
            <FText v-model="values.nomor" label="Nomor" disabled placeholder="Otomatis" />
            <FDate v-model="values.tanggal" label="Tanggal" required />
            <FSelect v-model="values.pabrik" label="Pabrik" required :options="pabrikOptions" />
            <FText v-model="values.jenis_kerja" label="Jenis Kerja" placeholder="Uraian pekerjaan lembur" />
            <FSelect v-model="values.departemen" label="Departemen (filter)" :options="departemenOptions" :disabled="allDep" />
            <label class="chk"><input v-model="allDep" type="checkbox" /> All Departemen</label>
            <FSelect v-model="values.jabatan" label="Jabatan (filter)" :options="jabatanOptions" :disabled="allJab" />
            <label class="chk"><input v-model="allJab" type="checkbox" /> All Jabatan</label>
            <FSelect v-model="values.bagian" label="Bagian (filter)" :options="bagianOptions.map(b => ({ label: b, value: b }))" :disabled="allBag || !values.pabrik" :placeholder="values.pabrik ? 'Pilih Bagian...' : 'Pilih Pabrik terlebih dahulu'" />
            <label class="chk"><input v-model="allBag" type="checkbox" /> All Bagian</label>
          </div>
          <div class="aksi-row">
            <button class="btn-mini" type="button" :disabled="memuatKaryawan" @click="muatKaryawanBtn">
              {{ memuatKaryawan ? "Memuat..." : "Muat Karyawan (tombol Bagian)" }}
            </button>
            <button class="btn-mini" type="button" @click="samakanJam">Samakan Jam Awal & Akhir</button>
          </div>
          <p class="note">Aturan Delphi: jam akhir SPL maksimal 30 menit setelah scan keluar absensi hari itu.</p>
        </fieldset>

        <fieldset class="fs">
          <legend>Daftar Karyawan ({{ baris.filter((b) => b.nik).length }} orang)</legend>
          <table ref="employeeGrid" class="grid-tbl employee-grid" @keydown="navigateEmployeeGrid" @focusout="blurEmployeeGrid">
            <thead>
              <tr><th style="width: 30px; text-align: center">No</th><th>NIK</th><th>Nama</th><th style="width: 100px">Jam Mulai</th><th style="width: 100px">Jam Akhir</th><th>Keterangan</th><th style="width: 70px">Panggil</th><th style="width: 60px; text-align: center">Aksi</th></tr>
            </thead>
            <tbody>
              <tr v-for="(b, i) in baris" :key="i" :data-grid-row="i">
                <td class="ctr">{{ i + 1 }}</td>
                <td data-grid-column="0">
                  <div class="nik-sel">
                    <input v-model="b.nik" placeholder="NIK" :aria-label="`NIK baris ${i + 1}`" />
                    <button class="btn-mini" type="button" @click="bukaCari(i)">...</button>
                  </div>
                </td>
                <td><span class="employee-name">{{ b.nama || '—' }}</span></td>
                <td data-grid-column="1"><FTime v-model="b.jam_mulai" label="Jam Mulai" compact :navigate-on-enter="false" placeholder="00:00:00" /></td>
                <td data-grid-column="2"><FTime v-model="b.jam_akhir" label="Jam Akhir" compact :navigate-on-enter="false" placeholder="00:00:00" /></td>
                <td data-grid-column="3"><input v-model="b.keterangan" placeholder="Keterangan" :aria-label="`Keterangan baris ${i + 1}`" /></td>
                <td class="ctr panggil-cell" data-grid-column="4" title="Space untuk centang/batalkan Panggil"><input v-model="b.panggilan" type="checkbox" :aria-label="`Panggil baris ${i + 1}; Space untuk centang atau batalkan`" /><span class="panggil-hint" aria-hidden="true">Space: centang</span></td>
                <td class="ctr"><button class="btn-mini del" type="button" @click="hapusBaris(i)">×</button></td>
              </tr>
            </tbody>
          </table>
          <div class="aksi-row">
            <button class="btn-mini" type="button" @click="tambahBaris">+ Tambah baris</button>
          </div>
          <p class="note">Panah ← / → dan Tab / Shift+Tab: kanan / kiri. Enter / Shift+Enter: bawah / atas. Enter di baris terakhir: tambah baris. F2: gerakkan kursor di dalam teks; Esc: kembali ke navigasi sel. Space: centang Panggil.</p>
        </fieldset>

        <OtorisasiKode
          v-if="perluOtorisasi"
          modul="lembur"
          :tanggal="String(values.tanggal || '')"
          @verified="otorisasiOke"
        />
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
          <input v-model="kataCari" placeholder="NIK / nama / jabatan / bagian / pabrik..." @input="liveSearch.schedule" @keyup.enter="liveSearch.run" />
          <button class="btn-mini primary" type="button" :disabled="cariLoading" @click="liveSearch.run">
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
.chk { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--ds-primary, #3b5998); padding-top: 20px; }
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
table.grid-tbl td.ctr, table.grid-tbl th.ctr { text-align: center; }
table.grid-tbl input[type="text"], table.grid-tbl input:not([type]) { width: 100%; border: 1px solid transparent; padding: 4px 6px; font-size: 11px; font-family: "Plus Jakarta Sans", sans-serif; }
table.grid-tbl input:focus { border-color: var(--ds-primary, #3b5998); outline: none; }
.employee-grid td[data-grid-column]:focus-within { outline: 2px solid var(--ds-primary, #3b5998); outline-offset: -2px; background: var(--ds-surface-inset, #edf2fb); }
.employee-name { display: block; padding: 4px 6px; cursor: default; }
.panggil-cell { position: relative; }
.panggil-hint { display: none; position: absolute; bottom: 1px; left: 0; right: 0; font-size: 9px; line-height: 11px; color: var(--ds-primary, #3b5998); pointer-events: none; }
.panggil-cell:focus-within .panggil-hint { display: block; }
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
