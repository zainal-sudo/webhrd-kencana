<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import api from "@/api/axios";
import { useToast } from "vue-toastification";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/authStore";
import { useTabsStore } from "@/stores/tabsStore";
import TabBar from "@/components/TabBar.vue";
import TabView from "@/components/TabView.vue";
import logoUrl from "@/assets/logo.png";
import {
  IconChevronDown,
  IconLogout,
  IconUser,
  IconLock,
  IconList,
  IconMenu2,
} from "@tabler/icons-vue";

const router = useRouter();
const authStore = useAuthStore();
const tabsStore = useTabsStore();
const toast = useToast();
const drawer = ref(true);
const rail = ref(false);
const isMobile = ref(false);

// ── Mode embed (iframe HRIS) ─────────────────────────────────────────────
// Kalau aplikasi ini jalan di dalam iframe HRIS (dibuka via PocokanEmbedView
// dengan deep-link ke halaman tertentu), navigasi sudah ditangani sidebar
// HRIS — jadi drawer, app bar, dan tab bar internal pocokan disembunyikan;
// yang dirender hanya konten halamannya. Kalau dibuka mandiri (dev/devtools/
// standalone), layout lengkap tetap tampil apa adanya.
const embedded = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return false; // akses ke window.top diblokir → dianggap standalone
  }
})();

// Tab siap ditampilkan (hanya relevan untuk mode standalone).
const showTabs = computed(() => tabsStore.isReady && tabsStore.tabs.length > 0);

// ── State Ganti Password ──────────────────────────────────────────────
const showPasswordDialog = ref(false);
const pwForm = ref({ oldPassword: "", newPassword: "", confirmPassword: "" });
const pwSaving = ref(false);
const pwError = ref("");

const userName = computed(() => authStore.userName);
const userCabang = computed(() => authStore.userCabang);

const openPasswordDialog = () => {
  pwForm.value = { oldPassword: "", newPassword: "", confirmPassword: "" };
  pwError.value = "";
  showPasswordDialog.value = true;
};

const submitChangePassword = async () => {
  pwError.value = "";
  if (!pwForm.value.oldPassword) {
    pwError.value = "Password lama wajib diisi.";
    return;
  }
  if (!pwForm.value.newPassword) {
    pwError.value = "Password baru wajib diisi.";
    return;
  }
  if (pwForm.value.newPassword !== pwForm.value.confirmPassword) {
    pwError.value = "Konfirmasi password tidak cocok.";
    return;
  }
  pwSaving.value = true;
  try {
    await api.post("/auth/change-password", pwForm.value);
    showPasswordDialog.value = false;
    toast.success("Password berhasil diganti.");
  } catch (e: any) {
    pwError.value = e.response?.data?.message || "Gagal mengganti password.";
  } finally {
    pwSaving.value = false;
  }
};

const logout = () => {
  authStore.logout();
  tabsStore.resetTabs();
  router.push("/login");
};

// Toggle hamburger — beda behavior mobile vs desktop
const toggleDrawer = () => {
  if (isMobile.value) {
    drawer.value = !drawer.value; // mobile: show/hide sepenuhnya
  } else {
    rail.value = !rail.value; // desktop: expand/collapse rail
  }
};

const updateBreakpoint = () => {
  const w = window.innerWidth;
  isMobile.value = w <= 768;

  // Hanya set rail berdasarkan ukuran layar
  // Jangan reset drawer.value saat resize agar tidak mengganggu user
  if (!isMobile.value) {
    rail.value = w <= 1024;
    drawer.value = true; // desktop/tablet selalu tampil
  }
};

// Init pertama kali — set semua state
const initBreakpoint = () => {
  const w = window.innerWidth;
  isMobile.value = w <= 768;
  if (isMobile.value) {
    rail.value = false;
    drawer.value = false; // mobile: mulai tertutup
  } else if (w <= 1024) {
    rail.value = true;
    drawer.value = true;
  } else {
    rail.value = false;
    drawer.value = true;
  }
};

onMounted(() => {
  initBreakpoint();
  window.addEventListener("resize", updateBreakpoint);
});

onUnmounted(() => {
  window.removeEventListener("resize", updateBreakpoint);
});

// ── Menu struktur (flat, tanpa submenu) ────────────────────────────────
// Dashboard tidak lagi di sidebar (masih bisa dibuka sebagai tab default
// saat login), grup Setting (User/Company Profile/Relogin) dihilangkan.
const menus = [
  {
    title: "Karyawan",
    icon: IconUser,
    route: "/master/karyawan",
    menuId: "4",
  },
  {
    title: "Bagian",
    icon: IconList,
    route: "/master/bagian",
    menuId: "5",
  },
  {
    title: "Unit",
    icon: IconList,
    route: "/master/unit",
    menuId: "6",
  },
  {
    title: "Hari Libur",
    icon: IconList,
    route: "/master/hari-libur",
    menuId: "7",
  },
  {
    title: "Absensi",
    icon: IconList,
    route: "/transaksi/absensi",
    menuId: "9",
  },
  {
    title: "Proses Gaji",
    icon: IconList,
    route: "/transaksi/proses-gaji",
    menuId: "10",
  },
  {
    title: "Lap. Gaji",
    icon: IconList,
    route: "/laporan/lap-gaji",
    menuId: "10",
  },
  {
    title: "Lap. Absensi",
    icon: IconList,
    route: "/laporan/lap-absensi",
    menuId: "11",
  },
];

