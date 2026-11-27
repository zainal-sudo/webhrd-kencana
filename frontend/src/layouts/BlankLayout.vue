<script setup lang="ts">
import { useAuthStore } from "@/stores/authStore";
</script>

<template>
  <div class="blank-layout">
    <router-view />
  </div>
</template>

<style scoped>
.blank-layout {
  min-height: 100vh;
  background: linear-gradient(145deg, #e8ecf1 0%, #d5dce6 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

/* Halaman cetak (mis. slip gaji) memakai layout ini supaya bebas dari shell
 * HRIS. Saat print, hilangkan padding/background wrapper supaya ukuran kertas
 * dan margin di @page tidak bergeser. */
@media print {
  .blank-layout {
    min-height: auto;
    padding: 0 !important;
    background: #fff !important;
    display: block;
  }
}
</style>