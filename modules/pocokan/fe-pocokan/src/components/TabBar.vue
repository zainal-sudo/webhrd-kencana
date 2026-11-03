<template>
  <div class="finance-tabbar" v-if="tabsStore.tabs.length > 0">
    <div
      class="tabs-scroll"
      ref="tabsContainerRef"
      @wheel.prevent="onWheelScroll"
    >
      <div class="tabs-list">
        <div
          v-for="tab in tabsStore.tabs"
          :key="tab.id"
          class="tab-item"
          :class="{
            active: tabsStore.activeTabId === tab.id,
            pinned: !tab.closable,
          }"
          @click="onTabClick(tab)"
          @contextmenu.prevent="onContextMenu($event, tab)"
          @mousedown.middle.prevent="closeTab(tab)"
        >
          <div class="tab-content">
            <component
              :is="tab.icon || (tab.closable ? IconFile : IconLayoutDashboard)"
              :size="14"
              :stroke-width="1.8"
              class="tab-icon"
            />
            <span class="tab-title">{{ tab.title }}</span>
            <button
              v-if="tab.closable"
              class="tab-close"
              title="Tutup tab"
              @click.stop="closeTab(tab)"
            >
              <IconX :size="11" :stroke-width="2.5" />
            </button>
          </div>
          <div
            class="tab-indicator"
            v-if="tabsStore.activeTabId === tab.id"
          />
        </div>
      </div>
    </div>

    <div class="tab-actions">
      <v-menu location="bottom end" min-width="190">
        <template #activator="{ props }">
          <button class="tab-action" v-bind="props" title="Opsi tab">
            <IconDots :size="15" :stroke-width="2.2" />
          </button>
        </template>
        <v-list density="compact">
          <v-list-item
            :disabled="!tabsStore.activeTab"
            @click="tabsStore.closeOtherTabs(tabsStore.activeTabId)"
          >
            <template #prepend><IconMinus :size="14" /></template>
            <v-list-item-title class="tab-menu-title">
              Tutup Tab Lain
            </v-list-item-title>
          </v-list-item>
          <v-list-item @click="tabsStore.closeAllTabs()">
            <template #prepend><IconCircleX :size="14" /></template>
            <v-list-item-title class="tab-menu-title">
              Tutup Semua Tab
            </v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </div>

    <!-- Context menu (klik kanan) -->
    <div
      v-if="ctxVisible"
      class="tab-context-menu"
      :style="{ left: `${ctxX}px`, top: `${ctxY}px` }"
      @click.stop
    >
      <div v-if="ctxTab?.closable" class="ctx-item" @click="ctxCloseTab">
        <IconX :size="14" />
        <span>Tutup Tab</span>
      </div>
      <div class="ctx-item" @click="ctxCloseOther">
        <IconMinus :size="14" />
        <span>Tutup Tab Lain</span>
      </div>
      <div class="ctx-item" @click="ctxCloseRight">
        <IconArrowRight :size="14" />
        <span>Tutup Tab ke Kanan</span>
      </div>
      <div class="ctx-sep" />
      <div class="ctx-item" @click="ctxCloseAll">
        <IconCircleX :size="14" />
        <span>Tutup Semua Tab</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from "vue";
import { useTabsStore, type TabItem } from "@/stores/tabsStore";
import {
  IconX,
  IconDots,
  IconMinus,
  IconArrowRight,
  IconCircleX,
  IconFile,
  IconLayoutDashboard,
} from "@tabler/icons-vue";

const tabsStore = useTabsStore();
const tabsContainerRef = ref<HTMLElement | null>(null);

// ── Context menu (klik kanan) ────────────────────────────────────────
const ctxVisible = ref(false);
const ctxX = ref(0);
const ctxY = ref(0);
const ctxTab = ref<TabItem | null>(null);
const ctxTabId = ref("");

let closeHandler: (() => void) | null = null;

const hideContextMenu = () => {
  ctxVisible.value = false;
  ctxTab.value = null;
  ctxTabId.value = "";
  detachCloseHandler();
};

const detachCloseHandler = () => {
  if (closeHandler) {
    window.removeEventListener("click", closeHandler);
    closeHandler = null;
  }
};

const attachCloseHandler = () => {
  detachCloseHandler();
  closeHandler = () => hideContextMenu();
  window.addEventListener("click", closeHandler);
};

const onContextMenu = (event: MouseEvent, tab: TabItem) => {
  tabsStore.setActiveTab(tab.id);
  ctxTab.value = tab;
  ctxTabId.value = tab.id;
  ctxX.value = Math.min(event.clientX, window.innerWidth - 220);
  ctxY.value = Math.min(event.clientY, window.innerHeight - 190);
  ctxVisible.value = true;
  attachCloseHandler();
};

const ctxCloseTab = () => {
  if (ctxTab.value) closeTab(ctxTab.value);
  hideContextMenu();
};
const ctxCloseOther = () => {
  void tabsStore.closeOtherTabs(ctxTabId.value);
  hideContextMenu();
};
const ctxCloseRight = () => {
  void tabsStore.closeTabsToRight(ctxTabId.value);
  hideContextMenu();
};
const ctxCloseAll = () => {
  void tabsStore.closeAllTabs();
  hideContextMenu();
};