// ── Filter Menu Berdasarkan Hak Akses ─────────────────────────────────
const filteredMenus = computed(() =>
  menus.filter((menu) => !menu.menuId || authStore.can(menu.menuId, "view"))
);
</script>

<template>
  <v-app class="finance-app" :class="{ 'finance-embed': embedded }">
    <v-navigation-drawer
      v-if="!embedded"
      v-model="drawer"
      :rail="!isMobile && rail"
      :temporary="isMobile"
      :permanent="!isMobile"
      class="finance-drawer"
      width="240"
      theme="dark"
    >
      <div class="drawer-brand" :class="{ 'rail-brand': rail }">
        <div class="brand-logo">
          <img :src="logoUrl" alt="Logo" class="img-logo" />
        </div>
        <transition name="fade">
          <div v-if="isMobile || !rail" class="brand-text">
            <div class="brand-title">POCOKAN</div>
            <div class="brand-sub">Sistem POCOKAN</div>
          </div>
        </transition>
      </div>

      <v-divider class="mx-3 mb-1" />

      <v-list density="compact" nav class="px-2">
        <v-list-item
          v-for="menu in filteredMenus"
          :key="menu.title"
          :to="menu.route"
          rounded="lg"
          class="mb-1"
          active-class="nav-active"
          :title="rail ? '' : menu.title"
        >
          <template #prepend>
            <component
              :is="menu.icon"
              :size="18"
              :stroke-width="1.8"
              class="nav-icon"
            />
          </template>
          <template #title v-if="isMobile || !rail">{{ menu.title }}</template>
        </v-list-item>
      </v-list>
    </v-navigation-drawer>

    <v-app-bar v-if="!embedded" flat class="finance-appbar" height="52">
      <v-btn variant="text" size="small" @click="toggleDrawer" class="ml-1">
        <IconMenu2 :size="20" :stroke-width="1.8" />
      </v-btn>

      <v-app-bar-title>
        <span class="appbar-title">Sistem Pocokan</span>
      </v-app-bar-title>

      <template #append>
        <v-menu>
          <template #activator="{ props }">
            <div class="appbar-user-btn" v-bind="props">
              <div class="appbar-avatar">
                {{ userName.charAt(0).toUpperCase() }}
              </div>
              <div class="appbar-info">
                <div class="appbar-name">{{ userName }}</div>
                <div class="appbar-cab">{{ userCabang }}</div>
              </div>
              <IconChevronDown :size="14" class="appbar-chevron" />
            </div>
          </template>

          <v-list density="compact" class="user-menu">
            <v-list-item @click="openPasswordDialog">
              <template #prepend>
                <IconLock
                  :size="15"
                  :stroke-width="1.8"
                  class="mr-2"
                  style="color: #3B5998"
                />
              </template>
              <v-list-item-title style="font-size: 13px"
                >Ganti Password</v-list-item-title
              >
            </v-list-item>
            <v-divider class="my-1" />
            <v-list-item @click="logout">
              <template #prepend>
                <IconLogout
                  :size="15"
                  :stroke-width="1.8"
                  class="mr-2"
                  style="color: #c62828"
                />
              </template>
              <v-list-item-title style="font-size: 13px; color: #c62828"
                >Keluar</v-list-item-title
              >
            </v-list-item>
          </v-list>
        </v-menu>
      </template>
    </v-app-bar>

    <v-main class="finance-main">
      <div class="finance-main-inner">
        <TabBar v-if="!embedded && showTabs" />
        <TabView />
      </div>
    </v-main>
  </v-app>

  <v-dialog v-model="showPasswordDialog" max-width="380" persistent>
    <v-card rounded="lg">
      <v-card-title class="pw-dialog-title">
        <IconLock :size="18" :stroke-width="1.8" color="#3B5998" />
        Ganti Password
      </v-card-title>
      <v-card-text class="pa-4 pt-2">
        <div class="pw-field">
          <label class="pw-lbl">Password Lama</label>
          <input
            v-model="pwForm.oldPassword"
            type="password"
            class="pw-inp"
            placeholder="Masukkan password lama"
            autocomplete="current-password"
          />
        </div>
        <div class="pw-field">
          <label class="pw-lbl">Password Baru</label>
          <input
            v-model="pwForm.newPassword"
            type="password"
            class="pw-inp"
            placeholder="Masukkan password baru"
            autocomplete="new-password"
          />
        </div>
        <div class="pw-field">
          <label class="pw-lbl">Ulangi Password Baru</label>
          <input
            v-model="pwForm.confirmPassword"
            type="password"
            class="pw-inp"
            placeholder="Ketik ulang password baru"
            autocomplete="new-password"
            @keydown.enter="submitChangePassword"
          />
        </div>
        <div v-if="pwError" class="pw-error">{{ pwError }}</div>
      </v-card-text>
      <v-card-actions class="pa-4 pt-0">
        <v-spacer />
        <v-btn variant="text" size="small" @click="showPasswordDialog = false"
          >Batal</v-btn
        >
        <v-btn
          color="primary"
          variant="flat"
          size="small"
          :loading="pwSaving"
          @click="submitChangePassword"
        >
          Simpan
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* Scroll hanya di konten/tabel, bukan dokumen di belakang layout. */
:global(html:has(.finance-app)) {
  overflow: hidden;
}
.finance-app :deep(.v-application__wrap) {
  height: 100vh;
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
}

