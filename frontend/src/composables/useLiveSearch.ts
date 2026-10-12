import { onActivated, onDeactivated, onUnmounted, ref, watch } from "vue";

/** Search-only debounce. Explicit Enter/Cari flushes the timer, never writes data. */
export function useLiveSearch(search: () => void | Promise<void>, options: {
  enabled?: () => boolean;
  invalidate?: () => void;
  delay?: number;
} = {}) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active = true;
  const pending = ref(false);
  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    pending.value = false;
  }
  function cancel() {
    clearTimer();
    options.invalidate?.();
  }
  function enabled() { return active && (options.enabled?.() ?? true); }
  async function run() {
    clearTimer();
    if (!enabled()) return;
    options.invalidate?.();
    await search();
  }
  function schedule() {
    cancel();
    if (!enabled()) return;
    pending.value = true;
    timer = setTimeout(() => { timer = undefined; void run(); }, options.delay ?? 350);
  }
  if (options.enabled) watch(options.enabled, (value) => { if (!value) cancel(); }, { flush: "sync" });
  onDeactivated(() => { active = false; cancel(); });
  onActivated(() => { active = true; });
  onUnmounted(() => { active = false; cancel(); });
  return { schedule, run, cancel, pending };
}
