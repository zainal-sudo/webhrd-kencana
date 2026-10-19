<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";
import { api, getErrorMessage } from "@/api/axios";

interface DetailRow {
  Nik: string;
  Nama: string | null;
  Mulai: string | null;
  Akhir: string | null;
  Keterangan: string | null;
  Panggilan: number | string | boolean | null;
}

const props = defineProps<{ nomor: string; preloaded?: DetailRow[] }>();
const rows = ref<DetailRow[]>([]);
const loading = ref(false);
const error = ref("");
let request = 0;

async function load() {
  const current = ++request;
  rows.value = [];
  error.value = "";
  if (props.preloaded !== undefined) {
    rows.value = props.preloaded;
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const { data } = await api.get("/transaksi/lembur/detail", { params: { nomor: props.nomor } });
    if (current === request) rows.value = data.data || [];
  } catch (err) {
    if (current === request) error.value = getErrorMessage(err, "Gagal memuat detail SPL.");
  } finally {
    if (current === request) loading.value = false;
  }
}

watch(() => [props.nomor, props.preloaded], load, { immediate: true });
onUnmounted(() => { ++request; });
</script>

<template>
  <section class="spl-detail" :aria-label="`Rincian SPL: ${nomor}`" :aria-busy="loading">
    <h3>Rincian SPL: <span>{{ nomor }}</span></h3>
    <p v-if="loading" class="detail-state" role="status">Memuat detail…</p>
    <div v-else-if="error" class="detail-state detail-error" role="alert">
      <span>{{ error }}</span>
      <button type="button" @click="load">Coba lagi</button>
    </div>
    <p v-else-if="!rows.length" class="detail-state">Belum ada detail karyawan</p>
    <div v-else class="detail-scroll" tabindex="0" role="region" :aria-label="`Tabel detail SPL ${nomor}`">
      <table>
        <thead><tr><th scope="col">No</th><th scope="col">NIK</th><th scope="col">Nama</th><th scope="col">Jam Mulai</th><th scope="col">Jam Akhir</th><th scope="col">Keterangan</th><th scope="col">Panggilan</th></tr></thead>
        <tbody>
          <tr v-for="(row, index) in rows" :key="index">
            <td>{{ index + 1 }}</td><td>{{ row.Nik }}</td><td>{{ row.Nama || '—' }}</td>
            <td class="clock">{{ row.Mulai || '—' }}</td><td class="clock">{{ row.Akhir || '—' }}</td>
            <td class="description">{{ row.Keterangan || '—' }}</td>
            <td>{{ Number(row.Panggilan) === 1 ? 'Ya' : 'Tidak' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.spl-detail { --detail-line: color-mix(in srgb, var(--ds-primary-100) 55%, var(--ds-surface-raised)); min-width: 0; color: var(--ds-text); border: 1px solid var(--detail-line); border-radius: 7px; background: var(--ds-surface-raised); overflow: hidden; box-shadow: 0 3px 6px rgb(15 35 65 / 8%), 0 8px 18px -6px rgb(15 35 65 / 18%); }
:root[data-theme="dark"] .spl-detail { box-shadow: 0 3px 6px rgb(0 0 0 / 18%), 0 8px 18px -6px rgb(0 0 0 / 35%); }
h3 { margin: 0; padding: 8px 12px; background: color-mix(in srgb, var(--ds-primary-50) 75%, var(--ds-surface-raised)); font-size: 12px; font-weight: 700; border-bottom: 1px solid var(--detail-line); }
h3 span { color: var(--ds-primary); overflow-wrap: anywhere; }
.detail-scroll { overflow: auto; max-height: 320px; }
table { width: 100%; border-collapse: collapse; font-size: 12px; text-align: left; }
th, td { padding: 7px 10px; border-bottom: 1px solid var(--detail-line); line-height: 1.5; }
thead th { position: sticky; top: 0; z-index: 1; color: var(--ds-text); font-size: 11px; font-weight: 700; white-space: nowrap; border-bottom: 1px solid var(--ds-border-light); }
/* Keep the parent browse table's global dark/hover rules outside this child table. */
:root .spl-detail .detail-scroll thead th { background: var(--ds-surface-raised) !important; }
:root .spl-detail .detail-scroll tbody > tr:nth-child(odd) > td { background: var(--ds-surface-raised) !important; }
:root .spl-detail .detail-scroll tbody > tr:nth-child(even) > td { background: color-mix(in srgb, var(--ds-primary) 2%, var(--ds-surface-raised)) !important; }
:root .spl-detail .detail-scroll tbody > tr > td { border-color: var(--detail-line) !important; }
:root .spl-detail .detail-scroll tbody > tr:hover > td { background: color-mix(in srgb, var(--ds-primary) 5%, var(--ds-surface-raised)) !important; }
tbody tr:last-child td { border-bottom: 0; }
.clock { white-space: nowrap; font-variant-numeric: tabular-nums; }
.description { min-width: 160px; max-width: 360px; white-space: pre-wrap; overflow-wrap: anywhere; }
.detail-state { padding: 12px; margin: 0; font-size: 12px; }
.detail-error { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; color: var(--ds-error); }
button { padding: 5px 10px; border: 1px solid var(--ds-border); border-radius: 6px; background: var(--ds-surface-raised); color: var(--ds-text); font: inherit; cursor: pointer; }
button:hover { background: var(--ds-surface-inset); }
button:focus-visible, .detail-scroll:focus-visible { outline: 2px solid var(--ds-primary); outline-offset: -2px; }
</style>
