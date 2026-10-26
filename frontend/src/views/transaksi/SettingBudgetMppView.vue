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
 * Setting Budget MPP — padanan `ufrmSettingBudgetMPP`.
 *
 * Budget per bagian per pabrik per tahun (`tbudgetmpp`). Bila budget belum
 * di-set, tampil jumlah karyawan aktif (Tetap=7, PKWT=1..6, Casual=8,
 * Pihak-3=9) sebagai titik awal — persis fallback `loaddataall` Delphi.
 */
const toast = useToast();
const route = useRoute();
const tabsStore = useTabsStore();
const auth = useAuthStore();

const form = String(route.meta.form || "frmSettingBudgetMPP");
const bisaSave = auth.can(form, "insert");

const pabrikList = ref<{ Kode: string; Nama: string }[]>([]);
const pabrik = ref("");
const tahun = ref(new Date().getFullYear());
const rows = ref<Record<string, any>[]>([]);
const loading = ref(false);
const menyimpan = ref(false);
const grid = ref<InstanceType<typeof EditableGrid> | null>(null);
const edited = ref(false);
const catatan = ref("");
const draft = useDraftSnapshot(() => rows.value, { busy: () => menyimpan.value });
const navigation = useTabNavigation();
let loadRequest = 0;
let loadedKey = "";

const TAHUN_OPSI = computed(() => {
  const akhir = new Date().getFullYear();
  const daftar: number[] = [];
  for (let y = akhir; y >= 2016; y--) daftar.push(y);
  return daftar;
});

const columns: GridCol[] = [
  { key: "bagian", label: "Bagian", width: "260px" },
  { key: "tetap", label: "Tetap", width: "90px", align: "right", edit: "number" },
  { key: "pkwt", label: "PKWT", width: "90px", align: "right", edit: "number" },
  { key: "casual", label: "Casual", width: "90px", align: "right", edit: "number" },
  { key: "pihak3", label: "Pihak Ke-3", width: "100px", align: "right", edit: "number" },
  { key: "total", label: "Total", width: "90px", align: "right", title: "Tetap + PKWT + Casual + Pihak Ke-3" },
];

function onGridUpdate({ row }: any) {
  row.total =
    (Number(row.tetap) || 0) + (Number(row.pkwt) || 0) +
    (Number(row.casual) || 0) + (Number(row.pihak3) || 0);
}

function confirmMuat() {
  if (edited.value && !window.confirm("Perubahan budget belum disimpan. Buang perubahan?")) return false;
  edited.value = false;
  return true;
}

async function muat() {
  const request = ++loadRequest;
  if (!pabrik.value) {
    rows.value = [];
    return;
  }
  loading.value = true;
  try {
    const r = await safeGet<{ sumber: string; rows: Record<string, any>[] }>("/transaksi/mpp/budget", {
      params: { pabrik: pabrik.value, tahun: tahun.value },
    });
    if (request !== loadRequest) return;
    rows.value = r.rows || [];
    catatan.value =
      r.sumber === "aktual"
        ? "Budget belum di-set — menampilkan jumlah karyawan aktif saat ini."
        : "Budget tersimpan untuk tahun ini.";
    draft.capture();
    loadedKey = `${pabrik.value}-${tahun.value}`;
    edited.value = false;
    grid.value?.reset();
  } catch (e) {
    if (request === loadRequest) toast.error(getErrorMessage(e, "Gagal memuat data"));
  } finally {
    if (request === loadRequest) loading.value = false;
  }
}

function gantiFilter() {
  const kunci = `${pabrik.value}-${tahun.value}`;
  if (kunci === loadedKey) return;
  if (confirmMuat()) void muat();
}

async function simpan() {
  if (loading.value || menyimpan.value) return;
  if (!pabrik.value || !rows.value.length) {
    toast.error("Pilih pabrik terlebih dahulu");
    return;
  }
  if (!confirm("Yakin ingin menyimpan budget MPP?")) return;
  menyimpan.value = true;
  const finishDraftSave = draft.beginSave();
  try {
    const r = await safePut<{ jumlah: number }>("/transaksi/mpp/budget", {
      pabrik: pabrik.value,
      tahun: tahun.value,
      rows: rows.value,
    });
    finishDraftSave(true);
    toast.success(`${r.jumlah} baris budget tersimpan`);
    edited.value = false;
    await muat();
  } catch (e) {
    finishDraftSave(false);
    toast.error(getErrorMessage(e, "Gagal menyimpan budget MPP"));
  } finally {
    menyimpan.value = false;
  }
}

function ekspor() {
  if (!pabrik.value) return;
  downloadFile(
    `/transaksi/mpp/budget?pabrik=${encodeURIComponent(pabrik.value)}&tahun=${tahun.value}&export=xlsx`,
    "setting-budget-mpp.xlsx"
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
        <span class="tool-icon"><MsIcon name="savings" :size="16" /></span>
        <span class="tool-title">Setting Budget MPP</span>
        <span class="tool-sub">Budget Man Power Plan per bagian — meniru ufrmSettingBudgetMPP</span>
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
        <button class="btn" title="Muat data" :disabled="menyimpan" @click="confirmMuat() && muat()"><MsIcon name="refresh" :size="15" /></button>
        <button class="btn" title="Export Excel" :disabled="!pabrik" @click="ekspor"><MsIcon name="file_download" :size="15" /></button>
        <button v-if="bisaSave" class="btn primary" :disabled="menyimpan || loading || !rows.length" @click="simpan">
          <MsIcon name="save" :size="15" />
          {{ menyimpan ? "Menyimpan..." : "Simpan" }}
        </button>
        <button class="btn" title="Tutup" @click="tutup"><MsIcon name="close" :size="15" /></button>
      </div>
    </div>

    <div class="body">
      <p v-if="catatan && rows.length" class="catatan">{{ catatan }}</p>
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
      <p v-else-if="!rows.length && !loading" class="empty">Tidak ada data untuk tampil.</p>
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
.catatan {
  flex-shrink: 0;
  margin: 0 0 8px;
  font-size: 11px;
  color: #8a6d1a;
  background: #fdf6e3;
  border: 1px solid #ecd9a0;
  padding: 4px 10px;
}
.empty {
  text-align: center;
  color: #8995a6;
  font-size: 12px;
}
</style>
