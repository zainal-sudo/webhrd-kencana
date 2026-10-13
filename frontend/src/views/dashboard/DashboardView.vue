<script setup lang="ts">
import { ref, computed, onMounted, onActivated } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import MsIcon from "@/components/MsIcon.vue";
import { useAuthStore } from "@/stores/authStore";
import { usePermissionStore } from "@/stores/permissionStore";
import { useTabsStore } from "@/stores/tabsStore";
import { pickError, safeGet } from "@/api";
import { api } from "@/api/axios";
import { formatNumber, formatTanggal } from "@/utils/format";
import { normalizeIcon } from "@/utils/icon";

const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const permissionStore = usePermissionStore();
const tabsStore = useTabsStore();

interface Ringkasan {
  totalKaryawan: number;
  karyawanAktif: number;
  karyawanKeluar: number;
  departments: number;
  jabatan: number;
  pabrik: number;
}

const data = ref<Ringkasan | null>(null);
const loading = ref(false);

const groups = computed(() => permissionStore.menuTree);

/**
 * Peringatan dashboard — pengganti popup berurutan `TfrmLogin` (program
 * Delphi) yang dulu muncul satu per satu setiap login. Empat daftar yang
 * diminta: belum setting BPJS, mangkir 2 hari berturut-turut, tidak aktif
 * tapi BPJS masih perusahaan, dan PKWT akan habis (< 2 bulan).
 */
interface PeringatanBagian {
  total: number;
  rows: Record<string, any>[];
  tanggal?: string[];
}
interface Peringatan {
  bpjs_belum: PeringatanBagian;
  mangkir_2hari: PeringatanBagian;
  nonaktif_bpjs: PeringatanBagian;
  pkwt_habis: PeringatanBagian;
}

interface PanelKolom { key: string; label: string; date?: boolean }
interface Panel {
  key: keyof Peringatan;
  title: string;
  desc: string;
  icon: string;
  tone: string;
  route: string;
  routeLabel: string;
  columns: PanelKolom[];
}

const panels: Panel[] = [
  {
    key: "bpjs_belum",
    title: "Belum Setting BPJS",
    desc: "Karyawan aktif > 30 hari, status BPJS belum disetting",
    icon: "medical_services",
    tone: "amber",
    route: "/master/karyawan",
    routeLabel: "Karyawan",
    columns: [
      { key: "Nik", label: "NIK" },
      { key: "Nama", label: "Nama" },
      { key: "Pabrik", label: "Pabrik" },
      { key: "Bagian", label: "Bagian" },
      { key: "Tgl_Masuk", label: "Tgl Masuk", date: true },
    ],
  },
  {
    key: "mangkir_2hari",
    title: "Tidak Masuk 2 Hari Berturut-turut",
    desc: "Status 0 tanpa ijin pada 3 hari kerja terakhir",
    icon: "person_off",
    tone: "red",
    route: "/laporan/tidak-masuk",
    routeLabel: "Tidak Masuk",
    columns: [
      { key: "Nik", label: "NIK" },
      { key: "Nama", label: "Nama" },
      { key: "Pabrik", label: "Pabrik" },
      { key: "Bagian", label: "Bagian" },
    ],
  },
  {
    key: "nonaktif_bpjs",
    title: "Tidak Aktif, BPJS Masih Perusahaan",
    desc: "Sudah keluar tapi status BPJS belum dipindah",
    icon: "manage_accounts",
    tone: "slate",
    route: "/master/karyawan",
    routeLabel: "Karyawan",
    columns: [
      { key: "Nik", label: "NIK" },
      { key: "Nama", label: "Nama" },
      { key: "Pabrik", label: "Pabrik" },
      { key: "Bagian", label: "Bagian" },
      { key: "Tgl_Keluar", label: "Tgl Keluar", date: true },
    ],
  },
  {
    key: "pkwt_habis",
    title: "Masa PKWT Akan Habis",
    desc: "Berakhir < 2 bulan dari hari ini, terdekat di atas",
    icon: "contract",
    tone: "violet",
    route: "/master/karyawan",
    routeLabel: "Karyawan",
    columns: [
      { key: "Nik", label: "NIK" },
      { key: "Nama", label: "Nama" },
      { key: "Jabatan", label: "Jabatan" },
      { key: "Status_Kerja", label: "Status" },
      { key: "Tgl_Berakhir", label: "Berakhir", date: true },
    ],
  },
];

