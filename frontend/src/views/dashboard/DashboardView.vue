<script setup lang="ts">
import { ref, computed, onMounted, onActivated } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import MsIcon from "@/components/MsIcon.vue";
import { useAuthStore } from "@/stores/authStore";
import { usePermissionStore } from "@/stores/permissionStore";
import { useTabsStore } from "@/stores/tabsStore";
import { useKaryawanBrowseStore, type KaryawanBrowseStatus } from "@/stores/karyawanBrowseStore";
import { pickError, safeGet } from "@/api";
import { api } from "@/api/axios";
import { formatNumber, formatTanggal, todaySql } from "@/utils/format";
import { normalizeIcon } from "@/utils/icon";

/**
 * Dashboard — bahasa visual disamakan dengan project-pocokan
 * (fe-pocokan DashboardView): sapaan + pill info, hero gradient,
 * kartu tugas beraksen warna, judul seksi kecil uppercase.
 *
 * Isi tetap khas HRD: ringkasan karyawan + 4 daftar peringatan pengganti
 * popup berurutan `TfrmLogin` program Delphi (belum setting BPJS, mangkir
 * 2 hari berturut-turut, tidak aktif tapi BPJS masih perusahaan, dan PKWT
 * akan habis < 2 bulan).
 */
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const permissionStore = usePermissionStore();
const tabsStore = useTabsStore();
const karyawanBrowseStore = useKaryawanBrowseStore();

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

const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 11) return "Selamat Pagi";
  if (h < 15) return "Selamat Siang";
  if (h < 18) return "Selamat Sore";
  return "Selamat Malam";
});
const userName = computed(() => authStore.user?.user_nama || authStore.user?.user_kode || "User");
const todayLabel = computed(() => formatTanggal(todaySql()));
const sibuk = computed(() => loading.value || peringatanLoading.value);

interface Kpi {
  label: string;
  value: number;
  icon: string;
  tone: string;
  route?: string;
  status?: KaryawanBrowseStatus;
}
const kpis = computed<Kpi[]>(() => [
  { label: "Total Karyawan", value: data.value?.totalKaryawan ?? 0, icon: "badge", tone: "blue", route: "/master/karyawan", status: "all" },
  { label: "Karyawan Aktif", value: data.value?.karyawanAktif ?? 0, icon: "how_to_reg", tone: "green", route: "/master/karyawan", status: "aktif" },
  { label: "Sudah Keluar", value: data.value?.karyawanKeluar ?? 0, icon: "logout", tone: "red", route: "/master/karyawan", status: "nonaktif" },
  { label: "Pabrik / Unit", value: data.value?.pabrik ?? 0, icon: "factory", tone: "orange" },
  { label: "Departemen", value: data.value?.departments ?? 0, icon: "account_tree", tone: "violet" },
  { label: "Jabatan", value: data.value?.jabatan ?? 0, icon: "engineering", tone: "blue" },
]);

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
    tone: "orange",
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
    tone: "blue",
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

