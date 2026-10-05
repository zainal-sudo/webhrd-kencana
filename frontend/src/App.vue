<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import DefaultLayout from "@/layouts/DefaultLayout.vue";
import BlankLayout from "@/layouts/BlankLayout.vue";
import { useAuthStore } from "@/stores/authStore";
import { usePermissionStore } from "@/stores/permissionStore";
import { useTabsStore } from "@/stores/tabsStore";
import MsIcon from "@/components/MsIcon.vue";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const permissionStore = usePermissionStore();
const tabsStore = useTabsStore();

const layout = computed(() => (route.meta?.layout === "BlankLayout" ? BlankLayout : DefaultLayout));

const showExpiredDialog = ref(false);

function onAuthExpired() {
  showExpiredDialog.value = true;
}

onMounted(() => {
  if (authStore.isAuthenticated && !permissionStore.loaded) {
    permissionStore.fetchAll().catch(() => undefined);
  }
  window.addEventListener("auth:expired", onAuthExpired);
});

onUnmounted(() => {
  window.removeEventListener("auth:expired", onAuthExpired);
});

const goToLogin = () => {
  showExpiredDialog.value = false;
  tabsStore.resetTabs();
  permissionStore.reset();
  authStore.logout();
  router.push("/login");
};
</script>

<template>
  <component :is="layout" />

  <v-dialog v-model="showExpiredDialog" max-width="380" persistent>
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