const peringatan = ref<Peringatan | null>(null);
const peringatanLoading = ref(false);
/** Panel yang dibuka penuh; bawaan hanya 8 baris pertama. */
const expanded = ref<Record<string, boolean>>({});
/** Panel yang sedang mengunduh Excel. */
const exporting = ref<Record<string, boolean>>({});

function bagian(key: keyof Peringatan): PeringatanBagian {
  return (
    peringatan.value?.[key] ?? { total: 0, rows: [] as Record<string, any>[] }
  );
}

function barisPanel(p: Panel): Record<string, any>[] {
  const rows = bagian(p.key).rows;
  return expanded.value[p.key] ? rows : rows.slice(0, 8);
}

function selTanggal(p: Panel): string {
  const t = bagian(p.key).tanggal || [];
  return t.map((d) => formatTanggal(d)).join(", ");
}

function bolehBuka(route: string): boolean {
  return permissionStore.allowedRoutes.includes(route);
}

function bukaRoute(route: string, label: string) {
  tabsStore.openTab({ title: label, path: route, icon: "", closable: true });
  router.push(route);
}

function cellText(row: Record<string, any>, col: PanelKolom): string {
  const v = row[col.key];
  if (v === null || v === undefined || v === "") return "-";
  return col.date ? formatTanggal(v) : String(v);
}

