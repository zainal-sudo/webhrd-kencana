import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "@/stores/authStore";
import { usePermissionStore } from "@/stores/permissionStore";

/**
 * Rute web HRD Kencana.
 *
 * `meta.form` berisi nilai `tmenu.men_nama` (mis. `frmKaryawan`) sehingga
 * penjaga rute bisa memeriksa hak akses pengguna sebelum membuka halaman —
 * meniru fungsi `cekview` pada program Delphi.
 */
const routes = [
  {
    path: "/login",
    name: "login",
    component: () => import("@/views/auth/LoginView.vue"),
    meta: { layout: "BlankLayout", requiresAuth: false, title: "Login" },
  },
  { path: "/", redirect: "/dashboard" },
  {
    path: "/dashboard",
    name: "dashboard",
    component: () => import("@/views/dashboard/DashboardView.vue"),
    meta: { requiresAuth: true, title: "Dashboard" },
  },

  /* ── Master ── */
  {
    path: "/master/karyawan",
    component: () => import("@/views/master/KaryawanView.vue"),
    meta: { requiresAuth: true, title: "Master Karyawan", form: "frmKaryawan" },
  },
  {
    path: "/master/karyawan/form",
    component: () => import("@/views/master/KaryawanForm.vue"),
    meta: { requiresAuth: true, title: "Form Karyawan", form: "frmKaryawan" },
  },
  {
    path: "/master/history-karyawan",
    component: () => import("@/views/master/HistoryKaryawanView.vue"),
    meta: { requiresAuth: true, title: "History Karyawan", form: "frmHistoryKaryawan" },
  },
  { path: "/master/jabatan", component: () => import("@/views/master/JabatanView.vue"), meta: { requiresAuth: true, title: "Master Jabatan", form: "frmJabatan" } },
  { path: "/master/jabatan/form", component: () => import("@/views/master/JabatanForm.vue"), meta: { requiresAuth: true, title: "Form Jabatan", form: "frmJabatan" } },
  { path: "/master/departemen", component: () => import("@/views/master/DepartemenView.vue"), meta: { requiresAuth: true, title: "Master Departemen", form: "frmDepartemen" } },
  { path: "/master/departemen/form", component: () => import("@/views/master/DepartemenForm.vue"), meta: { requiresAuth: true, title: "Form Departemen", form: "frmDepartemen" } },
  { path: "/master/pabrik", component: () => import("@/views/master/PabrikView.vue"), meta: { requiresAuth: true, title: "Master Pabrik", form: "frmPabrik" } },
  { path: "/master/pabrik/form", component: () => import("@/views/master/PabrikForm.vue"), meta: { requiresAuth: true, title: "Form Pabrik", form: "frmPabrik" } },
  { path: "/master/hari-libur", component: () => import("@/views/master/HariLiburView.vue"), meta: { requiresAuth: true, title: "Master Hari Libur", form: "frmHariLibur" } },
  { path: "/master/hari-libur/form", component: () => import("@/views/master/HariLiburForm.vue"), meta: { requiresAuth: true, title: "Form Hari Libur", form: "frmHariLibur" } },
  { path: "/master/jadwal", component: () => import("@/views/master/JadwalView.vue"), meta: { requiresAuth: true, title: "Jadwal", form: "frmJadwal" } },
  { path: "/master/jadwal/form", component: () => import("@/views/master/JadwalForm.vue"), meta: { requiresAuth: true, title: "Form Jadwal", form: "frmJadwal" } },
  { path: "/master/perusahaan", component: () => import("@/views/master/PerusahaanView.vue"), meta: { requiresAuth: true, title: "Identitas Perusahaan", form: "frmPerusahaan" } },

  /* ── Master tabel referensi ── */
  { path: "/master/status-karyawan", component: () => import("@/views/master/StatusKaryawanView.vue"), meta: { requiresAuth: true, title: "Status Karyawan", form: "frmKaryawan" } },
  { path: "/master/status-karyawan/form", component: () => import("@/views/master/StatusKaryawanForm.vue"), meta: { requiresAuth: true, title: "Form Status Karyawan", form: "frmKaryawan" } },
  { path: "/master/jenis-ijin", component: () => import("@/views/master/JenisIjinView.vue"), meta: { requiresAuth: true, title: "Jenis Ijin", form: "frmJenisIjin" } },
  { path: "/master/jenis-ijin/form", component: () => import("@/views/master/JenisIjinForm.vue"), meta: { requiresAuth: true, title: "Form Jenis Ijin", form: "frmJenisIjin" } },
  { path: "/master/pekerjaan", component: () => import("@/views/master/PekerjaanView.vue"), meta: { requiresAuth: true, title: "Pekerjaan", form: "frmPekerjaan" } },
  { path: "/master/pekerjaan/form", component: () => import("@/views/master/PekerjaanForm.vue"), meta: { requiresAuth: true, title: "Form Pekerjaan", form: "frmPekerjaan" } },
  { path: "/master/pendidikan", component: () => import("@/views/master/PendidikanView.vue"), meta: { requiresAuth: true, title: "Pendidikan", form: "frmPendidikan" } },
  { path: "/master/pendidikan/form", component: () => import("@/views/master/PendidikanForm.vue"), meta: { requiresAuth: true, title: "Form Pendidikan", form: "frmPendidikan" } },
  { path: "/master/keterangan-mutasi", component: () => import("@/views/master/KeteranganMutasiView.vue"), meta: { requiresAuth: true, title: "Keterangan Mutasi", form: "frmKeteranganMutasi" } },
  { path: "/master/keterangan-mutasi/form", component: () => import("@/views/master/KeteranganMutasiForm.vue"), meta: { requiresAuth: true, title: "Form Keterangan Mutasi", form: "frmKeteranganMutasi" } },

  /* ── Absensi ── */
  { path: "/absensi/browse", component: () => import("@/views/absensi/AbsensiView.vue"), meta: { requiresAuth: true, title: "Browse Absensi", form: "frmAbsensi" } },
  { path: "/absensi/form", component: () => import("@/views/absensi/AbsensiForm.vue"), meta: { requiresAuth: true, title: "Form Absensi", form: "frmAbsensi" } },
  { path: "/absensi/import", component: () => import("@/views/absensi/ImportAbsensiView.vue"), meta: { requiresAuth: true, title: "Import Absensi", form: "frmImportAbsensi" } },

  /* ── Transaksi Ijin (Tahap A: browse + dialog detail read-only) ── */
  { path: "/transaksi/ijin", component: () => import("@/views/transaksi/IjinView.vue"), meta: { requiresAuth: true, title: "Ijin", form: "frmIjin" } },

  /* ── Setting / Otorisasi ── */
  { path: "/setting/user", component: () => import("@/views/setting/UserView.vue"), meta: { requiresAuth: true, title: "Master User", form: "frmUser" } },
  { path: "/setting/user/form", component: () => import("@/views/setting/UserForm.vue"), meta: { requiresAuth: true, title: "Tambah User", form: "frmUser" } },
  { path: "/setting/user/form/:kode", component: () => import("@/views/setting/UserForm.vue"), meta: { requiresAuth: true, title: "Edit User", form: "frmUser" } },
  { path: "/setting/hak-akses", component: () => import("@/views/setting/HakAksesView.vue"), meta: { requiresAuth: true, title: "Hak Akses", form: "frmUser" } },
  { path: "/setting/menu", component: () => import("@/views/setting/MenuView.vue"), meta: { requiresAuth: true, title: "Daftar Menu", form: "frmUser" } },

  /* ── Error ── */
  { path: "/403", component: () => import("@/views/errors/ForbiddenView.vue"), meta: { requiresAuth: false, layout: "BlankLayout" } },
  { path: "/404", component: () => import("@/views/errors/NotFoundView.vue"), meta: { requiresAuth: false, layout: "BlankLayout" } },
  { path: "/:catchAll(.*)*", component: () => import("@/views/errors/NotFoundView.vue"), meta: { requiresAuth: false, layout: "BlankLayout" } },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();

  if (to.meta.requiresAuth !== false && !auth.isAuthenticated) {
    return { path: "/login", query: to.query };
  }
  if (to.path === "/login" && auth.isAuthenticated) {
    return { path: "/dashboard" };
  }

  const form = to.meta.form as string | undefined;
  if (form && auth.menus.length > 0 && !auth.can(form)) {
    return { path: "/403", query: { form } };
  }
  return true;
});

router.afterEach((to) => {
  const title = (to.meta.title as string) || "Web HRD Kencana";
  document.title = title === "Web HRD Kencana" ? title : `${title} | Web HRD Kencana`;
});

export default router;
