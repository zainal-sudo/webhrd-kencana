<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, onActivated } from "vue";
import { useRoute, onBeforeRouteLeave } from "vue-router";
import { useToast } from "vue-toastification";
import { IconClock, IconDeviceFloppy, IconDownload, IconAlertTriangle, IconAlertCircle } from "@tabler/icons-vue";

import BaseBrowse from "@/components/BaseBrowse.vue";
import { useTabsStore } from "@/stores/tabsStore";
import { unitApi, type Unit } from "@/api/master/unitApi";
import { absensiApi, type AbsensiItem } from "@/api/transaksi/absensiApi";
import { exportToExcel } from "@/utils/exportExcel";

const toast = useToast();
const route = useRoute();
const tabsStore = useTabsStore();
const MENU_ID = "9"; // Sesuai tmenu Absensi

const getTodayFormatted = () => {
  const d = new Date();
  return d.toISOString().split("T")[0];
};

const tanggal = ref(getTodayFormatted());
const unitList = ref<Unit[]>([]);
// Default SEMUA sejak awal supaya filter tidak blank dan tabel tetap bisa
// dimuat walau daftar unit gagal dimuat di percobaan pertama.
const selectedUnit = ref("SEMUA");
const items = ref<AbsensiItem[]>([]);
const isLoading = ref(false);
const isSaving = ref(false);
const isPulling = ref(false);
let loadRequest = 0;

// Read the rendered cells so navigation follows sorting, filters and the
// current page without maintaining a second copy of the browse order.
const editingCell = ref<string | null>(null);
let replaceOnType = true;

const onCellFocus = (event: FocusEvent) => {
  editingCell.value = null;
  replaceOnType = true;
  (event.currentTarget as HTMLInputElement).select();
};

const onCellBlur = () => {
  editingCell.value = null;
  replaceOnType = true;
};

const onCellKeydown = (event: KeyboardEvent) => {
  const input = event.currentTarget as HTMLInputElement;
  if (isPulling.value || input.disabled) {
    event.preventDefault();
    return;
  }
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;

  if (event.key === "F2") {
    event.preventDefault();
    editingCell.value = input.dataset.absensiCell ?? null;
    replaceOnType = false;
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    editingCell.value = null;
    replaceOnType = true;
    input.select();
    return;
  }

  const isEditing = editingCell.value === input.dataset.absensiCell;
  const isArrow = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key);
  if (isEditing && isArrow) return;

  if (isArrow || event.key === "Enter" || event.key === "Tab") {
    editingCell.value = null;
    replaceOnType = true;
    const cells = Array.from(
      input.closest("tbody")?.querySelectorAll<HTMLInputElement>(
        "input[data-absensi-cell]:not(:disabled)",
      ) ?? [],
    );
    const index = cells.indexOf(input);
    let target: HTMLInputElement | undefined;
    if (index >= 0) {
      if (event.key === "Tab") {
        target = cells[index + (event.shiftKey ? -1 : 1)];
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const neighbor = cells[index + (event.key === "ArrowLeft" ? -1 : 1)];
        if (neighbor?.closest("tr") === input.closest("tr")) target = neighbor;
      } else {
        const column = cells.filter((cell) => cell.dataset.absensiColumn === input.dataset.absensiColumn);
        const direction = event.key === "ArrowUp" || (event.key === "Enter" && event.shiftKey) ? -1 : 1;
        target = column[column.indexOf(input) + direction];
      }
    }
    // At either end, let Tab leave the table using normal browser focus order.
    if (event.key === "Tab" && !target) return;
    event.preventDefault();
    if (target) {
      target.focus();
      target.scrollIntoView({ block: "nearest", inline: "nearest" });
    } else {
      input.select();
    }
    return;
  }

  if (!isEditing && (event.key.length === 1 || event.key === "Backspace" || event.key === "Delete")) {
    if (replaceOnType || event.key === "Backspace" || event.key === "Delete") input.select();
    replaceOnType = false;
  }
};

// Input v-model.number bisa menghasilkan "", null, atau angka.
const terisi = (value: unknown) => value !== null && value !== undefined && value !== "";

// Nilai kehadiran yang boleh diisi manual: 0 tidak hadir, 0.5 setengah hari,
// 1 hadir, 2 dua hari. Penarikan wajah selalu menulis 1.
const NILAI_KEHADIRAN = [0, 0.5, 1, 2];