/* ── Drawer ── */
.finance-drawer {
  background: #2a497c !important;
  border-right: none !important;
}

.drawer-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px 10px;
  min-height: 64px;
  transition: padding 0.2s ease;
}

.rail-brand {
  padding-left: 0 !important;
  padding-right: 0 !important;
  justify-content: center !important;
}

.brand-logo {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
.img-logo {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 4px;
}

.brand-title {
  font-size: 14px;
  font-weight: 700;
  color: white;
  letter-spacing: 0.05em;
}
.brand-sub {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.65);
}

/* Nav items */
.nav-icon {
  flex-shrink: 0;
}

/* Active state */
:deep(.nav-active) {
  background: rgba(255, 255, 255, 0.15) !important;
}

/* ── App Bar ── */
.finance-appbar {
  background: white !important;
  border-bottom: 1px solid #c8c8e6 !important;
  box-shadow: 0 1px 4px rgba(46, 46, 125, 0.1) !important;
}
.appbar-title {
  font-size: 14px;
  font-weight: 600;
  color: #3B5998;
}

/* ── Main ── */
.finance-main {
  background-color: #f1f1f8 !important;
  height: 100vh;
  height: 100dvh;
  min-height: 0;
  flex: 0 0 auto;
  overflow: hidden;
}

.finance-main-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

/* Mode embed: tanpa tab bar internal sama sekali — iframe hanya konten. */

/* Transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Sembunyikan content di drawer saat rail aktif */
.finance-drawer :deep(.v-list-item__content) {
  display: none;
}
.finance-drawer:not(.v-navigation-drawer--rail) :deep(.v-list-item__content) {
  display: flex;
}

/* ── User menu dropdown ── */
.user-menu {
  min-width: 170px !important;
}

/* ── Password dialog ── */
.pw-dialog-title {
  font-size: 14px !important;
  font-weight: 700 !important;
  border-top: 3px solid #3B5998;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 16px 12px;
}
.pw-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}
.pw-field:last-of-type {
  margin-bottom: 0;
}
.pw-lbl {
  font-size: 12px;
  font-weight: 600;
  color: #4b5563;
}
.pw-inp {
  height: 36px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 0 10px;
  font-size: 13px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}
.pw-inp:focus {
  border-color: #3B5998;
  box-shadow: 0 0 0 3px rgba(46, 46, 125, 0.1);
}
.pw-error {
  font-size: 12px;
  color: #c62828;
  font-weight: 600;
  background: #ffebee;
  border-radius: 4px;
  padding: 8px 10px;
  margin-top: 10px;
}

/* ── Appbar user button ── */
.appbar-user-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-right: 8px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 8px;
  transition: background 0.15s;
}
.appbar-user-btn:hover {
  background: rgba(46, 46, 125, 0.08);
}
.appbar-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #3B5998;
  color: white;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.appbar-info {
  display: flex;
  flex-direction: column;
}
.appbar-name {
  font-size: 13px;
  font-weight: 600;
  color: #1a1a1a;
  line-height: 1.2;
}
.appbar-cab {
  font-size: 11px;
  color: #6b7280;
}
.appbar-chevron {
  color: #9ca3af;
  margin-left: 2px;
}

.finance-drawer.v-navigation-drawer--rail :deep(.v-list-item__content) {
  display: none !important;
}
.finance-drawer:not(.v-navigation-drawer--rail) :deep(.v-list-item__content) {
  display: grid !important; /* Vuetify 3 defaultnya pakai grid, bukan flex */
  opacity: 1 !important;
  visibility: visible !important;
}

/* ── Responsif DefaultLayout ── */
.finance-embed .v-navigation-drawer,
.finance-embed .v-app-bar {
  display: none !important;
}
.finance-embed .v-main {
  padding: 0 !important;
}
@media (max-width: 768px) {
  .appbar-info,
  .appbar-chevron {
    display: none;
  }
  .appbar-user-btn {
    margin-right: 4px;
    padding: 4px;
  }
  .appbar-title {
    font-size: 13px;
  }
  .finance-drawer {
    width: 240px !important;
  }
  /* Kembalikan tampilan konten menu di mobile */
  .finance-drawer :deep(.v-list-item__content) {
    display: grid !important;
    opacity: 1 !important;
    visibility: visible !important;
  }
}
</style>