/** Unduh satu daftar peringatan penuh sebagai .xlsx (pola BaseBrowse). */
async function exportPanel(p: Panel) {
  exporting.value[p.key] = true;
  try {
    const res = await api.get("/dashboard/peringatan", {
      params: { export: "xlsx", bagian: p.key },
      responseType: "blob",
      timeout: 300000,
    });
    const nama = p.title.replace(/[\\/:*?"<>|]/g, "").trim().replace(/\s+/g, "-") || "data";
    const tanggal = new Date().toISOString().slice(0, 10);
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nama}_${tanggal}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    toast.success("Berkas Excel berhasil diunduh");
  } catch (e) {
    toast.error(pickError(e));
  } finally {
    exporting.value[p.key] = false;
  }
}

async function load() {
  loading.value = true;
  peringatanLoading.value = true;
  try {
    data.value = await safeGet<Ringkasan>("/master/ringkasan");
  } catch (e) {
    toast.error(pickError(e));
  } finally {
    loading.value = false;
  }
  try {
    peringatan.value = await safeGet<Peringatan>("/dashboard/peringatan");
  } catch (e) {
    toast.error(pickError(e));
  } finally {
    peringatanLoading.value = false;
  }
}

function open(node: { label: string; route?: string; icon?: string }) {
  if (!node.route) return;
  tabsStore.openTab({ title: node.label, path: node.route, icon: node.icon || "", closable: true });
  router.push(node.route);
}

onMounted(load);
let firstActivation = true;
onActivated(() => {
  if (firstActivation) {
    firstActivation = false;
    return;
  }
  load();
});
</script>

<template>
  <div class="dash">
    <div class="hero">
      <div class="hero-text">
        <strong>Selamat datang, {{ authStore.user?.user_nama || authStore.user?.user_kode }}</strong>
        <small>
          Kode user <b>{{ authStore.user?.user_kode }}</b> &middot;
          Pabrik/Cabang <b>{{ authStore.user?.user_akses || "Semua" }}</b>
        </small>
      </div>
      <button class="btn-refresh" :disabled="loading || peringatanLoading" @click="load">
        <MsIcon :name="loading || peringatanLoading ? 'progress_activity' : 'refresh'" :size="15" />
        <span>Muat ulang</span>
      </button>
    </div>

    <div class="kpi-row">
      <div class="kpi">
        <span class="kpi-icon blue"><MsIcon name="badge" :size="20" /></span>
        <div>
          <small>Total Karyawan</small>
          <strong>{{ formatNumber(data?.totalKaryawan ?? 0) }}</strong>
        </div>
      </div>
      <div class="kpi">
        <span class="kpi-icon green"><MsIcon name="how_to_reg" :size="20" /></span>
        <div>
          <small>Karyawan Aktif</small>
          <strong>{{ formatNumber(data?.karyawanAktif ?? 0) }}</strong>
        </div>
      </div>
      <div class="kpi">
        <span class="kpi-icon red"><MsIcon name="logout" :size="20" /></span>
        <div>
          <small>Sudah Keluar</small>
          <strong>{{ formatNumber(data?.karyawanKeluar ?? 0) }}</strong>
        </div>
      </div>
      <div class="kpi">
        <span class="kpi-icon amber"><MsIcon name="factory" :size="20" /></span>
        <div>
          <small>Pabrik / Unit</small>
          <strong>{{ formatNumber(data?.pabrik ?? 0) }}</strong>
        </div>
      </div>
      <div class="kpi">
        <span class="kpi-icon slate"><MsIcon name="account_tree" :size="20" /></span>
        <div>
          <small>Departemen</small>
          <strong>{{ formatNumber(data?.departments ?? 0) }}</strong>
        </div>
      </div>
      <div class="kpi">
        <span class="kpi-icon violet"><MsIcon name="engineering" :size="20" /></span>
        <div>
          <small>Jabatan</small>
          <strong>{{ formatNumber(data?.jabatan ?? 0) }}</strong>
        </div>
      </div>
    </div>

    <div class="modul-head">
      Peringatan
      <span class="head-note">pengganti popup saat login di program lama</span>
    </div>
    <div v-if="peringatanLoading" class="empty">
      <MsIcon name="progress_activity" :size="20" />
      Memuat daftar peringatan...
    </div>
    <div v-else class="alert-grid">
      <section v-for="p in panels" :key="p.key" class="alert-panel">
        <div class="alert-head">
          <span class="kpi-icon" :class="p.tone"><MsIcon :name="p.icon" :size="18" /></span>
          <div class="alert-title">
            <strong>{{ p.title }}</strong>
            <small>{{ p.desc }}</small>
          </div>
          <span class="count-badge" :class="{ nol: bagian(p.key).total === 0 }">
            {{ formatNumber(bagian(p.key).total) }}
          </span>
        </div>
        <div v-if="p.key === 'mangkir_2hari' && bagian(p.key).tanggal?.length" class="alert-note">
          Acuan 3 hari kerja terakhir: {{ selTanggal(p) }}
        </div>
        <div v-if="bagian(p.key).rows.length === 0" class="alert-empty">
          <MsIcon name="check_circle" :size="16" />
          Tidak ada data — aman.
        </div>
        <div v-else class="alert-table-wrap" :class="{ full: expanded[p.key] }">
          <table class="alert-table">
            <thead>
              <tr>
                <th class="num-col">No</th>
                <th v-for="c in p.columns" :key="c.key">{{ c.label }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in barisPanel(p)" :key="`${p.key}-${i}`">
                <td class="num-col">{{ i + 1 }}</td>
                <td v-for="c in p.columns" :key="c.key">{{ cellText(row, c) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="alert-foot">
          <button
            v-if="bolehBuka(p.route)"
            class="link-btn"
            @click="bukaRoute(p.route, p.routeLabel)"
          >
            <MsIcon name="open_in_new" :size="13" />
            <span>Buka {{ p.routeLabel }}</span>
          </button>
          <button
            class="link-btn"
            :disabled="!!exporting[p.key] || bagian(p.key).total === 0"
            title="Unduh daftar ini sebagai Excel"
            @click="exportPanel(p)"
          >
            <MsIcon :name="exporting[p.key] ? 'progress_activity' : 'download'" :size="13" />
            <span>{{ exporting[p.key] ? "Menyiapkan..." : "Excel" }}</span>
          </button>
          <span class="foot-spacer"></span>
          <button
            v-if="bagian(p.key).rows.length > 8"
            class="link-btn"
            @click="expanded[p.key] = !expanded[p.key]"
          >
            <MsIcon :name="expanded[p.key] ? 'expand_less' : 'expand_more'" :size="14" />
            <span>{{ expanded[p.key] ? "Ringkas" : `Lihat semua ${bagian(p.key).total}` }}</span>
          </button>
        </div>
      </section>
    </div>

    <div class="modul-head">Modul yang dapat diakses</div>
    <div v-if="groups.length === 0" class="empty">
      <MsIcon name="lock" :size="20" />
      Belum ada modul yang diberikan. Hubungi administrator untuk hak akses.
    </div>
    <div class="modul-grid">
      <div v-for="g in groups" :key="g.key" class="modul-group">
        <div class="modul-group-head">
          <MsIcon :name="normalizeIcon(g.icon)" :size="16" />
          <span>{{ g.label }}</span>
        </div>
        <button
          v-for="c in g.children"
          :key="c.key"
          class="modul-item"
          @click="open(c)"
        >
          <MsIcon :name="normalizeIcon(c.icon) || 'chevron_right'" :size="14" />
          <span>{{ c.label }}</span>
          <MsIcon name="chevron_right" :size="14" class="chev" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dash {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  background: linear-gradient(180deg, #12324f 0%, #1b3e60 100%);
  color: #fff;
  border: 1px solid #0b2136;
}
.hero-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.hero-text strong {
  font-size: 15px;
  font-weight: 800;
}
.hero-text small {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.65);
}
.hero-text b {
  color: #fff;
}
.btn-refresh {
  height: 30px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.btn-refresh:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.18);
}
.kpi-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 10px;
}
.kpi {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: #fff;
  border: 1px solid var(--ds-border, #b0b8c4);
}
.kpi-icon {
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}
.kpi-icon.blue { background: #1b5e9e; }
.kpi-icon.green { background: #059669; }
.kpi-icon.red { background: #dc2626; }
.kpi-icon.amber { background: #d97706; }
.kpi-icon.slate { background: #475569; }
.kpi-icon.violet { background: #6d28d9; }
.kpi div {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.kpi small {
  font-size: 10.5px;
  color: #6b7a90;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  font-weight: 700;
}
.kpi strong {
  font-size: 20px;
  font-weight: 800;
  color: var(--ds-on-surface, #12324f);
}
.modul-head {
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ds-on-surface, #12324f);
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.head-note {
  font-size: 10.5px;
  font-weight: 600;
  text-transform: none;
  letter-spacing: 0;
  color: #6b7a90;
}
.alert-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(430px, 1fr));
  gap: 10px;
}
.alert-panel {
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.alert-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid #e6eaf0;
}
.alert-title {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  line-height: 1.25;
}
.alert-title strong {
  font-size: 12.5px;
  font-weight: 800;
  color: var(--ds-on-surface, #12324f);
}
.alert-title small {
  font-size: 10.5px;
  color: #6b7a90;
}
.count-badge {
  min-width: 34px;
  height: 26px;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #dc2626;
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  flex-shrink: 0;
}
.count-badge.nol {
  background: #e2e8f0;
  color: #64748b;
}
.alert-note {
  padding: 6px 12px;
  font-size: 10.5px;
  color: #854d0e;
  background: #fffbeb;
  border-bottom: 1px solid #f5e6c4;
}
.alert-empty {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 14px 12px;
  font-size: 12px;
  color: #059669;
}
.alert-table-wrap {
  overflow: auto;
  max-height: 264px;
}
.alert-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11.5px;
}
.alert-table th {
  position: sticky;
  top: 0;
  background: var(--ds-primary-dark, #243656);
  color: #fff;
  font-weight: 700;
  padding: 5px 8px;
  text-align: left;
  white-space: nowrap;
  z-index: 1;
}
.alert-table td {
  padding: 4px 8px;
  border-bottom: 1px solid #eef1f6;
  color: var(--ds-on-surface, #1b2d4a);
  white-space: nowrap;
}
.alert-table tbody tr:nth-child(even) {
  background: #f6f8fb;
}
.alert-table .num-col {
  text-align: center;
  width: 36px;
  color: #6b7a90;
}
.alert-foot {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  border-top: 1px solid #e6eaf0;
  background: #f8fafc;
}
.foot-spacer {
  flex: 1;
}
.link-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: none;
  background: transparent;
  color: var(--ds-primary, #1b5e9e);
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  padding: 2px 4px;
}
.link-btn:hover {
  text-decoration: underline;
}
.link-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  text-decoration: none;
}
.modul-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 10px;
}
.modul-group {
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  display: flex;
  flex-direction: column;
}
.modul-group-head {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 12px;
  background: var(--ds-surface-variant, #e0e4ea);
  border-bottom: 1px solid var(--ds-border, #b0b8c4);
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--ds-primary, #1b5e9e);
}
.modul-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: none;
  border-bottom: 1px solid #e6eaf0;
  background: #fff;
  cursor: pointer;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 12px;
  color: var(--ds-on-surface, #12324f);
  text-align: left;
}
.modul-item:hover {
  background: rgba(27, 94, 158, 0.08);
  color: var(--ds-primary, #1b5e9e);
}
.modul-item span {
  flex: 1;
}
.modul-item .chev {
  opacity: 0.35;
}
.empty {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 18px;
  border: 1px dashed var(--ds-border, #b0b8c4);
  color: #6b7a90;
  font-size: 12px;
}
</style>
