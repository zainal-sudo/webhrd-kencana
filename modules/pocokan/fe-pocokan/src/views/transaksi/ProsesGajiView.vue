<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, onActivated } from "vue";
import { useRoute, onBeforeRouteLeave } from "vue-router";
import { useToast } from "vue-toastification";
import { IconCalculator, IconDeviceFloppy, IconDownload, IconAlertTriangle, IconAlertCircle } from "@tabler/icons-vue";

import BaseBrowse from "@/components/BaseBrowse.vue";
import { useTabsStore } from "@/stores/tabsStore";
import { unitApi, type Unit } from "@/api/master/unitApi";
import { prosesGajiApi, type ProsesGajiItem } from "@/api/transaksi/prosesGajiApi";
import { exportToExcel } from "@/utils/exportExcel";

const toast = useToast();
const route = useRoute();
const tabsStore = useTabsStore();
const tabId = route.path;
const MENU_ID = "10"; // Sesuai tmenu Gaji

const getTodayFormatted = () => {
  const d = new Date();
  return d.toISOString().split("T")[0];
};

const periode1 = ref(getTodayFormatted());
const periode2 = ref(getTodayFormatted());
const unitList = ref<Unit[]>([]);
// Default SEMUA sejak awal supaya filter tidak blank saat muat pertama gagal.
const selectedUnit = ref("SEMUA");
const items = ref<ProsesGajiItem[]>([]);
const isLoading = ref(false);
const isSaving = ref(false);
const hasFilledPotongan = computed(() =>
  items.value.some((item) => item.potongan !== null && item.potongan !== "")
);

// Samakan dulu "", null, dan angka supaya "0" vs 0 tidak dianggap berubah.
const norm = (value: unknown) =>
  value === null || value === undefined || value === "" ? "" : String(Number(value));

const fingerprint = computed(() =>
  items.value.map((item) => `${item.id}|${norm(item.potongan)}`).join("\n")
);
const savedFingerprint = ref("");
const isDirty = computed(() => fingerprint.value !== savedFingerprint.value);

// Satu jawaban dipakai bersama bila navigasi/tutup tab dipicu bersamaan.
const showDiscardDialog = ref(false);
const discardMessage = ref("");
let discardResolver: ((value: boolean) => void) | null = null;
let discardPending: Promise<boolean> | null = null;
const konfirmasiBuang = (message: string) => {
  if (discardPending) return discardPending;
  discardMessage.value = message;
  showDiscardDialog.value = true;
  discardPending = new Promise<boolean>((resolve) => { discardResolver = resolve; });
  return discardPending;
};
const jawabDiscard = (ya: boolean) => {
  showDiscardDialog.value = false;
  const resolve = discardResolver;
  discardResolver = null;
  discardPending = null;
  resolve?.(ya);
};

let closingOwnTab = false;
tabsStore.setCloseGuard(tabId, async () => {
  if (!isDirty.value) return true;
  const bolehTutup = await konfirmasiBuang("Tutup tab ini? Perubahan potongan yang belum disimpan akan hilang.");
  if (bolehTutup) closingOwnTab = true;
  return bolehTutup;
});
onBeforeRouteLeave(() => {
  if (closingOwnTab) {
    closingOwnTab = false;
    return true; // Penutupan tab sudah dikonfirmasi, jangan bertanya dua kali.
  }
  if (!isDirty.value) return true;
  return konfirmasiBuang("Keluar dari halaman ini? Perubahan potongan yang belum disimpan akan hilang.");
});
// Guard tetap terdaftar selama instance tersimpan di KeepAlive.
onActivated(() => {
  closingOwnTab = false;
  // Muat ulang otomatis kalau muat awal gagal, tanpa refresh browser manual.
  if (!isDirty.value && !isLoading.value && items.value.length === 0) {
    if (unitList.value.length === 0) void loadUnits().then(() => loadData());
    else void loadData();
  }
});
const handleBeforeUnload = (e: BeforeUnloadEvent) => {
  if (!isDirty.value) return;
  e.preventDefault();
  e.returnValue = "";
};
window.addEventListener("beforeunload", handleBeforeUnload);
onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", handleBeforeUnload);
  tabsStore.setCloseGuard(tabId, null);
  jawabDiscard(false);
});

// Error koneksi jangan ditampilkan mentah seperti "read ECONNRESET".
const isConnectionError = (e: any) => {
  const code = String(e?.code ?? "");
  const msg = String(e?.message ?? e?.response?.data?.message ?? "");
  return (
    e?.response?.status === 503 ||
    /ECONNRESET|ECONNREFUSED|ETIMEDOUT|PROTOCOL_CONNECTION_LOST|ENOTFOUND|EAI_AGAIN|Network Error/i.test(
      `${code} ${msg}`,
    )
  );
};
const pesanMuat = (e: any, fallback: string) =>
  isConnectionError(e)
    ? "Koneksi ke server terputus, mencoba memuat ulang..."
    : (e?.response?.data?.message ?? fallback);

