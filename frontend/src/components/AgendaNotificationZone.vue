<script setup lang="ts">
import { computed, ref, watch } from "vue";
import MsIcon from "@/components/MsIcon.vue";
import AgendaStartToast from "@/components/AgendaStartToast.vue";
import type { AgendaStartNotice } from "@/composables/useAgendaStartNotice";

const props = defineProps<{ anchor: HTMLElement | null; notices: AgendaStartNotice[]; ongoingCount: number; allDayCount: number }>();
const emit = defineEmits<{ (event: "dismiss", id: number): void; (event: "pause", id: number): void; (event: "resume", id: number): void; (event: "dismiss-summary"): void; (event: "open-calendar"): void }>();
const zone = ref<HTMLElement | null>(null);
const position = ref({ left: 8, bottom: 80, tail: 24, maxHeight: 440 });
const hasSummary = computed(() => props.ongoingCount + props.allDayCount > 0);
const limit = computed(() => position.value.maxHeight < 320 ? 1 : 2);
const visible = computed(() => props.notices.slice(0, limit.value));
const overflow = computed(() => props.notices.length - visible.value.length);
watch([() => props.anchor, zone], ([anchor, element], _previous, cleanup) => {
  if (!element) return;
  let frame = 0;
  const place = () => {
    const rect = anchor?.getBoundingClientRect();
    const anchored = !!rect && rect.top > 48 && rect.top <= window.innerHeight;
    const center = anchored ? rect.left + rect.width / 2 : 32;
    const left = Math.max(12, Math.min(center - 24, window.innerWidth - element.offsetWidth - 12));
    position.value = { left, bottom: anchored ? window.innerHeight - rect.top + 12 : 24,
      tail: Math.max(8, Math.min(center - left, element.offsetWidth - 24)),
      maxHeight: Math.max(120, Math.min(440, (anchored ? rect.top : window.innerHeight - 24) - 24)) };
  };
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place); };
  const observer = new ResizeObserver(schedule);
  observer.observe(element);
  if (anchor) { observer.observe(anchor); const sidebar = anchor.closest('.sidebar'); if (sidebar) observer.observe(sidebar); }
  window.addEventListener('resize', schedule); window.addEventListener('scroll', schedule, true);
  place();
  cleanup(() => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule, true); });
}, { flush: 'post' });
</script>

<template>
  <Teleport to="body">
    <div v-if="visible.length || hasSummary" ref="zone" class="agenda-notification-zone" aria-label="Notifikasi Kalender Agenda"
      :style="{ left: `${position.left}px`, bottom: `${position.bottom}px`, '--agenda-tail-x': `${position.tail}px`, '--agenda-zone-height': `${position.maxHeight}px` }">
      <TransitionGroup name="agenda-zone" tag="div" class="agenda-zone-stack" aria-live="polite" aria-relevant="additions" aria-atomic="false">
        <section v-for="(notice, index) in visible" :key="notice.id" class="agenda-notice-card agenda-realtime-notice"
          @mouseenter="emit('pause', notice.id)" @mouseleave="emit('resume', notice.id)" @focusin="emit('pause', notice.id)" @focusout="emit('resume', notice.id)">
          <MsIcon name="calendar_month" :size="20" />
          <div class="agenda-notice-message"><AgendaStartToast :notice="notice" />
            <button v-if="index === visible.length - 1 && overflow > 0" type="button" class="agenda-notice-more" @click="emit('open-calendar')">+{{ overflow }} agenda lainnya</button>
          </div>
          <button type="button" class="agenda-notice-close" :aria-label="`Tutup notifikasi ${notice.title}`" @click="emit('dismiss', notice.id)"><MsIcon name="close" :size="18" /></button>
        </section>
        <section v-if="hasSummary" key="summary" class="agenda-notice-card agenda-login-notice" role="status">
          <MsIcon name="calendar_month" :size="22" />
          <div class="agenda-notice-message agenda-login-message"><strong>{{ ongoingCount > 0 ? 'Agenda sedang berlangsung' : 'Agenda hari ini' }}</strong>
            <p v-if="ongoingCount > 0">Ada {{ ongoingCount }} agenda yang sedang berlangsung.</p>
            <p v-if="allDayCount > 0">Ada {{ allDayCount }} agenda seharian untuk Anda hari ini.</p>
            <button type="button" class="agenda-login-open" @click="emit('open-calendar')">Lihat agenda</button>
          </div>
          <button type="button" class="agenda-notice-close agenda-login-close" aria-label="Tutup notifikasi agenda" @click="emit('dismiss-summary')"><MsIcon name="close" :size="18" /></button>
        </section>
      </TransitionGroup>
      <svg class="agenda-zone-tail" viewBox="0 0 32 12" aria-hidden="true"><path d="M 0 0 H 32 C 19 0 18 9 8 12 C 11 7 10 2 4 0 Z" /></svg>
    </div>
  </Teleport>
