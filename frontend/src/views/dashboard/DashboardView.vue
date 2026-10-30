<script setup lang="ts">
import { ref, computed, onMounted, onActivated, onUnmounted, nextTick } from "vue";
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
import Chart from "chart.js/auto";

/**
 * Dashboard — Analisis HR (gaya "analisis hr .html" mandiri): rekap absensi
 * satu periode dari backend (GET /dashboard/analisis-absensi), kartu statistik,
 * grafik per departemen, pelanggaran + rekomendasi punishment, ranking Top-10,
 * detail sortable, CSV/PDF, dan kirim WA.
 *
 * Yang dipertahankan dari dashboard lama: sapaan, panel Peringatan
 * (BPJS / mangkir 2 hari / BPJS nonaktif / PKWT akan habis — PKWT tidak
 * dihilangkan), dan daftar modul.
 */
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const permissionStore = usePermissionStore();
const tabsStore = useTabsStore();
const karyawanBrowseStore = useKaryawanBrowseStore();

/* ════════════════════ ANALISIS HR ════════════════════ */

interface AnalisisRow {
  [k: string]: any;
  Nik: string;
  Nama: string;
  Pabrik: string;
  Jabatan: string | null;
  Departemen: string | null;
  Bagian: string | null;
  Sistem: string | null;
  Total_hari?: number;
  TotalLembur?: number;
  Bonus_Libur?: number;
  terlambat?: number;
  ST_HARI?: number;
  sakit?: number;
  Ijin?: number;
  Alpha?: number;
  LainLain?: number;
  Total?: number;
  Adaform?: string; // "05-Oct,08-Oct."
  Tanpaform?: string;
  KetAlpha?: string;
}

interface AnalisisResponse {
  bulan: number;
  tahun: number;
  start: string;
  end: string;
  pabrik: string;
  rows: AnalisisRow[];
}

