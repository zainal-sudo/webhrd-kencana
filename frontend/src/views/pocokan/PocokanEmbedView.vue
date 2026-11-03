<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import MsIcon from "@/components/MsIcon.vue";

/**
 * Modul Pocokan (Koperasi) — frontend pocokan (Vue + Vuetify, project
 * terpisah di modules/pocokan/fe-pocokan) ditempel sebagai iframe same-origin
 * di bawah path /pocokan/ pada origin yang sama dengan HRIS (port eksternal
 * sama). FE pocokan membaca token HRIS dari localStorage (kencana_hrd_token)
 * sendiri — tidak ada token di URL, tidak ada login ganda.
 *
 * `meta.pocokanSrc` pada rute HRIS (mis. "/pocokan/master/karyawan") dipakai
 * untuk deep-link langsung ke halaman pocokan tertentu; tanpa meta itu
 * iframe membuka dashboard pocokan ("/pocokan/").
 */
const route = useRoute();

const src = computed(() => {
  const s = route.meta?.pocokanSrc;
  return typeof s === "string" && s ? s : "/pocokan/";
});

const loading = ref(true);
const onLoad = () => (loading.value = false);

/* Tinggi penuh area konten HRIS; tampilan internal pocokan (sidebar Vuetify
 * + app bar) dipertahankan utuh. */
const frameStyle = computed(() => ({ height: "100%", width: "100%" }));
</script>

<template>
  <div class="pocokan-embed">
    <div v-if="loading" class="pocokan-loading">
      <MsIcon name="progress_activity" :size="22" class="spin" />
      <span>Memuat modul Pocokan...</span>
    </div>
    <iframe :src="src" :style="frameStyle" title="Pocokan" @load="onLoad" />
  </div>
</template>

<style scoped>
.pocokan-embed {
  /* Isi penuh area konten; HRIS layout sudah menyediakan area scroll. */
  width: 100%;
  height: calc(100vh - 96px);
  display: flex;
  flex-direction: column;
}
.pocokan-embed iframe {
  flex: 1;
  border: none;
  background: transparent;
}
.pocokan-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  color: #5b6577;
  font-size: 13px;
}
.spin {
  animation: pocokan-spin 1s linear infinite;
}
@keyframes pocokan-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