</template>

<style scoped>
.agenda-notification-zone { --agenda-notice-bg: color-mix(in srgb, var(--ds-surface-raised, #fff) 88%, transparent); position: fixed; z-index: 3000; width: min(390px, calc(100vw - 24px)); box-sizing: border-box; color: var(--ds-text, #1b2d4a); font-size: 12px; }
.agenda-zone-stack { display: flex; flex-direction: column; gap: 10px; max-height: var(--agenda-zone-height); overflow-y: auto; overscroll-behavior: contain; padding: 4px; margin: -4px; scrollbar-width: thin; }
.agenda-notice-card { position: relative; flex: 0 0 auto; display: flex; align-items: flex-start; gap: 10px; padding: 14px; border: 1px solid var(--ds-border-light, #d5dce6); border-radius: 14px; background: var(--agenda-notice-bg); box-shadow: 0 4px 14px rgb(15 35 65 / 12%); }
.agenda-realtime-notice { padding: 12px 14px; border-left: 3px solid var(--ds-primary, #3b5998); }
.agenda-notice-card > .ms-icon { flex-shrink: 0; color: var(--ds-primary, #3b5998); }
.agenda-notice-message { flex: 1; min-width: 0; overflow-wrap: anywhere; }
strong { font-size: 13px; }
p { margin: 6px 0 10px; line-height: 1.5; }
.agenda-login-open { padding: 6px 10px; border: 0; border-radius: 6px; background: var(--ds-action, #3b5998); color: #fff; font: inherit; cursor: pointer; }
.agenda-notice-more { margin-top: 6px; padding: 0; border: 0; background: transparent; color: var(--ds-primary); font: inherit; font-weight: 600; cursor: pointer; }
.agenda-notice-close { display: flex; align-items: center; justify-content: center; flex: 0 0 24px; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 5px; background: transparent; color: inherit; cursor: pointer; }
.agenda-notice-close:hover { background: var(--ds-surface-inset); }
button:focus-visible { outline: 2px solid var(--ds-primary); outline-offset: 2px; }
.agenda-zone-tail { position: absolute; top: calc(100% - 1px); left: calc(var(--agenda-tail-x) - 8px); width: 32px; height: 12px; fill: var(--agenda-notice-bg); pointer-events: none; }
.agenda-zone-enter-active, .agenda-zone-leave-active, .agenda-zone-move { transition: opacity 200ms ease, transform 200ms ease; }
.agenda-zone-enter-from, .agenda-zone-leave-to { opacity: 0; transform: translateY(6px); }
.agenda-zone-leave-active { position: absolute; width: 100%; box-sizing: border-box; pointer-events: none; }
@media (max-width: 480px), (max-height: 600px) { .agenda-notice-card { padding: 10px; gap: 8px; } .agenda-zone-stack { gap: 8px; } }
@media (prefers-reduced-motion: reduce) { .agenda-zone-enter-active, .agenda-zone-leave-active, .agenda-zone-move { transition: none; } }
</style>
