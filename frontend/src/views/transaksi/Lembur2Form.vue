<script setup lang="ts">
import DateInput from "@/components/fields/DateInput.vue";
import { ref, reactive, onMounted, nextTick } from "vue";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
import MsIcon from "@/components/MsIcon.vue";
import KaryawanLookupTable from "@/components/KaryawanLookupTable.vue";
import { useKaryawanLookup } from "@/composables/useKaryawanLookup";
import { useLiveSearch } from "@/composables/useLiveSearch";
import FText from "@/components/fields/FText.vue";
import FTime from "@/components/fields/FTime.vue";
import FDate from "@/components/fields/FDate.vue";
import { api as sourceApi, getErrorMessage } from "@/api/axios";
import { useTransactionReset } from "@/composables/useTransactionReset";
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
const resetState = useTransactionReset({ values, info, baris }, {
  blocked: () => cariLoading.value || karyawanLookup.loading,
  afterRestore: () => {
    cariOpen.value = false;
    kataCari.value = "";
    karyawanLookup.clear();
  },
});
const api = resetState.trackApi(sourceApi);

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

const dateGrid = ref<HTMLTableElement | null>(null);
let editingGridInput: HTMLInputElement | null = null;
function blurDateGrid(event: FocusEvent) {
  if (event.target === editingGridInput) editingGridInput = null;
}
async function navigateDateGrid(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
  const input = event.target;
  if (!(input instanceof HTMLInputElement || input instanceof HTMLButtonElement) || input.disabled || input.type === "date") return;
  if (input instanceof HTMLButtonElement && (event.key === "Enter" || event.key === " ")) return;
  const cell = input.closest<HTMLElement>("[data-grid-column]");
  const row = input.closest<HTMLElement>("[data-grid-row]");
  if (!cell || !row) return;
  if (event.key === "F2" && input instanceof HTMLInputElement && input.type !== "checkbox") {
    event.preventDefault();
    editingGridInput = input;
    return;
  }
  if (event.key === "Escape" && input instanceof HTMLInputElement && editingGridInput === input) {
    event.preventDefault();
    editingGridInput = null;
    input.select();
    return;
  }
  let nextRow = Number(row.dataset.gridRow);
  let nextColumn = Number(cell.dataset.gridColumn);
  if (event.key === "Enter") {
    event.preventDefault();
    if (event.repeat) return;
    nextRow += event.shiftKey ? -1 : 1;
    if (nextRow === baris.value.length) { tambahBaris(); await nextTick(); }
  } else if (event.key === "Tab") {
    nextColumn += event.shiftKey ? -1 : 1;
    if (nextColumn < 0) { nextRow--; nextColumn = 5; }
    if (nextColumn > 5) { nextRow++; nextColumn = 0; }
    if (nextRow < 0 || nextRow >= baris.value.length) return;
    event.preventDefault();
  } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    if (event.shiftKey || editingGridInput === input) return;
    event.preventDefault();
    nextRow += event.key === "ArrowUp" ? -1 : 1;
  } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    if (event.shiftKey || editingGridInput === input) return;
    event.preventDefault();
    nextColumn += event.key === "ArrowLeft" ? -1 : 1;
  } else return;
  if (nextRow < 0 || nextRow >= baris.value.length || nextColumn < 0 || nextColumn > 5) return;
  const selector = `[data-grid-row="${nextRow}"] [data-grid-column="${nextColumn}"]`;
  const target = dateGrid.value?.querySelector<HTMLInputElement | HTMLButtonElement>(
    `${selector} input:not(:disabled):not([readonly]):not([type="date"]), ${selector} button:not(:disabled)`
  );
  target?.focus();
  if (target) {
    editingGridInput = null;
    if (target instanceof HTMLInputElement && target.type !== "checkbox") target.select();
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
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
  baris.value.forEach((b, i) => {
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
    // BaseForm owns save-and-close/new; keep any input made while awaiting the request.
    return data.message;
  } catch (e) {
    throw new Error(getErrorMessage(e));
  }
}

onMounted(async () => {
  /* form selalu mode tambah */
  await resetState.initialize();
});
const liveSearch = useLiveSearch(cariNik, { enabled: () => cariOpen.value, invalidate: () => karyawanLookup.invalidate() });
</script>

<template>
  <BaseForm
    title="Tambah Lembur Per NIK (V2)"
    subtitle="Satu karyawan untuk banyak tanggal — tiap baris menjadi SPL sendiri"
    icon="person_add"
    :crumbs="[{ label: 'Lembur', path: '/transaksi/lembur' }, { label: 'Per NIK (V2)' }]"
    :save-fn="simpan"
    :reset-fn="resetState.reset"
    :reset-disabled="resetState.disabled.value"
    return-path="/transaksi/lembur"
    new-form-path="/transaksi/lembur-v2/form" transaction-module="frmLembur2"
    save-label="Simpan Lembur"
  >
    <template #form-content>
      <fieldset class="fs">
        <legend>Karyawan</legend>
        <div class="grid">
          <div class="nik-cari">
            <FText v-model="values.nik" label="NIK" required placeholder="Ketik NIK / Cari" />
            <button class="btn-mini cari-inline employee-search-button" type="button" @click="bukaCari"><MsIcon name="search" :size="18" />Cari karyawan</button>
          </div>
          <FText :model-value="info.nama" label="Nama" disabled @update:model-value="() => {}" />
          <FText :model-value="info.pabrik" label="Pabrik" disabled @update:model-value="() => {}" />
          <FText :model-value="`${info.jab_kode} - ${info.jabatan}`" label="Jabatan" disabled @update:model-value="() => {}" />
          <FText :model-value="info.bagian" label="Bagian" disabled @update:model-value="() => {}" />
        </div>
        <p class="note">Bagian & pabrik SPL diambil dari master karyawan; jenis kerja = keterangan tiap baris.</p>
      </fieldset>

      <fieldset class="fs">
        <legend>Daftar Tanggal ({{ baris.filter((b) => b.tanggal).length }} SPL)</legend>
        <table ref="dateGrid" class="grid-tbl" @keydown="navigateDateGrid" @focusout="blurDateGrid">
          <thead>
            <tr><th style="width: 30px; text-align: center">No</th><th style="width: 130px">Tanggal</th><th style="width: 100px">Jam Mulai</th><th style="width: 100px">Jam Akhir</th><th>Keterangan (= Jenis Kerja)</th><th style="width: 70px">Panggil</th><th style="width: 50px; text-align: center">Aksi</th></tr>
          </thead>
          <tbody>
            <tr v-for="(b, i) in baris" :key="i" :data-grid-row="i">
              <td class="ctr">{{ i + 1 }}</td>
              <td data-grid-column="0"><DateInput v-model="b.tanggal" :aria-label="`Tanggal lembur baris ${i + 1}`" /></td>
              <td data-grid-column="1"><FTime v-model="b.jam_mulai" label="Jam Mulai" compact :navigate-on-enter="false" placeholder="00:00:00" /></td>
              <td data-grid-column="2"><FTime v-model="b.jam_akhir" label="Jam Akhir" compact :navigate-on-enter="false" placeholder="00:00:00" /></td>
              <td data-grid-column="3"><input v-model="b.keterangan" placeholder="Uraian pekerjaan lembur" :aria-label="`Keterangan baris ${i + 1}`" /></td>
              <td class="ctr" data-grid-column="4"><input v-model="b.panggilan" type="checkbox" :aria-label="`Panggil baris ${i + 1}`" /></td>
              <td class="ctr" data-grid-column="5"><button class="btn-mini del" type="button" title="Hapus baris (Enter / Space)" aria-label="Hapus baris" @click="hapusBaris(i)"><MsIcon name="close" :size="20" /></button></td>
            </tr>
          </tbody>
        </table>
        <div class="aksi-row">
          <button class="btn-mini" type="button" @click="tambahBaris">+ Tambah baris</button>
          <button class="btn-mini" type="button" @click="samakanJam">Samakan Jam Awal & Akhir</button>
        </div>
        <p class="note">Aturan Delphi: jam akhir maksimal 30 menit setelah scan keluar absensi hari itu.</p>
        <p class="note">Panah: pindah sel. Tab / Shift+Tab: kanan / kiri. Enter / Shift+Enter: bawah / atas. Enter di baris terakhir: tambah baris. F2: gerakkan kursor di dalam teks; Esc: kembali ke navigasi sel. Space: centang Panggil.</p>
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
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 14px; }
.nik-cari { display: flex; gap: 8px; align-items: flex-end; min-width: 0; }
.nik-cari > :first-child { flex: 1; min-width: 0; }
.cari-inline { height: 30px; flex-shrink: 0; }
.note { font-size: 12px; color: #7a5b16; margin: 8px 0 0; }
.aksi-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.btn-mini { height: 26px; padding: 0 10px; border: 1px solid var(--ds-border, #b0b8c4); border-radius: 8px; background: #fff; font-family: "Plus Jakarta Sans", sans-serif; font-size: 11px; font-weight: 700; cursor: pointer; color: var(--ds-on-surface, #1b2d4a); }
.btn-mini.primary { background: var(--ds-primary, #3b5998); border-color: var(--ds-primary-dark, #2c4472); color: #fff; }
.btn-mini.del { color: #dc2626; }
.btn-mini:disabled { opacity: 0.6; cursor: not-allowed; }
table.grid-tbl { width: 100%; border-collapse: collapse; font-size: 11px; }
table.grid-tbl th { background: var(--ds-surface-variant, #e0e4ea); border: 1px solid var(--ds-border, #b0b8c4); padding: 5px 6px; text-align: left; font-weight: 800; }
table.grid-tbl td { border: 1px solid #d5dbe3; padding: 2px; }
table.grid-tbl td.ctr { text-align: center; }
table.grid-tbl input, table.grid-tbl :deep(input[type="text"]) { width: 100%; border: 1px solid transparent; padding: 4px 28px 4px 6px; font-size: 11px; font-family: "Plus Jakarta Sans", sans-serif; }
table.grid-tbl input:focus, table.grid-tbl :deep(input:focus) { border-color: var(--ds-primary, #3b5998); outline: 2px solid var(--ds-primary, #3b5998); outline-offset: -2px; background: var(--ds-surface-inset, #edf2fb); }
table.grid-tbl input[type="checkbox"] { width: auto; padding: 0; }
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
