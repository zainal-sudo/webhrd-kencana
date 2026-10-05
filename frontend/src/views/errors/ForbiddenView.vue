<script setup lang="ts">
import { useRouter, useRoute } from "vue-router";
import MsIcon from "@/components/MsIcon.vue";

const router = useRouter();
const route = useRoute();
</script>

<template>
  <div class="err-page">
    <div class="err-box">
      <span class="err-icon"><MsIcon name="block" :size="42" /></span>
      <div class="err-code">403</div>
      <div class="err-title">Akses Ditolak</div>
      <div class="err-desc">
        Anda tidak memiliki hak untuk membuka modul
        <b>{{ route.query.form || "ini" }}</b>.<br />
        Hubungi administrator bila Anda merasa ini keliru.
      </div>
      <button class="err-btn" @click="router.back()">
        <MsIcon name="arrow_back" :size="15" />
        <span>Kembali</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.err-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  width: 100%;
}
.err-box {
  width: 420px;
  max-width: 100%;
  padding: 30px;
  text-align: center;
  background: var(--ds-surface, #f0f3f8);
  border: 1px solid var(--ds-border, #b0b8c4);
}
.err-icon {
  display: inline-flex;
  color: #d97706;
}
.err-code {
  font-size: 46px;
  font-weight: 800;
  color: var(--ds-on-surface, #12324f);
  line-height: 1;
  margin-top: 8px;
}
.err-title {
  font-size: 15px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ds-primary, #1b5e9e);
}
.err-desc {
  margin: 12px 0 18px;
  font-size: 12px;
  color: #55637a;
  line-height: 1.6;
}
.err-btn {
  height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 16px;
  border: none;
  background: var(--ds-primary, #1b5e9e);
  color: #fff;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.err-btn:hover {
  background: var(--ds-primary-darken-1, #14487c);
}
</style>