const hasFilledKehadiran = computed(() => items.value.some((item) => terisi(item.kehadiran)));
const hasFilledLembur = computed(() => items.value.some((item) => terisi(item.jamlembur)));
// Save cukup dibuka kalau salah satu kolom terisi: lembur boleh diinput lebih
// dulu tanpa harus mengisi kehadiran. Kosongnya SELURUH tabel bukan alasan
// menutup Save — justru itu cara admin mengembalikan nilai ke NULL, dan
// `isDirty` yang menentukan, bukan `hasSaveableInput`.
const hasSaveableInput = computed(() => hasFilledKehadiran.value || hasFilledLembur.value);

// ── Perubahan belum disimpan ───────────────────────────────────────────
// Tombol Save dipakai untuk edit manual. Kehadiran/lembur yang diketik admin
// hanya tersimpan di memori sampai Save ditekan, jadi perpindahan halaman,
// tab, atau pergantian filter harus dikonfirmasi lebih dulu.

// Input v-model.number bisa menghasilkan "", null, atau angka. Samakan dulu
// supaya "1" vs 1 tidak dianggap sebagai perubahan.
const norm = (value: unknown) =>
  value === null || value === undefined || value === "" ? "" : String(Number(value));

const fingerprint = (list: AbsensiItem[]) =>
  list.map((item) => `${item.id}|${norm(item.kehadiran)}|${norm(item.jamlembur)}`).join("\n");

const savedFingerprint = ref("");
const loadedFilter = ref({ tanggal: "", pabKode: "" });
const isDirty = computed(() => fingerprint(items.value) !== savedFingerprint.value);

const markSaved = () => {
  savedFingerprint.value = fingerprint(items.value);
};

// Satu dialog untuk semua pembatalan: pindah halaman/tab, ganti filter,
// atau muat ulang data.
const showDiscardDialog = ref(false);
const discardMessage = ref("");
let discardResolver: ((value: boolean) => void) | null = null;
let discardPending: Promise<boolean> | null = null;

const konfirmasiBuang = (message: string) => {
  // Kalau dialognya sedang tampil, pakai jawaban yang sedang ditunggu. Kalau
  // tidak, resolver sebelumnya tertimpa dan panggilannya menggantung selamanya.
  if (discardPending) return discardPending;
  discardMessage.value = message;
  showDiscardDialog.value = true;
  discardPending = new Promise<boolean>((resolve) => {
    discardResolver = resolve;
  });
  return discardPending;
};

const jawabDiscard = (ya: boolean) => {
  showDiscardDialog.value = false;
  const resolve = discardResolver;
  discardResolver = null;
  discardPending = null;
  resolve?.(ya);
};

// Refresh/close browser juga membuang isian yang belum disimpan.
const handleBeforeUnload = (e: BeforeUnloadEvent) => {
  if (!isDirty.value) return;
  e.preventDefault();
  e.returnValue = "";
};
window.addEventListener("beforeunload", handleBeforeUnload);

const pesanKeluar = "Keluar dari halaman ini? Perubahan kehadiran atau jam lembur yang belum disimpan akan hilang.";
const pesanTutupTab = "Tutup tab ini? Perubahan kehadiran atau jam lembur yang belum disimpan akan hilang.";

// Menutup tab (tombol X, "Tutup Tab", "Tutup Semua Tab", ...) melewati tabsStore,
// bukan router, jadi perlu guard sendiri. Guard-nya didaftarkan halaman ini lewat
// setCloseGuard; store tidak perlu tahu apa pun tentang Absensi, halaman lain
// yang butuh proteksi serupa cukup mendaftarkan callback-nya sendiri.
//
// Tab yang ditutup adalah tab aktif, jadi TabView lalu pindah ke tab lain dan
// onBeforeRouteLeave ikut menyala. Kalau keduanya menanyakan, admin melihat dua
// dialog untuk satu aksi; karena itu penutupan tab ditandai lebih dulu supaya
// route guard tidak mengulang pertanyaan yang sudah dijawab.
let closingOwnTab = false;

tabsStore.setCloseGuard(route.path, async () => {
  if (!isDirty.value) return true; // Tidak ada yang perlu dikonfirmasi.
  const bolehTutup = await konfirmasiBuang(pesanTutupTab);
  if (bolehTutup) closingOwnTab = true;
  return bolehTutup;
});

