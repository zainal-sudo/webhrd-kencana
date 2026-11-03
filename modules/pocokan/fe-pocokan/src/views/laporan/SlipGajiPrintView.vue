<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useToast } from "vue-toastification";
import { IconPrinter } from "@tabler/icons-vue";
import { lapGajiApi, type LapGajiItem } from "@/api/laporan/lapGajiApi";
import { formatTerbilangGaji, roundTHPGaji } from "@/utils/terbilang";
import LogoImg from "@/assets/logo2.png";

const route = useRoute();
const toast = useToast();

const periode1 = String(route.query.periode1 ?? "");
const periode2 = String(route.query.periode2 ?? "");

type SlipItem = LapGajiItem & { terbilang: string };

const items = ref<SlipItem[]>([]);
const isLoading = ref(true);

const BULAN_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

// "2026-04-17" -> { d: 17, m: 4, y: 2026 }
const parseTanggal = (val: string) => {
  const parts = String(val || "").split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return { d: parts[2], m: parts[1], y: parts[0] };
};

// "17-29 April 2026" bila sebulan, kalau beda bulan/tahun ditulis lengkap.
const formatPeriode = (p1: string, p2: string): string => {
  const a = parseTanggal(p1);
  const b = parseTanggal(p2);
  if (!a || !b) return `${p1} s/d ${p2}`;
  if (a.y === b.y && a.m === b.m) {
    return `${a.d}-${b.d} ${BULAN_ID[a.m - 1]} ${a.y}`;
  }
  return `${a.d} ${BULAN_ID[a.m - 1]} ${a.y}-${b.d} ${BULAN_ID[b.m - 1]} ${b.y}`;
};

const periodeText = computed(() => formatPeriode(periode1, periode2));

const formatNumber = (value: number) => {
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
};
const formatWholeNumber = (value: number) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(roundTHPGaji(value));

const isCash = (rekening: unknown) =>
  String(rekening ?? "").trim() === "";

// Slip hanya dicetak bila cash DAN ada uang yang benar-benar diterima.
// THP = kehadiran + lembur - potongan (lihat lapGajiService.js),
// sama dengan nilai "Diterima", jadi dipakai sebagai indikator final.
const isEligibleSlip = (row: LapGajiItem) =>
  isCash(row.rekening) && roundTHPGaji(row.thp) > 0;

const loadData = async () => {
  if (!periode1 || !periode2) {
    toast.error("Periode belum diisi.");
    isLoading.value = false;
    return;
  }
  try {
    const data = await lapGajiApi.getData(periode1, periode2);
    items.value = data
      .filter((row) => isEligibleSlip(row))
      .map((row) => ({
        ...row,
        thp: roundTHPGaji(row.thp),
        terbilang: formatTerbilangGaji(row.thp),
      }));
    if (items.value.length === 0) {
      toast.info("Tidak ada karyawan cash dengan pembayaran > 0 pada periode ini.");
    }
  } catch (e: any) {
    toast.error(
      e.response?.data?.message ?? "Gagal memuat data slip gaji."
    );
  } finally {
    isLoading.value = false;
  }
};

const cetak = () => {
  window.print();
};

onMounted(() => {
  void loadData();
});
</script>

