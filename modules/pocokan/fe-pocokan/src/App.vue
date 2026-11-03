<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import DefaultLayout from "@/layouts/DefaultLayout.vue";
import BlankLayout from "@/layouts/BlankLayout.vue";
import { IconLock } from "@tabler/icons-vue";
import { useAuthStore } from "@/stores/authStore";
import { systemApi, type SystemInfo } from "@/api/systemApi";
import { IconDownload } from "@tabler/icons-vue";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const layout = computed(() => {
  const l = route.meta?.layout as string | undefined;
  if (l === "BlankLayout") return BlankLayout;
  return DefaultLayout;
});

// ── Session expired ───────────────────────────────────────────────────
const showExpiredDialog = ref(false);

const onAuthExpired = () => {
  console.log("auth:expired received, showing dialog");
  showExpiredDialog.value = true;
};

// ── Auto Updater ──────────────────────────────────────────────────────
const appVersion = __APP_VERSION__;
const showUpdateDialog = ref(false);
const updateInfo = ref<SystemInfo | null>(null);

const checkForUpdate = async () => {
  // Jika dialog update sudah tampil, tidak perlu cek lagi
  if (showUpdateDialog.value) return;

  try {
    const info = await systemApi.getInfo();
    // Jika versi backend berbeda dengan versi frontend yang sedang berjalan di browser
    if (info.version !== appVersion) {
      updateInfo.value = info;
      showUpdateDialog.value = true;
    }
  } catch (e) {
    /* Abaikan secara silent jika gagal (misal koneksi terputus sesaat) */
  }
};

onMounted(() => {
  // 1. Cek saat aplikasi pertama kali dimuat
  checkForUpdate();

  // 2. Cek setiap kali tab browser kembali aktif (user kembali dari tab lain)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      checkForUpdate();
    }
  });

  window.addEventListener("auth:expired", onAuthExpired);
});
onUnmounted(() => {
  window.removeEventListener("auth:expired", onAuthExpired);
});

// 3. Cek setiap kali user pindah halaman di menu navigasi
router.afterEach(() => {
  checkForUpdate();
});

const doUpdate = () => {
  // Reload halaman secara paksa agar browser mengambil file JS/CSS terbaru dari server
  window.location.reload();
};

const goToLogin = () => {
  showExpiredDialog.value = false;
  authStore.logout(); // ← hapus token + user dari store dan localStorage
  router.push("/login");
};
</script>

<template>
  <component :is="layout" />

  <!-- ── Dialog Session Expired ── -->
  <v-dialog v-model="showExpiredDialog" max-width="380" persistent>
    <v-card rounded="lg">
      <v-card-item>
        <template #prepend>
          <v-avatar color="warning" variant="tonal" size="42">
            <IconLock :size="22" :stroke-width="1.8" color="#f57c00" />
          </v-avatar>
        </template>
        <v-card-title class="text-body-1 font-weight-bold">
          Sesi Berakhir
        </v-card-title>
      </v-card-item>
      <v-card-text class="text-body-2 pb-1">
        Token login Anda sudah <strong>expired</strong> atau tidak valid.<br />
        Silakan login kembali untuk melanjutkan.
      </v-card-text>
      <v-card-actions class="pa-4 pt-2">
        <v-spacer />
        <v-btn color="primary" variant="flat" @click="goToLogin">
          Login Kembali
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="showUpdateDialog" max-width="450" persistent scrollable>
    <v-card rounded="lg">
      <v-card-item class="bg-primary text-white pa-4">
        <template #prepend>
          <v-avatar color="white" variant="flat" size="42">
            <IconDownload :size="24" :stroke-width="2" color="#3B5998" />
          </v-avatar>
        </template>
        <v-card-title class="text-body-1 font-weight-bold" style="color: white">
          Pembaruan Tersedia!
        </v-card-title>
        <v-card-subtitle style="color: rgba(255, 255, 255, 0.8)">
          Versi baru sistem keuangan telah dirilis.
        </v-card-subtitle>
      </v-card-item>

      <v-card-text class="pa-4" style="max-height: 350px">
        <div class="d-flex align-center justify-space-between mb-3">
          <span style="font-size: 13px; color: #555"
            >Versi Anda:
            <strong style="color: #c62828">v{{ appVersion }}</strong></span
          >
          <span style="font-size: 13px; color: #555"
            >Versi Baru:
            <strong style="color: #3B5998"
              >v{{ updateInfo?.version }}</strong
            ></span
          >
        </div>

        <div v-if="updateInfo?.changelog" class="update-notes">
          <div class="notes-title">Apa yang baru?</div>
          <ul class="notes-list">
            <li v-for="(log, idx) in updateInfo.changelog" :key="idx">
              {{ log }}
            </li>
          </ul>
        </div>
      </v-card-text>

      <v-card-actions class="pa-4 pt-2" style="border-top: 1px solid #eee">
        <v-spacer />
        <v-btn
          variant="text"
          color="grey-darken-1"
          @click="showUpdateDialog = false"
          >Nanti Saja</v-btn
        >

        <v-btn color="primary" variant="flat" @click="doUpdate">
          <template #prepend
            ><IconDownload :size="16" stroke-width="2"
          /></template>
          Update Sekarang
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.update-notes {
  background: #f1f1f8;
  border: 1px solid #c8c8e6;
  border-radius: 8px;
  padding: 12px 16px;
}
.notes-title {
  font-size: 12px;
  font-weight: 700;
  color: #3B5998;
  margin-bottom: 6px;
  text-transform: uppercase;
}
.notes-list {
  margin: 0;
  padding-left: 20px;
  font-size: 12px;
  color: #374151;
}
.notes-list li {
  margin-bottom: 4px;
}
</style>
