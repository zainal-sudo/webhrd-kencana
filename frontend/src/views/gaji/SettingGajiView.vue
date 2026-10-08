<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useToast } from "vue-toastification";
import { useRoute } from "vue-router";
import MsIcon from "@/components/MsIcon.vue";
import EditableGrid from "@/components/EditableGrid.vue";
import type { GridCol } from "@/components/EditableGrid.vue";
import { useTabsStore } from "@/stores/tabsStore";
import { useAuthStore } from "@/stores/authStore";
import { api, getErrorMessage } from "@/api/axios";
import { safeGet, safePut, downloadFile } from "@/api";

/**
 * Setting Gaji — padanan `ufrmSettingGaji`.
 *
 * Grid tunjangan karyawan per pabrik. "Simpan" menyalin semua baris ke
 * `tkaryawan` sekaligus (transaksi 1), persis `simpandata` di Delphi.
 */
const toast = useToast();
const route = useRoute();
const tabsStore = useTabsStore();
const auth = useAuthStore();

const form = String(route.meta.form || "frmSettingGaji");
const bisaSave = auth.can(form, "insert");

const pabrikList = ref<{ Kode: string; Nama: string }[]>([]);
const pabrik = ref("");
const cari = ref("");
const rows = ref<Record<string, any>[]>([]);
const loading = ref(false);
const menyimpan = ref(false);
const grid = ref<InstanceType<typeof EditableGrid> | null>(null);

const columns: GridCol[] = [
  { key: "nik", label: "NIK", width: "100px" },
  { key: "nama", label: "Nama", width: "200px" },
  { key: "jabatan", label: "Jabatan", width: "150px" },
  { key: "gapok", label: "Gapok / hari", width: "110px", edit: "number", money: true },
  { key: "premi", label: "Premi Hadir", width: "110px", edit: "number", money: true },
  { key: "status_premi", label: "Premi Mingguan", width: "110px", align: "center", edit: "check", title: "1 = premi mingguan, 0 = premi per hari hadir" },
  { key: "makan", label: "Tunj. Makan", width: "110px", edit: "number", money: true },
  { key: "tjabatan", label: "Tunj. Jabatan (%)", width: "120px", edit: "number" },
  { key: "lain", label: "Lain", width: "110px", edit: "number", money: true },
  { key: "transport", label: "Transport", width: "110px", edit: "number", money: true },
  { key: "bpjs", label: "BPJS", width: "110px", edit: "number", money: true },
];

async function muatPabrik() {
  try {
    const { data } = await api.get("/master/pabrik/options");
    pabrikList.value = (data.data || []).map((p: any) => ({ Kode: p.Kode, Nama: p.Nama }));
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat daftar pabrik"));
  }
}

async function muat() {
  if (!pabrik.value) {
    rows.value = [];
    return;
  }
  loading.value = true;
  try {
    rows.value = await safeGet<Record<string, any>[]>("/gaji/setting", {
      params: { pabrik: pabrik.value, search: cari.value || undefined },
    });
    grid.value?.reset();
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat data"));
  } finally {
    loading.value = false;
  }
}

async function simpan() {
  if (!rows.value.length) {
    toast.error("Pilih pabrik terlebih dahulu");
    return;
  }
  if (!confirm("Yakin ingin menyimpan setting gaji?")) return;
  menyimpan.value = true;
  try {
    const r = await safePut<{ jumlah: number }>("/gaji/setting", { rows: rows.value });
    toast.success(`${r.jumlah} karyawan berhasil disimpan`);
    await muat();
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal menyimpan setting gaji"));
  } finally {
    menyimpan.value = false;
  }
}

function ekspor() {
  if (!pabrik.value) return;
  downloadFile(
    `/gaji/setting?pabrik=${encodeURIComponent(pabrik.value)}&search=${encodeURIComponent(cari.value)}&export=xlsx`,
    "setting-gaji.xlsx"
  ).catch((e) => toast.error(getErrorMessage(e, "Gagal mengekspor")));
}

function tutup() {
  const activeId = tabsStore.activeTabId;
  if (activeId) tabsStore.closeTab(activeId);
}

onMounted(async () => {
  await muatPabrik();
});
</script>

<template>
  <div class="panel">
    <div class="toolbar">
      <div class="tb-left">
        <span class="tool-icon"><MsIcon name="monetization_on" :size="16" /></span>
        <span class="tool-title">Setting Gaji</span>
        <span class="tool-sub">Tunjangan karyawan per pabrik — meniru ufrmSettingGaji</span>
      </div>
      <div class="tb-right">
        <label class="fld">
          Pabrik
          <select v-model="pabrik" @change="muat">
            <option value="">— pilih pabrik —</option>
            <option v-for="p in pabrikList" :key="p.Kode" :value="p.Kode">{{ p.Kode }} — {{ p.Nama }}</option>
          </select>
        </label>
        <label class="fld">
          Cari
          <input v-model="cari" type="search" placeholder="NIK / nama / jabatan" @keyup.enter="muat" />
        </label>
        <button class="btn" title="Muat ulang" @click="muat"><MsIcon name="refresh" :size="15" /></button>
        <button class="btn" title="Export Excel" @click="ekspor" :disabled="!pabrik">
          <MsIcon name="file_download" :size="15" />
        </button>
        <button v-if="bisaSave" class="btn primary" :disabled="menyimpan || !rows.length" @click="simpan">
          <MsIcon name="save" :size="15" />
          {{ menyimpan ? "Menyimpan..." : "Simpan" }}
        </button>
        <button class="btn" title="Tutup" @click="tutup"><MsIcon name="close" :size="15" /></button>
      </div>
    </div>

    <div class="body">
      <EditableGrid
        ref="grid"
        :columns="columns"
        :rows="rows"
        :loading="loading"
        primary-key="nik"
        max-height="100%"
      />
      <p v-if="!pabrik" class="empty">Pilih pabrik untuk menampilkan karyawannya.</p>
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
  flex-shrink: 0;
}
.empty {
  text-align: center;
  color: #8995a6;
  font-size: 12px;
}
</style>
