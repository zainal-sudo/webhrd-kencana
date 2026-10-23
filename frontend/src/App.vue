<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import DefaultLayout from "@/layouts/DefaultLayout.vue";
import BlankLayout from "@/layouts/BlankLayout.vue";
import PublicPenilaianLayout from "@/layouts/PublicPenilaianLayout.vue";
import { useAuthStore } from "@/stores/authStore";
import { usePermissionStore } from "@/stores/permissionStore";
import { useTabsStore } from "@/stores/tabsStore";
import MsIcon from "@/components/MsIcon.vue";
import { useThemeToggle } from "@/composables/useTheme";
import { installDraftBrowserHooks } from "@/utils/unsavedChanges";
import { useToast } from "vue-toastification";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const permissionStore = usePermissionStore();
const tabsStore = useTabsStore();
const toast = useToast();
let disposeDraftBrowserHooks: (() => void) | undefined;
// Terapkan preferensi tema sejak awal, termasuk pada layout Login.
useThemeToggle();

const layout = computed(() => route.meta?.layout === "PublicPenilaianLayout" ? PublicPenilaianLayout : route.meta?.layout === "BlankLayout" ? BlankLayout : DefaultLayout);

const showExpiredDialog = ref(false);

watch(() => authStore.token, () => { showExpiredDialog.value = false; }, { flush: "sync" });

function onAuthExpired() {
  if (!authStore.isAuthenticated || route.path === "/login" || route.meta?.publicPenilaian) return;
  showExpiredDialog.value = true;
}

onMounted(() => {
  disposeDraftBrowserHooks = installDraftBrowserHooks(message => toast.info(message));
  if (!route.meta?.publicPenilaian && authStore.isAuthenticated && !permissionStore.loaded) {
    permissionStore.fetchAll().catch(() => undefined);
  }
  window.addEventListener("auth:expired", onAuthExpired);
});

onUnmounted(() => {
  disposeDraftBrowserHooks?.();
  window.removeEventListener("auth:expired", onAuthExpired);
});

const goToLogin = () => {
  showExpiredDialog.value = false;
  authStore.logout();
  tabsStore.resetTabs();
  permissionStore.reset();
  router.replace("/login");
};
</script>

<template>
  <component :is="layout" />

  <v-dialog v-if="!route.meta.publicPenilaian" v-model="showExpiredDialog" max-width="380" persistent>
    <v-card rounded="false">
      <v-card-item>
        <template #prepend>
          <v-avatar color="warning" variant="tonal" size="42">
            <MsIcon name="lock" :size="20" />
          </v-avatar>
        </template>
        <v-card-title class="text-body-1 font-weight-bold">Sesi Berakhir</v-card-title>
      </v-card-item>
      <v-card-text class="text-body-2 pb-1">
        Token login Anda sudah <strong>expired</strong> atau tidak valid.<br />
        Silakan login kembali untuk melanjutkan.
      </v-card-text>
      <v-card-actions class="pa-4 pt-2">
        <v-spacer />
        <v-btn color="primary" variant="flat" @click="goToLogin">Login Kembali</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
