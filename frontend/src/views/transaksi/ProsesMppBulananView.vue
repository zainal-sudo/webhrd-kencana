<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useToast } from "vue-toastification";
import { useRoute } from "vue-router";
import MsIcon from "@/components/MsIcon.vue";
import EditableGrid from "@/components/EditableGrid.vue";
import type { GridCol } from "@/components/EditableGrid.vue";
import { useTabsStore } from "@/stores/tabsStore";
import { useAuthStore } from "@/stores/authStore";
import { safeGet, safePut, downloadFile } from "@/api";
import { api, getErrorMessage } from "@/api/axios";
import { useDraftSnapshot } from "@/composables/useUnsavedChanges";
import { useTabNavigation } from "@/composables/useTabNavigation";

/**
 * Proses MPP Bulanan — padanan `ufrmProsesMPPBulanan`.
 *
 * Kolom bertanda B. = budget (tbudgetmpp), R. = realisasi (tmppbulanan /
 * hitungan karyawan aktif status 7=Tetap, 1..6=PKWT, 8=Casual, 9=Pihak-3).
 * Muat: bila periode sudah pernah disimpan tampil datanya, bila belum
 * diproses dari budget + hitungan hari ini — persis loaddataall Delphi.
 */
const toast = useToast();
const route = useRoute();
const tabsStore = useTabsStore();
const auth = useAuthStore();

const form = String(route.meta.form || "frmprosesMPPBulanan");
const bisaSave = auth.can(form, "insert");

const pabrikList = ref<{ Kode: string; Nama: string }[]>([]);
const pabrik = ref("");
const tahun = ref(new Date().getFullYear());
const bulan = ref(new Date().getMonth());
const rows = ref<Record<string, any>[]>([]);
const sumber = ref("");
const loading = ref(false);
const menyimpan = ref(false);
const grid = ref<InstanceType<typeof EditableGrid> | null>(null);
const edited = ref(false);
const draft = useDraftSnapshot(() => rows.value, { busy: () => menyimpan.value });
const navigation = useTabNavigation();
let loadRequest = 0;
let loadedKey = "";

const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const TAHUN_OPSI = computed(() => {
  const akhir = new Date().getFullYear();
  const daftar: number[] = [];
  for (let y = akhir; y >= 2016; y--) daftar.push(y);
  return daftar;
});

const columns: GridCol[] = [
  { key: "bagian", label: "Bagian", width: "220px" },
  { key: "tetap", label: "B. Tetap", width: "80px", align: "right" },
  { key: "pkwt", label: "B. PKWT", width: "80px", align: "right" },
  { key: "casual", label: "B. Casual", width: "80px", align: "right" },
  { key: "pihak3", label: "B. Pihak 3", width: "80px", align: "right" },
  { key: "totalbudget", label: "Total Budget", width: "90px", align: "right", title: "Jumlah kolom budget" },
  { key: "tetap2", label: "R. Tetap", width: "80px", align: "right", edit: "number" },
  { key: "pkwt2", label: "R. PKWT", width: "80px", align: "right", edit: "number" },
  { key: "casual2", label: "R. Casual", width: "80px", align: "right", edit: "number" },
  { key: "pihak32", label: "R. Pihak 3", width: "80px", align: "right", edit: "number" },
  { key: "total2", label: "Total Realisasi", width: "90px", align: "right", title: "Jumlah kolom realisasi" },
  { key: "kurang", label: "Kurang", width: "80px", align: "right", title: "Total Budget − Total Realisasi" },
];

function onGridUpdate({ row }: any) {
  row.total2 =
    (Number(row.tetap2) || 0) + (Number(row.pkwt2) || 0) +
    (Number(row.casual2) || 0) + (Number(row.pihak32) || 0);
  row.kurang = (Number(row.totalbudget) || 0) - (Number(row.total2) || 0);
}

function confirmMuat() {
  if (edited.value && !window.confirm("Perubahan MPP belum disimpan. Buang perubahan?")) return false;
  edited.value = false;
  return true;
}

/** loaddataall: cek tmppbulanan, bila kosong proses dari budget. */
async function muat(mode: "otomatis" | "proses" = "otomatis") {
  const request = ++loadRequest;
  if (!pabrik.value) {
    rows.value = [];
    return;
  }
  loading.value = true;
  try {
    let hasil: { sumber: string; rows: Record<string, any>[] } | null = null;
    if (mode === "proses") {
      const r = await safeGet<{ sumber: string; rows: Record<string, any>[] }>("/transaksi/mpp/proses", {
        params: { pabrik: pabrik.value, tahun: tahun.value, periode: bulan.value + 1 },
      });
      hasil = { sumber: r.sumber, rows: r.rows || [] };
    } else {
      try {
        const r = await safeGet<{ sumber: string; rows: Record<string, any>[] }>("/transaksi/mpp/proses", {
          params: { pabrik: pabrik.value, tahun: tahun.value, periode: bulan.value + 1, sumber: "simpan" },
        });
        if ((r.rows || []).length) hasil = { sumber: "simpan", rows: r.rows };
      } catch {
        /* periode belum ada / masih error — lanjut proses dari budget */
      }
      if (!hasil) {
        hasil = await safeGet<{ sumber: string; rows: Record<string, any>[] }>("/transaksi/mpp/proses", {
          params: { pabrik: pabrik.value, tahun: tahun.value, periode: bulan.value + 1 },
        });
      }
    }
    if (request !== loadRequest) return;
    rows.value = hasil.rows;
    sumber.value = hasil.sumber;
    draft.capture();
    loadedKey = `${pabrik.value}-${tahun.value}-${bulan.value}`;
    edited.value = false;
    grid.value?.reset();
  } catch (e: any) {
    if (request === loadRequest) {
      rows.value = [];
      sumber.value = "";
      toast.warning(typeof e?.message === "string" && e.message.includes("budget")
        ? "Data budget belum ada — isi Setting Budget MPP dulu."
        : getErrorMessage(e, "Gagal memuat data"));
    }
  } finally {
    if (request === loadRequest) loading.value = false;
  }
}

