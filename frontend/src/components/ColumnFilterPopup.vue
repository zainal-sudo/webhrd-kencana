<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, onDeactivated } from "vue";
import MsIcon from "@/components/MsIcon.vue";
import { filterKey, filterLabel } from "@/utils/columnFilter";

const props = defineProps<{
  anchor: HTMLElement;
  colLabel: string;
  selected: string[];
  fetchValues: () => Promise<(string | number | null)[]>;
}>();

const emit = defineEmits<{
  (e: "apply", values: string[]): void;
  (e: "close"): void;
}>();

const root = ref<HTMLElement | null>(null);
const position = ref({ left: "12px", top: "12px", maxHeight: "380px", visibility: "hidden" as "hidden" | "visible" });
let resizeObserver: ResizeObserver | undefined;
let frame = 0;

function updatePosition() {
  const popup = root.value;
  if (!popup || !props.anchor.isConnected) return;
  const anchor = props.anchor.getBoundingClientRect();
  const margin = 12;
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight;
  const below = Math.max(0, viewportHeight - anchor.bottom - margin - 4);
  const above = Math.max(0, anchor.top - margin - 4);
  const openAbove = below < 380 && above > below;
  // Pada layar sangat pendek, gunakan ruang layar penuh agar tombol OK tetap terjangkau.
  const available = Math.max(above, below) < 180
    ? Math.max(0, viewportHeight - margin * 2)
    : openAbove ? above : below;
  const height = Math.min(popup.scrollHeight, 380, available);
  const left = Math.max(margin, Math.min(anchor.left, viewportWidth - popup.offsetWidth - margin));
  const top = Math.max(margin, Math.min(
    openAbove ? anchor.top - height - 4 : anchor.bottom + 4,
    viewportHeight - height - margin
  ));
  position.value = { left: `${left}px`, top: `${top}px`, maxHeight: `${Math.min(380, available)}px`, visibility: "visible" };
}

function schedulePosition(event?: Event) {
  // Scroll daftar nilai tidak mengubah posisi tombol filter.
  if (event?.target instanceof Node && root.value?.contains(event.target)) return;
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(updatePosition);
}
const loading = ref(true);
const loadError = ref("");
const allValues = ref<string[]>([]);
const checked = ref<string[]>([]);
const searchText = ref("");

const filteredValues = computed(() => {
  const q = searchText.value.trim().toLowerCase();
  if (!q) return allValues.value;
  return allValues.value.filter((v) => filterLabel(v).toLowerCase().includes(q));
});

const isAllSelected = computed(
  () => allValues.value.length > 0 && checked.value.length >= allValues.value.length
);

function toggleOne(v: string) {
  const i = checked.value.indexOf(v);
  if (i >= 0) checked.value.splice(i, 1);
  else checked.value.push(v);
}

function selectAll() {
  const set = new Set(checked.value);
  for (const v of filteredValues.value) set.add(v);
  checked.value = [...set];
}

function clearAll() {
  checked.value = [];
}

function onOk() {
  emit("apply", isAllSelected.value ? [] : [...checked.value]);
}

function onDocClick(e: MouseEvent) {
  const target = e.target as Node;
  if (root.value && !root.value.contains(target) && !props.anchor.contains(target)) emit("close");
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}

