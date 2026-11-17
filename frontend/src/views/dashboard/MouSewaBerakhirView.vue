<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { pickError, safeGet } from "@/api";
import { api, getErrorMessage } from "@/api/axios";
import { useToast } from "vue-toastification";
import MsIcon from "@/components/MsIcon.vue";
import PeriodeMouDialog, { type PeriodeSumber } from "@/components/PeriodeMouDialog.vue";

/**
 * Halaman "MoU Sewa Berakhir" — dibuka tombol Eksekusi pada card Dashboard
 * "MoU Sewa". Menampilkan MoU yang akan habis ≤2 bulan ke depan maupun yang
 * sudah lewat (sumber tunggal /dashboard/mou-sewa-berakhir, rule sama dengan
 * card). Baris yang sudah dieksekusi / ditandai selesai tidak lagi muncul.
 *
 * Klik Eksekusi → dialog PILIH AKSI:
 *  - "Buat Periode MoU Baru": tempat & alamat TERKUNCI (disalin dari baris
 *    sumber), no surat bisa dipilih SAMA (baris dobel dgn no surat sama)
 *    atau BARU (diketik manual), tanggal diubah lewat tombol "Ubah Tanggal";
 *    baris lama tetap tersimpan sebagai riwayat periode.
 *  - "Sudah Ditangani": tandai MoU selesai TANPA membuat periode baru —
 *    hilang dari card Dashboard.
 */

interface MouRow {
  Id: number | string;
  No_Surat: string;
  Tempat: string;
  Alamat: string | null;
  Awal_Mulai: string | null;
  Tgl_Berakhir: string;
  /** Positif = sisa hari sebelum habis; negatif = sudah lewat segini hari. */
  Sisa_Hari: number;
}

const rows = ref<MouRow[]>([]);
const loading = ref(false);
const gagal = ref("");
const cari = ref("");

const filtered = computed(() => {
  const q = cari.value.trim().toLowerCase();
  if (!q) return rows.value;
  return rows.value.filter((r) =>
    `${r.No_Surat} ${r.Tempat} ${r.Alamat || ""} ${r.Tgl_Berakhir}`.toLowerCase().includes(q)
  );
});

function formatTanggalTampil(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d || "");
}

function labelSisaHari(h: number): string {
  return h >= 0 ? `habis dalam ${h} hari` : `lewat ${-h} hari`;
}

/* ── Eksekusi: dialog pilih aksi → dialog periode baru (PeriodeMouDialog) ─ */
const sumber = ref<MouRow | null>(null);
/** true = dialog pilih aksi (periode baru / sudah ditangani) terbuka. */
const pilihAksi = ref(false);
const menandai = ref(false);

function bukaEksekusi(row: MouRow) {
  sumber.value = row;
  pilihAksi.value = true;
}

/** Dari dialog pilih aksi: mulai isi periode baru. Dialog periode baru
 *  (PeriodeMouDialog) tampil begitu pilihAksi false — isian & resetnya
 *  ditangani komponen itu sendiri. */
function mulaiPeriodeBaru() {
  pilihAksi.value = false;
}

/** Dari dialog pilih aksi: tandai sudah ditangani tanpa periode baru. */
async function tandaiSelesai() {
  if (!sumber.value || menandai.value) return;
  menandai.value = true;
  try {
    await api.post(`/master/mou-sewa/${encodeURIComponent(String(sumber.value.Id))}/tandai-ditangani`, { selesai: true });
    toast.success(`${sumber.value.No_Surat || sumber.value.Tempat} ditandai sudah ditangani — hilang dari card Dashboard.`);
    sumber.value = null;
    pilihAksi.value = false;
    await load();
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal menandai MoU sebagai ditangani."));
  } finally {
    menandai.value = false;
  }
}

/** Baris sumber untuk PeriodeMouDialog (hanya saat dialog periode baru
 *  terbuka, bukan saat dialog pilih aksi masih tampil). */
const periodeSumber = computed<PeriodeSumber | null>(() => {
  if (!sumber.value || pilihAksi.value) return null;
  const s = sumber.value;
  return {
    id: s.Id,
    noSurat: s.No_Surat,
    tempat: s.Tempat,
    alamat: s.Alamat,
    awal: s.Awal_Mulai,
    berakhir: s.Tgl_Berakhir,
    sisaHari: s.Sisa_Hari,
  };
});

/** Periode baru tersimpan (dari PeriodeMouDialog): tutup & muat ulang daftar. */
async function onPeriodeTersimpan() {
  sumber.value = null;
  await load();
}