function gantiFilter() {
  const kunci = `${pabrik.value}-${tahun.value}-${bulan.value}`;
  if (kunci === loadedKey) return;
  if (confirmMuat()) void muat();
}

async function prosesUlang() {
  if (!pabrik.value) return;
  if (!confirm(`Proses ulang MPP ${NAMA_BULAN[bulan.value]} ${tahun.value} dari data budget?`)) return;
  edited.value = false;
  await muat("proses");
}

async function simpan() {
  if (loading.value || menyimpan.value) return;
  if (!pabrik.value || !rows.value.length) {
    toast.error("Pilih pabrik dan bulan terlebih dahulu");
    return;
  }
  if (!confirm("Yakin ingin simpan?")) return;
  menyimpan.value = true;
  const finishDraftSave = draft.beginSave();
  try {
    const r = await safePut<{ jumlah: number }>("/transaksi/mpp/proses", {
      pabrik: pabrik.value,
      tahun: tahun.value,
      periode: bulan.value + 1,
      rows: rows.value,
    });
    finishDraftSave(true);
    toast.success(`${r.jumlah} baris tersimpan`);
    edited.value = false;
    await muat("proses");
  } catch (e) {
    finishDraftSave(false);
    toast.error(getErrorMessage(e, "Gagal menyimpan MPP"));
  } finally {
    menyimpan.value = false;
  }
}

function ekspor() {
  if (!pabrik.value) return;
  downloadFile(
    `/transaksi/mpp/proses?pabrik=${encodeURIComponent(pabrik.value)}&tahun=${tahun.value}&periode=${bulan.value + 1}&export=xlsx`,
    `proses-mpp-bulanan-${tahun.value}-${bulan.value + 1}.xlsx`
  ).catch((e) => toast.error(getErrorMessage(e, "Gagal mengekspor")));
}

function tutup() {
  const activeId = tabsStore.activeTabId;
  if (activeId) void navigation.closeTab(activeId);
}

onMounted(async () => {
  try {
    const { data } = await api.get("/master/pabrik/options");
    pabrikList.value = (data.data || []).map((p: any) => ({ Kode: p.Kode, Nama: p.Nama }));
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat daftar pabrik"));
  }
});
</script>

<template>
  <div class="panel">
    <div class="toolbar">
      <div class="tb-left">
        <span class="tool-icon"><MsIcon name="fact_check" :size="16" /></span>
        <span class="tool-title">Proses MPP Bulanan</span>
        <span class="tool-sub">Budget vs realisasi per bulan — meniru ufrmProsesMPPBulanan</span>
      </div>
      <div class="tb-right">
        <label class="fld">
          Pabrik
          <select v-model="pabrik" :disabled="menyimpan" @change="gantiFilter">
            <option value="">— pilih pabrik —</option>
            <option v-for="p in pabrikList" :key="p.Kode" :value="p.Kode">{{ p.Kode }} — {{ p.Nama }}</option>
          </select>
        </label>
        <label class="fld">
          Tahun
          <select v-model="tahun" :disabled="menyimpan" @change="gantiFilter">
            <option v-for="y in TAHUN_OPSI" :key="y" :value="y">{{ y }}</option>
          </select>
        </label>
        <label class="fld">
          Bulan
          <select v-model="bulan" :disabled="menyimpan" @change="gantiFilter">
            <option v-for="(n, i) in NAMA_BULAN" :key="n" :value="i">{{ n }}</option>
          </select>
        </label>
        <button class="btn" title="Muat data" :disabled="menyimpan" @click="confirmMuat() && muat()"><MsIcon name="refresh" :size="15" /></button>
        <button class="btn" title="Proses ulang dari budget" :disabled="menyimpan || !pabrik" @click="prosesUlang"><MsIcon name="replay" :size="15" /></button>
        <button class="btn" title="Export Excel" :disabled="!pabrik" @click="ekspor"><MsIcon name="file_download" :size="15" /></button>
        <button v-if="bisaSave" class="btn primary" :disabled="menyimpan || loading || !rows.length" @click="simpan">
          <MsIcon name="save" :size="15" />
          {{ menyimpan ? "Menyimpan..." : "Simpan" }}
        </button>
        <button class="btn" title="Tutup" @click="tutup"><MsIcon name="close" :size="15" /></button>
      </div>
    </div>

    <div class="body">
      <EditableGrid
        ref="grid"
        @update="onGridUpdate($event); edited = true"
        :columns="columns"
        :rows="rows"
        :loading="loading || menyimpan"
        primary-key="bagian"
        max-height="100%"
      />
      <p v-if="!pabrik" class="empty">Pilih pabrik untuk menampilkan data.</p>
      <p v-else-if="rows.length" class="empty">
        {{ sumber === "simpan" ? "Data tersimpan dari tmppbulanan." : "Hasil proses budget + jumlah karyawan aktif hari ini." }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.panel {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: var(--ds-surface, #f0f3f8);
}
.toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  background: var(--ds-surface-variant, #e0e4ea);
  border-bottom: 1px solid var(--ds-border, #b0b8c4);
  flex-wrap: wrap;
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
.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.body {
  padding: 12px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.body :deep(.grid-wrap) {
  flex: 1;
  min-height: 0;
}
.empty {
  text-align: center;
  color: #8995a6;
  font-size: 12px;
}
</style>
