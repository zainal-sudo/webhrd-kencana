<script setup lang="ts">
import type { AgendaStartNotice } from "@/composables/useAgendaStartNotice";
defineProps<{ notice: AgendaStartNotice }>();
</script>

<template>
  <div class="agenda-start-toast">
    <strong>{{ notice.kind === 'started' ? 'Agenda dimulai sekarang' : 'Agenda sedang berlangsung' }}</strong>
    <p>{{ notice.title }}</p>
    <small>{{ notice.start_time }}–{{ notice.end_time }} · {{ notice.visibility === 'shared' ? 'Bersama' : 'Pribadi' }}</small>
  </div>
</template>

<style scoped>
.agenda-start-toast { min-width: 0; line-height: 1.5; }
strong { display: block; font-size: 13px; }
p { margin: 6px 0 3px; font-size: 12px; overflow-wrap: anywhere; }
small { font-size: 11px; opacity: .9; }
</style>
