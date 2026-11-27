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
  /* html/body/#app HRIS pakai overflow:hidden, jadi layout ini yang harus
   * menjadi container scroll. height:100% (bukan min-height:100vh) supaya
   * konten yang lebih panjang dari viewport tetap bisa di-scroll. */
  height: 100%;
  overflow: auto;
  background: linear-gradient(145deg, #e8ecf1 0%, #d5dce6 100%);
  display: flex;
  padding: 24px;
}
/* Auto margin: konten pendek tetap terpusat, tapi bila lebih tinggi dari
 * viewport margin jadi 0 sehingga bagian atas tidak terpotong (bug scroll). */
.blank-layout > * {
  margin: auto;
}

/* Halaman cetak (mis. slip gaji) memakai layout ini supaya bebas dari shell
 * HRIS. Saat print, hilangkan padding/background wrapper supaya ukuran kertas
 * dan margin di @page tidak bergeser. */
@media print {
  .blank-layout {
    height: auto !important;
    min-height: auto;
    overflow: visible !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    display: block;
  }
}
</style>