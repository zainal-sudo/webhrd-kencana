<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import MsIcon from "@/components/MsIcon.vue";
import { useTabsStore } from "@/stores/tabsStore";
import { useTabNavigation } from "@/composables/useTabNavigation";

const route = useRoute();
const router = useRouter();
const tabsStore = useTabsStore();
const { closeAllTabs, closeTab } = useTabNavigation();

const draggedTabId = ref<string | null>(null);
const dropIndex = ref<number | null>(null);

function startDrag(event: DragEvent, tabId: string) {
  if (!event.dataTransfer) return;
  draggedTabId.value = tabId;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", tabId);
}

function endDrag() {
  draggedTabId.value = null;
  dropIndex.value = null;
}

function dragOver(event: DragEvent) {
  if (!draggedTabId.value) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  const strip = event.currentTarget as HTMLElement;
  const bounds = strip.getBoundingClientRect();
  if (event.clientX < bounds.left + 28) strip.scrollLeft -= 16;
  else if (event.clientX > bounds.right - 28) strip.scrollLeft += 16;
  const buttons = Array.from(strip.querySelectorAll<HTMLElement>(".tab-btn"));
  const index = buttons.findIndex((button) => {
    const rect = button.getBoundingClientRect();
    return event.clientX < rect.left + rect.width / 2;
  });
  dropIndex.value = index < 0 ? buttons.length : index;
}

function drop(event: DragEvent) {
  if (!draggedTabId.value) return;
  dragOver(event);
  const from = tabsStore.tabs.findIndex((tab) => tab.id === draggedTabId.value);
  if (from >= 0 && dropIndex.value !== null) {
    tabsStore.moveTab(draggedTabId.value, dropIndex.value - (from < dropIndex.value ? 1 : 0));
  }
  endDrag();
}

function leaveStrip(event: DragEvent) {
  const strip = event.currentTarget as HTMLElement;
  if (!(event.relatedTarget instanceof Node) || !strip.contains(event.relatedTarget)) {
    dropIndex.value = null;
  }
}

function moveWithKeyboard(event: KeyboardEvent, tabId: string) {
  if (!event.altKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  const index = tabsStore.tabs.findIndex((tab) => tab.id === tabId);
  tabsStore.moveTab(tabId, index + (event.key === "ArrowLeft" ? -1 : 1));
}

function activate(tabId: string) {
  const tab = tabsStore.tabs.find((t) => t.id === tabId);
  if (tab) {
    router.push({ path: tab.path, query: tab.query });
  }
}

function close(tabId: string) {
  void closeTab(tabId);
}

function refresh() {
  const { path, query } = route;
  router.replace({ path: "/dashboard" }).then(() => {
    router.push({ path, query });
  });
}
</script>

<template>
  <div class="tab-strip-wrap">
    <div class="tab-strip" @dragover="dragOver" @drop="drop" @dragleave="leaveStrip">
      <button
        v-for="(tab, index) in tabsStore.tabs"
        :key="tab.id"
        class="tab-btn"
        :class="{
          active: tab.id === tabsStore.activeTabId,
          dragging: tab.id === draggedTabId,
          'drop-before': dropIndex === index,
          'drop-after': dropIndex === tabsStore.tabs.length && index === tabsStore.tabs.length - 1,
        }"
        draggable="true"
        @dragstart="startDrag($event, tab.id)"
        @dragend="endDrag"
        @keydown="moveWithKeyboard($event, tab.id)"
        @click="activate(tab.id)"
        @dblclick="close(tab.id)"
        :title="`${tab.path} — Geser untuk memindahkan tab, atau Alt + panah kiri/kanan`"
      >
        <span class="tab-icon" v-if="tab.icon">
          <i :class="tab.icon"></i>
        </span>
        <span class="tab-title">{{ tab.title }}</span>
        <span
          v-if="tab.closable"
          class="tab-close"
          @click.stop="close(tab.id)"
          title="Tutup tab"
        >
          <MsIcon name="close" :size="12" />
        </span>
      </button>
    </div>
    <div class="tab-actions">
      <button class="tab-action" title="Muat ulang halaman" @click="refresh">
        <MsIcon name="refresh" :size="15" />
      </button>
      <button class="tab-action" title="Tutup tab lain" @click="tabsStore.closeOtherTabs(tabsStore.activeTabId)">
        <MsIcon name="close_fullscreen" :size="15" />
      </button>
      <button class="tab-action" title="Tutup semua tab" @click="closeAllTabs">
        <MsIcon name="tab_close" :size="15" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.tab-strip-wrap {
  height: 34px;
  display: flex;
  align-items: stretch;
  border-bottom: 1px solid var(--ds-border, #b8c0cc);
  background: var(--ds-surface, #f0f3f8);
}
.tab-strip {
  --ds-horizontal-scrollbar-size: 5px;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0 4px;
  gap: 2px;
}
.tab-strip::-webkit-scrollbar {
  height: var(--ds-horizontal-scrollbar-size, 14px);
}
.tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid #c3cad4;
  background: #e6e9ef;
  color: #3c4a60;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  user-select: none;
  border-bottom: none;
  position: relative;
  top: 1px;
}
.tab-btn[draggable="true"] {
  cursor: default;
}
.tab-btn[draggable="true"]:active {
  cursor: grabbing;
}
.tab-btn.dragging {
  opacity: 0.45;
  cursor: grabbing;
}
.tab-btn.drop-before::before,
.tab-btn.drop-after::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--ds-primary, #3b5998);
  pointer-events: none;
}
.tab-btn.drop-before::before {
  left: -2px;
}
.tab-btn.drop-after::after {
  right: -2px;
}
.tab-btn:hover {
  background: #dfe4ec;
}
.tab-btn.active {
  background: var(--ds-surface-variant, #e0e4ea);
  color: var(--ds-primary, #3b5998);
  border-color: var(--ds-primary-dark, #2c4472);
  box-shadow: inset 0 2px 0 var(--ds-primary, #3b5998);
}
.tab-icon i {
  font-size: 13px;
}
.tab-close {
  display: flex;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  color: #8494a7;
}
.tab-close:hover {
  background: rgba(59, 89, 152, 0.15);
  color: var(--ds-primary, #3b5998);
}
.tab-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 6px;
  border-left: 1px solid #c3cad4;
}
.tab-action {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #5b6b82;
  cursor: pointer;
}
.tab-action:hover {
  background: rgba(59, 89, 152, 0.12);
  color: var(--ds-primary, #3b5998);
}
</style>
