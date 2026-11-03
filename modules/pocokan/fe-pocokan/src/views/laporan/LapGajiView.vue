<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { IconList, IconDownload, IconPrinter } from "@tabler/icons-vue";

import BaseBrowse from "@/components/BaseBrowse.vue";
import {
  lapGajiApi,
  type LapGajiItem,
} from "@/api/laporan/lapGajiApi";
import {
  exportToMultiSheetExcel,
  type MultiSheetExportColumn,
} from "@/utils/exportMultiSheetExcel";
import { formatTerbilangGaji, roundTHPGaji } from "@/utils/terbilang";

const toast = useToast();
const router = useRouter();
const MENU_ID = "10"; // Sesuai tmenu Lap. Gaji

const getTodayFormatted = () => {
  const d = new Date();
  return d.toISOString().split("T")[0];
};

// Filter
const periode1 = ref(getTodayFormatted());
const periode2 = ref(getTodayFormatted());

// Data laporan
type LapGajiReportItem = LapGajiItem & { terbilang: string };
const items = ref<LapGajiReportItem[]>([]);
const browseRef = ref<InstanceType<typeof BaseBrowse> | null>(null);
const isLoading = ref(false);

const headers = [
  { title: "No", key: "no", width: "55px", align: "center" as const },
  { title: "ID", key: "id", width: "80px", align: "center" as const },
  { title: "Nama", key: "nama", minWidth: "180px", align: "start" as const },
  { title: "Unit", key: "unit", width: "90px", align: "center" as const, sortable: true },
  { title: "Bagian", key: "bagian", width: "120px", align: "start" as const },
  { title: "Hari", key: "hari", width: "70px", align: "center" as const },
  { title: "Lembur <= 2", key: "lemburLE2", width: "110px", align: "center" as const },
  { title: "Lembur > 2", key: "lemburGT2", width: "110px", align: "center" as const },
  { title: "Kehadiran", key: "kehadiran", width: "120px", align: "end" as const },
  { title: "Lembur", key: "lembur", width: "120px", align: "end" as const },
  { title: "Potongan", key: "potongan", width: "120px", align: "end" as const },
  { title: "THP", key: "thp", width: "130px", align: "end" as const },
  { title: "Rekening", key: "rekening", width: "150px", align: "start" as const },
  { title: "Terbilang", key: "terbilang", width: "300px", align: "start" as const },
];

// Auto refresh saat filter berubah (pola browse)
const filterValues = computed(() => ({
  periode1: periode1.value,
  periode2: periode2.value,
}));

const summaryColumns = [
  { key: "kehadiran", currency: true, maxFractionDigits: 2 },
  { key: "lembur", currency: true, maxFractionDigits: 2 },
  { key: "potongan", currency: true, maxFractionDigits: 2 },
  { key: "thp", currency: true, maxFractionDigits: 0 },
  { key: "terbilang", sumKey: "thp", formatTotal: formatTerbilangGaji },
];

// Saat filter dipicu refresh (pola BaseBrowse)
const loadData = async () => {
  if (!periode1.value || !periode2.value) return;

  isLoading.value = true;

  try {
    const data = await lapGajiApi.getData(
      periode1.value,
      periode2.value
    );

    items.value = data
      .map((item) => ({
        ...item,
        thp: roundTHPGaji(item.thp),
        terbilang: formatTerbilangGaji(item.thp),
      }))
      .filter((item) => item.thp !== 0)
      .map((item, index) => ({ ...item, no: index + 1 }));
  } catch (e: any) {
    toast.error(
      e.response?.data?.message ??
        "Gagal memuat laporan gaji."
    );
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  void loadData();
});

// Format nominal uang agar lebih enak dibaca
const formatNumber = (value: number) => {
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
};
const formatWholeNumber = (value: number) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(roundTHPGaji(value));

