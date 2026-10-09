<script setup lang="ts">
import { computed, ref } from "vue";
import type { KaryawanLookup } from "@/composables/useKaryawanLookup";

const props = defineProps<{ lookup: KaryawanLookup; columns: string[] }>();
const emit = defineEmits<{ select: [row: Record<string, any>] }>();
const jump = ref(1);
const labels: Record<string, string> = { Nik: "NIK", KodeAbsensi: "Kode Absensi" };
const pages = computed(() => {
  const { page, last_page } = props.lookup.pagination;
  const start = Math.max(1, Math.min(page - 2, last_page - 4));
  return Array.from({ length: Math.min(5, last_page) }, (_, i) => start + i);
});
async function run(action: () => Promise<void>) {
  try { await action(); } catch { /* Error and retry are shown in the table. */ }
}
function go(page: number) {
  if (!Number.isFinite(page)) return;
  run(() => props.lookup.load(Math.max(1, Math.min(Math.trunc(page), props.lookup.pagination.last_page))));
}
</script>

<template>
  <section class="employee-lookup" :aria-busy="lookup.loading">
    <div class="lookup-scroll">
      <table>
        <thead>
          <tr>
            <th v-for="key in columns" :key="key" :aria-sort="lookup.sortBy === key ? (lookup.sortDir === 'asc' ? 'ascending' : 'descending') : 'none'">
              <button type="button" class="sort" :disabled="lookup.loading" :aria-label="`Urutkan ${labels[key] || key}`" @click="run(() => lookup.sort(key))">
                {{ labels[key] || key }} <span v-if="lookup.sortBy === key">{{ lookup.sortDir === 'asc' ? '↑' : '↓' }}</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in lookup.rows" :key="row.Nik ?? row.KodeAbsensi" tabindex="0" @click="emit('select', row)" @keydown.enter.prevent="emit('select', row)" @keydown.space.prevent="emit('select', row)">
            <td v-for="key in columns" :key="key">{{ row[key] }}</td>
          </tr>
          <tr v-if="!lookup.rows.length" class="state"><td :colspan="columns.length" role="status">{{ lookup.loading ? 'Memuat…' : lookup.error || 'Karyawan tidak ditemukan' }}</td></tr>
        </tbody>
      </table>
    </div>
    <button v-if="lookup.error" type="button" :disabled="lookup.loading" @click="run(() => lookup.load(1))">Coba lagi</button>
    <nav class="lookup-pagination" aria-label="Halaman hasil pencarian karyawan">
      <span>{{ lookup.pagination.total }} hasil · Halaman {{ lookup.pagination.page }} / {{ lookup.pagination.last_page }}</span>
      <button type="button" :disabled="lookup.loading || lookup.pagination.page <= 1" aria-label="Halaman pertama" @click="go(1)">«</button>
      <button type="button" :disabled="lookup.loading || lookup.pagination.page <= 1" aria-label="Halaman sebelumnya" @click="go(lookup.pagination.page - 1)">‹</button>
      <button v-for="page in pages" :key="page" type="button" :class="{ active: page === lookup.pagination.page }" :aria-current="page === lookup.pagination.page ? 'page' : undefined" :disabled="lookup.loading" @click="go(page)">{{ page }}</button>
      <button type="button" :disabled="lookup.loading || lookup.pagination.page >= lookup.pagination.last_page" aria-label="Halaman berikutnya" @click="go(lookup.pagination.page + 1)">›</button>
      <button type="button" :disabled="lookup.loading || lookup.pagination.page >= lookup.pagination.last_page" aria-label="Halaman terakhir" @click="go(lookup.pagination.last_page)">»</button>
      <label>Ke <input v-model.number="jump" type="number" min="1" :max="lookup.pagination.last_page" @keyup.enter="go(jump)" /></label>
      <button type="button" :disabled="lookup.loading" @click="go(jump)">Go</button>
      <label>Baris <select v-model.number="lookup.pagination.per_page" :disabled="lookup.loading" @change="run(() => lookup.load(1))"><option :value="25">25</option><option :value="50">50</option><option :value="100">100</option></select></label>
    </nav>
  </section>
</template>

<style scoped>
.employee-lookup { color: var(--ds-text); font-size: 11px; }
.lookup-scroll { max-height: 45vh; overflow: auto; border: 1px solid var(--ds-border); }
table { width: 100%; border-collapse: separate; border-spacing: 0; }
th { position: sticky; top: 0; z-index: 1; background: var(--ds-surface-inset); min-width: 100px; }
th, td { padding: 6px; text-align: left; border-bottom: 1px solid var(--ds-border-light); }
td { background: var(--ds-surface-raised); }
tbody tr:not(.state) { cursor: pointer; }
tbody tr:not(.state):is(:hover, :focus) td { background: var(--ds-primary-50); }
.sort { width: 100%; display: flex; justify-content: space-between; gap: 8px; border: none; font-weight: 700; background: transparent; }
input, select, button { font: inherit; color: var(--ds-text); }
input, select { background: var(--ds-surface-raised); border: 1px solid var(--ds-border); padding: 4px; }
button { cursor: pointer; padding: 4px 7px; border: 1px solid var(--ds-border); background: var(--ds-surface-raised); }
button:disabled { opacity: .5; cursor: default; }
.active { background: var(--ds-primary-dark); color: white; }
.lookup-pagination { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; padding: 8px 0; }
.lookup-pagination { background: var(--ds-surface); }
.lookup-pagination > span { margin-right: auto; }
.lookup-pagination input { width: 55px; }
.state td { padding: 18px; text-align: center; }
</style>