// ── Tab actions ──────────────────────────────────────────────────────
const onTabClick = (tab: TabItem) => {
  tabsStore.setActiveTab(tab.id);
};

const closeTab = (tab: TabItem) => {
  if (!tab.closable) return;
  if (tab.onClose) tab.onClose();
  // Bisa sinkron (tanpa guard) atau Promise (kalau halaman mendaftarkan close
  // guard), jadi hasilnya dibuang dengan `void`.
  void tabsStore.closeTab(tab.id);
};

const onWheelScroll = (event: WheelEvent) => {
  if (ctxVisible.value) hideContextMenu();
  if (tabsContainerRef.value) {
    event.preventDefault();
    tabsContainerRef.value.scrollLeft += event.deltaY;
  }
};

// ── Scroll ke tab aktif ──────────────────────────────────────────────
const scrollToActiveTab = () => {
  nextTick(() => {
    if (!tabsContainerRef.value) return;
    const active = tabsContainerRef.value.querySelector(".tab-item.active");
    if (active) {
      active.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  });
};

watch(
  () => tabsStore.activeTabId,
  () => scrollToActiveTab(),
);

const onWindowKeydown = (e: KeyboardEvent) => {
  if (e.key === "Escape") hideContextMenu();
};

onMounted(() => {
  window.addEventListener("keydown", onWindowKeydown);
  nextTick(() => scrollToActiveTab());
});

onUnmounted(() => {
  window.removeEventListener("keydown", onWindowKeydown);
  detachCloseHandler();
});
</script>

<style scoped>
/* ===== TAB BAR — hijau tema ===== */
.finance-tabbar {
  display: flex;
  align-items: stretch;
  flex-shrink: 0;
  height: 38px;
  padding: 0 6px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-bottom: 1px solid #c8e6c9;
  position: relative;
  z-index: 20;
}

.tabs-scroll {
  flex: 1;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}
.tabs-scroll::-webkit-scrollbar {
  display: none;
}

.tabs-list {
  display: flex;
  align-items: stretch;
  height: 100%;
  gap: 2px;
}

.tab-item {
  position: relative;
  display: flex;
  align-items: center;
  height: 100%;
  padding: 0 10px;
  cursor: pointer;
  flex-shrink: 0;
  max-width: 210px;
  min-width: 96px;
  background: transparent;
  border-radius: 6px 6px 0 0;
  color: #6b7280;
  transition: background 0.15s ease;
}

.tab-content {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.tab-icon {
  color: #6b7280;
  flex-shrink: 0;
  transition: color 0.15s ease;
}

.tab-title {
  font-size: 12px;
  font-weight: 500;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.15s ease;
}

.tab-close {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.15s ease;
  margin-left: 2px;
  flex-shrink: 0;
  color: #6b7280;
}
.tab-close:hover {
  background: rgba(46, 125, 50, 0.1);
  color: #1b5e20;
}

.tab-indicator {
  position: absolute;
  bottom: 0;
  left: 12px;
  right: 12px;
  height: 2.5px;
  background: #2e7d32;
  border-radius: 2px 2px 0 0;
  animation: indicatorSlide 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.tab-item:hover {
  background: rgba(46, 125, 50, 0.06);
}
.tab-item:hover .tab-icon,
.tab-item:hover .tab-title {
  color: #1b5e20;
}
.tab-item:hover .tab-close {
  opacity: 0.8;
}

.tab-item.active {
  background: #e8f5e9;
}
.tab-item.active .tab-icon {
  color: #2e7d32;
}
.tab-item.active .tab-title {
  color: #1b5e20;
  font-weight: 600;
}
.tab-item.active .tab-close {
  opacity: 1;
}
.tab-item.pinned {
  min-width: auto;
}

@keyframes indicatorSlide {
  from {
    opacity: 0;
    transform: scaleX(0.3);
  }
  to {
    opacity: 1;
    transform: scaleX(1);
  }
}

.tab-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding-left: 4px;
}

.tab-action {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  transition: all 0.15s ease;
}
.tab-action:hover {
  background: rgba(46, 125, 50, 0.08);
  color: #2e7d32;
}

.tab-menu-title {
  font-size: 12.5px !important;
}

/* ── Context menu ── */
.tab-context-menu {
  position: fixed;
  z-index: 3000;
  min-width: 200px;
  background: #ffffff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.14);
  padding: 4px;
  animation: ctxFadeIn 0.12s ease;
}
.ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 6px;
  font-size: 12.5px;
  color: #374151;
  cursor: pointer;
  transition: all 0.12s ease;
}
.ctx-item:hover {
  background: rgba(46, 125, 50, 0.08);
  color: #1b5e20;
}
.ctx-sep {
  height: 1px;
  background: #e5e7eb;
  margin: 4px 6px;
}
@keyframes ctxFadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>