onMounted(async () => {
  document.addEventListener("mousedown", onDocClick);
  document.addEventListener("keydown", onKey);
  window.addEventListener("resize", schedulePosition);
  document.addEventListener("scroll", schedulePosition, true);
  await nextTick();
  updatePosition();
  if (root.value) {
    resizeObserver = new ResizeObserver(() => schedulePosition());
    resizeObserver.observe(root.value);
  }
  try {
    const list = await props.fetchValues();
    allValues.value = [...new Set((list || []).map(filterKey))];
    checked.value =
      props.selected.length > 0 ? props.selected.map(String) : [...allValues.value];
  } catch {
    loadError.value = "Gagal memuat daftar nilai";
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => {
  document.removeEventListener("mousedown", onDocClick);
  document.removeEventListener("keydown", onKey);
  window.removeEventListener("resize", schedulePosition);
  document.removeEventListener("scroll", schedulePosition, true);
  resizeObserver?.disconnect();
  cancelAnimationFrame(frame);
});
onDeactivated(() => emit("close"));
</script>

<template>
  <Teleport to="body">
  <div ref="root" class="col-filter-popup" :style="position" role="dialog" :aria-label="`Filter ${colLabel}`" @click.stop>
    <div class="cfp-head">
      <MsIcon name="filter_list" :size="14" />
      <span>{{ colLabel }}</span>
    </div>
    <div class="cfp-search">
      <MsIcon name="search" :size="13" />
      <input v-model="searchText" type="text" placeholder="Cari baris di kolom ini..." />
    </div>
    <div class="cfp-tools">
      <span class="cfp-caption">PILIH NILAI</span>
      <button class="cfp-link" @click="selectAll">Pilih Semua</button>
      <button class="cfp-link" @click="clearAll">Sembunyikan Semua</button>
    </div>
    <div class="cfp-list">
      <div v-if="loading" class="cfp-state">Memuat...</div>
      <div v-else-if="loadError" class="cfp-state error">{{ loadError }}</div>
      <div v-else-if="filteredValues.length === 0" class="cfp-state">Tidak ada nilai</div>
      <label v-for="v in filteredValues" :key="v" class="cfp-item">
        <input
          type="checkbox"
          :checked="checked.includes(v)"
          @change="toggleOne(v)"
        />
        <span :title="filterLabel(v)">{{ filterLabel(v) }}</span>
      </label>
    </div>
    <div class="cfp-foot">
      <button class="cfp-btn primary" :disabled="loading" @click="onOk">OK</button>
    </div>
  </div>
  </Teleport>
</template>

<style scoped>
.col-filter-popup {
  position: fixed;
  width: 320px;
  max-width: calc(100vw - 24px);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
  border: 1px solid #9aa5b5;
  box-shadow: 0 8px 22px rgba(15, 26, 46, 0.28);
  z-index: 1000;
  font-family: "Plus Jakarta Sans", sans-serif;
  text-align: left;
  font-weight: 400;
}
.cfp-head {
  flex-shrink: 0;
  overflow-wrap: anywhere;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--ds-primary-dark, #243656);
  border-bottom: 1px solid #d7dde5;
}
.cfp-search {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 10px 4px;
  border: 1px solid #b0b8c4;
  padding: 0 7px;
  height: 28px;
  color: #6b7a90;
}
.cfp-search input {
  min-width: 0;
  border: none;
  outline: none;
  font-size: 11.5px;
  font-family: inherit;
  width: 100%;
  background: transparent;
  color: var(--ds-on-surface, #1b2d4a);
}
.cfp-tools {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 6px 10px 2px;
}
.cfp-caption {
  font-size: 9.5px;
  font-weight: 800;
  color: #8a94a3;
  letter-spacing: 0.05em;
  flex-basis: 100%;
}
.cfp-link {
  white-space: normal;
  border: none;
  background: transparent;
  color: var(--ds-primary, #3b5998);
  font-size: 10.5px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  padding: 0;
}
.cfp-link:hover {
  text-decoration: underline;
}
.cfp-list {
  flex: 1 1 auto;
  min-height: 0;
  max-height: 210px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 4px 6px;
  border-bottom: 1px solid #d7dde5;
}
.cfp-state {
  padding: 14px;
  text-align: center;
  font-size: 11px;
  color: #8a94a3;
}
.cfp-state.error {
  color: #c02828;
}
.cfp-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 4px 8px;
  font-size: 11.5px;
  color: var(--ds-on-surface, #1b2d4a);
  cursor: pointer;
  white-space: nowrap;
}
.cfp-item:hover {
  background: #eef2f8;
}
.cfp-item span {
  overflow: hidden;
  text-overflow: ellipsis;
}
.cfp-item input {
  flex-shrink: 0;
  accent-color: var(--ds-primary, #3b5998);
}
.cfp-foot {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  padding: 8px 10px;
}
.cfp-btn {
  height: 28px;
  padding: 0 18px;
  border: none;
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 800;
  cursor: pointer;
}
.cfp-btn.primary {
  background: var(--ds-primary, #3b5998);
  color: #fff;
}
.cfp-btn.primary:hover:not(:disabled) {
  background: var(--ds-primary-darken-1, #2c4472);
}
.cfp-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
