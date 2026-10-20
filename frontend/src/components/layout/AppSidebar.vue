<script setup lang="ts">
import { ref, watch, computed, nextTick, onMounted, onUnmounted, defineAsyncComponent } from "vue";
import { useRoute, useRouter } from "vue-router";
import MsIcon from "@/components/MsIcon.vue";
import { usePermissionStore } from "@/stores/permissionStore";
import { useTabsStore } from "@/stores/tabsStore";
import { normalizeIcon } from "@/utils/icon";
import { useTabNavigation } from "@/composables/useTabNavigation";
import { useAuthStore } from "@/stores/authStore";
import { useAgendaNotice } from "@/composables/useAgendaNotice";
import { useAgendaStartNotice } from "@/composables/useAgendaStartNotice";
import AgendaNotificationZone from "@/components/AgendaNotificationZone.vue";

const auth = useAuthStore();
const agenda = useAgendaNotice(() => auth.isAuthenticated ? `${auth.token}:${auth.user?.user_kode}` : "", () => auth.user?.user_kode || "");
const startNotices = useAgendaStartNotice(() => auth.isAuthenticated ? `${auth.token}:${auth.user?.user_kode}` : "");
const { open: agendaOpen, count: agendaCount, failure: agendaFailure, refreshKey: agendaRefreshKey, loginOngoingCount, loginAllDayCount, dismissLoginNotice } = agenda;
const AgendaCalendar = defineAsyncComponent(() => import("@/components/AgendaCalendar.vue"));

const route = useRoute();
const router = useRouter();
const permissionStore = usePermissionStore();
const tabsStore = useTabsStore();
const { closeAllTabs } = useTabNavigation();

const collapsed = ref(false);
const agendaIcon = ref<HTMLElement | null>(null);
function openAgendaFromNotice() { agendaOpen.value = true; dismissLoginNotice(); void agenda.refresh(); }
const openGroupKey = ref("");
const flyoutKey = ref("");
const flyout = ref<HTMLElement | null>(null);
const flyoutAnchor = ref<HTMLElement | null>(null);
const flyoutPosition = ref({ left: 0, top: 0, width: 260, maxHeight: 400 });
let closeTimer: ReturnType<typeof setTimeout> | undefined;

const tree = computed(() => permissionStore.menuTree);
const flyoutGroup = computed(() => collapsed.value ? tree.value.find(group => group.key === flyoutKey.value) : undefined);

function cancelClose() {
  if (closeTimer !== undefined) clearTimeout(closeTimer);
  closeTimer = undefined;
}
function closeFlyout() {
  cancelClose();
  flyoutKey.value = "";
  flyoutAnchor.value = null;
}
function scheduleClose() {
  cancelClose();
  // Allow crossing the small gap between icon and flyout without flicker.
  closeTimer = setTimeout(closeFlyout, 180);
}
function showFlyout(key: string, event: Event) {
  if (!collapsed.value) return;
  const group = tree.value.find(item => item.key === key);
  if (!group?.children?.length) return;
  cancelClose();
  const anchor = event.currentTarget as HTMLElement;
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(260, window.innerWidth - 16);
  const maxHeight = Math.max(40, window.innerHeight - 16);
  const height = Math.min(maxHeight, 44 + group.children.length * 38);
  const left = rect.right + 6 + width <= window.innerWidth - 8 ? rect.right + 6 : rect.left - width - 6;
  flyoutPosition.value = { left: Math.max(8, left), top: Math.max(8, Math.min(rect.top, window.innerHeight - height - 8)), width, maxHeight };
  flyoutAnchor.value = anchor;
  flyoutKey.value = key;
}
function groupClick(key: string, event: Event) {
  if (collapsed.value) showFlyout(key, event);
  else toggle(key);
}
async function groupKeydown(key: string, event: KeyboardEvent) {
  if (!collapsed.value || !['ArrowRight', 'ArrowDown', 'Enter'].includes(event.key)) return;
  event.preventDefault();
  showFlyout(key, event);
  await nextTick();
  flyout.value?.querySelector<HTMLButtonElement>('button')?.focus();
}
function dismissOutside(event: Event) {
  const target = event.target as Node;
  if (!flyout.value?.contains(target) && !flyoutAnchor.value?.contains(target)) closeFlyout();
}
function focusOut(event: FocusEvent) {
  const target = event.relatedTarget as Node | null;
  if (target && (flyout.value?.contains(target) || flyoutAnchor.value?.contains(target))) return;
  scheduleClose();
}
function escapeFlyout(event: KeyboardEvent) {
  if (event.key !== "Escape" || !flyoutKey.value) return;
  event.preventDefault();
  const anchor = flyoutAnchor.value;
  closeFlyout();
  // Focusing the trigger opens the flyout; close again after restoring focus.
  anchor?.focus();
  closeFlyout();
}
watch(() => [collapsed.value, route.path], closeFlyout);
watch(tree, groups => { if (!groups.some(group => group.key === flyoutKey.value && group.children?.length)) closeFlyout(); });
onMounted(() => {
  document.addEventListener("pointerdown", dismissOutside);
  document.addEventListener("keydown", escapeFlyout);
  window.addEventListener("resize", closeFlyout);
});
onUnmounted(() => {
  closeFlyout();
  document.removeEventListener("pointerdown", dismissOutside);
  document.removeEventListener("keydown", escapeFlyout);
  window.removeEventListener("resize", closeFlyout);
});

