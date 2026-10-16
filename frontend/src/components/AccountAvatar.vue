<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { accountAvatarNumber } from "@/config/accountAvatars";

const props = defineProps<{ username: string }>();
const number = computed(() => accountAvatarNumber(props.username));
const source = computed(() => number.value ? `${import.meta.env.BASE_URL}img/avatars/avatar-${number.value}.png` : "");
const initial = computed(() => Array.from(props.username.trim())[0]?.toUpperCase() || "?");
const failed = ref(false);
watch(() => props.username, () => { failed.value = false; });
</script>

<template>
  <span class="account-avatar" aria-hidden="true">
    <img v-if="source && !failed" :key="source" :src="source" alt="" width="30" height="30" @error="failed = true" />
    <span v-else>{{ initial }}</span>
  </span>
</template>

<style scoped>
.account-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 30px;
  width: 30px;
  height: 30px;
  overflow: hidden;
  border-radius: 50%;
  background: #4c9bd6;
  color: #fff;
  font-size: 14px;
  font-weight: 800;
}
.account-avatar img { display: block; width: 100%; height: 100%; object-fit: cover; }
</style>