const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));
const loadUnits = async (maxAttempt = 3) => {
  for (let attempt = 1; attempt <= maxAttempt; attempt++) {
    try {
      unitList.value = await unitApi.getAll();
      if (!selectedUnit.value) selectedUnit.value = "SEMUA";
      return;
    } catch (e) {
      console.error(`Gagal memuat daftar unit (percobaan ${attempt}):`, e);
      if (attempt === maxAttempt) {
        toast.warning("Daftar unit gagal dimuat, menampilkan SEMUA. Coba refresh.");
        return;
      }
      await tidur(400 * attempt);
    }
  }
};

onMounted(async () => {
  await loadUnits();
  await loadData();
});

const headers = [
  { title: "No", key: "no", width: "55px", align: "center" as const },
  { title: "Id", key: "id", width: "80px", align: "center" as const },
  { title: "Nama", key: "nama", minWidth: "180px", align: "start" as const },
  { title: "Unit", key: "unit", width: "80px", align: "center" as const },
  { title: "Bagian", key: "bagian", width: "120px", align: "start" as const },
  { title: "Kehadiran", key: "kehadiran", width: "120px", align: "center" as const },
  { title: "Lembur <= 2", key: "lemburLE2", width: "130px", align: "center" as const },
  { title: "Lembur > 2", key: "lemburGT2", width: "130px", align: "center" as const },
  { title: "Potongan", key: "potongan", width: "140px", align: "end" as const },
];

// Auto refresh saat filter berubah (pola browse)
const filterValues = computed(() => ({
  periode1: periode1.value,
  periode2: periode2.value,
  selectedUnit: selectedUnit.value,
}));

const loadData = async () => {
  if (!periode1.value || !periode2.value) return;
  if (!selectedUnit.value) return;

  isLoading.value = true;
  try {
    items.value = await prosesGajiApi.getData(selectedUnit.value, periode1.value, periode2.value);
    savedFingerprint.value = fingerprint.value;
    if (items.value.length === 0) {
      toast.info("Tidak ada data karyawan / absensi pada rentang periode ini.");
    }
  } catch (e: any) {
    console.error("Gagal memuat data proses gaji:", e);
    toast.error(pesanMuat(e, "Gagal memuat data proses gaji."));
  } finally {
    isLoading.value = false;
  }
};

const handleSave = async () => {
  if (items.value.length === 0) {
    toast.warning("Tidak ada data untuk disimpan.");
    return;
  }
  if (items.value.some((item) =>
    item.potongan !== null && item.potongan !== "" &&
    (!Number.isFinite(Number(item.potongan)) || Number(item.potongan) < 0)
  )) {
    toast.warning("Potongan harus berupa angka nol atau lebih.");
    return;
  }

  // Menyimpan tabel yang seluruhnya kosong berarti menghapus semua potongan
  // periode ini, jadi pastikan admin memang sengaja mau begitu.
  if (!hasFilledPotongan.value && !confirm(
    "Tidak ada potongan yang terisi.\n\n" +
    "Menyimpan akan mengosongkan seluruh data potongan pada periode dan unit ini. Lanjutkan?"
  )) {
    return;
  }

  isSaving.value = true;
  try {
    await prosesGajiApi.save({
      pabKode: selectedUnit.value,
      periode1: periode1.value,
      periode2: periode2.value,
      items: items.value,
    });
    savedFingerprint.value = fingerprint.value;
    toast.success(
      hasFilledPotongan.value
        ? "Proses gaji berhasil disimpan."
        : "Seluruh data potongan periode ini dikosongkan."
    );
  } catch (e: any) {
    toast.error(e.response?.data?.message ?? "Gagal menyimpan proses gaji.");
  } finally {
    isSaving.value = false;
  }
};

const exportExcelData = () => {
  const exportItems = getExportItems();
  if (!exportItems.length) {
    toast.warning("Tidak ada data untuk diekspor.");
    return;
  }
  if (isDirty.value) {
    toast.warning("Ada perubahan potongan yang belum disimpan. Klik Save terlebih dahulu sebelum Export.");
    return;
  }
  exportToExcel({
    title: `Export Proses Gaji - ${periode1.value} s/d ${periode2.value}`,
    filenamePrefix: `proses-gaji-${selectedUnit.value}-${periode1.value}`,
    columns: [
      { header: "No", key: "no", width: 8, align: "center" },
      { header: "Id", key: "id", width: 12, align: "center" },
      { header: "Nama", key: "nama", width: 30 },
      { header: "Unit", key: "unit", width: 12, align: "center" },
      { header: "Bagian", key: "bagian", width: 20 },
      { header: "Kehadiran", key: "kehadiran", width: 12, align: "center" },
      { header: "Lembur <= 2", key: "lemburLE2", width: 14, align: "center" },
      { header: "Lembur > 2", key: "lemburGT2", width: 14, align: "center" },
      { header: "Potongan", key: "potongan", width: 18, align: "right" },
    ],
    rows: exportItems.map((item) => ({
      ...item,
      potongan: item.potongan ?? "",
    })),
  });
};
const browseRef = ref<InstanceType<typeof BaseBrowse> | null>(null);
const getExportItems = (): typeof items.value => browseRef.value?.getExportItems() ?? [];
</script>

