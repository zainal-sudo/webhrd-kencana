<template>
  <div class="tab-view">
    <router-view v-slot="{ Component, route }">
      <KeepAlive :max="10">
        <component :is="Component" :key="route.fullPath" />
      </KeepAlive>
    </router-view>
  </div>
</template>

<script setup lang="ts">
import { watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useTabsStore } from "@/stores/tabsStore";

const tabsStore = useTabsStore();
const router = useRouter();
const route = useRoute();

// Saat tab aktif berubah (klik tab / tutup tab), ikuti route-nya
watch(
  () => tabsStore.activeTabId,
  (id) => {
    const tab = tabsStore.tabs.find((t) => t.id === id);
    if (!tab) return;

    const samePath = tab.path === route.path;
    const tabQueryStr = JSON.stringify(tab.query ?? {});
    const routeQueryStr = JSON.stringify(route.query ?? {});
    if (samePath && tabQueryStr === routeQueryStr) return;

    const target =
      tab.query && Object.keys(tab.query).length > 0
        ? { path: tab.path, query: tab.query }
        : tab.path;
    router
      .push(target)
      .then((failure) => {
        // Navigasi ditolak, misalnya guard "perubahan belum disimpan" di
        // halaman yang kita tinggalkan. activeTabId sudah terlanjur diganti
        // waktu tab diklik, jadi kembalikan ke tab yang cocok dengan route
        // sekarang supaya tab aktif dan isi halaman tidak berbeda.
        // Id tab = path, jadi satu path selalu menunjuk satu tab.
        if (!failure) return;
        const current = tabsStore.tabs.find((t) => t.path === route.path);
        if (current && current.id !== id) tabsStore.setActiveTab(current.id);
      })
      .catch(() => {});
  },
  { immediate: true },
);
</script>

<style scoped>
.tab-view {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  overscroll-behavior: contain;
}
</style>
