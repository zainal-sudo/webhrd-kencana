<script setup lang="ts">
import { computed, nextTick, onUnmounted, reactive, ref, watch } from "vue";
import { api, getErrorMessage } from "@/api/axios";
import { addDays, agendaAudience, agendaDateLabel, agendaEditedAt, agendaTimeError, calendarDays, compareAgendaCards, jakartaToday, moveMonth } from "@/utils/agenda";
import type { Agenda, AgendaStatus, AgendaUser } from "@/utils/agenda";
import MsIcon from "@/components/MsIcon.vue";
import FTime from "@/components/fields/FTime.vue";

const props = defineProps<{ username: string; refreshKey: number }>();
const emit = defineEmits<{ close: []; changed: [] }>();
const selected = ref(jakartaToday()), mode = ref<"month" | "week">("month");
const days = computed(() => calendarDays(selected.value, mode.value, true));
const calendarDirection = ref(1), calendarAnimating = ref(false);
const range = computed(() => `${days.value[0]}:${days.value[days.value.length - 1]}`);
const rows = ref<Agenda[]>([]), loading = ref(false), busy = ref(false), detailLoading = ref(false);
const error = ref(""), formError = ref(""), userError = ref(""), editor = ref(false);
const document = ref<Agenda | null>(null), users = ref<AgendaUser[]>([]), search = ref("");
const userLoading = ref(false), recipientNames = ref<Record<string, string>>({});
let loadRequest = 0, detailRequest = 0, userRequest = 0, disposed = false;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
const draft = reactive({ title: "", notes: "", date: selected.value, start_time: "", end_time: "",
  visibility: "private" as "private" | "shared", status: "OPEN" as AgendaStatus, recipients: [] as string[] });