const BULAN_NAMA = [
  "", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const PABRIK_OPTIONS = [
  { value: "ALL", label: "🏭 ALL (Semua Pabrik)" },
  { value: "STORE", label: "🏬 STORE (K*)" },
  { value: "HO", label: "🏢 HO" },
  { value: "P01", label: "🏭 P01" },
  { value: "P02", label: "🏭 P02" },
  { value: "P04", label: "🏭 P04" },
  { value: "P05", label: "🏭 P05" },
];

const now0 = new Date();
const bulan = ref(now0.getMonth() + 1);
const tahun = ref(now0.getFullYear());
const pabrik = ref("ALL");
const analisisLoading = ref(false);
const analisisPeriode = ref<{ bulan: number; tahun: number } | null>(null);
/** Baris rekap mentah dari backend (belum per filter pabrik). */
const rawRows = ref<AnalisisRow[]>([]);
const analisisTercoba = ref(false);
/* ── Dropdown custom (bulan & pabrik) — daftar native tak bisa distyle, jadi diganti custom ── */
const ddBulan = ref(false);
const ddPabrik = ref(false);
const labelPabrik = computed(() => PABRIK_OPTIONS.find((o) => o.value === pabrik.value)?.label ?? pabrik.value);
async function pilihBulan(b: number) {
  bulan.value = b;
  ddBulan.value = false;
  await nextTick();
  renderCharts();
}
async function pilihPabrik(v: string) {
  pabrik.value = v;
  ddPabrik.value = false;
  await nextTick();
  renderCharts();
}
function tutupDropdown(e: Event) {
  if (e instanceof KeyboardEvent && e.key !== "Escape") return;
  ddBulan.value = false;
  ddPabrik.value = false;
}
/** Kombinasi filter yang datanya SUDAH siap di memori (prefetch bisa selesai sebelum di-klik). */
const analisisKunci = ref("");
const kunciFilter = () => `${bulan.value}:${tahun.value}:${pabrik.value}`;

/** Parse "05-Oct,08-Oct." -> [{text:"05-Oct", count}] — pola master countItemsFromText. */
function tanggalDari(text?: string | null): string[] {
  const str = String(text || "").trim();
  if (!str) return [];
  return str.replace(/,$/, "").replace(/\.?$/, "").split(",").map(s => s.trim()).filter(s => s && /\d/.test(s));
}

/** Baris bersih + hitungan derived, filter Total > 0 (pola processData master).
 *  Kolom DECIMAL MySQL datang sebagai string ("0.0000") — semua angka
 *  dipaksa Number() agar statistik tidak menghasilkan NaN. */
const angka = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const cleanData = computed(() =>
  rawRows.value
    .map((r) => {
      const totalHari = angka(r.Total_Hari ?? r.Total_hari);
      const bonusLibur = angka(r.Bonus_Libur);
      const adaformTgl = tanggalDari(r.Adaform);
      const tanpaformTgl = tanggalDari(r.Tanpaform);
      const alphaTgl = tanggalDari((r.KetAlpha || "").replace(/^Alpha\s*: ?/i, ""));
      return {
        ...r,
        Total_Hari: totalHari,
        TotalLembur: angka(r.TotalLembur),
        Bonus_Libur: bonusLibur,
        terlambat: angka(r.terlambat),
        ST_HARI: angka(r.ST_HARI),
        sakit: angka(r.sakit),
        Ijin: angka(r.Ijin),
        Alpha: angka(r.Alpha),
        LainLain: angka(r.LainLain),
        Total: angka(r.Total),
        Hari_Kerja_Efektif: Math.max(totalHari - bonusLibur, 0),
        Adaform_Count: adaformTgl.length,
        Adaform_Text: adaformTgl.join(", ") || "-",
        Tanpaform_Count: tanpaformTgl.length,
        Tanpaform_Text: tanpaformTgl.join(", ") || "-",
        Alpha_Count: angka(r.Alpha),
        Alpha_Text: alphaTgl.join(", ") || "-",
        Terlambat_Count: angka(r.terlambat),
      };
    })
    .filter((r) => r.Total > 0 && (r.Nama || "").trim() !== "")
);

/** Baris sesuai filter pabrik (ALL / STORE=>K* / kode). */
const filteredData = computed(() => {
  if (pabrik.value === "ALL") return cleanData.value;
  if (pabrik.value === "STORE") return cleanData.value.filter((r) => (r.Pabrik || "").startsWith("K"));
  return cleanData.value.filter((r) => r.Pabrik === pabrik.value);
});

const dataReady = computed(() => filteredData.value.length > 0);
/** Analisis belum pernah dimuat di sesi ini → sembunyikan kartu statistik 0-an. */
const belumMuat = computed(() => !analisisTercoba.value);

/* ── Rekomendasi punishment (pola getRekomendasi master) ── */
function rekomendasi(r: { Adaform_Count: number; Tanpaform_Count: number; Alpha_Count: number }) {
  const rekom: string[] = [];
  const alasan: string[] = [];
  const a = r.Adaform_Count, t = r.Tanpaform_Count, al = r.Alpha_Count;
  if (a > 4) { rekom.push("Pembinaan (Punishment Terakhir)"); alasan.push(`Terlambat dengan form ${a}x (>4x)`); }
  if (a > 5) { rekom.push("Pembinaan/SP1 (Punishment Terakhir)"); alasan.push(`Terlambat dengan form ${a}x (>5x)`); }
  if (a > 7) { rekom.push("SP1/SP2 (Sesuai Punishment)"); alasan.push(`Terlambat dengan form ${a}x (>7x)`); }
  if (al >= 1 && al <= 2) { rekom.push("Pembinaan"); alasan.push(`Alpha ${al}x (1-2x)`); }
  if (al > 2 && al <= 3) { rekom.push("Pembinaan/SP1"); alasan.push(`Alpha ${al}x (2-3x)`); }
  if (al > 3) { rekom.push("SP2/SP3"); alasan.push(`Alpha ${al}x (>3x)`); }
  if (t >= 1) { rekom.push("Pembinaan (Punishment Terakhir)"); alasan.push(`Terlambat tanpa form ${t}x (1x)`); }
  if (t >= 2) { rekom.push("Pembinaan/SP1 (Punishment Terakhir)"); alasan.push(`Terlambat tanpa form ${t}x (≥2x)`); }
  if (t >= 4) { rekom.push("SP1/SP2 (Sesuai Punishment)"); alasan.push(`Terlambat tanpa form ${t}x (≥4x)`); }
  if (rekom.length === 0) return { rekom: "Aman", alasan: "Tidak ada pelanggaran", level: "safe" };
  const rekomFinal = rekom[rekom.length - 1];
  let level = "info";
  if (rekomFinal.includes("SP2") || rekomFinal.includes("SP3")) level = "danger";
  else if (rekomFinal.includes("SP1")) level = "warning";
  return { rekom: rekomFinal, alasan: alasan.join("; "), level };
}

interface BarisRekom {
  [k: string]: any;
  rekom: string;
  alasan: string;
  level: string;
  Adaform_Count: number;
  Tanpaform_Count: number;
  Alpha_Count: number;
  Terlambat_Count: number;
}

/** Baris + rekomendasi, sesuai filter pabrik aktif. */
const allDataWithRekom = computed<BarisRekom[]>(() =>
  filteredData.value.map((r) => ({ ...r, ...rekomendasi(r) }))
);
const pelanggaranList = computed(() => allDataWithRekom.value.filter((r) => r.level !== "safe"));

function detailPelanggaranItems(r: BarisRekom) {
  const items: { label: string; value: string; detail: string; badge: string }[] = [];
  if (r.Adaform_Count > 0) items.push({ label: "Terlambat dengan form", value: `${r.Adaform_Count}x`, detail: r.Adaform_Text, badge: "red" });
  if (r.Tanpaform_Count > 0) items.push({ label: "Terlambat tanpa form", value: `${r.Tanpaform_Count}x`, detail: r.Tanpaform_Text, badge: "orange" });
  if (r.Alpha_Count > 0) items.push({ label: "Alpha", value: `${r.Alpha_Count}x`, detail: r.Alpha_Text, badge: "blue" });
  return items;
}
function detailPelanggaranWA(r: BarisRekom): string {
  const d: string[] = [];
  if (r.Adaform_Count > 0) d.push(`Terlambat dengan form ${r.Adaform_Count}x (${r.Adaform_Text})`);
  if (r.Tanpaform_Count > 0) d.push(`Terlambat tanpa form ${r.Tanpaform_Count}x (${r.Tanpaform_Text})`);
  if (r.Alpha_Count > 0) d.push(`Alpha ${r.Alpha_Count}x (${r.Alpha_Text})`);
  return d.join(", ") || "Tidak ada pelanggaran";
}

/* ── Statistik ringkasan (pola updateStats master) ── */
const stats = computed(() => {
  const d = filteredData.value;
  const total = d.length;
  const totalHari = d.reduce((s, r) => s + (r.Hari_Kerja_Efektif || 0), 0);
  const totalLembur = d.reduce((s, r) => s + (r.TotalLembur || 0), 0);
  const totalTerlambat = d.reduce((s, r) => s + (r.Terlambat_Count || 0), 0);
  const totalAlpha = d.reduce((s, r) => s + (r.Alpha_Count || 0), 0);
  const totalSakit = d.reduce((s, r) => s + (r.sakit || 0), 0);
  const totalIjin = d.reduce((s, r) => s + (r.Ijin || 0), 0);
  const totalSetengah = d.reduce((s, r) => s + (r.ST_HARI || 0), 0);
  const totalTanpaform = d.reduce((s, r) => s + (r.Tanpaform_Count || 0), 0);
  let pct = 0, count = 0;
  d.forEach((r) => {
    const pembagi = (r.Total_Hari || 0) - (r.Bonus_Libur || 0);
    if (pembagi > 0) {
      const k = ((pembagi - ((r.sakit || 0) + (r.Ijin || 0) + (r.Alpha_Count || 0))) / pembagi) * 100;
      pct += Math.max(0, Math.min(k, 100));
      count++;
    }
  });
  return {
    total, totalHari, totalLembur, totalTerlambat, totalAlpha,
    kehadiran: count ? pct / count : 0,
    totalSakit, totalIjin, totalSetengah, totalTanpaform,
  };
});

/* ── Agregat departemen (pola renderDepartemen master) ── */
interface DeptStat {
  departemen: string; karyawan: number; totalHari: number; bonusLibur: number;
  sakit: number; ijin: number; alpha: number; terlambat: number;
  kehadiran: number; pctTerlambat: number; totalLembur: number; avgLembur: number;
  tanpaform: number; adaform: number; setengah: number; pembagi: number; absen: number;
}
const deptArray = computed<DeptStat[]>(() => {
  const m: Record<string, any> = {};
  filteredData.value.forEach((r) => {
    const dept = r.Departemen || "Unknown";
    if (!m[dept]) m[dept] = { karyawan: 0, totalHari: 0, bonusLibur: 0, sakit: 0, ijin: 0, alpha: 0, terlambat: 0, totalLembur: 0, tanpaform: 0, adaform: 0, setengah: 0 };
    const d = m[dept];
    d.karyawan++;
    d.totalHari += r.Total_Hari || 0;
    d.bonusLibur += r.Bonus_Libur || 0;
    d.sakit += r.sakit || 0;
    d.ijin += r.Ijin || 0;
    d.alpha += r.Alpha_Count || 0;
    d.terlambat += r.Terlambat_Count || 0;
    d.totalLembur += r.TotalLembur || 0;
    d.tanpaform += r.Tanpaform_Count || 0;
    d.adaform += r.Adaform_Count || 0;
    d.setengah += r.ST_HARI || 0;
  });
  return Object.keys(m).map((departemen) => {
    const d = m[departemen];
    const pembagi = d.totalHari - d.bonusLibur;
    let kehadiran = 0;
    if (pembagi > 0) kehadiran = Math.max(0, Math.min(((pembagi - (d.sakit + d.ijin + d.alpha)) / pembagi) * 100, 100));
    return {
      departemen, ...d,
      pembagi,
      kehadiran,
      pctTerlambat: d.totalHari > 0 ? (d.terlambat / d.totalHari) * 100 : 0,
      avgLembur: d.karyawan > 0 ? d.totalLembur / d.karyawan : 0,
      absen: d.sakit + d.ijin + d.alpha,
    };
  });
});
const deptRanking = computed(() => [...deptArray.value].sort((a, b) => b.kehadiran - a.kehadiran));

function warnaPct(v: number) {
  return v >= 90 ? "#2ecc71" : v >= 75 ? "#f39c12" : "#e74c3c";
}
function medalName(i: number) {
  return i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
}

/* ── Rankings Top 10 ── */
const rankTerlambat = computed(() =>
  [...allDataWithRekom.value].sort((a, b) => b.Terlambat_Count - a.Terlambat_Count).slice(0, 10).filter((r) => r.Terlambat_Count > 0));
const rankAlpha = computed(() =>
  [...allDataWithRekom.value].sort((a, b) => b.Alpha_Count - a.Alpha_Count).slice(0, 10).filter((r) => r.Alpha_Count > 0));
const rankTanpaform = computed(() =>
  [...allDataWithRekom.value].sort((a, b) => b.Tanpaform_Count - a.Tanpaform_Count).slice(0, 10).filter((r) => r.Tanpaform_Count > 0));
/** Rekomendasi kecil pada kartu ranking (pola master). */
function rekomRanking(r: { Adaform_Count: number; Tanpaform_Count: number; Alpha_Count: number }, jenis: "terlambat" | "alpha" | "tanpaform") {
  const a = r.Adaform_Count, t = r.Tanpaform_Count, al = r.Alpha_Count;
  if (jenis === "terlambat") { if (a > 7 || t >= 4) return "SP 2"; if (a > 5 || t >= 2) return "SP 1"; }
  if (jenis === "alpha") { if (al > 3) return "SP 2"; else if (al > 2) return "SP 1"; }
  if (jenis === "tanpaform") { if (t >= 4) return "SP 2"; else if (t >= 2) return "SP 1"; }
  return "Pembinaan";
}

/* ── Grafik Chart.js ── */
type ChartKey = "kehadiran" | "lembur" | "terlambatDept" | "totalLembur";
const instances: Partial<Record<ChartKey, Chart>> = {};
const canvasKehadiran = ref<HTMLCanvasElement>();
const canvasLembur = ref<HTMLCanvasElement>();
const canvasTerlambat = ref<HTMLCanvasElement>();
const canvasTotalLembur = ref<HTMLCanvasElement>();

function hancurkanChart() {
  (Object.keys(instances) as ChartKey[]).forEach((k) => {
    instances[k]?.destroy();
    delete instances[k];
  });
}

const chartOpsDasar: any = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
};

let renderChartsCoba = 0; // penghitung retry ukuran canvas (requestAnimationFrame)