async function load() {
  loading.value = true;
  gagal.value = "";
  try {
    const data = await safeGet<MouRow[]>("/dashboard/mou-sewa-berakhir");
    rows.value = Array.isArray(data) ? data : [];
  } catch (e) {
    gagal.value = pickError(e);
    toast.error(gagal.value);
  } finally {
    loading.value = false;
  }
}

const toast = useToast();
onMounted(load);
</script>

<template>
  <div class="page mou-berakhir-page">
    <div class="page-head">
      <div>
        <h2 class="module-title"><MsIcon name="handshake" :size="18" /> MoU Sewa Berakhir</h2>
        <p class="module-sub">
          MoU yang akan habis &le;2 bulan ke depan maupun yang sudah lewat &middot;
          tombol <b>Eksekusi</b>: buat periode baru ATAU tandai sudah ditangani &mdash;
          keduanya membuat baris hilang dari card; riwayat tetap tersimpan di Master MoU Sewa.
        </p>
      </div>
      <button type="button" class="refresh-btn" :disabled="loading" @click="load">
        <MsIcon name="refresh" :size="15" /> Muat Ulang
      </button>
    </div>

    <div class="summary-info" aria-live="polite">
      <span>Total MoU pada rentang ini (belum ditangani): {{ loading ? "—" : rows.length }}</span>
    </div>

    <div class="list-card">
      <div class="card-tool">
        <form class="search-field" role="search" @submit.prevent>
          <input
            v-model="cari"
            type="search"
            class="cari-input"
            aria-label="Cari MoU berdasarkan no surat, tempat, atau alamat"
            placeholder="Cari no surat, tempat, atau alamat..."
          />
          <button type="submit" class="search-button" aria-label="Cari MoU" title="Cari">
            <MsIcon name="search" :size="16" />
          </button>
        </form>
      </div>

      <div v-if="loading" class="keadaan"><MsIcon name="hourglass_top" :size="16" /> Memuat daftar...</div>
      <div v-else-if="gagal" class="keadaan err"><MsIcon name="error" :size="16" /> {{ gagal }}</div>

      <div v-else class="tbl-wrap">
        <table class="tbl">
          <thead>
            <tr>
              <th scope="col" class="num">No</th>
              <th scope="col">No Surat</th>
              <th scope="col">Tempat</th>
              <th scope="col">Alamat</th>
              <th scope="col" class="col-tgl">Awal Mulai</th>
              <th scope="col" class="col-tgl">Berakhir</th>
              <th scope="col" class="col-lama">Sisa / Lewat</th>
              <th scope="col" class="col-aksi">Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="filtered.length === 0">
              <td colspan="8" class="empty-cell">
                {{ cari ? "Tidak ada MoU yang cocok dengan pencarian." : "Tidak ada MoU yang belum ditangani pada rentang ini." }}
              </td>
            </tr>
            <tr v-for="(r, i) in filtered" :key="r.Id">
              <td class="num">{{ i + 1 }}</td>
              <td class="no-surat">{{ r.No_Surat || "-" }}</td>
              <td class="cell-primary">{{ r.Tempat || "-" }}</td>
              <td class="alamat">{{ r.Alamat || "-" }}</td>
              <td class="col-tgl">{{ r.Awal_Mulai ? formatTanggalTampil(r.Awal_Mulai) : "-" }}</td>
              <td class="col-tgl">{{ formatTanggalTampil(r.Tgl_Berakhir) }}</td>
              <td class="col-lama">
                <span class="badge-lama" :class="r.Sisa_Hari >= 0 ? 'masih' : 'lewat'">{{ labelSisaHari(r.Sisa_Hari) }}</span>
              </td>
              <td class="col-aksi">
                <button
                  type="button"
                  class="eksekusi-btn"
                  :title="`Buat periode baru atau tandai sudah ditangani untuk ${r.Tempat}`"
                  @click="bukaEksekusi(r)"
                >
                  <MsIcon name="autorenew" :size="14" />
                  <span>Eksekusi</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Langkah 1: dialog PILIH AKSI setelah klik Eksekusi -->
    <v-dialog :model-value="pilihAksi && !!sumber" max-width="470" persistent>
      <v-card v-if="sumber">
        <v-card-title class="text-body-1 font-weight-bold">Eksekusi — {{ sumber.No_Surat || sumber.Tempat }}</v-card-title>
        <v-card-text>
          <div class="aksi-sumber">
            <div><span>Tempat:</span> {{ sumber.Tempat }}</div>
            <div><span>Berakhir:</span> {{ formatTanggalTampil(sumber.Tgl_Berakhir) }} ({{ labelSisaHari(sumber.Sisa_Hari) }})</div>
          </div>
          <p class="aksi-pertanyaan">Pilih tindak lanjutnya:</p>
          <div class="aksi-pilihan">
            <button type="button" class="aksi-opt utama" :disabled="menandai" @click="mulaiPeriodeBaru">
              <MsIcon name="autorenew" :size="18" />
              <span class="aksi-teks">
                <b>Buat Periode MoU Baru</b>
                <small>Buat baris baru untuk tempat ini (no surat sama atau baru); baris lama jadi riwayat periode</small>
              </span>
            </button>
            <button type="button" class="aksi-opt selesai" :disabled="menandai" @click="tandaiSelesai">
              <MsIcon name="task_alt" :size="18" />
              <span class="aksi-teks">
                <b>Sudah Ditangani / Clear</b>
                <small>Tandai MoU ini selesai tanpa membuat periode baru — hilang dari card Dashboard</small>
              </span>
            </button>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn :disabled="menandai" variant="text" @click="pilihAksi = false">Batal</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Langkah 2 (opsi "Buat Periode MoU Baru"): dialog periode baru —
         formnya kini di komponen bersama PeriodeMouDialog (dipakai juga
         tombol Tambah Periode di Master MoU Sewa). -->
    <PeriodeMouDialog :sumber="periodeSumber" @close="sumber = null" @saved="onPeriodeTersimpan" />
  </div>