const laporanGajiExportColumns: MultiSheetExportColumn[] = [
  { header: "No", key: "no", width: 8, align: "center" },
  { header: "ID", key: "id", width: 12, align: "center" },
  { header: "Nama", key: "nama", width: 30 },
  { header: "Unit", key: "unit", width: 12, align: "center" },
  { header: "Bagian", key: "bagian", width: 20 },
  { header: "Hari", key: "hari", width: 10, align: "center" },
  {
    header: "Lembur <= 2",
    key: "lemburLE2",
    width: 15,
    align: "center",
  },
  {
    header: "Lembur > 2",
    key: "lemburGT2",
    width: 15,
    align: "center",
  },
  {
    header: "Kehadiran",
    key: "kehadiran",
    width: 18,
    currency: true,
    numFmt: '"Rp"* #,##0',
  },
  {
    header: "Lembur",
    key: "lembur",
    width: 18,
    currency: true,
    numFmt: '"Rp"* #,##0.00;"Rp"* -#,##0.00;"Rp"* 0',
  },
  {
    header: "Potongan",
    key: "potongan",
    width: 18,
    currency: true,
    numFmt: '"Rp"* #,##0',
  },
  {
    header: "THP",
    key: "thp",
    width: 18,
    currency: true,
    numFmt: '"Rp"* #,##0',
  },
  {
    header: "Rekening",
    key: "rekening",
    width: 22,
  },
  {
    header: "Terbilang",
    key: "terbilang",
    width: 45,
    italic: true,
    noWrap: true,
  },
];

type PaymentType = "cash" | "tf";

type SalaryExportGroup = {
  unit: string;
  payment: PaymentType;
  rows: LapGajiReportItem[];
};

type SalaryNumericKey = "kehadiran" | "lembur" | "potongan" | "thp";

const sumSalaryRows = (rows: LapGajiReportItem[], key: SalaryNumericKey) =>
  rows.reduce((sum, row) => sum + Number(row[key] || 0), 0);

const exportExcelData = async () => {
  const exportItems: LapGajiReportItem[] = browseRef.value?.getExportItems() ?? [];
  if (!exportItems.length) {
    toast.warning("Tidak ada data untuk diekspor.");
    return;
  }

  const groups = new Map<string, SalaryExportGroup>();

  exportItems.forEach((row) => {
    const unit = String(row.unit ?? "-").trim().toLowerCase() || "-";
    const payment: PaymentType =
      String(row.rekening ?? "").trim() === "" ? "cash" : "tf";
    const key = JSON.stringify([unit, payment]);
    const group = groups.get(key);

    if (group) {
      group.rows.push(row);
      return;
    }

    groups.set(key, { unit, payment, rows: [row] });
  });

  const paymentOrder: Record<PaymentType, number> = {
    cash: 0,
    tf: 1,
  };
  const sheets = Array.from(groups.values())
    .sort(
      (a, b) =>
        a.unit.localeCompare(b.unit) ||
        paymentOrder[a.payment] - paymentOrder[b.payment]
    )
    .map((group) => {
      const totalTHP = sumSalaryRows(group.rows, "thp");

      return {
        name: `${group.unit}-${group.payment}`,
        columns: laporanGajiExportColumns,
        dataCount: group.rows.length,
        totalMergeThroughKey: "lemburGT2",
        rows: [
          ...group.rows,
          {
            no: "TOTAL",
            id: "",
            nama: "",
            unit: "",
            bagian: "",
            hari: "",
            lemburLE2: "",
            lemburGT2: "",
            kehadiran: sumSalaryRows(group.rows, "kehadiran"),
            lembur: sumSalaryRows(group.rows, "lembur"),
            potongan: sumSalaryRows(group.rows, "potongan"),
            thp: totalTHP,
            rekening: "",
            terbilang: formatTerbilangGaji(totalTHP),
          },
        ],
      };
    });

  const totalSemuaTHP = sumSalaryRows(exportItems, "thp");
  sheets.unshift({
    name: "SEMUA",
    columns: laporanGajiExportColumns,
    dataCount: exportItems.length,
    totalMergeThroughKey: "lemburGT2",
    rows: [
      ...exportItems,
      {
        no: "TOTAL",
        id: "",
        nama: "",
        unit: "",
        bagian: "",
        hari: "",
        lemburLE2: "",
        lemburGT2: "",
        kehadiran: sumSalaryRows(exportItems, "kehadiran"),
        lembur: sumSalaryRows(exportItems, "lembur"),
        potongan: sumSalaryRows(exportItems, "potongan"),
        thp: totalSemuaTHP,
        rekening: "",
        terbilang: formatTerbilangGaji(totalSemuaTHP),
      },
    ],
  });

  try {
    await exportToMultiSheetExcel({
      title: `Laporan Gaji ${periode1.value} s/d ${periode2.value}`,
      filenamePrefix: `laporan-gaji-${periode1.value}-${periode2.value}`,
      sheets,
    });
  } catch (error) {
    console.error(error);
    toast.error("Gagal mengekspor laporan gaji.");
  }
};