<template>
  <div class="slip-screen">
    <!-- Toolbar (layar saja, tidak ikut tercetak) -->
    <div class="slip-toolbar no-print">
      <span class="slip-toolbar-info">
        Slip Gaji Cash — {{ periodeText }} ({{ items.length }} slip)
      </span>
      <v-btn
        color="primary"
        variant="flat"
        size="small"
        :disabled="isLoading || items.length === 0"
        @click="cetak"
      >
        <IconPrinter :size="16" class="mr-1" />
        Cetak
      </v-btn>
    </div>

    <div v-if="isLoading" class="slip-loading">Memuat slip gaji...</div>
    <div v-else-if="items.length === 0" class="slip-loading">
      Tidak ada slip untuk dicetak.
    </div>

    <!-- Satu halaman per slip -->
    <div v-else class="slip-pages">
      <div v-for="row in items" :key="`${row.unit}-${row.id}`" class="slip-page">
        <div class="slip-head">
          <div class="slip-title">SLIP GAJI</div>
          <img :src="LogoImg" alt="Kencana Print" class="slip-logo" />
        </div>

        <div class="slip-cols">
          <div class="kv-group kv-left">
            <div class="kv">
              <span class="k">Nama</span><span class="c">:</span
              ><span class="v"
                ><span class="id-num">{{ row.id }}.</span>
                <span class="employee-name">{{ row.nama }}</span></span
              >
            </div>
            <div class="kv">
              <span class="k">Periode</span><span class="c">:</span
              ><span class="v">{{ periodeText }}</span>
            </div>
            <div class="kv">
              <span class="k">Bagian</span><span class="c">:</span
              ><span class="v">{{ row.bagian }}</span>
            </div>
          </div>
          <div class="kv-group kv-right">
            <div class="kv">
              <span class="k">Masuk</span><span class="c">:</span
              ><span class="v">{{ row.hari }}</span>
            </div>
            <div class="kv">
              <span class="k">Lembur &le;2</span><span class="c">:</span
              ><span class="v">{{ row.lemburLE2 }}</span>
            </div>
            <div class="kv">
              <span class="k">Lembur &gt;2</span><span class="c">:</span
              ><span class="v">{{ row.lemburGT2 }}</span>
            </div>
          </div>
        </div>

        <div class="kv-group slip-nominal">
          <div class="kv">
            <span class="k">Gaji</span><span class="c">:</span
            ><span class="v">Rp{{ formatNumber(row.kehadiran) }}</span>
          </div>
          <div class="kv">
            <span class="k">Lembur</span><span class="c">:</span
            ><span class="v">Rp{{ formatNumber(row.lembur) }}</span>
          </div>
          <div class="kv">
            <span class="k">Total</span><span class="c">:</span
            ><span class="v">Rp{{ formatWholeNumber(row.thp) }}</span>
          </div>
          <div class="kv">
            <span class="k">Pot. BS</span><span class="c">:</span
            ><span class="v pot-bs">Rp{{ formatNumber(row.potongan) }}</span>
          </div>
        </div>

        <div class="slip-diterima">
          Diterima: Rp{{ formatWholeNumber(row.thp) }},-
        </div>
        <div class="slip-terbilang">{{ row.terbilang }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.slip-screen {
  background: #f3f4f6;
  min-height: 100vh;
  padding: 16px;
  font-family: Arial, Helvetica, sans-serif;
}
.slip-toolbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 16px;
  font-family: Arial, Helvetica, sans-serif;
}
.slip-toolbar-info {
  font-size: 13px;
  font-weight: 700;
}
.slip-loading {
  text-align: center;
  padding: 40px 0;
  color: #6b7280;
  font-size: 13px;
  font-family: Arial, Helvetica, sans-serif;
}
.slip-pages {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
}
.slip-page {
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  box-sizing: border-box;
  width: 152mm;
  min-height: 90mm;
  padding: 6mm 10mm 4mm 15mm;
  color: #000;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 8.5pt;
  line-height: 1.35;
}
.slip-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 4mm;
  margin-bottom: 1.5mm;
}
.slip-title {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 12pt;
  font-weight: 700;
  text-decoration: underline;
  letter-spacing: 0.5px;
}
.slip-logo {
  height: 6.5mm;
  max-width: 36mm;
  object-fit: contain;
}
.slip-cols {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 4mm;
  margin-bottom: 2.5mm;
}
.kv-group {
  display: flex;
  flex-direction: column;
  row-gap: 0.6mm;
}
.kv-left {
  flex: 1 1 auto;
  min-width: 0;
}
.kv-right {
  flex: 0 0 40mm;
  max-width: 40mm;
}
.kv {
  display: grid;
  align-items: baseline;
  column-gap: 1.5mm;
}
.kv-left .kv,
.slip-nominal .kv {
  grid-template-columns: 14mm 3mm 1fr;
}
.kv-right .kv {
  grid-template-columns: 19mm 3mm 1fr;
}
.slip-nominal {
  row-gap: 0.6mm;
  margin-bottom: 0;
}
.kv .k {
  white-space: nowrap;
  font-weight: 400;
}
.kv .c {
  font-weight: 400;
}
.kv .v {
  font-weight: 400;
  overflow-wrap: anywhere;
}
.employee-name {
  font-weight: 700;
}
.pot-bs {
  text-decoration: underline;
}
.slip-diterima {
  font-family: Arial, Helvetica, sans-serif;
  font-weight: 700;
  margin: 2mm 0 0;
}
.slip-terbilang {
  font-family: Arial, Helvetica, sans-serif;
  font-style: italic;
  font-weight: 400;
  margin-top: 2.5mm;
}

@media print {
  .no-print,
  .slip-toolbar,
  .slip-loading {
    display: none !important;
  }
  .slip-screen {
    background: #fff !important;
    min-height: auto;
    padding: 0 !important;
    margin: 0 !important;
  }
  .slip-pages {
    gap: 0;
    align-items: stretch;
  }
  .slip-page {
    border: none !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    background: #fff !important;
    box-sizing: border-box;
    /* Margin fisik: kiri 15 mm, kanan 10 mm (termasuk margin halaman 3 mm). */
    width: 146mm;
    height: 84mm;
    min-height: auto;
    padding: 3mm 7mm 1mm 12mm;
    margin: 0;
    overflow: hidden;
    page-break-after: always;
    break-after: page;
    break-inside: avoid;
  }
  .slip-page:last-child {
    page-break-after: auto;
    break-after: auto;
  }
  @page {
    size: 152mm 90mm;
    margin: 3mm;
  }
}
</style>