watch(
  () => [route.path, tree.value] as const,
  ([path, groups]) => {
    const activeGroup = groups.find(g => g.children?.some(c => c.route === path));
    if (activeGroup) openGroupKey.value = activeGroup.key;
    else if (!groups.some(g => g.key === openGroupKey.value)) openGroupKey.value = "";
  },
  { immediate: true }
);

function toggle(groupKey: string) {
  openGroupKey.value = openGroupKey.value === groupKey ? "" : groupKey;
}

function isGroupOpen(groupKey: string) {
  return openGroupKey.value === groupKey;
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
      <button type="button" class="menu-item dashboard-item" :class="{ active: isActive('/dashboard') }"
        :aria-current="isActive('/dashboard') ? 'page' : undefined" aria-label="Dashboard" title="Dashboard"
        @click="router.push('/dashboard')">
        <span class="menu-item-dot"><MsIcon name="dashboard" :size="17" /></span>
        <span v-if="!collapsed" class="menu-item-text">Dashboard</span>
        <span v-if="!collapsed && isActive('/dashboard')" class="menu-item-mark"></span>
      </button>
      <button class="sidebar-collapse" @click="collapsed = !collapsed">
        <MsIcon :name="collapsed ? 'chevron_right' : 'chevron_left'" :size="18" />
      </button>
    </div>

    <nav class="sidebar-nav" @scroll="closeFlyout">
      <template v-for="group in tree" :key="group.key">
        <div class="menu-group">
          <button class="menu-group-head" :class="{ 'flyout-open': collapsed && flyoutKey === group.key }"
            :aria-label="group.label" :aria-expanded="collapsed ? flyoutKey === group.key : isGroupOpen(group.key)"
            :aria-controls="collapsed && flyoutKey === group.key ? 'sidebar-flyout' : undefined"
            @click="groupClick(group.key, $event)" @mouseenter="showFlyout(group.key, $event)" @mouseleave="scheduleClose"
            @focus="showFlyout(group.key, $event)" @blur="focusOut" @keydown="groupKeydown(group.key, $event)">
            <span class="menu-group-icon">
              <MsIcon :name="normalizeIcon(group.icon)" :size="17" />
            </span>
            <span class="menu-group-text" v-if="!collapsed">{{ group.label }}</span>
            <MsIcon
              v-if="!collapsed"
              class="menu-group-chev"
              :class="{ expanded: isGroupOpen(group.key) }"
              name="expand_more"
              :size="16"
            />
          </button>
          <div class="menu-group-body" v-if="!collapsed" :class="{ expanded: isGroupOpen(group.key) }"
            :inert="!isGroupOpen(group.key)" :aria-hidden="!isGroupOpen(group.key)">
            <div class="menu-group-content">
              <div class="menu-group-items">
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
          </div>
        </div>
      </template>
      <div v-if="!permissionStore.loaded && !permissionStore.loading" class="sidebar-empty">
        <MsIcon name="refresh" :size="18" />
        <span>Menunggu menu...</span>
      </div>
    </nav>

    <div class="sidebar-foot">
      <button v-if="auth.isAuthenticated" type="button" class="foot-item agenda-menu-button" :title="agendaFailure || 'Kalender Agenda'" :aria-label="`Kalender Agenda${agendaCount ? ', ada agenda hari ini' : ''}`" @click="agendaOpen = true; agenda.refresh()">
        <span ref="agendaIcon" class="agenda-menu-icon"><MsIcon name="calendar_month" :size="16" /><i v-if="agendaCount > 0" class="agenda-notice-dot" /></span>
        <span v-if="!collapsed">Kalender Agenda</span>
      </button>
      <button class="foot-item" title="Tutup semua tab" @click="closeAllTabs">
        <MsIcon name="tab" :size="16" />
        <span v-if="!collapsed">Tutup Semua Tab</span>
      </button>
    </div>
  </aside>
  <AgendaCalendar v-if="agendaOpen && auth.isAuthenticated" :key="auth.user?.user_kode" :username="auth.user?.user_kode || ''" :refresh-key="agendaRefreshKey" @close="agendaOpen = false" @changed="agenda.refresh()" />
  <AgendaNotificationZone v-if="auth.isAuthenticated" :anchor="agendaIcon" :notices="startNotices.notices.value" :ongoing-count="loginOngoingCount" :all-day-count="loginAllDayCount"
    @dismiss="startNotices.dismiss" @pause="startNotices.pauseNotice" @resume="startNotices.resumeNotice" @dismiss-summary="dismissLoginNotice" @open-calendar="openAgendaFromNotice" />
  <Teleport to="body">
    <nav v-if="flyoutGroup" id="sidebar-flyout" ref="flyout" class="sidebar-flyout" :aria-label="`${flyoutGroup.label} — menu`"
      :style="{ left: `${flyoutPosition.left}px`, top: `${flyoutPosition.top}px`, width: `${flyoutPosition.width}px`, maxHeight: `${flyoutPosition.maxHeight}px` }"
      @mouseenter="cancelClose" @mouseleave="scheduleClose" @focusin="cancelClose" @focusout="focusOut">
      <div class="flyout-heading"><MsIcon :name="normalizeIcon(flyoutGroup.icon)" :size="17" /><span>{{ flyoutGroup.label }}</span></div>
      <button v-for="child in flyoutGroup.children" :key="child.key" type="button" class="flyout-item"
        :class="{ active: isActive(child.route) }" :aria-current="isActive(child.route) ? 'page' : undefined"
        @click="go(child.route); closeFlyout()">
        <MsIcon :name="normalizeIcon(child.icon)" :size="16" /><span>{{ child.label }}</span>
      </button>
    </nav>
  </Teleport>
</template>

<style scoped>
.agenda-menu-icon { position: relative; display: inline-flex; }
.agenda-notice-dot { position: absolute; top: -3px; right: -4px; width: 7px; height: 7px; border-radius: 50%; background: #ff4545; box-shadow: 0 0 0 2px var(--ds-sidebar-bg, #1b2d4a); }
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
  flex-shrink: 0;
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
  border-radius: 8px;
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
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 6px 0;
}
.sidebar-nav::-webkit-scrollbar {
  width: 5px;
  background: transparent;
}
.sidebar-nav::-webkit-scrollbar-track {
  background: transparent;
  margin-block: 8px;
}
.sidebar-nav::-webkit-scrollbar-thumb {
  background: rgba(76, 101, 137, 0.55);
  border-radius: 999px;
  min-height: 32px;
}
.sidebar-nav::-webkit-scrollbar-thumb:hover {
  background: rgba(76, 101, 137, 0.8);
}
.sidebar-nav::-webkit-scrollbar-button {
  display: none;
}
@supports not selector(::-webkit-scrollbar) {
  .sidebar-nav {
    scrollbar-width: thin;
    scrollbar-color: rgba(76, 101, 137, 0.55) var(--ds-sidebar-bg, #1b2d4a);
  }
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
  transition: transform 0.28s ease;
}
.menu-group-chev.expanded { transform: rotate(180deg); }
.menu-group-body {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition: grid-template-rows 0.28s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease;
}
.menu-group-body.expanded {
  grid-template-rows: 1fr;
  opacity: 1;
}
.menu-group-content {
  min-height: 0;
  overflow: hidden;
}
.menu-group-items {
  padding: 2px 8px 6px 0;
}
@media (prefers-reduced-motion: reduce) {
  .menu-group-body, .menu-group-chev, .sidebar { transition: none; }
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
.menu-group-head.flyout-open { background: rgba(255, 255, 255, 0.08); color: #fff; }
.menu-group-head:focus-visible { outline: 2px solid var(--ds-primary, #5b79b8); outline-offset: -2px; }
.sidebar-flyout { position: fixed; z-index: 1500; overflow-y: auto; box-sizing: border-box; padding: 6px; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 8px; background: var(--ds-sidebar-bg, #1b2d4a); color: rgba(255, 255, 255, 0.78); box-shadow: 0 6px 20px rgb(0 0 0 / 18%); }
.flyout-heading { display: flex; align-items: center; gap: 8px; padding: 9px 10px; margin-bottom: 4px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); font-size: 12px; font-weight: 700; color: #7fb0e8; }
.flyout-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 10px; border: none; border-left: 3px solid transparent; border-radius: 4px; background: transparent; color: rgba(255, 255, 255, 0.62); text-align: left; font: inherit; font-size: 12px; cursor: pointer; }
.flyout-item span { min-width: 0; overflow-wrap: anywhere; }
.flyout-item:hover { background: rgba(255, 255, 255, 0.06); color: #fff; }
.flyout-item.active { background: rgba(59, 89, 152, 0.35); color: #fff; border-left-color: #5b79b8; font-weight: 700; }
.flyout-item:focus-visible { outline: 2px solid #7fb0e8; outline-offset: -2px; }
.dashboard-item { flex: 1; min-width: 0; height: 100%; padding: 9px 6px; font-weight: 600; }
.dashboard-item:focus-visible { outline: 2px solid var(--ds-primary, #5b79b8); outline-offset: -2px; }
.sidebar-collapse { flex-shrink: 0; }
.sidebar.collapsed .sidebar-head { flex-direction: column; height: auto; padding: 4px 0; gap: 2px; }
.sidebar.collapsed .dashboard-item { flex: none; width: 38px; height: 32px; padding: 6px 7px; }
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
.sidebar.collapsed .foot-item {
  justify-content: center;
  gap: 0;
  padding: 8px 0;
}
.foot-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}
</style>