// Pindah tab/menu: TabBar -> TabView -> router.push, jadi guard ini yang menangkap.
onBeforeRouteLeave(async () => {
  if (closingOwnTab) {
    closingOwnTab = false;
    return true; // Sudah dikonfirmasi lewat dialog tutup tab.
  }
  if (!isDirty.value) return true;
  return konfirmasiBuang(pesanKeluar);
});

// Halaman ini di-cache KeepAlive, jadi onBeforeUnmount hanya jalan saat instance
// benar-benar dibuang. Guard tutup tab sengaja TIDAK dilepas di onDeactivated:
// selama instance masih hidup, isian yang belum disimpan masih ada di sana, dan
// tab yang di-cache itu masih bisa ditutup dari TabBar.
onActivated(() => {
  // Instance diaktifkan kembali (tab dibuka lagi). Buang penanda dari penutupan
  // tab sebelumnya supaya tidak membuat guard berikutnya lolos tanpa konfirmasi.
  closingOwnTab = false;
  // Kalau muat awal gagal (mis. koneksi DB putus saat pertama buka menu),
  // coba lagi otomatis supaya tidak harus refresh browser manual. Jangan
  // ganggu isian yang belum disimpan.
  if (!isDirty.value && !isLoading.value) {
    if (unitList.value.length === 0) void loadUnits();
    if (loadedFilter.value.pabKode === "" && loadedFilter.value.tanggal === "") {
      void loadData();
    }
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", handleBeforeUnload);
  tabsStore.setCloseGuard(route.path, null);
  // Jangan dialog menggantung bila tab ditutup saat konfirmasi terbuka.
  jawabDiscard(false);
});

const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Error koneksi (DB/pool dingin, timeout) jangan ditampilkan mentah seperti
// "read ECONNRESET" — tampilkan pesan ramah, detail asli hanya ke console.
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

// Daftar unit dimuat terpisah dari data tabel. Gagal di sini tidak boleh
// mengosongkan filter — selectedUnit tetap SEMUA supaya tabel tetap bisa dimuat.
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
  { title: "Jam Lembur", key: "jamlembur", width: "130px", align: "center" as const },
];

// Auto refresh saat filter berubah (pola browse)
const filterValues = computed(() => ({
  tanggal: tanggal.value,
  selectedUnit: selectedUnit.value,
}));

// Muat ulang data. Ada tiga pemicu: filter berubah (otomatis, debounce di
// BaseBrowse), tombol refresh, dan segarkan setelah Tarik Absensi. Semuanya
// mengganti isi tabel, jadi isian manual yang belum disimpan akan hilang —
// konfirmasi dulu, dan kembalikan filter ke nilai yang sedang ditampilkan
// bila admin batal. `confirmed` dipakai saat pemanggil sudah meminta
// konfirmasi lebih dulu (mis. Tarik Absensi).
let suppressNextLoad = 0;

const loadData = async ({ confirmed = false }: { confirmed?: boolean } = {}) => {
  // Filter yang dikembalikan setelah admin batal tidak boleh memicu muat ulang.
  if (suppressNextLoad > 0) {
    suppressNextLoad--;
    return;
  }
  if (!tanggal.value) return;
  if (!selectedUnit.value) return;

  const pabKode = selectedUnit.value;
  const selectedDate = tanggal.value;
  const filterBerpindah =
    pabKode !== loadedFilter.value.pabKode || selectedDate !== loadedFilter.value.tanggal;

  if (isDirty.value && !confirmed) {
    const lanjut = await konfirmasiBuang(
      filterBerpindah
        ? "Ganti tanggal atau unit? Kehadiran dan jam lembur yang belum disimpan akan hilang."
        : "Muat ulang data? Kehadiran dan jam lembur yang belum disimpan akan hilang.",
    );
    if (!lanjut) {
      // Batal: kembalikan filter supaya tampilan tidak berbeda dari data yang dimuat.
      if (filterBerpindah) {
        suppressNextLoad = 1;
        tanggal.value = loadedFilter.value.tanggal;
        selectedUnit.value = loadedFilter.value.pabKode;
      }
      return;
    }
  }

  const request = ++loadRequest;
  isLoading.value = true;
  try {
    const data = await absensiApi.getKaryawan(pabKode, selectedDate);
    if (request !== loadRequest || pabKode !== selectedUnit.value || selectedDate !== tanggal.value) return;
    items.value = data;
    loadedFilter.value = { tanggal: selectedDate, pabKode };
    markSaved();
    if (items.value.length === 0) {
      toast.info("Tidak ada karyawan aktif pada unit ini.");
    }
  } catch (e: any) {
    if (request === loadRequest) {
      console.error("Gagal memuat karyawan absensi:", e);
      toast.error(pesanMuat(e, "Gagal memuat karyawan."));
    }
  } finally {
    if (request === loadRequest) isLoading.value = false;
  }
};

