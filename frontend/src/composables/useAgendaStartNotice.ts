import { onMounted, onUnmounted, watch } from "vue";
import { useToast } from "vue-toastification";
import AgendaStartToast from "@/components/AgendaStartToast.vue";
import { api } from "@/api/axios";
import { getAgendaClientId } from "@/utils/agendaClientId";

export interface AgendaStartNotice {
  id: number; title: string; date: string; start_time: string; end_time: string;
  visibility: "private" | "shared"; kind: "started" | "ongoing";
}

export function useAgendaStartNotice(identity: () => string) {
  const toast = useToast();
  const activeToasts = new Set<string | number>();
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
        const id = toast.info({ component: AgendaStartToast, props: { notice } }, {
          timeout: 15000, closeOnClick: false, closeButton: "button", pauseOnHover: true,
          onClose: () => activeToasts.delete(id),
        });
        activeToasts.add(id);
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
    for (const id of activeToasts) toast.dismiss(id);
    activeToasts.clear();
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
  return { check };
}
