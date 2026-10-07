<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { useToast } from "vue-toastification";
import { useRoute } from "vue-router";
import MsIcon from "@/components/MsIcon.vue";
import EditableGrid from "@/components/EditableGrid.vue";
import type { GridCol, GridUpdate } from "@/components/EditableGrid.vue";
import { useTabsStore } from "@/stores/tabsStore";
import { useAuthStore } from "@/stores/authStore";
import { api, getErrorMessage } from "@/api/axios";
import { safeGet, downloadFile } from "@/api";
import { todaySql, firstDayOfMonth } from "@/utils/format";

/**
 * Proses Gaji — padanan `ufrmProsesGaji`.
 *
 *   Refresh  -> reload grid dari `tgajibulanan` (loaddataall Delphi)
 *   Proses   -> getminggu + InsertNilai ulang untuk periode & tanggal terpilih
 *   Simpan   -> simpandata: 9 kolom yang bisa diedit disalin ke `tgajibulanan`
 *   Load Potongan -> baca berkas Excel lalu timpa kolom potongan/skill/koperasi/bpjs
 *
 * Total = hasil SQL bulat rupiah; saat sel potongan/bonus diedit, Total
 * disesuaikan langsung (tanpa pembulatan) seperti Delphi.
 */
const toast = useToast();
const route = useRoute();
const tabsStore = useTabsStore();
const auth = useAuthStore();

const form = String(route.meta.form || "frmProsesGaji");
const bisaInsert = auth.can(form, "insert");

const sekarang = new Date();
const bulan = ref(sekarang.getMonth() + 1);
const tahun = ref(sekarang.getFullYear());
const start = ref(firstDayOfMonth());
const end = ref(todaySql());

const rows = ref<Record<string, any>[]>([]);
const loading = ref(false);
const memproses = ref(false);
const menyimpan = ref(false);
const memuatPotongan = ref(false);
const filePotongan = ref<File | null>(null);
const grid = ref<InstanceType<typeof EditableGrid> | null>(null);

/** Filter hasil (client-side; Simpan/Export tetap memakai seluruh baris). */
const cari = ref("");
const pabrik = ref("");
const daftarPabrik = computed(() =>
  [...new Set(rows.value.map((r) => String(r.pabrik ?? "")))].filter(Boolean).sort()
);
const tampilRows = computed(() => {
  const q = cari.value.trim().toLowerCase();
  return rows.value.filter((r) => {
    if (pabrik.value && String(r.pabrik ?? "") !== pabrik.value) return false;
    if (!q) return true;
    return (
      String(r.nik ?? "").toLowerCase().includes(q) ||
      String(r.nama ?? "").toLowerCase().includes(q)
    );
  });
});