const handleSave = async () => {
  if (isSaving.value || isPulling.value) return;
  if (items.value.length === 0) {
    toast.warning("Tidak ada data untuk disimpan.");
    return;
  }
  if (items.value.some((item) =>
    terisi(item.kehadiran) && !NILAI_KEHADIRAN.includes(Number(item.kehadiran))
  )) {
    toast.warning("Kehadiran hanya boleh diisi 0, 0.5, 1, atau 2.");
    return;
  }

  // Menyimpan tabel yang seluruhnya kosong berarti menghapus semua absensi
  // tanggal & unit ini, jadi pastikan admin memang sengaja mau begitu.
  if (!hasSaveableInput.value && !confirm(
    "Tidak ada kehadiran atau jam lembur yang terisi.\n\n" +
    "Menyimpan akan mengosongkan seluruh data absensi tanggal ini untuk unit yang dipilih. Lanjutkan?"
  )) {
    return;
  }

  isSaving.value = true;
  try {
    await absensiApi.save({
      pabKode: selectedUnit.value,
      tanggal: tanggal.value,
      items: items.value,
    });
    markSaved();
    toast.success(
      hasSaveableInput.value
        ? "Absensi berhasil disimpan."
        : "Seluruh data absensi tanggal ini dikosongkan."
    );
  } catch (e: any) {
    toast.error(e.response?.data?.message ?? "Gagal menyimpan absensi.");
  } finally {
    isSaving.value = false;
  }
};

const handleTarikAbsensi = async () => {
  if (isPulling.value || isSaving.value || isLoading.value) return;
  if (!tanggal.value || !selectedUnit.value) {
    toast.warning("Pilih tanggal dan unit terlebih dahulu.");
    return;
  }
  // Tarik Absensi menyegarkan tabel di akhir, jadi isian manual yang belum
  // disimpan ikut terbuang. Minta konfirmasi lebih dulu.
  if (isDirty.value) {
    const lanjut = await konfirmasiBuang(
      "Tarik Absensi akan memuat ulang tabel. Kehadiran dan jam lembur yang belum disimpan akan hilang. Lanjutkan?",
    );
    if (!lanjut) return;
  }
  isPulling.value = true;
  try {
    const result = await absensiApi.tarikWajah({
      pabKode: selectedUnit.value,
      tanggal: tanggal.value,
    });
    if (result.data.inserted + result.data.updated > 0) toast.success(result.message);
    else toast.info(result.message);
    if (result.data.skipped > 0) {
      toast.info(`${result.data.skipped} record sumber dilewati (duplikat, tidak valid, atau karyawan tidak aktif/tidak ditemukan).`);
    }
  } catch (e: any) {
    toast.error(e.response?.data?.message ?? "Gagal menarik absensi wajah. Silakan coba kembali.");
  } finally {
    // MyISAM dapat menghasilkan penulisan parsial saat error; selalu segarkan.
    await loadData({ confirmed: true });
    isPulling.value = false;
  }
};

const exportExcelData = () => {
  const exportItems = getExportItems();
  if (!exportItems.length) {
    toast.warning("Tidak ada data untuk diekspor.");
    return;
  }
  if (isDirty.value) {
    toast.warning("Ada perubahan kehadiran atau jam lembur yang belum disimpan. Klik Save terlebih dahulu sebelum Export.");
    return;
  }
  exportToExcel({
    title: `Export Data Absensi - ${tanggal.value}`,
    filenamePrefix: `absensi-${selectedUnit.value}-${tanggal.value}`,
    columns: [
      { header: "No", key: "no", width: 8, align: "center" },
      { header: "Id", key: "id", width: 12, align: "center" },
      { header: "Nama", key: "nama", width: 30 },
      { header: "Unit", key: "unit", width: 12, align: "center" },
      { header: "Bagian", key: "bagian", width: 20 },
      { header: "Kehadiran", key: "kehadiran", width: 12, align: "center" },
      { header: "Jam Lembur", key: "jamlembur", width: 12, align: "center" },
    ],
    rows: exportItems,
  });
};
const browseRef = ref<InstanceType<typeof BaseBrowse> | null>(null);
const getExportItems = (): typeof items.value => browseRef.value?.getExportItems() ?? [];
</script>