// Jumlah slip yang BENAR-BENAR eligible dicetak:
// cash (tanpa rekening) DAN THP (nilai final "Di terima") > 0.
// Harus sama dengan filter di SlipGajiPrintView agar count tombol konsisten.
const cashCount = computed(
  () =>
    items.value.filter(
      (row) =>
        String(row.rekening ?? "").trim() === "" && row.thp > 0
    ).length
);

// Cetak slip gaji khusus yang tidak punya rekening (cash) dan THP > 0,
// dibuka di tab baru dengan ukuran kertas 152mm x 90mm.
const printSlipCash = () => {
  if (cashCount.value === 0) {
    toast.warning("Tidak ada karyawan cash dengan pembayaran > 0 untuk dicetak.");
    return;
  }
  const url = router.resolve({
    name: "SlipGajiPrint",
    query: {
      periode1: periode1.value,
      periode2: periode2.value,
    },
  }).href;
  window.open(url, "_blank");
};
</script>

<template>
  <BaseBrowse
    ref="browseRef"
    title="Laporan Gaji"
    :menu-id="MENU_ID"
    :icon="IconList"
    :headers="headers"
    :items="items"
    :is-loading="isLoading"
    item-value="no"
    :summary-columns="summaryColumns"
    :filter-values="filterValues"
    :fixed-layout="false"
    @refresh="loadData"
  >
    <!-- ── Filter ── -->
    <template #filter-left>
      <div class="filter-group">
        <span class="filter-lbl">Periode</span>
        <input v-model="periode1" type="date" class="date-inp" />
        <span class="filter-sep">s/d</span>
        <input v-model="periode2" type="date" class="date-inp" />
      </div>
    </template>

    <!-- ── Export & Cetak ── -->
    <template #extra-actions>
      <v-btn
        size="small"
        variant="tonal"
        color="success"
        @click="exportExcelData"
        :disabled="!items.length"
      >
        <IconDownload :size="16" class="mr-1" />
        Export
      </v-btn>
      <v-btn
        size="small"
        variant="tonal"
        color="primary"
        @click="printSlipCash"
        :disabled="cashCount === 0"
        :title="`Cetak ${cashCount} slip cash`"
      >
        <IconPrinter :size="16" class="mr-1" />
        Cetak Slip
      </v-btn>
    </template>

    <!-- ── Custom cell angka ── -->
    <template #item.kehadiran="{ value }">
      <span class="currency-cell"><span>Rp</span><span>{{ formatNumber(value) }}</span></span>
    </template>

    <template #item.lembur="{ value }">
      <span class="currency-cell"><span>Rp</span><span>{{ formatNumber(value) }}</span></span>
    </template>

    <template #item.potongan="{ value }">
      <span class="currency-cell"><span>Rp</span><span>{{ formatNumber(value) }}</span></span>
    </template>

    <template #item.thp="{ value }">
      <span class="currency-cell font-weight-medium"><span>Rp</span><span>{{ formatWholeNumber(value) }}</span></span>
    </template>

    <template #item.terbilang="{ value }">
      <span class="terbilang-cell">{{ value }}</span>
    </template>
  </BaseBrowse>
</template>

<style scoped>
.filter-group {
  display: flex;
  align-items: center;
  gap: 6px;
}
.filter-lbl {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  white-space: nowrap;
}
.filter-sep {
  font-size: 12px;
  color: #9ca3af;
}
.date-inp {
  height: 32px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 0 8px;
  font-size: 12px;
  outline: none;
  width: 130px;
  background: #fff;
}
.date-inp:focus {
  border-color: #3B5998;
}
.currency-cell {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  font-variant-numeric: tabular-nums;
}
.terbilang-cell {
  font-style: italic;
}
</style>
