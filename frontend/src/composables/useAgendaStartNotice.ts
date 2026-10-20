import { ref, onMounted, onUnmounted, watch } from "vue";
import { api } from "@/api/axios";
import { getAgendaClientId } from "@/utils/agendaClientId";

export interface AgendaStartNotice {
  id: number; title: string; date: string; start_time: string; end_time: string;
  visibility: "private" | "shared"; kind: "started" | "ongoing";
}

export function useAgendaStartNotice(identity: () => string) {
  const notices = ref<AgendaStartNotice[]>([]);
  const timers = new Map<number, { timer?: ReturnType<typeof setTimeout>; remaining: number; started: number }>();
  function dismiss(id: number) {
    const state = timers.get(id);
    if (state?.timer !== undefined) clearTimeout(state.timer);
    timers.delete(id);
    notices.value = notices.value.filter(notice => notice.id !== id);
  }
  function resumeNotice(id: number) {
    const state = timers.get(id);
    if (!state || state.timer !== undefined) return;
    state.started = Date.now();
    state.timer = setTimeout(() => dismiss(id), state.remaining);
  }
  function pauseNotice(id: number) {
    const state = timers.get(id);
    if (!state || state.timer === undefined) return;
    clearTimeout(state.timer); state.timer = undefined;
    state.remaining = Math.max(0, state.remaining - (Date.now() - state.started));
  }
  let interval: ReturnType<typeof setInterval> | undefined;
  let generation = 0, disposed = false, mounted = false, running = false;
  async function check(catchUp = false) {
    const who = identity(), current = generation;
    if (!mounted || disposed || !who || document.hidden || running) return;
    running = true;
    try {
      const clientId = await getAgendaClientId();
      if (disposed || current !== generation || identity() !== who) return;
      const { data } = await api.post("/agenda/notifications/claim", { client_id: clientId, catch_up: catchUp });
      if (disposed || current !== generation || identity() !== who) return;
      for (const notice of data.data as AgendaStartNotice[]) {
        if (timers.has(notice.id)) continue;
        notices.value = [notice, ...notices.value];
        timers.set(notice.id, { remaining: 15000, started: Date.now() });
        resumeNotice(notice.id);
      }
    } catch {
      // Background notification failures must not interrupt CRUD or the login reminder.
      // A missing manual migration is reported by the endpoint; retry on the next tick.
    } finally { if (current === generation) running = false; }
  }
  function reset() {
    generation++; running = false;
    if (interval !== undefined) clearInterval(interval);
    interval = undefined;
    for (const id of timers.keys()) dismiss(id);
    if (mounted && !disposed && identity()) {
      interval = setInterval(() => { void check(); }, 60000);
      void check(true);
    }
  }
  const resume = () => { if (!document.hidden) void check(true); };
  watch(identity, reset);
  onMounted(() => {
    mounted = true; reset();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
  });
  onUnmounted(() => {
    disposed = true; reset();
    document.removeEventListener("visibilitychange", resume);
    window.removeEventListener("focus", resume);
  });
  return { check, notices, dismiss, pauseNotice, resumeNotice };
}