<template>
  <BaseBrowse
    ref="browseRef"
    title="Proses Gaji"
    :menu-id="MENU_ID"
    :icon="IconCalculator"
    :headers="headers"
    :items="items"
    :is-loading="isLoading"
    item-value="no"
    :filter-values="filterValues"
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

      <div class="filter-group">
        <span class="filter-lbl">Unit</span>
        <select v-model="selectedUnit" class="select-inp">
          <option value="SEMUA">SEMUA</option>
          <option
            v-for="u in unitList"
            :key="u.kode"
            :value="u.kode"
          >
            {{ u.kode }} — {{ u.nama }}
          </option>
        </select>
      </div>
    </template>

    <!-- ── Aksi: Export & Save ── -->
    <template #extra-actions>
      <v-chip v-if="isDirty" color="warning" size="small" variant="tonal">
        <IconAlertTriangle :size="14" class="mr-1" />
        Belum disimpan
      </v-chip>
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
        color="primary"
        variant="flat"
        @click="handleSave"
        :loading="isSaving"
        :disabled="!items.length || !isDirty"
      >
        <IconDeviceFloppy :size="16" class="mr-1" />
        Save
      </v-btn>
    </template>

    <!-- ── Tampilan kolom ── -->
    <template #item.kehadiran="{ item }">
      <span>{{ item.kehadiran }}</span>
    </template>

    <template #item.lemburLE2="{ item }">
      <span>{{ item.lemburLE2 }}</span>
    </template>

    <template #item.lemburGT2="{ item }">
      <span>{{ item.lemburGT2 }}</span>
    </template>

    <template #item.potongan="{ item }">
      <span class="editable-cell">
        <input
          v-model.number="item.potongan"
          type="number"
          class="table-inp"
          min="0"
          step="any"
          inputmode="decimal"
          aria-label="Potongan"
          title="Kosongkan untuk mengembalikan ke NULL."
        />
      </span>
    </template>
  </BaseBrowse>
  <v-dialog v-model="showDiscardDialog" max-width="380" persistent>
    <v-card class="discard-dialog-card">
      <div class="discard-dialog-icon" aria-hidden="true">
        <IconAlertCircle :size="28" :stroke-width="1.8" />
      </div>
      <h2 class="discard-dialog-title">
        Perubahan Belum Disimpan
      </h2>
      <p class="discard-dialog-message">{{ discardMessage }}</p>
      <v-card-actions class="discard-dialog-actions">
        <v-btn class="discard-dialog-cancel" variant="outlined" @click="jawabDiscard(false)">
          Batal
        </v-btn>
        <v-btn class="discard-dialog-confirm" color="error" variant="flat" @click="jawabDiscard(true)">
          Keluar Tanpa Simpan
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.discard-dialog-card {
  padding: 20px 24px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(17, 24, 39, 0.12);
}
.discard-dialog-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin-bottom: 12px;
  border-radius: 50%;
  background: #ffedd5;
  color: #dc2626;
}
.discard-dialog-title {
  margin: 0;
  padding: 0;
  color: #111827;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: 0;
  white-space: normal;
  text-align: left;
}
.discard-dialog-card .discard-dialog-message {
  margin: 8px 0 0;
  padding: 0;
  color: #4b5563;
  font-size: 14px;
  line-height: 1.5;
  letter-spacing: 0;
  text-align: left;
}
.discard-dialog-card .discard-dialog-actions {
  min-height: 0;
  padding: 16px 0 0;
  background: #fff;
  flex-wrap: nowrap;
  justify-content: flex-end;
  gap: 10px;
}
.discard-dialog-actions .v-btn {
  min-width: 0;
  height: 38px;
  margin: 0;
  padding: 0 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
}
.discard-dialog-cancel {
  background: #fff;
  color: #374151;
  border-color: #d1d5db;
}
.discard-dialog-confirm {
  color: #fff;
}
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
.select-inp {
  height: 32px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 0 8px;
  font-size: 12px;
  outline: none;
  min-width: 220px;
  background: #fff;
  cursor: pointer;
}
.select-inp:focus {
  border-color: #3B5998;
}
.editable-cell {
  display: inline-block;
  background: #fef08a;
  padding: 2px 4px;
  border-radius: 3px;
}
.table-inp {
  width: 110px;
  height: 26px;
  border: 1px solid #d1d5db;
  border-radius: 3px;
  text-align: center;
  font-size: 12px;
  outline: none;
  background: white;
}
.table-inp:focus {
  border-color: #3B5998;
  box-shadow: 0 0 0 1px #3B5998;
}
</style>