<template>
  <BaseBrowse
    ref="browseRef"
    title="Absensi Karyawan"
    :menu-id="MENU_ID"
    :icon="IconClock"
    :headers="headers"
    :items="items"
    :is-loading="isLoading"
    item-value="no"
    :filter-values="filterValues"
    @refresh="loadData()"
    search-placeholder="Cari ID, nama, bagian atau unit..."
  >
    <!-- ── Filter ── -->
    <template #filter-left>
      <div class="filter-group">
        <span class="filter-lbl">Tanggal</span>
        <input v-model="tanggal" type="date" class="date-inp" :disabled="isPulling" />
      </div>

      <div class="filter-group">
        <span class="filter-lbl">Unit</span>
        <select v-model="selectedUnit" class="select-inp" :disabled="isPulling">
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

    <!-- ── Aksi: Export, Tarik Absensi & Save ── -->
    <template #extra-actions>
      <v-chip
        v-if="isDirty"
        size="small"
        color="warning"
        variant="tonal"
        class="mr-1 font-weight-bold"
        title="Perubahan kehadiran/jam lembur belum disimpan. Tekan Save untuk menyimpan."
      >
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
        variant="tonal"
        @click="handleTarikAbsensi"
        :loading="isPulling"
        :disabled="isPulling || isSaving || isLoading || !tanggal || !selectedUnit"
      >
        <template #loader>Menarik absensi...</template>
        <IconDownload :size="16" class="mr-1" />
        Tarik Absensi
      </v-btn>

      <v-btn
        size="small"
        color="primary"
        variant="flat"
        @click="handleSave"
        :loading="isSaving"
        :disabled="isPulling || !items.length || !isDirty"
      >
        <IconDeviceFloppy :size="16" class="mr-1" />
        Save
      </v-btn>
    </template>

    <!-- ── Sel yang bisa diedit ── -->
    <template #item.kehadiran="{ item }">
      <span class="editable-cell">
        <input
          type="number"
          v-model.number="item.kehadiran"
          :disabled="isPulling"
          class="table-inp"
          :class="{ 'is-editing': editingCell === `${item.no}:kehadiran` }"
          :data-absensi-cell="`${item.no}:kehadiran`"
          data-absensi-column="kehadiran"
          :aria-label="`Kehadiran ${item.nama}`"
          @focus="onCellFocus"
          @blur="onCellBlur"
          @keydown.stop="onCellKeydown"
          @click.stop
          min="0"
          max="2"
          step="0.5"
          title="0 tidak hadir, 0.5 setengah hari, 1 hadir, 2 dua hari. Kosongkan untuk mengembalikan ke NULL."
        />
      </span>
    </template>

    <template #item.jamlembur="{ item }">
      <span class="editable-cell">
        <input
          type="number"
          v-model.number="item.jamlembur"
          :disabled="isPulling"
          class="table-inp"
          :class="{ 'is-editing': editingCell === `${item.no}:jamlembur` }"
          :data-absensi-cell="`${item.no}:jamlembur`"
          data-absensi-column="jamlembur"
          :aria-label="`Jam lembur ${item.nama}`"
          @focus="onCellFocus"
          @blur="onCellBlur"
          @keydown.stop="onCellKeydown"
          @click.stop
          min="0"
          step="1"
          title="Kosongkan untuk mengembalikan ke NULL."
        />
      </span>
    </template>
  </BaseBrowse>

  <!-- ── Konfirmasi buang perubahan belum disimpan ── -->
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
  width: 140px;
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
  width: 60px;
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
  box-shadow: 0 0 0 2px #3B5998;
  background: #eff6ff;
}
.table-inp.is-editing:focus {
  border-color: #b45309;
  box-shadow: 0 0 0 2px #b45309;
  background: #fffbeb;
}
</style>