/** Kolom grid = urutan Delphi (BPJSTK tidak berkolom). */
const columns: GridCol[] = [
  { key: "nik", label: "NIK", width: "96px" },
  { key: "nama", label: "Nama", width: "180px" },
  { key: "bagian", label: "Bagian", width: "130px" },
  { key: "pabrik", label: "Pabrik", width: "60px" },
  { key: "gapok", label: "Gapok", width: "110px", money: true },
  { key: "harimasuk", label: "Hari Masuk", width: "90px", align: "right" },
  { key: "premi", label: "Premi", width: "100px", money: true },
  { key: "haripremi", label: "Hari Premi", width: "90px", align: "right" },
  { key: "makan", label: "Makan", width: "100px", money: true },
  { key: "harimakan", label: "Hari Makan", width: "90px", align: "right" },
  { key: "tjabatan", label: "Tj. Jab.", width: "100px", money: true },
  { key: "tmasakerja", label: "Tj. Masa Kerja", width: "100px", money: true },
  { key: "tlain", label: "Tj. Lain", width: "100px", money: true },
  { key: "harilembur2", label: "Jam Lbr 2", width: "90px", align: "right" },
  { key: "tlembur2", label: "Tj. Lbr 2", width: "100px", money: true },
  { key: "harilembur", label: "Jam Lbr", width: "90px", align: "right" },
  { key: "tlembur", label: "Tj. Lembur", width: "100px", money: true },
  { key: "harilemburp", label: "Jam Pgl", width: "90px", align: "right" },
  { key: "tlemburp", label: "Tj. Pgl", width: "100px", money: true },
  { key: "bonuslibur", label: "Bonus Libur", width: "100px", edit: "number", money: true },
  { key: "bonusmlibur", label: "Bonus Mlm Libur", width: "110px", money: true },
  { key: "bpjs", label: "BPJS", width: "100px", edit: "number", money: true },
  { key: "koperasi", label: "Koperasi", width: "100px", edit: "number", money: true },
  { key: "potongan", label: "Potongan", width: "100px", edit: "number", money: true },
  { key: "skill", label: "SP", width: "100px", edit: "number", money: true },
  { key: "total", label: "Total", width: "120px", money: true },
  { key: "rekening", label: "Rekening", width: "120px" },
  { key: "sthari", label: "Setengah Hari", width: "90px", edit: "number", align: "right" },
  { key: "sakit", label: "Sakit", width: "70px", edit: "number", align: "right" },
  { key: "ijin", label: "Ijin", width: "70px", edit: "number", align: "right" },
  { key: "alpha", label: "Alpha", width: "70px", edit: "number", align: "right" },
];

/** Kolom potongan: total berkurang bila nilainya naik. */
const KOLOM_POTONGAN = new Set(["bpjs", "koperasi", "potongan", "skill", "sthari", "sakit", "ijin", "alpha"]);

const periodeBoleh = () => {
  if (!start.value || !end.value || end.value < start.value) return "Periode tanggal tidak valid";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start.value) || !/^\d{4}-\d{2}-\d{2}$/.test(end.value))
    return "Format tanggal harus YYYY-MM-DD";
  if (!Number.isInteger(bulan.value) || bulan.value < 1 || bulan.value > 12) return "Bulan harus 1-12";
  if (!Number.isInteger(tahun.value) || tahun.value < 2000 || tahun.value > 2100) return "Tahun tidak valid";
  return null;
};

async function muat() {
  const salah = periodeBoleh();
  if (salah) {
    toast.error(salah);
    return;
  }
  loading.value = true;
  try {
    rows.value = await safeGet<Record<string, any>[]>("/gaji/proses", {
      params: { periode: bulan.value, tahun: tahun.value, start: start.value, end: end.value },
    });
    grid.value?.reset();
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat data"));
  } finally {
    loading.value = false;
  }
}

/** Proses == RefreshClick Delphi (getminggu + InsertNilai). */
async function proses() {
  const salah = periodeBoleh();
  if (salah) return toast.error(salah);
  if (!confirm(`Proses gaji ${start.value} s/d ${end.value}?\nData periode ${bulan.value}/${tahun.value} akan diganti.`)) return;
  memproses.value = true;
  try {
    const { data } = await api.post<{ message: string; data: { jumlah: number } }>("/gaji/proses/process", {
      periode: bulan.value,
      tahun: tahun.value,
      start: start.value,
      end: end.value,
    });
    toast.success(data.message || `${data.data?.jumlah ?? 0} karyawan diproses`);
    await muat();
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memproses gaji"));
  } finally {
    memproses.value = false;
  }
}

/** Penyesuaian Total mengikuti Delphi (tidak ada pembulatan). */
function onUpdate({ row, col, oldValue, newValue }: GridUpdate) {
  const o = Number(oldValue) || 0;
  const n = Number(newValue) || 0;
  if (col.key === "bonuslibur") row.total += n - o;
  else if (KOLOM_POTONGAN.has(col.key)) row.total += o - n;
}

