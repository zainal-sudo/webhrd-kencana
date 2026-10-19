import { ref, watch, onMounted, onUnmounted } from "vue";
import { api, getErrorMessage } from "@/api/axios";
import { jakartaToday } from "@/utils/agenda";

export function useAgendaNotice(identity: () => string) {
  const open = ref(false), count = ref(0), date = ref(""), failure = ref(""), refreshKey = ref(0);
  const loginNoticeCount = ref(0);
  let loginNoticeTimer: ReturnType<typeof setTimeout> | undefined, announced = false;
  function dismissLoginNotice() {
    loginNoticeCount.value = 0;
    if (loginNoticeTimer !== undefined) clearTimeout(loginNoticeTimer);
    loginNoticeTimer = undefined;
  }
  let timer: ReturnType<typeof setInterval> | undefined, request = 0, disposed = false;
  async function refresh() {
    const who = identity(), current = ++request;
    if (!who || disposed || document.hidden) return;
    if (date.value !== jakartaToday()) { count.value = 0; date.value = ""; dismissLoginNotice(); }
    try {
      const { data } = await api.get("/agenda/today");
      if (current !== request || identity() !== who || disposed) return;
      count.value = data.data.count; date.value = data.data.date; failure.value = "";
      if (!announced && date.value === jakartaToday()) {
        announced = true;
        if (count.value > 0) {
          loginNoticeCount.value = count.value;
          loginNoticeTimer = setTimeout(dismissLoginNotice, 20000);
        }
      }
      if (count.value === 0) dismissLoginNotice();
    } catch (error) {
      if (current !== request || identity() !== who || disposed) return;
      count.value = 0; failure.value = getErrorMessage(error, "Gagal memeriksa agenda.");
      dismissLoginNotice();
    }
  }
  function tick() { if (!document.hidden && identity()) { void refresh(); refreshKey.value++; } }
  function reset() {
    dismissLoginNotice(); announced = false;
    request++; open.value = false; count.value = 0; date.value = ""; failure.value = ""; refreshKey.value++;
    if (timer) clearInterval(timer); timer = undefined;
    if (identity() && !disposed) { timer = setInterval(tick, 60000); void refresh(); }
  }
  watch(identity, reset);
  watch(open, value => { if (value) dismissLoginNotice(); });
  onMounted(() => { reset(); document.addEventListener("visibilitychange", tick); window.addEventListener("focus", tick); });
  onUnmounted(() => { disposed = true; request++; dismissLoginNotice(); if (timer) clearInterval(timer); document.removeEventListener("visibilitychange", tick); window.removeEventListener("focus", tick); });
  return { open, count, date, failure, refreshKey, refresh, loginNoticeCount, dismissLoginNotice };
}