function renderCharts() {
  hancurkanChart();
  if (!analisisTercoba.value) return; // grid disembunyikan → canvas belum ada
  const labels = deptArray.value.map((d) => d.departemen);
  if (labels.length === 0) return;
  // Guard: semua canvas harus sudah dirender di DOM (v-show vs mounted).
  /* Retry via rAF kalau canvas belum ada (still animasi v-if spinner→grid) atau
     belum terukur (layout browser belum selesai) — max 5 frame, tanpa loop abadi. */
  if (!canvasKehadiran.value || !canvasLembur.value || !canvasTerlambat.value || !canvasTotalLembur.value) {
    if (renderChartsCoba < 5) {
      renderChartsCoba++;
      requestAnimationFrame(renderCharts);
      return;
    }
    return; // sungguh tidak ada canvas → jangan buat chart
  }
  /* Guard ukuran nyata: nextTick Vue tidak menjamin browser selesai layout —
     canvas bisa masih 0×0 saat grid baru muncul; Chart yang dibuat saat itu
     menggambar kosong. Tunggu 1 frame per frame sampai terukur (max ~5x). */
  if (canvasKehadiran.value!.clientWidth === 0 || canvasKehadiran.value!.clientHeight === 0) {
    if (renderChartsCoba < 5) {
      renderChartsCoba++;
      requestAnimationFrame(renderCharts);
      return;
    }
  }
  renderChartsCoba = 0;
  const kehadiran = deptArray.value.map((d) => Number(d.kehadiran.toFixed(1)));
  instances.kehadiran = new Chart(canvasKehadiran.value!, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Kehadiran (%)",
        data: kehadiran,
        backgroundColor: kehadiran.map((v) => (v >= 90 ? "rgba(46,204,113,.7)" : v >= 75 ? "rgba(243,156,18,.7)" : "rgba(231,76,60,.7)")),
        borderColor: "#2c3e50",
        borderWidth: 1,
      }],
    },
    options: { ...chartOpsDasar, scales: { y: { beginAtZero: true, max: 100, ticks: { callback: (v: number) => v + "%" } } } },
  });
  instances.lembur = new Chart(canvasLembur.value!, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Rata-rata Lembur (jam)",
        data: deptArray.value.map((d) => Number(d.avgLembur.toFixed(1))),
        backgroundColor: "rgba(52,152,219,.7)",
        borderColor: "#3498db",
        borderWidth: 1,
      }],
    },
    options: { ...chartOpsDasar, scales: { y: { beginAtZero: true, ticks: { callback: (v: number) => v + " jam" } } } },
  });
  instances.terlambatDept = new Chart(canvasTerlambat.value!, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Keterlambatan (%)",
        data: deptArray.value.map((d) => Number(d.pctTerlambat.toFixed(1))),
        backgroundColor: "rgba(231,76,60,.6)",
        borderColor: "#e74c3c",
        borderWidth: 1,
      }],
    },
    options: { ...chartOpsDasar, scales: { y: { beginAtZero: true, ticks: { callback: (v: number) => v + "%" } } } },
  });
  instances.totalLembur = new Chart(canvasTotalLembur.value!, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Total Lembur (jam)",
        data: deptArray.value.map((d) => Number(d.totalLembur.toFixed(1))),
        backgroundColor: "rgba(155,89,182,.7)",
        borderColor: "#9b59b6",
        borderWidth: 1,
      }],
    },
    options: { ...chartOpsDasar, scales: { y: { beginAtZero: true, ticks: { callback: (v: number) => v + " jam" } } } },
  });
}

/* ── Tab ── */
const tabAktif = ref<"departemen" | "pelanggaran">("departemen");
function setTab(t: "departemen" | "pelanggaran") {
  tabAktif.value = t;
  // Canvas canvas dengan ukuran 0 saat tersembunyi — render ulang saat tab tampil.
  nextTick(() => {
    if (t === "departemen") renderCharts();
    else hancurkanChart();
  });
}

/* ── Ekspor PDF pelanggaran (pola master exportPelanggaranPDF — jspdf + autotable) ── */
async function exportPelanggaranPDF() {
  const data = pelanggaranList.value;
  if (data.length === 0) {
    toast.info("Tidak ada data pelanggaran untuk di-export.");
    return;
  }
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF("p", "mm", "a4");
  const pw = doc.internal.pageSize.getWidth();
  const bl = pabrik.value === "ALL" ? "Semua Pabrik" : pabrik.value === "STORE" ? "STORE (K*)" : pabrik.value;

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("LAPORAN PELANGGARAN KARYAWAN", pw / 2, 20, { align: "center" });
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(`Periode: ${BULAN_NAMA[bulan.value]} ${tahun.value} | Pabrik: ${bl}`, pw / 2, 28, { align: "center" });
  doc.text(`Total Pelanggaran: ${data.length} karyawan`, pw / 2, 34, { align: "center" });
  doc.setDrawColor(200);
  doc.line(20, 38, pw - 20, 38);

  autoTable(doc, {
    startY: 42,
    head: [["No", "Nik", "Nama", "Pabrik", "Dept", "Jabatan", "Tlmb/Alpha", "Detail Pelanggaran", "Rekomendasi"]],
    body: data.map((row, i) => [
      i + 1,
      row.Nik || "-",
      row.Nama || "-",
      row.Pabrik || "-",
      row.Departemen || "-",
      row.Jabatan || "-",
      `${row.Terlambat_Count || 0}x / ${row.Alpha_Count || 0}x`,
      detailPelanggaranWA(row),
      row.rekom || "-",
    ]),
    theme: "striped",
    headStyles: { fillColor: [26, 26, 46], textColor: [255, 255, 255], fontSize: 8 },
    bodyStyles: { fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 7 }, 1: { cellWidth: 16 }, 2: { cellWidth: 22 },
      3: { cellWidth: 12 }, 4: { cellWidth: 16 }, 5: { cellWidth: 16 },
      6: { cellWidth: 16 }, 7: { cellWidth: 36 }, 8: { cellWidth: 24 },
    },
    didDrawPage: (info: any) => {
      const pages = (doc.internal as any).getNumberOfPages();
      doc.setFontSize(8);
      doc.text(`Halaman ${info.pageNumber} dari ${pages}`, pw / 2, doc.internal.pageSize.getHeight() - 10, { align: "center" });
    },
  });
  doc.save(`laporan_pelanggaran_${pabrik.value}_${BULAN_NAMA[bulan.value]}_${tahun.value}.pdf`);
}

/* ── Modal WhatsApp (pola openWAModal/sendWA master) ── */
const PUNISHMENTS = ["Pembinaan", "SP 1", "SP 2", "SP 3"];
const waModal = ref(false);
const waTarget = ref<BarisRekom | null>(null);
const waPunishment = ref("Pembinaan");
const waPhone = ref("");
const waRekomAsal = ref("");