/** Kartu hijau (aman) bila kosong, aksen tone panel bila ada isi. */
function accentClass(p: Panel): string {
  return bagian(p.key).total > 0 ? `task-${p.tone}` : "task-green";
}
function chipClass(p: Panel): string {
  return bagian(p.key).total > 0 ? p.tone : "green";
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

function bukaKaryawan(status: KaryawanBrowseStatus) {
  karyawanBrowseStore.setStatus(status, true);
  bukaRoute("/master/karyawan", "Master Karyawan");
}

function bukaKpi(kpi: Kpi) {
  if (!kpi.route || !bolehBuka(kpi.route)) return;
  if (kpi.status) bukaKaryawan(kpi.status);
  else bukaRoute(kpi.route, kpi.label);
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
  <div class="dash-wrap">
    <!-- ── Sapaan ── -->
    <div class="dash-greeting">
      <div class="greeting-left">
        <h2 class="greeting-text">
          {{ greeting }},
          <span class="name">{{ userName }}</span>
        </h2>
        <p class="greeting-sub">HRD Kencana Management System</p>
      </div>
      <div class="info-pills">
        <div class="info-pill">
          <MsIcon name="badge" :size="13" />
          <span>{{ authStore.user?.user_kode }}</span>
        </div>
        <div class="info-pill">
          <MsIcon name="factory" :size="13" />
          <span>{{ authStore.user?.user_akses || "Semua" }}</span>
        </div>
        <div class="info-pill">
          <MsIcon name="calendar_month" :size="13" />
          <span>{{ todayLabel }}</span>
        </div>
        <div class="info-pill clickable" :class="{ busy: sibuk }" @click="load" title="Muat ulang">
          <MsIcon :name="sibuk ? 'progress_activity' : 'refresh'" :size="13" />
          <span>Muat ulang</span>
        </div>
      </div>
    </div>

    <!-- ── Hero karyawan aktif ── -->
    <div
      class="saldo-hero"
      :class="{ clickable: bolehBuka('/master/karyawan') }"
      @click="bolehBuka('/master/karyawan') && bukaKaryawan('aktif')"
    >
      <div class="saldo-hero-left">
        <div class="saldo-hero-label">
          <MsIcon name="how_to_reg" :size="14" />
          Karyawan Aktif
        </div>
        <div class="saldo-hero-val">
          <span v-if="loading" class="saldo-loading">Memuat...</span>
          <span v-else>{{ formatNumber(data?.karyawanAktif ?? 0) }}</span>
        </div>
        <div class="saldo-hero-sub">
          Berdasarkan status aktif &middot; Klik untuk lihat karyawan aktif
        </div>
      </div>
      <div class="saldo-hero-icon">
        <MsIcon name="how_to_reg" :size="36" />
      </div>
    </div>

    <!-- ── Ringkasan ── -->
    <h3 class="section-title">
      <MsIcon name="dashboard" :size="14" class="section-icon" />
      Ringkasan
    </h3>
    <div class="task-grid">
      <div
        v-for="k in kpis"
        :key="k.label"
        class="task-card"
        :class="[`task-${k.tone}`, { clickable: k.route && bolehBuka(k.route) }]"
        @click="bukaKpi(k)"
      >
        <div class="task-top">
          <div class="task-icon-wrap" :class="k.tone">
            <MsIcon :name="k.icon" :size="20" />
          </div>
          <MsIcon v-if="k.route && bolehBuka(k.route)" name="chevron_right" :size="14" class="task-arrow" />
        </div>
        <div class="task-count">
          <span v-if="loading">—</span>
          <span v-else>{{ formatNumber(k.value) }}</span>
        </div>
        <div class="task-label">{{ k.label }}</div>
      </div>
    </div>

    <!-- ── Peringatan ── -->
    <h3 class="section-title">
      <MsIcon name="warning" :size="14" class="section-icon amber" />
      Peringatan
      <span class="section-note">pengganti popup saat login di program lama</span>
    </h3>
    <div v-if="peringatanLoading" class="empty">
      <MsIcon name="progress_activity" :size="20" />
      Memuat daftar peringatan...
    </div>
    <div v-else class="alert-grid">
      <section v-for="p in panels" :key="p.key" class="task-card alert-card" :class="accentClass(p)">
        <div class="task-top">
          <div class="task-icon-wrap" :class="chipClass(p)">
            <MsIcon :name="p.icon" :size="20" />
          </div>
          <MsIcon
            v-if="bolehBuka(p.route)"
            name="chevron_right"
            :size="14"
            class="task-arrow clickable"
            title="Buka {{ p.routeLabel }}"
            @click="bukaRoute(p.route, p.routeLabel)"
          />
        </div>
        <div class="task-count">
          <span v-if="peringatanLoading">—</span>
          <span v-else>{{ formatNumber(bagian(p.key).total) }}</span>
        </div>
        <div class="task-label">{{ p.title }}</div>
        <div class="task-sub">{{ p.desc }}</div>
        <div v-if="p.key === 'mangkir_2hari' && bagian(p.key).tanggal?.length" class="alert-note">
          Acuan 3 hari kerja terakhir: {{ selTanggal(p) }}
        </div>
        <div v-if="bagian(p.key).rows.length === 0" class="alert-empty">
          <MsIcon name="check_circle" :size="16" />
          Tidak ada data — aman.
        </div>
        <div v-else class="alert-table-wrap">
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

    <!-- ── Modul ── -->
    <h3 class="section-title" style="margin-top: 28px">
      <MsIcon name="apps" :size="14" class="section-icon" />
      Modul yang dapat diakses
    </h3>
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
/* ── Bahasa visual pocokan (fe-pocokan DashboardView) ── */
.dash-wrap {
  width: 100%;
  max-width: 100%;
  padding: 4px 8px 32px;
}

/* ── Sapaan ── */
.dash-greeting {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.greeting-text {
  font-size: 20px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0 0 4px;
}
.greeting-text .name {
  color: #3b5998;
}
.greeting-sub {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
  margin: 0;
}
.info-pills {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.info-pill {
  display: flex;
  align-items: center;
  gap: 5px;
  background: #f1f1f8;
  border: 1px solid #c8c8e6;
  border-radius: 20px;
  padding: 4px 12px;
  font-size: 11px;
  font-weight: 600;
  color: #3b5998;
}
.info-pill.clickable {
  cursor: pointer;
  transition: background 0.15s;
}
.info-pill.clickable:hover {
  background: #e8e8f5;
}
.info-pill.busy {
  opacity: 0.6;
  pointer-events: none;
}

/* ── Hero ── */
.saldo-hero {
  background: linear-gradient(135deg, #3b5998, #3b5998);
  border-radius: 12px;
  padding: 20px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  box-shadow: 0 4px 16px rgba(46, 46, 125, 0.25);
}
.saldo-hero.clickable {
  cursor: pointer;
  transition: opacity 0.15s;
}
.saldo-hero.clickable:hover {
  opacity: 0.92;
}
.saldo-hero-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 6px;
}
.saldo-hero-val {
  font-size: 26px;
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.5px;
  margin-bottom: 4px;
}
.saldo-loading {
  font-size: 14px;
  opacity: 0.7;
}
.saldo-hero-sub {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.55);
}
.saldo-hero-icon {
  color: rgba(255, 255, 255, 0.3);
}

/* ── Judul seksi ── */
.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  color: #374151;
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.section-icon {
  color: #3b5998;
}
.section-icon.amber {
  color: #c62828;
}
.section-note {
  font-size: 10px;
  font-weight: 600;
  text-transform: none;
  letter-spacing: 0;
  color: #9ca3af;
}

/* ── Kartu tugas ── */
.task-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 28px;
}
.task-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 14px 16px;
  position: relative;
  overflow: hidden;
}
.task-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
}
.task-red::before { background: #ef5350; }
.task-orange::before { background: #ef6c00; }
.task-blue::before { background: #1565c0; }
.task-violet::before { background: #6d28d9; }
.task-green::before { background: #3b5998; }
.task-grid .task-card.clickable {
  cursor: pointer;
  transition: all 0.2s;
}
.task-grid .task-card.clickable:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
}
.task-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.task-icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.task-icon-wrap.red { background: #ffebee; color: #c62828; }
.task-icon-wrap.orange { background: #fff3e0; color: #ef6c00; }
.task-icon-wrap.blue { background: #e3f2fd; color: #1565c0; }
.task-icon-wrap.violet { background: #ede9fe; color: #5b21b6; }
.task-icon-wrap.green { background: #e8e8f5; color: #3b5998; }
.task-arrow {
  color: #9ca3af;
}
.task-arrow.clickable {
  cursor: pointer;
}
.task-arrow.clickable:hover {
  color: #3b5998;
}
.task-count {
  font-size: 28px;
  font-weight: 800;
  color: #111;
  line-height: 1;
  margin-bottom: 4px;
}
.task-red .task-count { color: #c62828; }
.task-orange .task-count { color: #e65100; }
.task-blue .task-count { color: #1565c0; }
.task-violet .task-count { color: #5b21b6; }
.task-green .task-count { color: #3b5998; }
.task-label {
  font-size: 11px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 2px;
}
.task-sub {
  font-size: 10px;
  color: #9ca3af;
}

/* ── Panel peringatan (kartu tugas + rincian tabel) ── */
.alert-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(430px, 1fr));
  gap: 12px;
  margin-bottom: 28px;
}
.alert-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding-bottom: 0;
}
.alert-card .task-sub {
  margin-bottom: 10px;
}
.alert-note {
  margin: 0 -16px 10px;
  padding: 6px 16px;
  font-size: 10.5px;
  color: #854d0e;
  background: #fffbeb;
  border-top: 1px solid #f5e6c4;
  border-bottom: 1px solid #f5e6c4;
}
.alert-empty {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 0 12px;
  font-size: 12px;
  color: #059669;
}
.alert-table-wrap {
  overflow: auto;
  max-height: 264px;
  margin: 0 -16px;
  padding: 0 16px;
  border-top: 1px solid #f3f4f6;
}
.alert-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 11.5px;
}
.alert-table th {
  position: sticky;
  top: 0;
  background: #3b5998;
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
  color: #1b2d4a;
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
  gap: 4px;
  margin: 0 -16px;
  padding: 8px 12px;
  border-top: 1px solid #e6eaf0;
  background: #f8fafc;
  border-radius: 0 0 10px 10px;
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
  color: #3b5998;
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

/* ── Modul ── */
.modul-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 12px;
}
.modul-group {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.modul-group-head {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 12px;
  background: #f1f1f8;
  border-bottom: 1px solid #e5e7eb;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  color: #3b5998;
}
.modul-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: none;
  border-bottom: 1px solid #f3f4f6;
  background: #fff;
  cursor: pointer;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 12px;
  color: #374151;
  text-align: left;
  transition: all 0.15s;
}
.modul-item:last-child {
  border-bottom: none;
}
.modul-item:hover {
  border-color: #3b5998;
  background: #f1f1f8;
  color: #3b5998;
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
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  color: #6b7a90;
  font-size: 12px;
  margin-bottom: 28px;
}

/* ── Responsif ala pocokan ── */
@media (max-width: 768px) {
  .saldo-hero-val {
    font-size: 20px;
  }
  .task-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .task-count {
    font-size: 22px;
  }
  .dash-greeting {
    flex-direction: column;
    gap: 10px;
  }
  .alert-grid {
    grid-template-columns: 1fr;
  }
}
</style>