const statuses: AgendaStatus[] = ["OPEN", "SELESAI", "BATAL"];
const recipientPanel = ref<HTMLElement | null>(null), recipientSearchInput = ref<HTMLInputElement | null>(null);
const notesInput = ref<HTMLTextAreaElement | null>(null);
function resizeNotes() {
  const input = notesInput.value;
  if (!input) return;
  input.style.height = 'auto';
  input.style.height = `${input.scrollHeight + input.offsetHeight - input.clientHeight}px`;
}
watch(() => draft.notes, () => nextTick(resizeNotes), { flush: 'post' });
watch(notesInput, (input, _previous, cleanup) => {
  if (!input) return;
  let width = input.getBoundingClientRect().width;
  const observer = new ResizeObserver(() => {
    const nextWidth = input.getBoundingClientRect().width;
    if (nextWidth !== width) { width = nextWidth; resizeNotes(); }
  });
  observer.observe(input);
  resizeNotes();
  cleanup(() => observer.disconnect());
}, { flush: 'post' });
const agendaPane = ref<HTMLElement | null>(null), agendaLayout = ref<HTMLElement | null>(null);
const calendarPane = ref<HTMLElement | null>(null);
const calendarSide = ref(96);
function fitCalendar() {
  const pane = calendarPane.value;
  if (!pane) return;
  const style = getComputedStyle(pane);
  const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const heading = pane.closest('.agenda-dialog')?.querySelector('.agenda-heading');
  const otherHeight = Array.from(pane.children).reduce((height, child) => {
    if (child.classList.contains('calendar-grid') || getComputedStyle(child).position === 'absolute') return height;
    const css = getComputedStyle(child);
    return height + child.getBoundingClientRect().height + parseFloat(css.marginTop) + parseFloat(css.marginBottom);
  }, 0);
  const availableHeight = Math.min(800, window.innerHeight - 48)
    - (heading?.getBoundingClientRect().height || 0) - verticalPadding - otherHeight - 26 - 2;
  calendarSide.value = Math.max(1, Math.floor(Math.min(96,
    (pane.clientWidth - horizontalPadding - 1) / 7, availableHeight / 6)));
}
watch(calendarPane, (pane, _previous, cleanup) => {
  if (!pane) return;
  let frame = 0;
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(fitCalendar); };
  const observer = new ResizeObserver(schedule);
  observer.observe(pane);
  for (const child of pane.children) {
    if (!child.classList.contains('calendar-grid')) observer.observe(child);
  }
  const heading = pane.closest('.agenda-dialog')?.querySelector('.agenda-heading');
  if (heading) observer.observe(heading);
  window.addEventListener('resize', schedule);
  fitCalendar();
  cleanup(() => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', schedule); });
}, { flush: 'post' });
watch([days, loading, error], () => nextTick(fitCalendar), { flush: 'post' });
async function resetPaneScroll() {
  const currentForm = detailRequest;
  await nextTick();
  if (disposed || currentForm !== detailRequest || !agendaPane.value) return;
  agendaPane.value.scrollTop = 0;
  if (agendaLayout.value && window.matchMedia('(max-width: 760px)').matches) {
    agendaLayout.value.scrollTop = Math.max(0, agendaLayout.value.scrollTop + agendaPane.value.getBoundingClientRect().top - agendaLayout.value.getBoundingClientRect().top);
  }
}
function chooseStatus(status: AgendaStatus) {
  if (busy.value) return;
  draft.status = status;
}
async function focusRecipients() {
  if (!owner.value || draft.visibility !== "shared") return;
  const currentForm = detailRequest;
  await nextTick();
  if (disposed || currentForm !== detailRequest || !editor.value || !owner.value || draft.visibility !== "shared") return;
  recipientSearchInput.value?.focus({ preventScroll: true });
  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? "auto" : "smooth";
  const viewport = window.matchMedia('(max-width: 760px)').matches ? agendaLayout.value : agendaPane.value;
  if (recipientPanel.value && viewport && recipientPanel.value.offsetHeight > viewport.clientHeight - 116) recipientSearchInput.value?.scrollIntoView({ block: "start", behavior });
  else recipientPanel.value?.scrollIntoView({ block: "center", behavior });
}
const daily = computed(() => rows.value.filter(row => row.date === selected.value).sort(compareAgendaCards));
const byDate = computed(() => {
  const map = new Map<string, Agenda[]>();
  for (const row of rows.value) { if (!map.has(row.date)) map.set(row.date, []); map.get(row.date)!.push(row); }
  return map;
});
const owner = computed(() => !document.value || document.value.creator === props.username.trim().toLowerCase());
const recipientPanelReady = computed(() => editor.value && !detailLoading.value && owner.value && draft.visibility === "shared");
const recipientOptions = computed(() => users.value.filter(user => user.code !== (document.value?.creator ?? props.username.trim().toLowerCase())));
const allRecipientsSelected = computed(() => recipientOptions.value.length > 0 && recipientOptions.value.every(user => draft.recipients.includes(user.code)));
const someRecipientsSelected = computed(() => !allRecipientsSelected.value && recipientOptions.value.some(user => draft.recipients.includes(user.code)));
function toggleAllRecipients() {
  if (busy.value || !recipientPanelReady.value || userLoading.value || userError.value || !recipientOptions.value.length) return;
  const visible = new Set(recipientOptions.value.map(user => user.code));
  draft.recipients = allRecipientsSelected.value
    ? draft.recipients.filter(code => !visible.has(code))
    : [...new Set([...draft.recipients, ...visible])];
}
function recipientLabel(code: string) { return recipientNames.value[code] ? `${code.toUpperCase()} · ${recipientNames.value[code]}` : code.toUpperCase(); }
function toggleRecipient(code: string) {
  if (busy.value || !recipientPanelReady.value || code === (document.value?.creator ?? props.username.trim().toLowerCase())) return;
  draft.recipients = draft.recipients.includes(code) ? draft.recipients.filter(item => item !== code) : [...draft.recipients, code];
}
function dayCounts(day: string) { return statuses.map(status => ({ status, count: (byDate.value.get(day) || []).filter(row => row.status === status).length })).filter(item => item.count); }
async function reload() {
  const request = ++loadRequest;
  rows.value = []; loading.value = true; error.value = "";
  const [start, end] = range.value.split(":");
  try {
    const { data } = await api.get("/agenda", { params: { start, end } });
    if (request !== loadRequest || disposed) return;
    rows.value = data.data;
    // If the selected agenda was removed/revoked, discard its details and draft.
    if (document.value && document.value.date >= start && document.value.date <= end && !rows.value.some(row => row.id === document.value?.id)) {
      closeEditor(); error.value = "Agenda sudah dipindahkan, dihapus, atau aksesnya dicabut. Muat ulang jika diperlukan.";
    }
  } catch (err) {
    if (request === loadRequest && !disposed) { error.value = getErrorMessage(err, "Gagal memuat agenda."); closeEditor(); }
  } finally { if (request === loadRequest && !disposed) loading.value = false; }
}
watch([range, () => props.refreshKey], () => { void reload(); }, { immediate: true });
function navigate(amount: number) {
  if (busy.value) return;
  calendarDirection.value = amount < 0 ? -1 : 1;
  calendarAnimating.value = true;
  closeEditor(); selected.value = mode.value === "month" ? moveMonth(selected.value, amount) : addDays(selected.value, amount * 7);
}
function selectDate(day: string) { if (busy.value) return; closeEditor(); selected.value = day; }
function resetRecipientSearch() {
  userRequest++;
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = undefined; search.value = ""; users.value = []; recipientNames.value = {}; userError.value = ""; userLoading.value = false;
}
function closeEditor() { detailRequest++; resetRecipientSearch(); editor.value = false; detailLoading.value = false; document.value = null; formError.value = ""; draft.title = ""; draft.notes = ""; draft.recipients = []; void resetPaneScroll(); }
function newAgenda() {
  closeEditor(); Object.assign(draft, { title: "", notes: "", date: selected.value, start_time: "", end_time: "", visibility: "private", status: "OPEN", recipients: [] });
  editor.value = true;
  void resetPaneScroll();
}
function assign(row: Agenda) {
  document.value = row;
  Object.assign(draft, { title: row.title, notes: row.notes, date: row.date, start_time: row.start_time || "", end_time: row.end_time || "", visibility: row.visibility, status: row.status, recipients: [...row.recipients] });
}
async function editAgenda(id: number) {
  resetRecipientSearch();
  const request = ++detailRequest;
  editor.value = true; document.value = null; detailLoading.value = true; formError.value = "";
  draft.title = ""; draft.notes = ""; draft.recipients = [];
  void resetPaneScroll();
  try {
    const { data } = await api.get(`/agenda/${id}`);
    if (request !== detailRequest || disposed) return;
    assign(data.data);
    void resetPaneScroll();
  } catch (err) {
    if (request === detailRequest && !disposed) { closeEditor(); error.value = getErrorMessage(err); void reloadAfterAccessError(err); }
  } finally { if (request === detailRequest && !disposed) detailLoading.value = false; }
}
async function searchUsers() {
  if (!recipientPanelReady.value) return;
  if (searchTimer) clearTimeout(searchTimer); searchTimer = undefined;
  const request = ++userRequest; userLoading.value = true; userError.value = ""; users.value = [];
  try {
    const { data } = await api.get("/agenda/users", { params: { search: search.value } });
    if (request === userRequest && !disposed && recipientPanelReady.value) {
      users.value = data.data;
      for (const user of users.value) recipientNames.value[user.code] = user.name;
    }
  } catch (err) { if (request === userRequest && !disposed) { users.value = []; userError.value = getErrorMessage(err, "Gagal memuat akun penerima."); } }
  finally { if (request === userRequest && !disposed) userLoading.value = false; }
}
watch(recipientPanelReady, value => {
  if (value) void searchUsers();
  else { userRequest++; if (searchTimer) clearTimeout(searchTimer); userLoading.value = false; users.value = []; }
});
watch(search, () => {
  userRequest++; if (searchTimer) clearTimeout(searchTimer);
  if (!recipientPanelReady.value) { userLoading.value = false; return; }
  users.value = []; userLoading.value = true;
  searchTimer = setTimeout(() => { void searchUsers(); }, 250);
}, { flush: "sync" });
watch(() => draft.visibility, value => { if (value === "private" && owner.value) draft.recipients = []; });
async function reloadAfterAccessError(err: unknown) {
  const status = (err as { response?: { status: number } }).response?.status;
  if (status === 404 || status === 403) { closeEditor(); await reload(); error.value = "Agenda tidak tersedia atau aksesnya telah berubah."; }
}
async function save() {
  if (busy.value || detailLoading.value) return;
  formError.value = agendaTimeError(draft.start_time, draft.end_time);
  if (!draft.title.trim()) formError.value = "Judul wajib diisi.";
  if (draft.visibility === "shared" && !draft.recipients.length) formError.value = "Pilih minimal satu akun penerima.";
  if (formError.value) return;
  busy.value = true;
  try {
    const payload = { ...draft, recipients: [...draft.recipients], version: document.value?.version };
    if (document.value) await api.put(`/agenda/${document.value.id}`, payload);
    else await api.post("/agenda", payload);
    if (disposed) return;
    const date = draft.date; closeEditor(); selected.value = date; await reload(); emit("changed");
  } catch (err) { if (!disposed) { formError.value = getErrorMessage(err); await reloadAfterAccessError(err); } }
  finally { busy.value = false; }
}
async function remove() {
  const row = document.value;
  if (!row || busy.value || !window.confirm(`Hapus agenda “${row.title}”? Agenda akan dihapus untuk pembuat dan seluruh penerima.`)) return;
  busy.value = true; formError.value = "";
  try {
    await api.delete(`/agenda/${row.id}`, { data: { version: row.version } });
    if (disposed) return;
    closeEditor(); await reload(); emit("changed");
  } catch (err) { if (!disposed) { formError.value = getErrorMessage(err); await reloadAfterAccessError(err); } }
  finally { busy.value = false; }
}
onUnmounted(() => { disposed = true; loadRequest++; detailRequest++; userRequest++; if (searchTimer) clearTimeout(searchTimer); });
</script>

