<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useRoute } from "vue-router";
import type { PenilaianAccess, PenilaianFormType } from "@/features/penilaian/types";

const props = defineProps<{ formType: PenilaianFormType }>();
const route = useRoute();
const host = ref<HTMLElement | null>(null);
const loading = ref(true);
const ready = ref(false);
const message = ref("");
const invalidMessage = "Link penilaian sudah kedaluwarsa atau tidak valid. Silakan meminta link penilaian baru kepada HR.";
let controller: AbortController | undefined;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
let revision = 0;

function clearForm() {
  ready.value = false;
  host.value?.shadowRoot?.replaceChildren();
  clearTimeout(expiryTimer);
}

watch(() => [route.query.t, props.formType], async () => {
  const current = ++revision;
  controller?.abort();
  controller = new AbortController();
  clearForm();
  loading.value = true;
  message.value = "";
  const token = route.query.t;
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
    loading.value = false;
    message.value = invalidMessage;
    return;
  }
  try {
    // fetch khusus public: tidak memakai interceptor sesi HRIS atau mengirim Authorization.
    const response = await fetch(`/api/public/penilaian/${props.formType}/akses`, {
      method: "POST", credentials: "omit", referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }), signal: controller.signal,
    });
    if (response.status === 404 || response.status === 400) throw new Error(invalidMessage);
    if (!response.ok) throw new Error("Layanan penilaian sedang tidak tersedia. Silakan coba kembali atau hubungi HR.");
    const result = await response.json() as { success: boolean; data: PenilaianAccess };
    if (current !== revision) return;
    const expiresIn = Date.parse(result.data.expiresAt) - Date.now();
    if (!result.success || result.data.formType !== props.formType || !Number.isFinite(expiresIn) || expiresIn <= 0) throw new Error(invalidMessage);
    ready.value = true;
    await nextTick();
    const { mountLegacyForm } = await import("@/features/penilaian/mountLegacyForm");
    if (current !== revision || !host.value) return;
    await mountLegacyForm(host.value, props.formType, result.data.employee, () => current === revision);
    if (current !== revision) return;
    const scheduleExpiry = () => {
      if (current !== revision) return;
      const remaining = Date.parse(result.data.expiresAt) - Date.now();
      if (remaining <= 0) { clearForm(); message.value = invalidMessage; }
      else expiryTimer = setTimeout(scheduleExpiry, Math.min(remaining, 2147483647));
    };
    scheduleExpiry();
  } catch (error) {
    if (current !== revision) return;
    clearForm();
    message.value = error instanceof Error ? error.message : invalidMessage;
  } finally { if (current === revision) loading.value = false; }
}, { immediate: true });

onBeforeUnmount(() => { ++revision; controller?.abort(); clearForm(); });
</script>

<template>
  <main class="public-penilaian">
    <div v-if="loading" class="public-state" role="status">Memuat form penilaian...</div>
    <div v-if="message" class="public-state" role="alert"><h1>Form Penilaian PKWT</h1><p>{{ message }}</p></div>
    <div v-show="ready && !loading" ref="host" class="legacy-host"></div>
  </main>
</template>

<style scoped>
.public-penilaian { height:100%; width:100%; background:#f0f7ff; color:#1a1a2e; font-family:Inter,system-ui,sans-serif; }
.legacy-host { height:100%; width:100%; }
.public-state { max-width:560px; margin:0 auto; padding:48px 24px; text-align:center; font-size:15px; line-height:1.6; }
.public-state h1 { font-size:22px; margin-bottom:12px; }
</style>
