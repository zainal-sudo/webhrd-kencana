import { ref, watch, onMounted, onUnmounted } from "vue";
import { api, getErrorMessage } from "@/api/axios";
import { jakartaToday } from "@/utils/agenda";
import { readAgendaLoginMarker, consumeAgendaLoginMarker } from "@/utils/agendaLoginMarker";

export function useAgendaNotice(identity: () => string, account: () => string) {
  const open = ref(false), count = ref(0), date = ref(""), failure = ref(""), refreshKey = ref(0);
  const loginNoticeCount = ref(0);
  const loginOngoingCount = ref(0), loginAllDayCount = ref(0);
  let loginNoticeTimer: ReturnType<typeof setTimeout> | undefined;
  function dismissLoginNotice() {
    loginNoticeCount.value = 0;
    loginOngoingCount.value = 0; loginAllDayCount.value = 0;
    if (loginNoticeTimer !== undefined) clearTimeout(loginNoticeTimer);
    loginNoticeTimer = undefined;
  }
  let timer: ReturnType<typeof setInterval> | undefined, request = 0, disposed = false;
  async function refresh() {
    const who = identity(), current = ++request;
    if (!who || disposed || document.hidden) return;
    const marker = readAgendaLoginMarker(account());
    if (date.value !== jakartaToday()) { count.value = 0; date.value = ""; dismissLoginNotice(); }
    try {
      const { data } = await api.get("/agenda/today");
      if (current !== request || identity() !== who || disposed) return;
      count.value = data.data.count; date.value = data.data.date; failure.value = "";
      const ongoing = Math.max(0, Number(data.data.ongoing_count) || 0);
      const allDay = Math.max(0, Number(data.data.all_day_open_count) || 0);
      if (marker && date.value === jakartaToday() && consumeAgendaLoginMarker(account(), marker.nonce)) {
        loginOngoingCount.value = ongoing; loginAllDayCount.value = allDay;
        loginNoticeCount.value = ongoing + allDay;
        if (loginNoticeCount.value > 0) {
          if (loginNoticeTimer !== undefined) clearTimeout(loginNoticeTimer);
          loginNoticeTimer = setTimeout(dismissLoginNotice, 20000);
        }
      }
      if (loginNoticeCount.value > 0) {
        loginOngoingCount.value = ongoing; loginAllDayCount.value = allDay; loginNoticeCount.value = ongoing + allDay;
        if (!loginNoticeCount.value) dismissLoginNotice();
      }
    } catch (error) {
      if (current !== request || identity() !== who || disposed) return;
      count.value = 0; failure.value = getErrorMessage(error, "Gagal memeriksa agenda.");
      dismissLoginNotice();
    }
  }
  function tick() { if (!document.hidden && identity()) { void refresh(); refreshKey.value++; } }
  function reset() {
    dismissLoginNotice();
    request++; open.value = false; count.value = 0; date.value = ""; failure.value = ""; refreshKey.value++;
    if (timer) clearInterval(timer); timer = undefined;
    if (identity() && !disposed) { timer = setInterval(tick, 60000); void refresh(); }
  }
  watch(identity, reset);
  watch(open, value => { if (value) dismissLoginNotice(); });
  onMounted(() => { reset(); document.addEventListener("visibilitychange", tick); window.addEventListener("focus", tick); });
  onUnmounted(() => { disposed = true; request++; dismissLoginNotice(); if (timer) clearInterval(timer); document.removeEventListener("visibilitychange", tick); window.removeEventListener("focus", tick); });
  return { open, count, date, failure, refreshKey, refresh, loginNoticeCount, loginOngoingCount, loginAllDayCount, dismissLoginNotice };
}
