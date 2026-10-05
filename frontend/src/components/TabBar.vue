<script setup lang="ts">
import { useRoute, useRouter } from "vue-router";
import MsIcon from "@/components/MsIcon.vue";
import { useTabsStore } from "@/stores/tabsStore";

const route = useRoute();
const router = useRouter();
const tabsStore = useTabsStore();

function activate(tabId: string) {
  tabsStore.setActiveTab(tabId);
  const tab = tabsStore.tabs.find((t) => t.id === tabId);
  if (tab) {
    router.push({ path: tab.path, query: tab.query });
  }
}

function close(tabId: string) {
  const tab = tabsStore.tabs.find((t) => t.id === tabId);
  const wasActive = tabsStore.activeTabId === tabId;
  tabsStore.closeTab(tabId);
  if (wasActive) {
    const next = tabsStore.tabs.find(
      (t) => t.id === tabsStore.activeTabId
    );
    if (next) {
      router.push({ path: next.path, query: next.query });
    } else {
      router.push("/dashboard");
    }
  }
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
    <div class="tab-strip">
      <button
        v-for="tab in tabsStore.tabs"
        :key="tab.id"
        class="tab-btn"
        :class="{ active: tab.id === tabsStore.activeTabId }"
        @click="activate(tab.id)"
        @dblclick="close(tab.id)"
        :title="tab.path"
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
      <button class="tab-action" title="Tutup semua tab" @click="tabsStore.closeAllTabs()">
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
  flex: 1;
  display: flex;
  align-items: center;
  overflow-x: auto;
  padding: 0 4px;
  gap: 2px;
}
.tab-strip::-webkit-scrollbar {
  height: 4px;
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
  border-bottom: none;
  position: relative;
  top: 1px;
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