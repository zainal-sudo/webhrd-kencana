<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import MsIcon from "@/components/MsIcon.vue";
import { usePermissionStore } from "@/stores/permissionStore";
import { useTabsStore } from "@/stores/tabsStore";
import { normalizeIcon } from "@/utils/icon";

const route = useRoute();
const router = useRouter();
const permissionStore = usePermissionStore();
const tabsStore = useTabsStore();

const collapsed = ref(false);
const openGroups = ref<Record<string, boolean>>({});

const tree = computed(() => permissionStore.menuTree);

watch(
  () => [route.path, tree.value] as const,
  ([path, groups]) => {
    for (const g of groups) {
      if (g.children?.some((c) => c.route === path)) {
        openGroups.value[g.key] = true;
      }
    }
  },
  { immediate: true }
);

function toggle(groupKey: string) {
  openGroups.value[groupKey] = !openGroups.value[groupKey];
}

function isGroupOpen(groupKey: string) {
  return !!openGroups.value[groupKey];
}

function isActive(routePath?: string) {
  return route.path === routePath;
}

function go(routePath?: string) {
  if (!routePath) return;
  const child = tree.value
    .flatMap((g) => g.children || [])
    .find((c) => c.route === routePath);
  tabsStore.openTab({
    title: child?.label || "Halaman",
    path: routePath,
    icon: "mdi mdi-circle-small",
    closable: routePath !== "/dashboard",
  });
  router.push(routePath);
}
</script>

<template>
  <aside class="sidebar" :class="{ collapsed }">
    <div class="sidebar-head">
      <button class="sidebar-collapse" @click="collapsed = !collapsed">
        <MsIcon :name="collapsed ? 'chevron_right' : 'chevron_left'" :size="18" />
      </button>
    </div>

    <nav class="sidebar-nav">
      <template v-for="group in tree" :key="group.key">
        <div class="menu-group">
          <button class="menu-group-head" @click="toggle(group.key)">
            <span class="menu-group-icon">
              <MsIcon :name="normalizeIcon(group.icon)" :size="17" />
            </span>
            <span class="menu-group-text" v-if="!collapsed">{{ group.label }}</span>
            <MsIcon
              v-if="!collapsed"
              class="menu-group-chev"
              :name="isGroupOpen(group.key) ? 'expand_less' : 'expand_more'"
              :size="16"
            />
          </button>
          <div class="menu-group-body" v-if="!collapsed" v-show="isGroupOpen(group.key)">
            <button
              v-for="child in group.children"
              :key="child.key"
              class="menu-item"
              :class="{ active: isActive(child.route) }"
              @click="go(child.route)"
            >
              <span class="menu-item-dot">
                <MsIcon :name="normalizeIcon(child.icon)" :size="14" />
              </span>
              <span class="menu-item-text">{{ child.label }}</span>
              <span v-if="isActive(child.route)" class="menu-item-mark"></span>
            </button>
          </div>
        </div>
      </template>
      <div v-if="!permissionStore.loaded && !permissionStore.loading" class="sidebar-empty">
        <MsIcon name="refresh" :size="18" />
        <span>Menunggu menu...</span>
      </div>
    </nav>

    <div class="sidebar-foot">
      <button class="foot-item" title="Tutup semua tab" @click="tabsStore.closeAllTabs()">
        <MsIcon name="tab" :size="16" />
        <span v-if="!collapsed">Tutup Semua Tab</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 258px;
  min-width: 258px;
  background: var(--ds-sidebar-bg, #1b2d4a);
  display: flex;
  flex-direction: column;
  border-right: 1px solid #0f1a2e;
  overflow: hidden;
  transition: width 0.18s ease;
}
.sidebar.collapsed {
  width: 54px;
  min-width: 54px;
}
.sidebar-head {
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.sidebar-collapse {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.65);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sidebar-collapse:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}
.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 6px 0;
}
.sidebar-nav::-webkit-scrollbar {
  width: 6px;
}
.sidebar-nav::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
}
.menu-group-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
  border: none;
  border-left: 3px solid transparent;
  background: transparent;
  color: rgba(255, 255, 255, 0.78);
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  cursor: pointer;
}
.menu-group-head:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}
.menu-group-icon {
  display: flex;
  align-items: center;
  color: #7fb0e8;
}
.menu-group-text {
  flex: 1;
  text-align: left;
}
.menu-group-chev {
  color: rgba(255, 255, 255, 0.45);
}
.menu-group-body {
  padding: 2px 8px 6px 0;
}
.menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 12px 7px 26px;
  border: none;
  border-left: 3px solid transparent;
  background: transparent;
  color: rgba(255, 255, 255, 0.62);
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 12px;
  cursor: pointer;
  position: relative;
}
.menu-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}
.menu-item.active {
  background: rgba(59, 89, 152, 0.35);
  color: #fff;
  border-left-color: #5b79b8;
}
.menu-item-dot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  min-width: 18px;
  overflow: hidden;
  flex-shrink: 0;
  color: #6d88ad;
}
.menu-item.active .menu-item-dot {
  color: #a8c4ec;
}
.menu-item-text {
  flex: 1;
  text-align: left;
}
.menu-item-mark {
  width: 6px;
  height: 6px;
  background: #fff;
  border-radius: 50%;
}
.sidebar-empty {
  padding: 16px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.sidebar-foot {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding: 6px 0;
}
.foot-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  font-size: 11px;
  font-family: "Plus Jakarta Sans", sans-serif;
  cursor: pointer;
}
.foot-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}
</style>