async function simpan() {
  if (!rows.value.length) return toast.error("Tidak ada data untuk disimpan");
  const salah = periodeBoleh();
  if (salah) return toast.error(salah);
  if (!confirm("Yakin ingin menyimpan perubahan (simpandata)?")) return;
  menyimpan.value = true;
  try {
    const payload = rows.value.map((r) => ({
      nik: r.nik,
      bpjs: r.bpjs,
      koperasi: r.koperasi,
      potongan: r.potongan,
      skill: r.skill,
      bonuslibur: r.bonuslibur,
      sthari: r.sthari,
      sakit: r.sakit,
      ijin: r.ijin,
      alpha: r.alpha,
    }));
    const { data } = await api.put<{ message: string; data: { jumlah: number } }>("/gaji/proses", {
      periode: bulan.value,
      tahun: tahun.value,
      start: start.value,
      end: end.value,
      rows: payload,
    });
    toast.success(data.message || `${data.data?.jumlah ?? 0} baris disimpan`);
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal menyimpan"));
  } finally {
    menyimpan.value = false;
  }
}

function pilihPotongan(ev: Event) {
  const el = ev.target as HTMLInputElement;
  filePotongan.value = el.files?.[0] ?? null;
}

async function muatPotongan() {
  if (!filePotongan.value) return toast.error("Pilih berkas Excel terlebih dahulu");
  memuatPotongan.value = true;
  try {
    const fd = new FormData();
    fd.append("file", filePotongan.value);
    const { data } = await api.post("/gaji/proses/load-potongan", fd);
    const items: { nik: string; potongan: number; skill: number; koperasi: number; bpjs: number }[] =
      data.data?.rows ?? [];
    const byNik = new Map(rows.value.map((r) => [r.nik, r]));
    let dipakai = 0;
    for (const it of items) {
      const r = byNik.get(it.nik);
      if (!r || r.nik === "") continue;
      for (const k of ["potongan", "skill", "koperasi", "bpjs"] as const) {
        const o = Number(r[k]) || 0;
        r[k] = it[k] ?? 0;
        r.total += o - (Number(it[k]) || 0);
      }
      dipakai += 1;
    }
    toast.success(`${items.length} baris dibaca berhasil, ${dipakai} diterapkan`);
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal membaca berkas potongan"));
  } finally {
    memuatPotongan.value = false;
  }
}

function ekspor() {
  const salah = periodeBoleh();
  if (salah) return toast.error(salah);
  downloadFile(
    `/gaji/proses?periode=${bulan.value}&tahun=${tahun.value}&start=${start.value}&end=${end.value}&export=xlsx`,
    "proses-gaji.xlsx"
  ).catch((e) => toast.error(getErrorMessage(e, "Gagal mengekspor")));
}

function tutup() {
  const activeId = tabsStore.activeTabId;
  if (activeId) tabsStore.closeTab(activeId);
}

onMounted(() => {
  muat();
});
</script>