</template>

<style scoped>
.mou-berakhir-page {
  --mou-border: #e6eaf2;
  --mou-row-alt: #f8fafc;
  --mou-row-hover: #f0f4fa;
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
  padding: 8px 6px 0;
}
:global(:root[data-theme="dark"] .mou-berakhir-page) {
  --mou-border: var(--ds-border-light);
  --mou-row-alt: var(--ds-row-alt);
  --mou-row-hover: var(--ds-row-hover);
}
.page-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.page-head > div { min-width: 0; }
.module-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 15px;
  font-weight: 800;
  color: #12224e;
  margin: 0 0 2px;
}
.module-sub {
  margin: 0;
  font-size: 10px;
  line-height: 1.5;
  color: var(--ds-text-secondary, #64748b);
}
.refresh-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid #dbe2ee;
  border-radius: 8px;
  background: #fff;
  color: #1b2d4a;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}
.refresh-btn:hover { background: #f3f6fb; }
.refresh-btn:disabled { opacity: 0.55; cursor: default; }
.summary-info {
  flex-shrink: 0;
  margin-bottom: 8px;
  font-size: 10px;
  color: var(--ds-text-secondary, #5a6a7e);
}
.list-card {
  flex: 1 0 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--ds-surface-raised, #fff);
  border: 1px solid var(--mou-border);
  border-radius: 10px;
  padding: 12px 14px;
  box-shadow: 0 1px 3px rgba(18, 34, 78, 0.05);
}
.card-tool {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding-bottom: 10px;
}
.cari-input {
  width: 100%;
  padding: 6px 38px 6px 10px;
  border: 1px solid #dbe2ee;
  border-radius: 7px;
  font-size: 11.5px;
  color: #1b2d4a;
}
.cari-input:focus { outline: none; border-color: #3b5998; }
.search-field { position: relative; width: 320px; max-width: 100%; }
.search-button {
  position: absolute;
  right: 3px;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 26px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--ds-text-secondary, #5a6a7e);
  cursor: pointer;
}
.search-button:hover { background: var(--ds-primary-50, #e8edf5); color: var(--ds-primary, #3b5998); }
.tbl-wrap {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: visible;
  border: 1px solid var(--mou-border);
  border-radius: 8px;
  scrollbar-gutter: stable;
}
.tbl {
  width: 100%;
  min-width: 760px;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 12px;
  table-layout: fixed;
}
.tbl th {
  position: sticky;
  top: 0;
  z-index: 2;
  height: 38px;
  padding: 9px 14px;
  background: #3b5998;
  color: #fff;
  font-weight: 700;
  text-align: left;
  white-space: nowrap;
}
.tbl th.num { width: 48px; }
.tbl th.col-tgl { width: 100px; }
.tbl th.col-lama { width: 132px; }
.tbl th.col-aksi { width: 110px; }
.tbl td {
  height: 48px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--mou-border);
  color: var(--ds-text, #1b2d4a);
  vertical-align: middle;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.tbl tbody tr:last-child td { border-bottom: 0; }
.tbl .num,
.tbl .col-tgl,
.tbl .col-lama,
.tbl .col-aksi { text-align: center; }
.tbl td.num { color: var(--ds-text-secondary, #5a6a7e); font-variant-numeric: tabular-nums; }
.tbl tbody tr:nth-child(even) { background: var(--mou-row-alt); }
.tbl tbody tr:hover { background: var(--mou-row-hover); }
td.empty-cell { padding: 24px 12px; text-align: center; color: var(--ds-text-secondary, #5a6a7e); }
.cell-primary { font-weight: 600; }
.no-surat { font-weight: 600; }
.alamat { color: var(--ds-text-secondary, #5a6a7e); font-size: 11px; }
.badge-lama {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
  white-space: nowrap;
}
.badge-lama.lewat { background: var(--pkwt-warning-bg, #fef2f2); color: #b91c1c; border: 1px solid #f5b5b5; }
.badge-lama.masih { background: #fff8e6; color: #b45309; border: 1px solid #f2d38b; }
.eksekusi-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 72px;
  min-height: 30px;
  padding: 2px 9px;
  border: 1px solid #88cda8;
  border-radius: 999px;
  background: #f2fbf6;
  color: #148a4b;
  font-size: 10.5px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.eksekusi-btn:hover { background: #15803d; border-color: #15803d; color: #fff; }
.keadaan {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 2px 10px;
  font-size: 11.5px;
  color: #059669;
}
.keadaan.err { color: #b91c1c; }

/* Dialog pilih aksi (periode baru / sudah ditangani); CSS isian dialog
   "Periode MoU Baru" ada di komponen PeriodeMouDialog. */
.aksi-sumber {
  display: grid;
  gap: 3px;
  padding: 8px 10px;
  margin-bottom: 10px;
  border: 1px solid var(--ds-border, #dbe2ee);
  border-radius: 12px;
  background: var(--ds-primary-50, #f3f6fb);
  font-size: 11.5px;
}
.aksi-sumber span { color: var(--ds-text-secondary, #5a6a7e); font-weight: 600; }
.aksi-pertanyaan { margin: 2px 0 8px; font-size: 11.5px; color: var(--ds-text-secondary, #5a6a7e); }
.aksi-pilihan { display: flex; flex-direction: column; gap: 10px; }
/* Kartu pilihan aksi: sudut membulat; saat hover terangkat + berbayang +
   panah "›" muncul di kanan supaya jelas kartu ini bisa diklik. */
.aksi-opt {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 36px 12px 14px;
  border: 1.5px solid var(--ds-border, #dbe2ee);
  border-radius: 16px;
  background: var(--ds-surface, #fff);
  color: var(--ds-on-surface, #12324f);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, transform 0.15s, box-shadow 0.15s;
}
.aksi-opt::after {
  content: "›";
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%) translateX(-4px);
  font-size: 18px;
  font-weight: 700;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.15s, transform 0.15s;
  pointer-events: none;
}
.aksi-opt:hover,
.aksi-opt:focus-visible {
  outline: none;
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgb(12 32 60 / 12%);
}
.aksi-opt:hover::after,
.aksi-opt:focus-visible::after { opacity: 1; transform: translateY(-50%) translateX(0); }
.aksi-opt:active:not(:disabled) { transform: translateY(0); box-shadow: 0 2px 6px rgb(12 32 60 / 10%); }
.aksi-opt:hover { border-color: var(--ds-primary, #3b5998); background: var(--ds-primary-50, #f3f6fb); }
.aksi-opt:hover::after { color: var(--ds-primary, #3b5998); }
.aksi-opt .aksi-teks { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.aksi-opt .aksi-teks b { font-size: 12px; }
.aksi-opt .aksi-teks small { font-size: 10.5px; line-height: 1.45; color: var(--ds-text-secondary, #5a6a7e); }
.aksi-opt.utama { border-color: #88cda8; background: #f2fbf6; }
.aksi-opt.utama:hover,
.aksi-opt.utama:focus-visible { border-color: #15803d; background: #e6f7ee; }
.aksi-opt.utama:hover::after { color: #15803d; }
.aksi-opt.utama > .ms-icon, .aksi-opt.utama svg { color: #148a4b; }
.aksi-opt.selesai { border-color: #c9d6ea; }
.aksi-opt.selesai:hover,
.aksi-opt.selesai:focus-visible { border-color: #2d5fa0; background: var(--ds-primary-50, #f3f6fb); }
.aksi-opt.selesai:hover::after { color: #2d5fa0; }
.aksi-opt:disabled { opacity: 0.6; cursor: default; transform: none; box-shadow: none; }

@media (max-width: 640px) {
  .tbl th.col-tgl, .tbl th.col-lama { width: 88px; }
}
</style>
