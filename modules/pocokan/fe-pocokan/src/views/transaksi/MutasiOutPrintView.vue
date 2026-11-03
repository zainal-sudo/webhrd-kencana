<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import api from "@/api/axios";
import LogoImg from "@/assets/logo.png";

const route = useRoute();
const data = ref<any>(null);
const isLoading = ref(true);

const months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const formatTgl = (val: string) => {
  if (!val) return "";
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  return `${String(d.getDate()).padStart(2, "0")} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

const formatQty = (val: any) =>
  Number(val || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fetchData = async () => {
  try {
    const res = await api.get(
      `/transaksi/mutasi-out/form/${encodeURIComponent(route.params.nomor as string)}`,
    );
    data.value = res.data.data;
  } catch (error) {
    console.error("Gagal memuat data cetak", error);
  } finally {
    isLoading.value = false;
    setTimeout(() => window.print(), 500);
  }
};

const paddedDetails = computed(() => {
  if (!data.value?.Detail) return [];
  const items = [...data.value.Detail];
  const minRows = 8;
  while (items.length < minRows) items.push({});
  return items;
});

onMounted(fetchData);
</script>

<template>
  <div v-if="isLoading" class="d-flex justify-center align-center h-screen">
    <v-progress-circular indeterminate color="primary" />
  </div>
  <div v-else class="print-container">
    <div v-for="(wm, index) in ['ASLI', 'COPY 1']" :key="wm" class="print-half">
      <div class="watermark">{{ wm }}</div>

      <div class="header-wrap">
        <div class="header-left">
          <div class="doc-title">MUTASI OUT {{ data.Jenis }}</div>
          <div class="d-flex mt-2" style="gap: 50px">
            <table class="info-table">
              <tr>
                <td class="lbl">Nomor</td>
                <td class="val">: {{ data.Nomor }}</td>
              </tr>
              <tr>
                <td class="lbl">Tanggal</td>
                <td class="val">: {{ formatTgl(data.Tanggal) }}</td>
              </tr>
              <tr>
                <td class="lbl">Keterangan</td>
                <td class="val">: {{ data.Keterangan }}</td>
              </tr>
            </table>
            <table class="info-table">
              <tr>
                <td class="lbl">Asal</td>
                <td class="val">
                  : {{ data.Usr }} — {{ data.Bagian }} {{ data.CabangAsal }}
                </td>
              </tr>
              <tr>
                <td class="lbl">Tujuan</td>
                <td class="val">: {{ data.CabangTujuan }}</td>
              </tr>
            </table>
          </div>
        </div>
        <div class="header-logo">
          <img :src="LogoImg" alt="Kencana Print" class="logo" />
        </div>
      </div>

      <div class="hal-info">Hal: {{ index + 1 }} of 2</div>

      <table class="data-table mt-1">
        <thead>
          <tr>
            <th style="width: 40px; text-align: center">No</th>
            <th style="width: 120px">Kode</th>
            <th>Nama</th>
            <th style="width: 80px; text-align: center">Satuan</th>
            <th style="width: 100px; text-align: right">Jumlah</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, i) in paddedDetails" :key="i">
            <td class="text-center">{{ item.Kode ? i + 1 : "" }}</td>
            <td class="fw-medium">{{ item.Kode }}</td>
            <td class="fw-medium">{{ item.Nama }}</td>
            <td class="text-center">{{ item.Satuan }}</td>
            <td class="text-right">
              {{ item.Jumlah ? formatQty(item.Jumlah) : "" }}
            </td>
          </tr>
        </tbody>
      </table>

      <div class="signature-section mt-auto">
        <div class="solid-line"></div>
        <div class="sig-boxes">
          <div class="sig-box">
            <div class="sig-title">Diserahkan Oleh</div>
            <div class="sig-name">{{ data.Usr }}</div>
          </div>
          <div class="sig-box">
            <div class="sig-title">Diterima,</div>
            <div class="sig-name"></div>
          </div>
          <div class="sig-box">
            <div class="sig-title">Mengetahui,</div>
            <div class="sig-name"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
@media print {
  @page {
    size: A4 portrait;
    margin: 0;
  }
  body {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    background: white;
    margin: 0;
  }
}
</style>

<style scoped>
.print-container {
  width: 210mm;
  height: 296mm;
  margin: 0 auto;
  background: white;
  font-family: Arial, sans-serif;
  color: #000;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.print-half {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  padding: 10mm 12mm;
  box-sizing: border-box;
  overflow: hidden;
}
.print-half:first-child {
  border-bottom: 1px dashed #ccc;
}
.watermark {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-45deg);
  font-size: 80px;
  font-weight: bold;
  color: rgba(200, 200, 200, 0.2);
  z-index: 0;
  pointer-events: none;
  white-space: nowrap;
}
.header-wrap {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  position: relative;
  z-index: 1;
  width: 100%;
}
.header-left {
  flex: 1;
}
.header-logo {
  flex-shrink: 0;
  text-align: right;
  padding-top: 4px;
}
.logo {
  height: 38px;
  object-fit: contain;
}
.doc-title {
  font-size: 16px;
  font-weight: bold;
  text-transform: uppercase;
}
.info-table {
  font-size: 11px;
  border-collapse: collapse;
}
.info-table td {
  padding: 2px 4px 2px 0;
  vertical-align: top;
}
.info-table .lbl {
  width: 65px;
}
.hal-info {
  text-align: right;
  font-size: 10px;
  font-weight: bold;
  margin-top: -12px;
  margin-bottom: 2px;
  position: relative;
  z-index: 1;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  position: relative;
  z-index: 1;
}
.data-table th {
  border-top: 1.5px solid #000;
  border-bottom: 1.5px solid #000;
  padding: 5px;
  font-weight: bold;
  text-align: left;
}
.data-table td {
  padding: 4px 5px;
  height: 20px;
}
.signature-section {
  position: relative;
  width: 100%;
  z-index: 1;
}
.mt-auto {
  margin-top: auto;
}
.solid-line {
  width: 100%;
  height: 1px;
  background-color: #000;
  margin-bottom: 10px;
}
.sig-boxes {
  display: flex;
  gap: 20px;
}
.sig-box {
  width: 130px;
  height: 65px;
  border: 1px dashed #000;
  border-top: none;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  padding: 4px;
}
.sig-title {
  font-size: 11px;
}
.sig-name {
  font-size: 11px;
  font-weight: bold;
  text-transform: uppercase;
}
.text-center {
  text-align: center;
}
.text-right {
  text-align: right;
}
.fw-medium {
  font-weight: 500;
}
.mt-1 {
  margin-top: 4px;
}
.mt-2 {
  margin-top: 8px;
}
.d-flex {
  display: flex;
}
</style>