<template>
  <div class="panel">
    <div class="toolbar">
      <div class="tb-left">
        <span class="tool-icon"><MsIcon name="payments" :size="16" /></span>
        <span class="tool-title">Proses Gaji</span>
        <span class="tool-sub">Hitung gaji bulanan — meniru ufrmProsesGaji</span>
      </div>
      <div class="tb-right">
        <label class="fld">Bulan
          <select v-model.number="bulan">
            <option v-for="b in 12" :key="b" :value="b">{{ b }}</option>
          </select>
        </label>
        <label class="fld">Tahun
          <input v-model.number="tahun" type="number" min="2000" max="2100" style="width: 72px" />
        </label>
        <label class="fld">Dari
          <input v-model="start" type="date" />
        </label>
        <label class="fld">Sampai
          <input v-model="end" type="date" />
        </label>
      </div>
    </div>

    <div class="toolbar sub">
      <label class="fld">Cari
        <input v-model="cari" class="cari" type="text" placeholder="NIK / nama..." />
      </label>
      <label class="fld">Pabrik
        <select v-model="pabrik">
          <option value="">Semua</option>
          <option v-for="p in daftarPabrik" :key="p" :value="p">{{ p }}</option>
        </select>
      </label>
      <span class="count">{{ tampilRows.length }} dari {{ rows.length }} baris</span>
      <button class="btn ghost" title="Muat ulang grid" @click="muat">
        <MsIcon name="refresh" :size="15" /> Refresh
      </button>
      <button v-if="bisaInsert" class="btn primary" :disabled="memproses" @click="proses">
        <MsIcon name="bolt" :size="15" />
        {{ memproses ? "Memproses..." : "Proses" }}
      </button>
      <button v-if="bisaInsert" class="btn" :disabled="memuatPotongan" @click="muatPotongan">
        <MsIcon name="table_view" :size="15" />
        {{ memuatPotongan ? "..." : "Load Potongan" }}
      </button>
      <input
        v-if="bisaInsert"
        type="file"
        accept=".xlsx,.xls"
        style="display: none"
        id="file-potongan"
        @change="pilihPotongan"
      />
      <label v-if="bisaInsert" for="file-potongan" class="btn ghost" :title="filePotongan?.name || 'Pilih berkas Excel potongan'">
        <MsIcon name="attach_file" :size="15" />
        {{ filePotongan ? filePotongan.name : "Pilih Berkas" }}
      </label>
      <button v-if="bisaInsert" class="btn" :disabled="menyimpan || !rows.length" @click="simpan">
        <MsIcon name="save" :size="15" />
        {{ menyimpan ? "Menyimpan..." : "Simpan" }}
      </button>
      <button class="btn" @click="ekspor">
        <MsIcon name="file_download" :size="15" /> Export
      </button>
      <button class="btn" title="Tutup" @click="tutup"><MsIcon name="close" :size="15" /></button>
    </div>

    <div class="body">
      <EditableGrid
        ref="grid"
        :columns="columns"
        :rows="tampilRows"
        :loading="loading"
        primary-key="nik"
        max-height="66vh"
        sortable
        show-total
        @update="onUpdate"
      />
      <p v-if="!loading && !rows.length" class="empty">
        Belum ada data. Tekan <b>Proses</b> untuk menghitung gaji periode ini.
      </p>
    </div>
  </div>
</template>

<style scoped>
.panel {
  border: 1px solid var(--ds-border, #b0b8c4);
  background: var(--ds-surface, #f0f3f8);
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  background: var(--ds-surface-variant, #e0e4ea);
  border-bottom: 1px solid var(--ds-border, #b0b8c4);
  flex-wrap: wrap;
}
.toolbar.sub {
  background: #edf0f5;
}
.tb-left,
.tb-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.tool-icon {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ds-primary, #3b5998);
  color: #fff;
}
.tool-title {
  font-size: 13px;
  font-weight: 800;
  color: var(--ds-on-surface, #1b2d4a);
}
.tool-sub {
  font-size: 11px;
  color: #6b7a90;
  border-left: 1px solid #b0b8c4;
  padding-left: 8px;
}
.fld {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 700;
  color: #55637a;
  text-transform: uppercase;
}
.fld select,
.fld input {
  border: 1px solid #c3cad4;
  padding: 4px 7px;
  font-size: 11.5px;
  font-family: "Plus Jakarta Sans", sans-serif;
  background: #fff;
  color: var(--ds-on-surface, #1b2d4a);
}
.fld .cari {
  width: 150px;
}
.count {
  font-size: 11px;
  font-weight: 700;
  color: #55637a;
}
.btn {
  height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  cursor: pointer;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--ds-on-surface, #1b2d4a);
}
.btn.primary {
  background: var(--ds-primary, #3b5998);
  border-color: var(--ds-primary-dark, #2c4472);
  color: #fff;
}
.btn.ghost {
  border-style: dashed;
}
.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.body {
  padding: 12px;
}
.empty {
  text-align: center;
  color: #8995a6;
  font-size: 12px;
}
</style>