function bukaWaModal(r: BarisRekom) {
  waTarget.value = r;
  const cocok = PUNISHMENTS.find((p) => r.rekom === p || r.rekom.includes(p));
  waPunishment.value = cocok || "Pembinaan";  // fallback master
  waPhone.value = "";
  waRekomAsal.value = r.rekom;
  waModal.value = true;
}
function cetak() {
  window.print();
}
function tutupWaModal() {
  waModal.value = false;
  waTarget.value = null;
}
function kirimWa() {
  if (!waTarget.value) return;
  const phone = waPhone.value.replace(/[+\s]/g, "");
  if (!phone) { toast.warning("Silakan masukkan nomor WhatsApp tujuan!"); return; }
  let clean = phone;
  if (clean.startsWith("0")) clean = "62" + clean.substring(1);
  else if (!clean.startsWith("62")) clean = "62" + clean;

  const t = waTarget.value;
  const message = `*HR Analytics - Notifikasi Pelanggaran*

Kepada Yth. *${t.Nama}* (${t.Nik})
Departemen: ${t.Departemen || "-"}
Pabrik: ${t.Pabrik || "-"}

Berdasarkan data kehadiran periode ${BULAN_NAMA[bulan.value]} ${tahun.value}, Anda mendapatkan rekomendasi:

*${waPunishment.value}*

Detail Pelanggaran:
${detailPelanggaranWA(t)}

Mohon untuk segera melakukan perbaikan lebih baik lagi agar tidak berulang.
Terima kasih.

--
HR Departemen`;
  window.open(`https://wa.me/${clean}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  tutupWaModal();
}

/* ════════════════════ SISANYA (peringatan) ════════════════════ */

const sibuk = computed(() => analisisLoading.value || peringatanLoading.value);

const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 11) return "Selamat Pagi";
  if (h < 15) return "Selamat Siang";
  if (h < 18) return "Selamat Sore";
  return "Selamat Malam";
});
const todayLabel = computed(() => formatTanggal(todaySql()));

const userName = computed(() => authStore.user?.user_nama || authStore.user?.user_kode || "User");
/* Analisis HR & Peringatan khusus HRD & SUPER (dashboard tidak punya frm di tmenu). */
const bolehAnalisis = computed(() => ["hrd", "super"].includes(String(authStore.user?.user_kode || "").toLowerCase()));

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
  eksekusi?: { route: string; label: string };
  columns: PanelKolom[];
  /** Jumlah baris default yang tampil sebelum "Lihat semua" (default 11). */
  barisTampil?: number;
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
    key: "mangkir_2hari",
    title: "Tidak Masuk 2 Hari Berturut-turut",
    desc: "Status 0 tanpa ijin pada 3 hari kerja terakhir",
    icon: "person_off",
    tone: "red",
    route: "/laporan/tidak-masuk",
    routeLabel: "Tidak Masuk",
    barisTampil: 5,
    columns: [
      { key: "Nik", label: "NIK" },
      { key: "Nama", label: "Nama" },
      { key: "Pabrik", label: "Pabrik" },
      { key: "Bagian", label: "Bagian" },
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
    eksekusi: { route: "/dashboard/eksekusi-pkwt", label: "Eksekusi PKWT" },
    barisTampil: 5,
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
const expanded = ref<Record<string, boolean>>({});

/* ── Autofit baris: ukur tinggi area tabel, tampilkan HANYA baris yang muat utuh ──
 * Kalau ruangnya pas 4 baris (bukan 5), yang tampil 4 — tidak ada baris terpotong. */
const wrapEls: Record<string, HTMLElement | null> = {};
const rowsShown = ref<Record<string, number>>({});

/** Autofit baris — semua ukuran DIUKUR dari DOM nyata (tanpa tebakan konstanta). */
function hitungBaris() {
  for (const key of Object.keys(wrapEls)) {
    const el = wrapEls[key];
    if (!el || !el.isConnected) continue;
    const ruang = el.clientHeight; // clientHeight memperhitungkan scrollbar horizontal
    if (ruang <= 0) continue; // card sedang tidak tampil → lewati
    const headTr = el.querySelector<HTMLElement>("thead tr");
    const barisArray = el.querySelectorAll<HTMLElement>("tbody tr");
    const pertama = barisArray[0];
    if (!headTr || !pertama) continue;
    const tinggiHead = headTr.offsetHeight;
    const tinggiBaris = pertama.offsetHeight; // sudah termasuk border-bottom
    if (tinggiBaris <= 0) continue;
    const n = Math.max(0, Math.floor((ruang - tinggiHead) / tinggiBaris));
    if (rowsShown.value[key] !== n) rowsShown.value = { ...rowsShown.value, [key]: n };
  }
}
function setWrapEl(key: string, el: unknown) {
  wrapEls[key] = (el as HTMLElement) ?? null;
}
/** Toggle "Lihat semua" — setelah card memanjang/kembali, hitung ulang baris. */
async function terbukaPanel(p: Panel) {
  expanded.value = { ...expanded.value, [p.key]: !expanded.value[p.key] };
  await nextTick();
  hitungBaris();
}

function bagian(key: keyof Peringatan): PeringatanBagian {
  return peringatan.value?.[key] ?? { total: 0, rows: [] as Record<string, any>[] };
}
function accentClass(p: Panel): string {
  return bagian(p.key).total > 0 ? `task-${p.tone}` : "task-green";
}
function chipClass(p: Panel): string {
  return bagian(p.key).total > 0 ? p.tone : "green";
}
function barisPanel(p: Panel): Record<string, any>[] {
  const rows = bagian(p.key).rows;
  /* Terbuka ("Lihat semua") → semua baris, card memanjang.
   * Default → hanya baris yang TERUKUR muat utuh (autofit); fallback nilai
   * konfigurasi `barisTampil` sebelum ukuran card terukur. */
  const tampil = expanded.value[p.key]
    ? rows.length
    : (rowsShown.value[p.key as string] ?? p.barisTampil ?? 5);
  return rows.slice(0, tampil);
}
function selTanggal(p: Panel): string {
  const t = bagian(p.key).tanggal || [];
  return t.map((d) => formatTanggalSederhana(d)).join(", ");
}
function formatTanggalSederhana(d: string): string {
  /** SQL date "yyyy-mm-dd" → tampil "dd/mm/yyyy"; nilai lain diteruskan apa adanya. */
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ""));
  if (!m) return String(d || "");
  return `${m[3]}/${m[2]}/${m[1]}`;
}
function bolehBuka(route: string): boolean {
  return permissionStore.allowedRoutes.includes(route);
}
function bukaRoute(route: string, label: string) {
  tabsStore.stageTab({ title: label, path: route, icon: "", closable: true });
  router.push(route);
}
function bukaKpi(status: KaryawanBrowseStatus) {
  karyawanBrowseStore.setStatus(status, true);
  bukaRoute("/master/karyawan", "Master Karyawan");
}
function cellText(row: Record<string, any>, col: PanelKolom): string {
  const v = row[col.key];
  if (v === null || v === undefined || v === "") return "-";
  if (col.date) return formatTanggalSederhana(v);
  return String(v);
}
const exporting = ref<Record<string, boolean>>({});
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

/** Muat analisis; refresh=1 untuk posisi-bypass cache server (tombol Terapkan). */
async function muatAnalisisUntuk(refresh: boolean) {
  try {
    const res = await safeGet<AnalisisResponse>("/dashboard/analisis-absensi", {
      params: { bulan: bulan.value, tahun: tahun.value, refresh: refresh ? "1" : undefined },
    });
    rawRows.value = res.rows;
    analisisKunci.value = `${res.bulan}:${res.tahun}:${String(pabrik.value)}`;
    analisisPeriode.value = { bulan: res.bulan, tahun: res.tahun };
  } catch (e) {
    toast.error(pickError(e));
  } finally {
    analisisLoading.value = false;
    /* Render HARUS setelah analisisLoading=false — grid (dan canvas-nya) baru
       ada di DOM saat spinner hilang (v-if analisisLoading vs template v-else).
       Render sebelum ini selalu gagal: canvas null/0x0 → bar chart kosong. */
    if (analisisTercoba.value) {
      await nextTick();
      renderCharts();
    }
  }
}

/** Muat daftar peringatan, secepat selesai langsung menampilkan panel (PKWT dkk). */
async function muatPeringatanUntuk() {
  try {
    peringatan.value = await safeGet<Peringatan>("/dashboard/peringatan");
    // Ukur dua kali: setelah DOM terpasang & sekali lagi setelah layout stabil
    // (font/scrollbar horizontal bisa menggeser tinggi area tabel).
    await nextTick();
    hitungBaris();
    requestAnimationFrame(hitungBaris);
  } catch (e) {
    toast.error(pickError(e));
  } finally {
    peringatanLoading.value = false;
  }
}

/* ── Prefetch + reveal-on-click ───────────────────────────────────────────
 *  Saat dashboard dibuka: data analisis LANGSUNG diambil di latar belakang
 *  (prefetch, tanpa mengganggu tampilan), tapi BAGIAN analisis belum tampil.
 *  HRD hanya perlu mencet "Terapkan" → jika data prefetcta sudah siap,
 *  muncul instan; jika filter diubah/klik dahulu, tampil spinner sampai data
 *  masuk. Terapkan juga tetap memaksa muat ulang jika datanya belum pas. */
async function load(refresh = false) {
  /* User selain HRD/SUPER: dashboard hanya sapaan — jangan fetch analisis/peringatan
     (server memang akan menjawab 403). */
  if (!bolehAnalisis.value) return;
  // refresh=true (pill "Muat ulang") → bypass cache server.
  if (analisisTercoba.value && refresh) {
    analisisLoading.value = true;
    rawRows.value = [];
    hancurkanChart();
    analisisPeriode.value = null;
    await muatAnalisisUntuk(true);
  } else if (!analisisLoading.value) {
    analisisLoading.value = true;
    muatAnalisisUntuk(refresh); // prefetch latar belakang, tanpa reveal
  }
  // Peringatan selalu ikut dimuat ulang.
  if (!peringatanLoading.value) {
    peringatanLoading.value = true;
    muatPeringatanUntuk();
  }
}

/** Tombol Terapkan: tampilkan analisis (dari prefetch yang sudah siap,
 *  atau tunggu/ambil yang sesuai filter aktif). */
async function onTerapkan() {
  if (analisisLoading.value) {
    analisisTercoba.value = true; // spinner block (grid v-if analisisTercoba…)
    return;
  }
  if (!analisisKunci.value || analisisKunci.value !== kunciFilter()) {
    // filter berubah / belum ada data → ambil dulu untuk filter ini
    analisisLoading.value = true;
    analisisTercoba.value = true;
    await muatAnalisisUntuk(false);
    return;
  }
  /* Data siap & filter cocok → tampil instan. */
  analisisTercoba.value = true;
  await nextTick();
  renderCharts();
}

onMounted(() => {
  load();
  document.addEventListener("click", tutupDropdown);
  document.addEventListener("keydown", tutupDropdown);
  window.addEventListener("resize", hitungBaris);
});
onUnmounted(() => {
  document.removeEventListener("click", tutupDropdown);
  document.removeEventListener("keydown", tutupDropdown);
  window.removeEventListener("resize", hitungBaris);
});
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
        <!-- Muat ulang hanya untuk HRD/SUPER (yang punya data analisis/peringatan untuk di-refresh). -->
        <div v-if="bolehAnalisis" class="info-pill clickable" :class="{ busy: sibuk }" @click="load()" title="Muat ulang">
          <MsIcon :name="sibuk ? 'progress_activity' : 'refresh'" :size="13" />
          <span>Muat ulang</span>
        </div>
      </div>
    </div>

    <!-- ══════════════ PERINGATAN — status global, tidak mengikuti filter/tabs (HRD & SUPER saja) ══════════════ -->
    <h3 v-if="bolehAnalisis" class="section-title" style="margin-top: 0">
      <MsIcon name="warning" :size="14" class="section-icon amber" />
      Peringatan
      <span class="section-note">pengganti popup saat login di program lama</span>
    </h3>
    <div v-if="bolehAnalisis && peringatanLoading" class="empty">
      <MsIcon name="progress_activity" :size="20" />
      Memuat daftar peringatan...
    </div>
    <div v-else-if="bolehAnalisis" class="alert-grid">
      <section v-for="p in panels" :key="p.key" class="task-card alert-card" :class="[accentClass(p), expanded[p.key] ? 'terbuka' : '']">
        <div class="task-top">
          <div class="task-icon-wrap" :class="chipClass(p)">
            <MsIcon :name="p.icon" :size="20" />
          </div>
          <MsIcon
            v-if="bolehBuka(p.route)"
            name="chevron_right"
            :size="14"
            class="task-arrow clickable"
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
        <div v-else class="alert-table-wrap" :ref="(el) => setWrapEl(p.key, el)">
          <table class="alert-table">
            <colgroup v-if="p.key === 'pkwt_habis'">
              <col class="pkwt-no">
              <col class="pkwt-nik">
              <col>
              <col class="pkwt-jabatan">
              <col class="pkwt-status">
              <col class="pkwt-berakhir">
            </colgroup>
            <thead>
              <tr>
                <th class="num-col">No</th>
                <th v-for="c in p.columns" :key="c.key">{{ c.label }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in barisPanel(p)" :key="`${p.key}-${i}`">
                <td class="num-col">{{ i + 1 }}</td>
                <td v-for="c in p.columns" :key="c.key" :title="cellText(row, c)">{{ cellText(row, c) }}</td>
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
            v-if="p.eksekusi"
            class="link-btn"
            :title="`Buka halaman ${p.eksekusi.label} (Kirim WA per karyawan)`"
            @click="bukaRoute(p.eksekusi.route, p.eksekusi.label)"
          >
            <MsIcon name="send" :size="13" />
            <span>Eksekusi</span>
          </button>
          <!-- Lihat semua: default terbatas `barisTampil` baris; membentangkan semua
               dengan scroll vertikal tanpa gagang scrollbar (scroll roda tetap jalan) -->
          <button
            v-if="expanded[p.key] || bagian(p.key).rows.length > (rowsShown[p.key] ?? p.barisTampil ?? 5)"
            class="link-btn"
            @click="terbukaPanel(p)"
          >
            <MsIcon :name="expanded[p.key] ? 'expand_less' : 'expand_more'" :size="14" />
            <span>{{ expanded[p.key] ? "Ringkas" : `Lihat semua ${bagian(p.key).total}` }}</span>
          </button>
        </div>
      </section>
    </div>

    <!-- ══════════════ ANALISIS HR (HRD & SUPER saja) ══════════════ -->
    <template v-if="bolehAnalisis">
    <div class="ana-header">
      <div>
        <h2 class="ana-title">Analisis HR</h2>
        <div class="ana-sub">Sistem Monitoring Kehadiran & Pelanggaran</div>
      </div>
      <div v-if="analisisTercoba && analisisPeriode" class="ana-badge">
        <MsIcon name="calendar_month" :size="13" />
        Periode: {{ BULAN_NAMA[analisisPeriode.bulan] }} {{ analisisPeriode.tahun }}
      </div>
    </div>

    <!-- Filter -->
    <div class="ana-filter">
      <MsIcon name="tune" :size="15" class="ana-filter-ico" />
      <div class="ana-dd" :class="{ open: ddBulan }">
        <button type="button" class="ana-select dd-btn" aria-label="Bulan" @click.stop="ddBulan = !ddBulan">
          <span>{{ BULAN_NAMA[bulan] }}</span>
          <MsIcon name="expand_more" :size="16" class="ana-arr" />
        </button>
        <div v-if="ddBulan" class="dd-menu">
          <button
            v-for="b in 12"
            :key="b"
            type="button"
            class="dd-opt"
            :class="{ aktif: b === bulan }"
            @click.stop="pilihBulan(b)"
          >
            <span>{{ BULAN_NAMA[b] }}</span>
            <MsIcon v-if="b === bulan" name="check" :size="14" />
          </button>
        </div>
      </div>
      <input v-model.number="tahun" type="number" min="2000" max="2100" class="ana-select ana-tahun" aria-label="Tahun" />
      <div class="ana-dd" :class="{ open: ddPabrik }">
        <button type="button" class="ana-select dd-btn" aria-label="Pabrik" @click.stop="ddPabrik = !ddPabrik">
          <span>{{ labelPabrik }}</span>
          <MsIcon name="expand_more" :size="16" class="ana-arr" />
        </button>
        <div v-if="ddPabrik" class="dd-menu">
          <button
            v-for="o in PABRIK_OPTIONS"
            :key="o.value"
            type="button"
            class="dd-opt"
            :class="{ aktif: o.value === pabrik }"
            @click.stop="pilihPabrik(o.value)"
          >
            <span>{{ o.label }}</span>
            <MsIcon v-if="o.value === pabrik" name="check" :size="14" />
          </button>
        </div>
      </div>
      <button class="ana-btn" :disabled="analisisLoading" @click="onTerapkan">
        <MsIcon :name="analisisLoading ? 'progress_activity' : 'bolt'" :size="15" />
        {{ analisisLoading ? "Memuat..." : "Terapkan" }}
      </button>
    </div>

    <!-- Statistik -->
    <div v-if="!belumMuat" class="ana-grid">
      <div class="stat-card blue">
        <div class="stat-label"><MsIcon name="group" :size="13" /> Total Karyawan</div>
        <div class="stat-value">{{ stats.total }}</div>
      </div>
      <div class="stat-card green">
        <div class="stat-label"><MsIcon name="event_available" :size="13" /> Total Hari Kerja</div>
        <div class="stat-value">{{ formatNumber(Math.round(stats.totalHari)) }} <span class="unit">hari</span></div>
      </div>
      <div class="stat-card orange">
        <div class="stat-label"><MsIcon name="schedule" :size="13" /> Total Lembur</div>
        <div class="stat-value">{{ formatNumber(Math.round(stats.totalLembur)) }} <span class="unit">jam</span></div>
      </div>
      <div class="stat-card red">
        <div class="stat-label"><MsIcon name="warning" :size="13" /> Total Terlambat</div>
        <div class="stat-value">{{ stats.totalTerlambat }} <span class="unit">surat</span></div>
      </div>
      <div class="stat-card purple">
        <div class="stat-label"><MsIcon name="block" :size="13" /> Total Alpha</div>
        <div class="stat-value">{{ stats.totalAlpha }} <span class="unit">surat</span></div>
      </div>
      <div class="stat-card teal">
        <div class="stat-label"><MsIcon name="military_tech" :size="13" /> Rata-rata Kehadiran</div>
        <div class="stat-value">{{ stats.kehadiran.toFixed(1) }} <span class="unit">%</span></div>
      </div>
      <div class="stat-card pink">
        <div class="stat-label"><MsIcon name="sick" :size="13" /> Sakit</div>
        <div class="stat-value">{{ stats.totalSakit }} <span class="unit">surat</span></div>
      </div>
      <div class="stat-card indigo">
        <div class="stat-label"><MsIcon name="description" :size="13" /> Ijin</div>
        <div class="stat-value">{{ stats.totalIjin }} <span class="unit">surat</span></div>
      </div>
      <div class="stat-card amber">
        <div class="stat-label"><MsIcon name="hourglass_bottom" :size="13" /> 1/2 Hari</div>
        <div class="stat-value">{{ stats.totalSetengah }} <span class="unit">surat</span></div>
      </div>
    </div>

    <div v-if="analisisTercoba && analisisLoading" class="ana-sheet">
      <MsIcon name="progress_activity" :size="18" class="spin" />
      Memuat analisis absensi... (± 10 detik)
    </div>
    <div v-else-if="!analisisTercoba" class="ana-sheet ana-sheet-hint">
      <MsIcon name="insights" :size="18" />
      <span>
        Analisis HR tidak dimuat otomatis agar dashboard tampil cepat —
        pilih <strong>bulan/tahun/pabrik</strong> lalu pencet <strong>Terapkan</strong>.
      </span>
    </div>
    <div v-else-if="!dataReady" class="ana-sheet">
      <MsIcon name="inbox" :size="18" />
      Tidak ada data rekap absensi untuk periode {{ BULAN_NAMA[bulan] }} {{ tahun }}{{ pabrik !== "ALL" ? ` (${pabrik})` : "" }}.
    </div>

    <template v-else>
      <!-- Tabs -->
      <div class="ana-tabs">
        <button class="ana-tab" :class="{ active: tabAktif === 'departemen' }" @click="setTab('departemen')">
          <MsIcon name="account_tree" :size="13" /> Departemen
        </button>
        <button class="ana-tab" :class="{ active: tabAktif === 'pelanggaran' }" @click="setTab('pelanggaran')">
          <MsIcon name="gavel" :size="13" /> Pelanggaran
        </button>
      </div>

      <!-- ══ TAB DEPARTEMEN ══ -->
      <section v-show="tabAktif === 'departemen'" class="ana-body">
        <div class="chart-grid">
          <div class="chart-box">
            <h3>Persentase Kehadiran per Departemen</h3>
            <div class="chart-hold"><canvas ref="canvasKehadiran"></canvas></div>
          </div>
          <div class="chart-box">
            <h3>Rata-rata Lembur per Departemen</h3>
            <div class="chart-hold"><canvas ref="canvasLembur"></canvas></div>
          </div>
          <div class="chart-box">
            <h3>Persentase Keterlambatan per Departemen</h3>
            <div class="chart-hold"><canvas ref="canvasTerlambat"></canvas></div>
          </div>
          <div class="chart-box">
            <h3>Total Lembur per Departemen</h3>
            <div class="chart-hold"><canvas ref="canvasTotalLembur"></canvas></div>
          </div>
        </div>

        <h3 class="ana-h3">
          <MsIcon name="military_tech" :size="14" /> Peringkat Departemen (Berdasarkan Kehadiran)
        </h3>
        <div class="ana-table-wrap">
          <table class="ana-table">
            <thead>
              <tr>
                <th>Peringkat</th>
                <th>Departemen</th>
                <th>Karyawan</th>
                <th>Kehadiran (%)</th>
                <th>Rata-rata Lembur</th>
                <th>Terlambat</th>
                <th>Alpha</th>
                <th>Sakit</th>
                <th>Ijin</th>
                <th>1/2 Hari</th>
                <th>Tanpa Form</th>
                <th>Ada Form</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(d, i) in deptRanking" :key="d.departemen">
                <td><strong>{{ medalName(i) }}</strong></td>
                <td><strong>{{ d.departemen }}</strong></td>
                <td>{{ d.karyawan }}</td>
                <td class="pct-cell" :style="{ color: warnaPct(d.kehadiran) }">{{ d.kehadiran.toFixed(1) }}%</td>
                <td>{{ d.avgLembur.toFixed(1) }} jam</td>
                <td>{{ d.terlambat }}</td>
                <td>{{ d.alpha }}</td>
                <td>{{ d.sakit }}</td>
                <td>{{ d.ijin }}</td>
                <td>{{ d.setengah }}</td>
                <td>{{ d.tanpaform }}</td>
                <td>{{ d.adaform }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 class="ana-h3">
          <MsIcon name="table_chart" :size="14" /> Detail Departemen
        </h3>
        <div class="ana-table-wrap">
          <table class="ana-table">
            <thead>
              <tr>
                <th>Departemen</th>
                <th>Karyawan</th>
                <th>Total Hari</th>
                <th>Bonus Libur</th>
                <th>Pembagi</th>
                <th>Absen (S+I+A)</th>
                <th>Kehadiran (%)</th>
                <th>Rata-rata Lembur</th>
                <th>Total Lembur</th>
                <th>Terlambat</th>
                <th>Alpha</th>
                <th>Sakit</th>
                <th>Ijin</th>
                <th>1/2 Hari</th>
                <th>Tanpa Form</th>
                <th>Ada Form</th>
                <th>Keterlambatan (%)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in deptArray" :key="`det-${d.departemen}`">
                <td><strong>{{ d.departemen }}</strong></td>
                <td>{{ d.karyawan }}</td>
                <td>{{ d.totalHari.toFixed(0) }}</td>
                <td>{{ d.bonusLibur.toFixed(0) }}</td>
                <td>{{ d.pembagi.toFixed(0) }}</td>
                <td>{{ d.absen.toFixed(0) }}</td>
                <td class="pct-cell" :style="{ color: warnaPct(d.kehadiran) }">{{ d.kehadiran.toFixed(1) }}%</td>
                <td>{{ d.avgLembur.toFixed(1) }} jam</td>
                <td>{{ d.totalLembur.toFixed(1) }}</td>
                <td>{{ d.terlambat }}</td>
                <td>{{ d.alpha }}</td>
                <td>{{ d.sakit }}</td>
                <td>{{ d.ijin }}</td>
                <td>{{ d.setengah }}</td>
                <td>{{ d.tanpaform }}</td>
                <td>{{ d.adaform }}</td>
                <td>{{ d.pctTerlambat.toFixed(1) }}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- ══ TAB PELANGGARAN ══ -->
      <section v-show="tabAktif === 'pelanggaran'" class="ana-body">
        <div class="ana-body-head">
          <h2 class="ana-h2"><MsIcon name="gavel" :size="15" /> Pelanggaran &amp; Rekomendasi</h2>
          <div class="ana-body-actions">
            <button class="link-btn" :disabled="pelanggaranList.length === 0" @click="exportPelanggaranPDF">
              <MsIcon name="picture_as_pdf" :size="13" /> <span>Save PDF</span>
            </button>
            <button class="link-btn" @click="cetak">
              <MsIcon name="print" :size="13" /> <span>Print</span>
            </button>
          </div>
        </div>

        <div v-if="pelanggaranList.length === 0" class="ana-aman">
          <MsIcon name="check_circle" :size="34" />
          <h3>Tidak ada pelanggaran</h3>
          <p>Semua karyawan memenuhi aturan yang berlaku</p>
        </div>
        <template v-else>
          <div class="ana-jml">
            <MsIcon name="warning" :size="15" />
            Terdapat <strong>{{ pelanggaranList.length }}</strong> karyawan dengan pelanggaran
          </div>

          <div class="plg-grid">
            <div v-for="row in pelanggaranList.slice(0, 100)" :key="`${row.Nik}-${row.Pabrik}`" class="plg-card" @click="bukaWaModal(row)">
              <div class="plg-head">
                <div>
                  <span class="plg-nama">{{ row.Nama }}</span>
                  <span class="plg-nik">({{ row.Nik }})</span>
                </div>
                <span class="plg-dept">{{ row.Departemen || "-" }}</span>
              </div>
              <div class="plg-detail">
                <span v-for="item in detailPelanggaranItems(row)" :key="item.label" class="item">
                  <span class="label">{{ item.label }}:</span>
                  <span class="plg-badge" :class="item.badge">{{ item.value }}</span>
                  <span v-if="item.detail !== '-'" class="plg-tgl"> ({{ item.detail }})</span>
                </span>
              </div>
              <div class="plg-rekom"><MsIcon name="gavel" :size="12" /> Rekomendasi: {{ row.rekom }}</div>
              <div class="plg-foot">
                <span>Total Terlambat: {{ row.Terlambat_Count }}x | Alpha: {{ row.Alpha_Count }}x</span>
                <span class="plg-wa"><MsIcon name="send" :size="11" /> Klik untuk kirim via WhatsApp</span>
              </div>
            </div>
          </div>
        </template>

        <h2 class="ana-h2" style="margin-top: 26px"><MsIcon name="military_tech" :size="15" /> Ranking Keterlambatan (Top 10)</h2>
        <div v-if="rankTerlambat.length === 0" class="ana-empty">
          <MsIcon name="check_circle" :size="16" /> Tidak ada keterlambatan
        </div>
        <div v-else class="rank-list">
          <div v-for="(r, i) in rankTerlambat" :key="r.Nik" class="rank-item" @click="bukaWaModal(r)">
            <span class="rank" :class="i < 3 ? ['gold', 'silver', 'bronze'][i] : ''">#{{ i + 1 }}</span>
            <div class="info">
              <div class="name">{{ r.Nama }}</div>
              <div class="dept">{{ r.Departemen || "-" }} · {{ r.Jabatan || "-" }}</div>
            </div>
            <span class="rank-val">{{ r.Terlambat_Count }}x</span>
          </div>
        </div>

        <h2 class="ana-h2" style="margin-top: 26px"><MsIcon name="block" :size="15" /> Ranking Alpha (Top 10)</h2>
        <div v-if="rankAlpha.length === 0" class="ana-empty">
          <MsIcon name="check_circle" :size="16" /> Tidak ada Alpha
        </div>
        <div v-else class="rank-list">
          <div v-for="(r, i) in rankAlpha" :key="r.Nik" class="rank-item" @click="bukaWaModal(r)">
            <span class="rank" :class="i < 3 ? ['gold', 'silver', 'bronze'][i] : ''">#{{ i + 1 }}</span>
            <div class="info">
              <div class="name">{{ r.Nama }}</div>
              <div class="dept">{{ r.Departemen || "-" }} · {{ r.Jabatan || "-" }}</div>
              <div v-if="r.Alpha_Text !== '-'" class="tgl-list">📅 {{ r.Alpha_Text }}</div>
            </div>
            <span class="rank-val">{{ r.Alpha_Count }}x</span>
          </div>
        </div>

        <h2 class="ana-h2" style="margin-top: 26px"><MsIcon name="event_busy" :size="15" /> Ranking Tanpa Form (Top 10)</h2>
        <div v-if="rankTanpaform.length === 0" class="ana-empty">
          <MsIcon name="check_circle" :size="16" /> Tidak ada data Tanpa Form
        </div>
        <div v-else class="rank-list">
          <div v-for="(r, i) in rankTanpaform" :key="r.Nik" class="rank-item" @click="bukaWaModal(r)">
            <span class="rank" :class="i < 3 ? ['gold', 'silver', 'bronze'][i] : ''">#{{ i + 1 }}</span>
            <div class="info">
              <div class="name">{{ r.Nama }}</div>
              <div class="dept">{{ r.Departemen || "-" }} · {{ r.Jabatan || "-" }}</div>
              <div class="tgl-list">📅 {{ r.Tanpaform_Text }}</div>
            </div>
            <span class="rank-val">{{ r.Tanpaform_Count }}x</span>
          </div>
        </div>
      </section>
    </template>
    </template>

    <!-- ══════════════ MODAL WHATSAPP ══════════════ -->
    <div v-if="waModal" class="wa-overlay" @click.self="tutupWaModal">
      <div class="wa-box">
        <button class="wa-close" @click="tutupWaModal">&times;</button>
        <h3 class="wa-title">
          <MsIcon name="send" :size="16" /> Kirim via WhatsApp
        </h3>
        <div v-if="waTarget" class="wa-info">
          <strong>{{ waTarget.Nama }}</strong> · {{ waTarget.Nik }}<br />
          {{ waTarget.Departemen || "-" }}
        </div>
        <div v-if="waTarget" class="wa-detail-box">
          <strong>Detail Pelanggaran:</strong><br />
          {{ detailPelanggaranWA(waTarget) }}
        </div>
        <template v-if="waTarget">
          <label class="wa-label" for="waPunishment">Pilih Punishment:</label>
          <select id="waPunishment" v-model="waPunishment" class="ana-select" style="width: 100%">
            <option v-for="p in PUNISHMENTS" :key="p" :value="p">{{ p }}</option>
          </select>

          <label class="wa-label" for="waPhone">Nomor WhatsApp Tujuan:</label>
          <input id="waPhone" v-model="waPhone" type="text" class="ana-select" style="width: 100%" placeholder="Contoh: 6281234567890" />
          <div class="wa-hint">*Masukkan nomor dengan kode negara (contoh: 6281234567890)</div>

          <button class="wa-send" @click="kirimWa">
            <MsIcon name="send" :size="14" /> Kirim ke WhatsApp
          </button>
          <button class="wa-batal" @click="tutupWaModal">Batal</button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
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
/* Dark mode: teks gelap default tidak terbaca di latar navy. */
:root[data-theme="dark"] .greeting-text {
  color: #eef2f7;
}
:root[data-theme="dark"] .greeting-text .name {
  color: #8fb3f5;
}
:root[data-theme="dark"] .greeting-sub {
  color: rgba(255, 255, 255, 0.6);
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

/* ── Judul seksi (peringatan/modul) ── */
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

/* ═══════════ ANALISIS HR ═══════════ */
.ana-header {
  background: linear-gradient(135deg, #1a1a2e, #16213e);
  color: #fff;
  padding: 20px 26px;
  border-radius: 16px;
  margin-bottom: 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}
.ana-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0;
}
.ana-sub {
  font-size: 12px;
  opacity: 0.8;
}
.ana-badge {
  background: rgba(255, 255, 255, 0.15);
  padding: 8px 18px;
  border-radius: 20px;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.ana-filter {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px 16px;
  margin-bottom: 18px;
}
.ana-filter-ico {
  color: #6b7280;
}
.ana-select {
  border: 1px solid #d7dce4;
  border-radius: 10px;
  padding: 8px 12px;
  font-family: inherit;
  font-size: 13px;
  color: #1a1a2e;
  background: #fff;
  outline: none;
  cursor: pointer;
}
.ana-arr {
  color: #6b7280;
}

/* ── Dropdown custom (bulan & pabrik) ── */
.ana-dd {
  position: relative;
}
.ana-dd .ana-arr {
  position: static;
  transition: transform 0.18s;
}
.ana-dd.open .ana-arr {
  transform: rotate(180deg);
}
.dd-btn {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 150px;
  cursor: pointer;
  text-align: left;
}
.dd-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 100%;
  max-height: 264px;
  overflow: auto;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 6px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.14);
  z-index: 60;
  animation: ddMasuk 0.14s ease;
}
@keyframes ddMasuk {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
.dd-opt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  font-family: inherit;
  font-size: 12.5px;
  color: #1a1a2e;
  text-align: left;
  cursor: pointer;
}
.dd-opt:hover {
  background: #f1f1f8;
}
.dd-opt.aktif {
  background: #3b5998;
  color: #fff;
  font-weight: 700;
}
.ana-select:focus {
  border-color: #3b5998;
}
.ana-tahun {
  width: 96px;
}
.ana-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #3b5998;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 9px 18px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
}
.ana-btn:hover:not(:disabled) {
  background: #2d4373;
}
.ana-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

/* Kartu statistik */
.ana-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}
.stat-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 14px 16px;
  position: relative;
  overflow: hidden;
}
.stat-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
}
.stat-card.blue::before { background: #1565c0; }
.stat-card.green::before { background: #2ecc71; }
.stat-card.orange::before { background: #ef6c00; }
.stat-card.red::before { background: #e74c3c; }
.stat-card.purple::before { background: #9b59b6; }
.stat-card.teal::before { background: #16a085; }
.stat-card.pink::before { background: #e91e63; }
.stat-card.indigo::before { background: #3f51b5; }
.stat-card.amber::before { background: #f39c12; }
.stat-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  font-weight: 700;
  color: #374151;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.stat-value {
  font-size: 26px;
  font-weight: 800;
  color: #111;
  line-height: 1.25;
  margin-top: 6px;
}
.stat-value .unit {
  font-size: 11px;
  font-weight: 700;
  color: #9ca3af;
  margin-left: 3px;
}

/* Lembar kosong/loading */
.ana-sheet {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 24px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  color: #6b7a90;
  font-size: 13px;
  margin-bottom: 24px;
}
.ana-sheet-hint {
  color: #3b5998;
  background: #f1f1f8;
  border-color: #c8c8e6;
}
.spin {
  animation: ana-spin 1s linear infinite;
}
@keyframes ana-spin {
  to { transform: rotate(360deg); }
}

/* Tab */
.ana-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 8px;
}
.ana-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center; /* teks di tengah — konsisten antar tab */
  flex: 1 1 0;             /* pembagian merata: semua tab lebar sama (dibagi 2/3) */
  gap: 6px;
  border: none;
  background: transparent;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 700;
  color: #374151;
  padding: 9px 20px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
}
.ana-tab.vertical {
  color: #374151;
}
.ana-tab :deep(svg) {
  pointer-events: none;
}
.ana-tab:hover {
  background: #f1f1f8;
  color: #3b5998;
}
.ana-tab.active {
  background: #3b5998;
  color: #fff;
}
.ana-body {
  margin-bottom: 28px;
}

/* Chart */
.chart-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 14px;
  margin-bottom: 8px;
}
.chart-box {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
}
.chart-box h3 {
  font-size: 12.5px;
  font-weight: 700;
  color: #374151;
  margin: 0 0 10px;
}
.chart-hold {
  height: 260px;
}

/* Tabel */
.ana-h2 {
  font-size: 16px;
  font-weight: 700;
  color: #1a1a2e;
  margin: 10px 0 12px;
  display: flex;
  align-items: center;
  gap: 7px;
}
.ana-h3 {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 700;
  color: #4b5563;
  margin: 22px 0 10px;
}
.ana-body-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 2px;
}
.ana-body-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 2px;
}
.ana-table-wrap,
.ana-scroll {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: auto;
}
.ana-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 12px;
}
.ana-table th {
  background: #3b5998;
  color: #fff;
  font-weight: 700;
  padding: 7px 10px;
  text-align: left;
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 1;
}
.ana-table th.sort-icon,
.ana-table .sorted {
  color: #ffd76e;
}
.ana-table th .sort-icon {
  font-size: 9px;
  opacity: 0.75;
}
.th-klik th.clickable,
.ana-table th {
  cursor: default;
}
.ana-table th.clickable {
  cursor: pointer;
}
.ana-table td {
  padding: 6px 10px;
  border-bottom: 1px solid #eef1f6;
  color: #1b2d4a;
  white-space: nowrap;
}
.ana-table tbody tr:nth-child(even) {
  background: #f6f8fb;
}
.sortable th {
  cursor: pointer;
}
.pct-cell {
  font-weight: 600;
}
.strong {
  font-weight: 600;
}
.bad {
  color: #e74c3c;
}
.warn {
  color: #f39c12;
}
.pabrik-badge {
  background: #e3f2fd;
  color: #1565c0;
  border-radius: 10px;
  padding: 2px 8px;
  font-size: 10.5px;
  font-weight: 700;
}
.ana-more {
  text-align: center;
  color: #9ca3af;
  font-style: italic;
  padding: 10px;
  font-size: 12px;
}
.sortable-head {
  cursor: pointer;
}

/* Pelanggaran */
.ana-aman {
  background: #e8f8f0;
  border-radius: 12px;
  padding: 25px;
  text-align: center;
  color: #27ae60;
  margin-bottom: 10px;
}
.ana-aman h3 {
  margin: 8px 0 4px;
  color: #27ae60;
}
.ana-aman p {
  color: #666;
  font-size: 12px;
}
.ana-jml {
  background: #fef9e7;
  border-left: 5px solid #f39c12;
  border-radius: 10px;
  padding: 12px 16px;
  font-size: 13px;
  color: #5f4b0a;
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  gap: 7px;
}
.plg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
  gap: 12px;
}
.plg-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px 16px;
  cursor: pointer;
  transition: all 0.15s;
}
.plg-card:hover {
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.1);
  transform: translateY(-1px);
}
.plg-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}
.plg-nama {
  font-weight: 700;
  color: #1a1a2e;
  font-size: 13px;
}
.plg-nik {
  color: #9ca3af;
  font-size: 11.5px;
  margin-left: 4px;
}
.plg-dept {
  background: #f1f1f8;
  color: #3b5998;
  font-size: 10.5px;
  font-weight: 700;
  border-radius: 10px;
  padding: 2px 10px;
}
.plg-detail {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin: 10px 0 8px;
  font-size: 11.5px;
  color: #374151;
}
.plg-detail .item .label {
  color: #6b7280;
}
.plg-badge {
  border-radius: 10px;
  padding: 1.5px 8px;
  font-weight: 700;
  font-size: 10.5px;
}
.plg-badge.red {
  background: #ffebee;
  color: #c62828;
}
.plg-badge.orange {
  background: #fff3e0;
  color: #ef6c00;
}
.plg-badge.blue {
  background: #f3e5f5;
  color: #6d28d9;
}
.plg-tgl {
  color: #9ca3af;
  font-size: 11px;
}
.plg-rekom {
  font-size: 11.5px;
  font-weight: 600;
  color: #1b2d4a;
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 8px;
}
.plg-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  border-top: 1px dashed #e5e7eb;
  padding-top: 8px;
  font-size: 11px;
  color: #6b7280;
}
.plg-wa {
  color: #25d366;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* Ranking */
.rank-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rank-item {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: box-shadow 0.15s;
}
.rank-item:hover {
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
}
.rank {
  font-weight: 800;
  font-size: 13px;
  color: #6b7280;
  min-width: 34px;
  text-align: center;
}
.rank.gold { color: #d4af37; }
.rank.silver { color: #9aa5b1; }
.rank.bronze { color: #b08d57; }
.rank-item .info {
  flex: 1;
  min-width: 0;
}
.rank-item .name {
  font-weight: 700;
  font-size: 12.5px;
  color: #1a1a2e;
}
.rank-item .dept {
  font-size: 11px;
  color: #9ca3af;
}
.rank-item .tgl-list {
  font-size: 10.5px;
  color: #6b7280;
}
.rank-val {
  font-weight: 800;
  font-size: 14px;
  color: #e74c3c;
}
.ana-empty {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 14px 16px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  color: #6b7a90;
  font-size: 12.5px;
}

/* Panel peringatan lama */
.task-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 14px 16px;
  position: relative;
  overflow: hidden;
}
/* TINGGI CARD DITETAPKAN DI CARD-nya — bukan berdasarkan jumlah baris.
 * 380px: muat header + note (bila ada) + header tabel + 5 baris tanpa scroll. */
.alert-card {
  height: 380px;
  display: flex;
  flex-direction: column;
}
/* Default: overflow-y DISEMBUNYIKAN — tampil seadanya yang muat, tidak bisa
 * discroll vertikal ( untuk baris selebihnya ada tombol "Lihat semua"). */
.alert-table-wrap {
  overflow-y: hidden;
}
/* "Lihat semua": card memanjang (height auto) + area table scroll vertikal. */
.alert-card.terbuka {
  height: auto;
  min-height: 380px;
  align-self: start;
}
.alert-card.terbuka .alert-table-wrap {
  overflow-y: auto;
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
.task-arrow { color: #9ca3af; }
.task-arrow.clickable { cursor: pointer; }
.task-arrow.clickable:hover { color: #3b5998; }
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
.alert-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(430px, 1fr));
  gap: 12px;
  margin-bottom: 28px;
  /* default grid stretch: semua kartu dalam 1 baris grid memiliki TINGGI SAMA */
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
/* Area tabel: MENGISI sisa tinggi card yang tetap (header/footer sudah terpakai).
 * overflow-y: diatur per-keadaan — default hidden (lihat .alert-card di atas),
 * terbuka/Lihat semua → auto. */
.alert-table-wrap {
  flex: 1 1 auto; /* mengisi badan kartu → footer tetap nempel di dasar */
  min-height: 140px;
  max-height: none;
  overflow-x: auto;
  margin: 0 -16px;
  padding: 0 16px 6px;
  border-top: 1px solid #f3f4f6;
  /* HANYA scrollbar vertikal yang disembunyikan:
   * - Chromium/Edge: ::-webkit-scrollbar width 0 (lihat bawah)
   * - Firefox: native overlay biasanya auto-hide; TIDAK dipakai scrollbar-width:none
   *   karena di Chrome itu menyembunyikan scrollbar HORIZONTAL juga. */
  box-shadow: inset 0 0 0 1px #e5e7eb; /* bingkai jelas di tepi area scroll (batas konsisten kiri/kanan) */
}
.alert-table-wrap::-webkit-scrollbar {
  width: 0; /* scrollbar VERTIKAL disembunyikan (scroll roda/trackpad tetap berfungsi) */
  height: 8px; /* scrollbar HORIZONTAL tetap ADA & terlihat */
}
.alert-table-wrap::-webkit-scrollbar-track {
  background: #f1f3f7; /* jalur scrollbar kelihatan — batas terlihat jelas */
  border-radius: 4px;
  margin: 0 2px;
}
.alert-table-wrap::-webkit-scrollbar-thumb {
  background: #b9c2d0;
  border-radius: 4px;
  border: 2px solid #f1f3f7;
}
.alert-table-wrap::-webkit-scrollbar-thumb:hover {
  background: #98a4b5;
}
/* min-width ikut konten → kolom tidak dipangkas kecil; sedangkan lebihannya tetap
 * bisa di-scroll horizontal (barangai gaya bar 6px di wrap). */
.alert-table {
  width: 100%;
  min-width: max-content;
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
  padding: 0 8px;
  height: 28px;
  line-height: 18px;
  text-align: left;
  white-space: nowrap;
  vertical-align: middle;
  z-index: 1;
}
.alert-table td {
  padding: 0 8px;   /* tinggi dikontrol height, bukan padding → emua card barisnya sama */
  height: 28px;
  line-height: 18px;
  border-bottom: 1px solid #eef1f6;
  color: #1b2d4a;
  white-space: nowrap;
  vertical-align: middle;
}
.alert-table tbody tr:nth-child(even) {
  background: #f6f8fb;
}
.alert-table .num-col {
  text-align: center;
  width: 36px;
}
.alert-table td.num-col {
  color: #6b7a90;
}
/* PKWT: tabel diberi lebar minimum supaya semua kolom terbaca penuh
 * tanpa dipangkas — lebihannya tetap DISCROLL (scrollbar horizontal ada). */
.pkwt-card .alert-table {
  table-layout: auto;
  min-width: 780px;
}
.pkwt-card .pkwt-no { width: 28px; }
.pkwt-card .pkwt-nik { width: 84px; }
.pkwt-card .pkwt-jabatan { width: 76px; }
.pkwt-card .pkwt-status { width: 54px; }
.pkwt-card .pkwt-berakhir { width: 82px; }
.pkwt-card .alert-table th,
.pkwt-card .alert-table td {
  padding-left: 6px;
  padding-right: 6px;
}
.alert-foot {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: auto -16px 0; /* selalu nempel di dasar kartu (ala card Tidak Masuk) */
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

/* Modal WA */
.wa-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}
.wa-box {
  background: #fff;
  border-radius: 14px;
  padding: 22px 24px;
  width: 420px;
  max-width: 100%;
  max-height: 90vh;
  overflow: auto;
  position: relative;
}
.wa-close {
  position: absolute;
  top: 10px;
  right: 14px;
  border: none;
  background: transparent;
  font-size: 24px;
  cursor: pointer;
  color: #9ca3af;
  line-height: 1;
}
.wa-close:hover {
  color: #374151;
}
.wa-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 15px;
  font-weight: 800;
  color: #1a1a2e;
  margin: 0 0 10px;
  color: #25d366;
}
.wa-info {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 10px;
}
.wa-detail-box {
  background: #f8fafc;
  border: 1px solid #eef1f6;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 12px;
  color: #1b2d4a;
  margin-bottom: 12px;
}
.wa-label {
  display: block;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #374151;
  margin: 10px 0 5px;
}
.wa-hint {
  font-size: 10.5px;
  color: #9ca3af;
  margin-top: 4px;
}
.wa-send {
  display: block;
  width: 100%;
  border: none;
  background: #25d366;
  color: #fff;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  padding: 11px;
  border-radius: 8px;
  cursor: pointer;
  margin-top: 14px;
}
.wa-send:hover {
  background: #1eb857;
}
.wa-batal {
  display: block;
  width: 100%;
  border: 1px solid #e5e7eb;
  background: #fff;
  color: #374151;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  padding: 10px;
  border-radius: 8px;
  cursor: pointer;
  margin-top: 8px;
}
.wa-batal:hover {
  background: #f8fafc;
}

/* ── Responsif ── */
@media (max-width: 768px) {
  .task-grid,
  .ana-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .stat-value {
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
