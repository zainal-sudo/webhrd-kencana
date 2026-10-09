<script setup lang="ts">
import { computed } from 'vue';
import { rupiah } from '@/utils/pinjaman';

const props = withDefaults(defineProps<{
  rows?: Array<{ periode: string | null; nominal: number | null }>;
}>(), { rows: () => [] });
const total = computed(() => props.rows.length && props.rows.every(row => row.nominal != null)
  ? props.rows.reduce((sum, row) => sum + Number(row.nominal), 0) : null);
</script>

<template>
  <section class="loan-schedule" aria-label="Rencana Potongan">
    <h3>Rencana Potongan</h3>
    <div class="schedule-scroll">
      <table>
        <thead><tr><th scope="col">Periode Potongan</th><th scope="col" class="amount">Nominal Potongan</th></tr></thead>
        <tbody>
          <tr v-for="(row, index) in rows" :key="index"><td>{{ row.periode ?? '—' }}</td><td class="amount">{{ rupiah(row.nominal) }}</td></tr>
          <tr v-if="!rows.length"><td>—</td><td class="amount">—</td></tr>
        </tbody>
        <tfoot><tr><th scope="row">Total</th><td class="amount">{{ rupiah(total) }}</td></tr></tfoot>
      </table>
    </div>
  </section>
</template>

<style scoped>
.loan-schedule { color: var(--ds-text); min-width: 0; }
h3 { margin: 0 0 6px; font-size: 12px; font-weight: 700; }
.schedule-scroll { overflow: auto; max-height: 320px; border: 1px solid var(--ds-border-light, var(--ds-border)); border-radius: 7px; box-shadow: 0 2px 6px rgb(0 0 0 / 4%); background: var(--ds-surface-raised); }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th, td { padding: 7px 10px; text-align: left; border-bottom: 1px solid var(--ds-border-light, var(--ds-border)); }
thead { background: var(--ds-surface); }
thead th { font-size: 11px; font-weight: 600; }
.amount { text-align: right; white-space: nowrap; }
tfoot { background: var(--ds-surface); font-weight: 800; }
tfoot th, tfoot td { border-bottom: 0; }
</style>
