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
</style>