<template>
  <v-dialog :model-value="true" max-width="960" :persistent="busy" aria-labelledby="agenda-title" @update:model-value="!$event && emit('close')">
    <section class="agenda-dialog">
      <header class="agenda-heading"><h2 id="agenda-title"><MsIcon name="calendar_month" :size="20" />Kalender Agenda</h2><button type="button" aria-label="Tutup kalender agenda" :disabled="busy" @click="emit('close')"><MsIcon name="close" :size="20" /></button></header>
      <div ref="agendaLayout" class="agenda-layout">
        <section ref="calendarPane" class="calendar-pane" aria-label="Kalender">
          <div class="calendar-toolbar">
            <h3>{{ agendaDateLabel(selected, { month: 'long', year: 'numeric' }) }}</h3>
            <div class="calendar-controls">
              <div class="view-switch" role="group" aria-label="Tampilan kalender"><button type="button" :aria-pressed="mode === 'month'" :disabled="busy" @click="mode = 'month'">Bulan</button><button type="button" :aria-pressed="mode === 'week'" :disabled="busy" @click="mode = 'week'">Minggu</button></div>
              <button type="button" :disabled="busy" @click="selectDate(jakartaToday())">Hari ini</button>
              <button type="button" aria-label="Periode sebelumnya" :disabled="busy" @click="navigate(-1)"><MsIcon name="chevron_left" :size="18" /></button>
              <button type="button" aria-label="Periode berikutnya" :disabled="busy" @click="navigate(1)"><MsIcon name="chevron_right" :size="18" /></button>
            </div>
          </div>
          <div class="agenda-legend"><span v-for="status in statuses" :key="status"><i :class="status" />{{ status }}</span></div>
          <p v-if="error" class="agenda-error" role="alert">{{ error }} <button type="button" :disabled="loading || busy" @click="reload">Coba lagi</button></p>
          <Transition name="calendar-notice"><div v-if="loading" role="status" aria-live="polite" class="calendar-loading"><span class="calendar-spinner" aria-hidden="true" />Memuat kalender…</div></Transition>
          <div :key="range" class="calendar-grid" :class="{ 'week-view': mode === 'week', 'compact-cells': calendarSide < 60, 'is-sliding': calendarAnimating }" :style="{ '--calendar-week-rows': days.length / 7, '--calendar-side': `${calendarSide}px`, '--calendar-direction': calendarDirection }" :aria-busy="loading">
            <span v-for="day in ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']" :key="day" class="weekday">{{ day }}</span>
            <button v-for="day in days" :key="day" type="button" class="calendar-day" :class="{ muted: day.slice(0, 7) !== selected.slice(0, 7), selected: day === selected, today: day === jakartaToday() }"
              :aria-label="`${agendaDateLabel(day)}${dayCounts(day).map(item => `, ${item.count} ${item.status}`).join('')}`" :aria-pressed="day === selected" :disabled="busy" @click="selectDate(day)">
              <span class="day-number">{{ Number(day.slice(-2)) }}</span>
              <span class="day-markers"><span v-for="item in dayCounts(day)" :key="item.status" class="day-count" :class="item.status"><i />{{ item.count }} <span class="day-status">{{ item.status }}</span></span></span>
            </button>
          </div>
          <small class="timezone-note">Tanggal dan jam menggunakan WIB (Asia/Jakarta).</small>
        </section>
        <section ref="agendaPane" class="agenda-pane" :class="{ 'is-editing': editor }" aria-label="Agenda tanggal terpilih">
          <div v-if="!editor" class="daily-heading"><h3>{{ agendaDateLabel(selected) }}</h3><button type="button" class="primary" :disabled="busy || loading" @click="newAgenda"><MsIcon name="add" :size="16" />Tambah</button></div>
          <div v-if="editor" class="form-heading"><button type="button" class="agenda-back" aria-label="Kembali ke daftar agenda" title="Kembali ke daftar agenda" :disabled="busy" @click="closeEditor"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true"><path d="m14 6-6 6 6 6M8 12h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></button><h4>{{ document || detailLoading ? 'Edit agenda' : 'Tambah agenda' }}</h4></div>
          <p v-if="detailLoading" role="status" class="agenda-state">Memuat detail agenda…</p>
          <form v-else-if="editor" class="agenda-form" @submit.prevent="save">
            <div v-if="document" class="agenda-meta"><span>Dibuat oleh {{ document.creator.toUpperCase() }}<template v-if="document.visibility === 'shared'"> · Bersama {{ agendaAudience(document) }}</template></span><span v-if="document.updated_by">Terakhir diedit oleh {{ document.updated_by.toUpperCase() }}<template v-if="agendaEditedAt(document.updated_at)"> · {{ agendaEditedAt(document.updated_at) }}</template></span></div>
            <p v-if="formError" class="agenda-error" role="alert">{{ formError }}<button v-if="document" type="button" :disabled="busy" @click="editAgenda(document.id)">Muat ulang agenda</button></p>
            <label><span class="field-label">Judul <span class="required-mark" aria-hidden="true">*</span></span><input v-model="draft.title" maxlength="200" required :disabled="busy" /></label>
            <div class="date-time-fields">
            <label><span class="field-label">Tanggal <span class="required-mark" aria-hidden="true">*</span></span><input v-model="draft.date" type="date" min="1000-01-01" max="9999-12-31" required :disabled="busy" /></label>
            <FTime v-model="draft.start_time" label="Jam mulai" placeholder="00:00" :seconds="false" :disabled="busy" />
            <FTime v-model="draft.end_time" label="Jam selesai" placeholder="00:00" :seconds="false" :disabled="busy" />
            </div>
            <small>Kosongkan kedua jam untuk agenda seharian.</small>
            <fieldset class="agenda-status-field" :disabled="busy">
              <legend class="status-label">Status</legend>
              <div class="status-segments">
                <label v-for="status in statuses" :key="status" class="status-option" :class="[status, { selected: draft.status === status }]">
                  <input type="radio" name="agenda-status" :value="status" :checked="draft.status === status" @change="chooseStatus(status)" />
                  <span>{{ status }}</span>
                </label>
              </div>
            </fieldset>
            <fieldset class="visibility-picker" :disabled="busy || !owner"><legend>Jenis agenda</legend><div class="visibility-options" :class="{ 'is-shared': draft.visibility === 'shared' }">
              <span class="visibility-indicator" aria-hidden="true" />
              <label :class="{ chosen: draft.visibility === 'private' }"><input v-model="draft.visibility" type="radio" name="agenda-visibility" value="private" /><MsIcon name="lock" :size="18" /><span>Pribadi</span></label>
              <label :class="{ chosen: draft.visibility === 'shared' }"><input v-model="draft.visibility" type="radio" name="agenda-visibility" value="shared" @change="focusRecipients()" /><MsIcon name="group" :size="18" /><span>Bersama</span></label>
            </div></fieldset>
            <fieldset v-if="draft.visibility === 'shared'" ref="recipientPanel" class="recipient-panel" :disabled="busy || !owner">
              <legend>Akun penerima</legend>
              <small>Pilih akun yang akan menerima agenda ini.</small>
              <p class="recipient-count" role="status">{{ draft.recipients.length }} akun dipilih</p>
              <ul v-if="draft.recipients.length" class="selected-recipients" aria-label="Akun terpilih"><li v-for="code in draft.recipients" :key="code"><span>{{ recipientLabel(code) }}</span><button v-if="owner" type="button" :aria-label="`Hapus penerima ${code.toUpperCase()}`" @click="toggleRecipient(code)"><svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg></button></li></ul>
              <template v-if="owner">
                <label for="agenda-recipient-search">Cari kode / nama akun<input id="agenda-recipient-search" ref="recipientSearchInput" v-model="search" type="search" placeholder="Cari kode / nama akun" autocomplete="off" @keydown.enter.prevent /></label>
                <label class="recipient-select-all"><input type="checkbox" :checked="allRecipientsSelected" :indeterminate="someRecipientsSelected" :aria-checked="someRecipientsSelected ? 'mixed' : allRecipientsSelected" :disabled="busy || userLoading || !!userError || !recipientOptions.length" @change="toggleAllRecipients" /><span>Pilih semua{{ search.trim() ? ' hasil pencarian' : '' }}<small>{{ recipientOptions.length }} akun ditampilkan</small></span></label>
                <div class="recipient-list" :aria-busy="userLoading">
                  <p v-if="userLoading" class="recipient-state" role="status">Memuat akun…</p>
                  <div v-else-if="userError" class="recipient-state agenda-error" role="alert">{{ userError }} <button type="button" @click="searchUsers">Coba lagi</button></div>
                  <p v-else-if="!recipientOptions.length" class="recipient-state">Tidak ditemukan</p>
                  <label v-for="user in userLoading || userError ? [] : recipientOptions" :key="user.code" class="recipient-option"><input type="checkbox" :value="user.code" :checked="draft.recipients.includes(user.code)" @change="toggleRecipient(user.code)" /><span><strong>{{ user.code.toUpperCase() }}</strong><span>{{ user.name || user.code }}</span></span></label>
                </div>
              </template>
            </fieldset>
            <small v-if="!owner">Hanya pembuat yang dapat mengubah pengaturan berbagi dan penerima.</small>
            <label>Catatan<textarea ref="notesInput" v-model="draft.notes" rows="2" maxlength="10000" :disabled="busy" /></label>
            <footer class="agenda-form-actions"><button v-if="document" type="button" class="danger" :disabled="busy" @click="remove">Hapus untuk semua</button><button type="submit" class="primary" :disabled="busy">{{ busy ? 'Menyimpan…' : 'Simpan' }}</button></footer>
          </form>
          <template v-else>
            <p v-if="!loading && !error && !daily.length" class="agenda-empty">Belum ada agenda pada tanggal ini.</p>
            <button v-for="row in daily" :key="row.id" type="button" class="agenda-card" :disabled="busy" @click="editAgenda(row.id)">
              <span class="agenda-card-top"><span class="agenda-card-labels"><span class="agenda-badge" :class="row.status">{{ row.status }}</span><small>{{ row.visibility === 'private' ? 'Pribadi' : 'Bersama' }}</small></span><span class="agenda-card-time">{{ row.start_time ? `${row.start_time}–${row.end_time}` : 'Seharian' }}</span></span>
              <strong class="agenda-card-title">{{ row.title }}</strong><span v-if="row.notes" class="agenda-card-notes">{{ row.notes }}</span>
              <span class="agenda-meta"><span>Dibuat oleh {{ row.creator.toUpperCase() }}<template v-if="row.visibility === 'shared'"> · Bersama {{ agendaAudience(row) }}</template></span><span v-if="row.updated_by">Terakhir diedit oleh {{ row.updated_by.toUpperCase() }}<template v-if="agendaEditedAt(row.updated_at)"> · {{ agendaEditedAt(row.updated_at) }}</template></span></span>
            </button>
          </template>
        </section>
      </div>
    </section>
  </v-dialog>
