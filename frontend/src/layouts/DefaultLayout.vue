<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import MsIcon from "@/components/MsIcon.vue";
import AppSidebar from "@/components/layout/AppSidebar.vue";
import TabBar from "@/components/TabBar.vue";
import { useAuthStore } from "@/stores/authStore";
import { usePermissionStore } from "@/stores/permissionStore";
import { useTabsStore } from "@/stores/tabsStore";
import { useThemeToggle } from "@/composables/useTheme";

const router = useRouter();
const authStore = useAuthStore();
const permissionStore = usePermissionStore();
const tabsStore = useTabsStore();
const { dark, toggle } = useThemeToggle();

const now = ref(new Date());
let clockTimer: number | undefined;

onMounted(() => {
  if (!permissionStore.loaded) permissionStore.fetchAll().catch(() => undefined);
  tabsStore.initDefaultTabs();
  clockTimer = window.setInterval(() => {
    now.value = new Date();
  }, 1000);
});

onUnmounted(() => {
  if (clockTimer) window.clearInterval(clockTimer);
});

const clock = computed(() =>
  now.value.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
);
const dateStr = computed(() =>
  now.value.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
);

const username = computed(() => authStore.user?.user_kode || "");
const userName = computed(() => authStore.user?.user_nama || "");
const cabang = computed(() => authStore.user?.user_akses || "Semua Pabrik");

const userMenu = ref(false);

async function logout() {
  userMenu.value = false;
  tabsStore.resetTabs();
  permissionStore.reset();
  authStore.logout();
  router.push("/login");
}

function goHome() {
  tabsStore.openTab({
    title: "Dashboard",
    path: "/dashboard",
    icon: "dashboard",
    closable: false,
  });
  router.push("/dashboard");
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => undefined);
  } else {
    document.exitFullscreen().catch(() => undefined);
  }
}
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="topbar-left">
        <button class="brand-btn" @click="goHome">
          <span class="brand-badge">
            <MsIcon name="groups" :size="22" filled />
          </span>
          <span class="brand-text">
            <strong>WEB HRD &mdash; KENCANA</strong>
            <small>HUMAN RESOURCE DEPARTMENT</small>
          </span>
        </button>
      </div>

      <div class="topbar-right">
        <span class="clock-block">
          <span class="clock-time">{{ clock }}</span>
          <span class="clock-date">{{ dateStr }}</span>
        </span>

        <button class="icon-btn" title="Fullscreen" @click="toggleFullscreen">
          <MsIcon name="fullscreen" :size="19" />
        </button>
        <button class="icon-btn" :title="dark ? 'Mode Terang' : 'Mode Gelap'"
          :aria-label="dark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'" :aria-pressed="dark" @click="toggle">
          <MsIcon :name="dark ? 'light_mode' : 'dark_mode'" :size="19" />
        </button>

        <div class="user-menu">
          <button class="user-btn" @click="userMenu = !userMenu">
            <span class="user-avatar">{{ username.charAt(0).toUpperCase() }}</span>
            <span class="user-info">
              <strong>{{ username }}</strong>
              <small>{{ cabang }}</small>
            </span>
            <MsIcon name="expand_more" :size="16" />
          </button>
          <div v-show="userMenu" class="user-dropdown" @click.stop>
            <div class="dd-head">
              <strong>{{ userName || username }}</strong>
              <small>Kode: {{ username }} &middot; Cabang: {{ cabang }}</small>
            </div>
            <button class="dd-item" @click="logout">
              <MsIcon name="logout" :size="16" />
              <span>Keluar</span>
            </button>
          </div>
        </div>
      </div>
    </header>

    <div class="page-body">
      <AppSidebar />

      <main class="main-panel">
        <TabBar />
        <div class="content-area">
          <router-view v-slot="{ Component }">
            <keep-alive :key="tabsStore.cacheVersion" :max="10">
              <component :is="Component" :key="$route.fullPath" />
            </keep-alive>
          </router-view>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--ds-bg, #e8ecf1);
  overflow: hidden;
}
.topbar {
  height: 52px;
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  background: linear-gradient(180deg, #12324f 0%, #1b3e60 100%);
  border-bottom: 1px solid #0b2136;
  gap: 12px;
}
.topbar-left {
  flex: 0 0 auto;
}
.brand-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0;
}
.brand-badge {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #4c9bd6, #1b5e9e);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.25);
}
.brand-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.1;
  color: #fff;
}
.brand-text strong {
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.02em;
}
.brand-text small {
  font-size: 9px;
  letter-spacing: 0.18em;
  color: rgba(255, 255, 255, 0.55);
  font-weight: 600;
}
.topbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
}
.clock-block {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.15;
  margin-right: 6px;
}
.clock-time {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  font-variant-numeric: tabular-nums;
}
.clock-date {
  font-size: 9.5px;
  color: rgba(255, 255, 255, 0.55);
  text-transform: capitalize;
}
.icon-btn {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  border-radius: 0;
}
.icon-btn:hover {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
}
.user-menu {
  position: relative;
}
.user-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  cursor: pointer;
  padding: 4px 10px 4px 4px;
}
.user-btn:hover {
  background: rgba(255, 255, 255, 0.14);
}
.user-avatar {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #4c9bd6;
  color: #fff;
  font-weight: 800;
  font-size: 14px;
}
.user-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.1;
}
.user-info strong {
  font-size: 12px;
  font-weight: 700;
}
.user-info small {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.6);
}
.user-dropdown {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  min-width: 220px;
  background: var(--ds-surface, #f0f3f8);
  border: 1px solid var(--ds-border, #b0b8c4);
  box-shadow: 0 6px 18px rgba(15, 26, 46, 0.22);
  z-index: 1200;
}
.dd-head {
  display: flex;
  flex-direction: column;
  padding: 10px 14px;
  border-bottom: 1px solid var(--ds-border, #c3cad4);
}
.dd-head strong {
  font-size: 13px;
  color: var(--ds-on-surface, #12324f);
}
.dd-head small {
  font-size: 11px;
  color: #6b7a90;
}
.dd-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--ds-on-surface, #12324f);
  font-size: 12px;
  font-family: "Plus Jakarta Sans", sans-serif;
}
.dd-item:hover {
  background: rgba(27, 94, 158, 0.1);
  color: var(--ds-primary, #1b5e9e);
}
.page-body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.main-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.content-area {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px;
  background: var(--ds-bg, #e8ecf1);
}
</style>