</template>

<style scoped>
.agenda-dialog { --agenda-surface: var(--ds-surface-raised, #fff); --agenda-panel: var(--ds-surface, #f0f3f8); display: flex; flex-direction: column; height: min(800px, calc(100dvh - 48px)); max-height: min(800px, calc(100dvh - 48px)); background: var(--agenda-surface); color: var(--ds-text, #1b2d4a); border-radius: 10px; overflow: hidden; font-size: 12px; }
:global(:root[data-theme="dark"] .agenda-dialog) { --agenda-surface: var(--ds-surface, #172334); --agenda-panel: var(--ds-surface-raised, #1d2b3e); }
.agenda-heading { display: flex; flex: 0 0 auto; align-items: center; justify-content: space-between; padding: 12px 16px; background: var(--ds-action, #3b5998); color: #fff; }
.agenda-heading h2 { display: flex; align-items: center; gap: 8px; font-size: 15px; }
.agenda-heading button { color: inherit; background: transparent; border: 0; padding: 2px; }
.agenda-layout { display: grid; flex: 1; min-height: 0; grid-template-columns: minmax(0, 1.5fr) minmax(320px, 1fr); grid-template-rows: minmax(0, 1fr); overflow: hidden; }
.calendar-pane, .agenda-pane { padding: 16px; overflow-y: auto; min-width: 0; min-height: 0; }
.calendar-pane { position: relative; display: flex; flex-direction: column; overflow: hidden; background: var(--agenda-surface); }
.calendar-loading { position: absolute; right: 16px; bottom: 16px; z-index: 6; display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid var(--ds-border-light, #c4cad3); border-radius: 8px; background: var(--agenda-surface); color: var(--ds-text, #1b2d4a); box-shadow: 0 3px 12px rgb(0 0 0 / 12%); pointer-events: none; }
.calendar-spinner { width: 12px; height: 12px; border: 2px solid var(--ds-border-light, #c4cad3); border-top-color: var(--ds-primary, #3b5998); border-radius: 50%; animation: calendar-spin 700ms linear infinite; }
@keyframes calendar-spin { to { transform: rotate(360deg); } }
.calendar-notice-enter-active, .calendar-notice-leave-active { transition: opacity 120ms ease; }
.calendar-notice-enter-from, .calendar-notice-leave-to { opacity: 0; }
.calendar-pane > :not(.calendar-grid) { flex-shrink: 0; }
.agenda-pane { border-left: 1px solid var(--ds-border, #dce3ed); background: var(--agenda-panel); container-type: inline-size; scroll-padding-top: 56px; scroll-padding-bottom: 60px; }
.agenda-pane.is-editing { padding-top: 0; padding-bottom: 0; }
.calendar-toolbar, .calendar-controls, .daily-heading, .agenda-card-top, .form-heading, .agenda-form-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.calendar-toolbar { flex-wrap: wrap; margin-bottom: 12px; }
.form-heading { position: sticky; top: 0; z-index: 4; justify-content: flex-start; min-height: 48px; margin-bottom: 8px; padding: 8px 0; background: var(--agenda-panel); border-bottom: 1px solid var(--ds-border-light, #c4cad3); }
.agenda-back { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; border-radius: 50%; background: transparent; }
h3 { font-size: 13px; margin: 0; } h4 { font-size: 13px; }
.calendar-controls { flex-wrap: wrap; gap: 5px; }
button { cursor: pointer; font: inherit; color: inherit; border: 1px solid var(--ds-border, #cbd5e1); border-radius: 5px; background: var(--agenda-surface); padding: 5px 8px; }
button:disabled { opacity: .55; cursor: default; }
button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 2px solid var(--ds-primary, #3b5998); outline-offset: 2px; }
.primary, .view-switch button[aria-pressed="true"] { color: #fff; background: var(--ds-action, #3b5998); border-color: transparent; }
.primary { display: inline-flex; align-items: center; justify-content: center; gap: 4px; }
.view-switch { display: flex; } .view-switch button:first-child { border-radius: 5px 0 0 5px; } .view-switch button:last-child { border-radius: 0 5px 5px 0; }
.agenda-legend { display: flex; gap: 12px; font-size: 10px; margin-bottom: 12px; }
.agenda-legend span { display: flex; align-items: center; gap: 5px; }
i { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.OPEN { color: var(--ds-error, #dc3535); } .SELESAI { color: var(--ds-success, #278448); } .BATAL { color: var(--ds-text-muted, #80838b); }
.calendar-grid { display: grid; flex: 0 0 auto; align-self: center; grid-template-columns: repeat(7, var(--calendar-side, 48px)); grid-template-rows: 26px repeat(var(--calendar-week-rows), var(--calendar-side, 48px)); padding: 0 1px 1px 0; }
.calendar-grid.is-sliding { animation: calendar-slide-in 240ms cubic-bezier(.22, 1, .36, 1); }
@keyframes calendar-slide-in {
  from { opacity: 0; transform: translateX(calc(var(--calendar-direction, 1) * 32px)); }
  to { opacity: 1; transform: translateX(0); }
}
.weekday { text-align: center; padding: 4px 0; font-size: 10px; text-transform: uppercase; color: var(--ds-text-muted, #68788f); }
.calendar-day { width: 100%; height: var(--calendar-side, 48px); aspect-ratio: 1; box-sizing: border-box; align-self: start; border-radius: 0; min-height: 0; min-width: 0; overflow: hidden; border-color: var(--ds-border, #e1e6ee); padding: 2px; display: flex; flex-direction: column; align-items: flex-start; gap: 1px; margin: 0 -1px -1px 0; }
.day-number { font-size: 10px; line-height: 12px; }
.day-markers { display: flex; flex-direction: row; flex-wrap: wrap; gap: 1px 3px; max-width: 100%; }
.day-status { display: none; }
.calendar-day.muted .day-number { opacity: .45; }
.calendar-day.selected { background: var(--ds-surface-inset, #e8edf4); box-shadow: inset 0 0 0 2px var(--ds-primary, #3b5998); z-index: 1; }
.calendar-day.today .day-number { font-weight: 800; text-decoration: underline; text-underline-offset: 3px; }
.day-count { display: flex; align-items: center; gap: 2px; font-size: 8px; line-height: 10px; white-space: nowrap; }
.day-count i { flex-shrink: 0; width: 4px; height: 4px; }
.calendar-grid:not(.compact-cells) .calendar-day { padding: 5px; gap: 3px; }
.calendar-grid:not(.compact-cells) .day-number { font-size: 12px; line-height: 16px; }
.calendar-grid:not(.compact-cells) .day-count { font-size: 9px; line-height: 12px; gap: 3px; }
.calendar-grid:not(.compact-cells) .day-count i { width: 6px; height: 6px; }
.timezone-note, .agenda-meta, .agenda-form small { display: block; color: var(--ds-text-muted, #68788f); font-size: 10px; }
.agenda-meta { font-weight: 400; overflow-wrap: anywhere; line-height: 1.5; } .agenda-meta > span { display: block; }
.recipient-panel { min-width: 0; border: 1px solid var(--ds-border, #b0b8c4); border-radius: 8px; padding: 10px; scroll-margin-top: 56px; scroll-margin-bottom: 60px; }
.recipient-panel legend { padding: 0 5px; font-weight: 600; }
.recipient-count { font-size: 11px; margin: 0 0 8px; color: var(--ds-text-secondary, #5a6a7e); }
.selected-recipients { list-style: none; padding: 0; margin: 0 0 10px; display: flex; flex-wrap: wrap; gap: 5px; }
.selected-recipients li { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; padding: 3px 6px; border-radius: 5px; background: var(--ds-surface-inset, #e0e4ea); font-size: 10px; }
.selected-recipients li > span { overflow-wrap: anywhere; }
.selected-recipients button { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 22px; width: 22px; height: 22px; background: transparent; border: 0; padding: 0; border-radius: 50%; }
.selected-recipients button:hover { background: var(--ds-border-light, #c4cad3); }
.selected-recipients button svg { display: block; }
.visibility-picker { border: 0; padding: 0; min-width: 0; }
.visibility-picker legend { font-weight: 600; margin-bottom: 6px; }
.agenda-status-field { border: 0; padding: 0; margin: 0; min-width: 0; }
.status-label { font-size: 12px; font-weight: 600; margin-bottom: 6px; }
.status-segments { display: inline-flex; align-items: center; gap: 4px; padding: 4px; max-width: 100%; border: 1px solid var(--ds-border-light, #c4cad3); border-radius: 12px; background: var(--ds-surface-inset, #e0e4ea); }
.agenda-form .status-option { position: relative; display: inline-flex; flex-direction: row; align-items: center; justify-content: center; min-height: 28px; padding: 4px 10px; border: 1px solid transparent; border-radius: 9px; background: color-mix(in srgb, currentColor 5%, var(--agenda-surface)); font-size: 11px; font-weight: 600; line-height: 18px; cursor: pointer; transition: background-color 140ms ease, border-color 140ms ease; }
.status-option.BATAL { color: var(--ds-text-secondary, #5a6a7e); }
.agenda-status-field:not(:disabled) .status-option:hover { border-color: color-mix(in srgb, currentColor 65%, transparent); background: color-mix(in srgb, currentColor 18%, var(--agenda-surface)); }
.agenda-form .status-option.selected { border-color: currentColor; background: color-mix(in srgb, currentColor 28%, var(--agenda-surface)); font-weight: 700; box-shadow: inset 0 0 0 1px currentColor; }
.agenda-status-field:not(:disabled) .status-option.selected:hover { background: color-mix(in srgb, currentColor 34%, var(--agenda-surface)); }
.agenda-status-field:not(:disabled) .status-option:active { border-color: currentColor; background: color-mix(in srgb, currentColor 40%, var(--agenda-surface)); }
.agenda-form .status-option input { position: absolute; width: 1px; height: 1px; opacity: 0; padding: 0; border: 0; }
.status-option:focus-within { outline: 2px solid var(--ds-primary, #3b5998); outline-offset: -2px; }
.agenda-status-field:disabled .status-option { opacity: .55; cursor: default; }
.visibility-options { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; border-radius: 9px; padding: 4px; background: var(--ds-surface-inset, #e0e4ea); isolation: isolate; }
.visibility-indicator { position: absolute; left: 4px; top: 4px; bottom: 4px; width: calc((100% - 14px) / 2); border: 1px solid var(--ds-border, #b0b8c4); border-radius: 7px; background: var(--ds-surface-raised, #fff); box-shadow: 0 1px 3px rgb(0 0 0 / 8%); pointer-events: none; transition: transform 240ms cubic-bezier(.22, 1, .36, 1); }
.visibility-options.is-shared .visibility-indicator { transform: translateX(calc(100% + 6px)); }
.agenda-form .visibility-options label { position: relative; display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 6px; min-height: 36px; padding: 7px; border: 1px solid transparent; border-radius: 7px; cursor: pointer; font-size: 11px; font-weight: 500; }
.visibility-options label { z-index: 1; transition: color 180ms ease; }
.visibility-options label.chosen { color: var(--ds-text, #1b2d4a); }
.visibility-options input { position: absolute; opacity: 0; width: 1px !important; height: 1px !important; padding: 0 !important; }
.visibility-options label:focus-within { outline: 2px solid var(--ds-primary, #3b5998); outline-offset: 1px; }
.visibility-picker:disabled label { cursor: default; opacity: .65; }
@media (prefers-reduced-motion: reduce) {
  .calendar-spinner { animation: none; }
  .calendar-notice-enter-active, .calendar-notice-leave-active { transition: none; }
  .calendar-grid.is-sliding { animation: none; }
  .visibility-indicator, .visibility-options label { transition: none; }
  .agenda-form .status-option { transition: none; }
}
.recipient-list { height: min(240px, 30dvh); max-height: 240px; overflow-y: auto; margin-top: 8px; }
.agenda-form .recipient-option, .agenda-form .recipient-select-all { display: flex; flex-direction: row; align-items: center; gap: 9px; min-height: 42px; padding: 7px; border-bottom: 1px solid var(--ds-border-light, #c4cad3); cursor: pointer; font-weight: 400; }
.recipient-option:hover { background: var(--ds-surface-inset, #e0e4ea); }
.agenda-form .recipient-option input, .agenda-form .recipient-select-all input { width: 16px; height: 16px; padding: 0; flex: 0 0 16px; accent-color: var(--ds-action, #3b5998); }
.recipient-option > span { display: flex; flex-direction: column; gap: 2px; overflow-wrap: anywhere; min-width: 0; }
.recipient-option > span > span, .recipient-state { color: var(--ds-text-secondary, #5a6a7e); font-size: 11px; }
.recipient-state { padding: 8px 4px; }
.timezone-note { margin-top: 8px; }
.daily-heading { margin-bottom: 16px; align-items: flex-start; }
.daily-heading h3 { padding-top: 5px; }
.agenda-empty, .agenda-state { padding: 20px 0; text-align: center; color: var(--ds-text-muted, #68788f); }
.agenda-card { display: flex; flex-direction: column; text-align: left; gap: 6px; width: 100%; padding: 11px 12px; margin-bottom: 8px; border-radius: 9px; transition: border-color 140ms ease, background-color 140ms ease, box-shadow 140ms ease; }
.agenda-card:hover { border-color: var(--ds-primary, #3b5998); box-shadow: 0 2px 6px rgb(0 0 0 / 6%); }
.agenda-card:focus-visible { outline: 2px solid var(--ds-primary, #3b5998); outline-offset: 2px; }
.agenda-card-labels { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.agenda-card-top { width: 100%; align-items: flex-start; }
.agenda-card-time { white-space: nowrap; padding-top: 3px; }
.agenda-card-title { margin-top: 1px; }
.agenda-card .agenda-meta { width: 100%; font-size: 10px; line-height: 1.45; margin-top: 2px; }
.agenda-card strong { font-size: 13px; overflow-wrap: anywhere; }
.agenda-card-top, .agenda-card small { font-size: 10px; }
.agenda-card-notes { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; white-space: pre-wrap; overflow-wrap: anywhere; overflow: hidden; line-height: 1.5; }
.agenda-badge { display: inline-flex; align-items: center; border-radius: 999px; padding: 3px 10px; font-weight: 600; line-height: 1.5; background: color-mix(in srgb, currentColor 10%, transparent); border: 1px solid color-mix(in srgb, currentColor 22%, transparent); }
.agenda-form { display: flex; flex-direction: column; gap: 8px; min-height: calc(100% - 56px); padding-top: 1px; }
.agenda-form label { display: flex; flex-direction: column; gap: 4px; font-weight: 600; min-width: 0; }
/* Jam agenda memakai FTime (mode HH:mm); label di atas seperti field form lain. */
.agenda-form :deep(.time-field) { flex-direction: column; align-items: stretch; gap: 4px; }
.agenda-form :deep(.time-label) { flex: 0 0 auto; font: inherit; color: inherit; }
.date-time-fields .field-label, .date-time-fields :deep(.time-label) { line-height: 18px; }
.date-time-fields :deep(.time-control) { flex: none; width: 100%; }
.date-time-fields :deep(input) { box-sizing: border-box; height: 32px; padding: 5px 9px; border: 1px solid var(--ds-border, #b0b8c4); border-radius: 6px; background: var(--agenda-surface); font: inherit; color: inherit; }
.date-time-fields :deep(input:focus) { border-color: var(--ds-primary, #3b5998); }
.date-time-fields :deep(input[aria-invalid="true"]) { border-color: var(--ds-error, #dc3535); }
.date-time-fields :deep(input:disabled) { background: var(--ds-surface-inset, #e0e4ea); color: var(--ds-text-secondary, #5a6a7e); }
.agenda-form :deep(.time-field small) { margin-left: 0; }
.field-label { display: inline-flex; align-items: baseline; gap: 3px; }
.required-mark { color: var(--ds-error, #dc3535); }
.agenda-form input, .agenda-form select, .agenda-form textarea { font: inherit; color: inherit; background: var(--agenda-surface); border: 1px solid var(--ds-border, #b0b8c4); border-radius: 6px; padding: 5px 9px; width: 100%; min-width: 0; }
.agenda-form input:not([type="checkbox"]):not([type="radio"]) { height: 32px; }
.agenda-form textarea { resize: none; overflow: hidden; min-height: 56px; }
.date-time-fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; align-items: start; }
.agenda-form input, .agenda-form textarea, .recipient-option { scroll-margin-top: 64px; scroll-margin-bottom: 60px; }
.agenda-form-actions { position: sticky; bottom: 0; z-index: 3; margin-top: auto; justify-content: flex-end; min-height: 48px; padding: 8px 0; border-top: 1px solid var(--ds-border-light, #c4cad3); background: var(--agenda-panel); }
.danger, .agenda-error { color: var(--ds-error, #dc3535); }
.agenda-error { padding: 8px; background: var(--ds-surface-inset, #f0f3f8); border-radius: 5px; overflow-wrap: anywhere; }
.agenda-error button { margin-left: 5px; }
@media (max-width: 760px) {
  .agenda-layout { display: flex; flex-direction: column; overflow-y: auto; overflow-x: hidden; scrollbar-gutter: stable; scroll-padding-top: 56px; scroll-padding-bottom: 60px; }
  .calendar-pane, .agenda-pane { overflow: visible; padding: 12px; }
  .calendar-pane { flex: 0 0 auto; }
  .agenda-pane { flex: 0 0 auto; border-left: 0; border-top: 1px solid var(--ds-border, #dce3ed); }
}
@media (max-height: 680px) {
  .calendar-toolbar { margin-bottom: 6px; }
  .agenda-legend { margin-bottom: 6px; }
}
@media (prefers-reduced-motion: reduce) { .agenda-card { transition: none; } }
</style>
