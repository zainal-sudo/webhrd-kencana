<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import BaseBrowse from "@/components/BaseBrowse.vue";
import MsIcon from "@/components/MsIcon.vue";
import { useTabsStore } from "@/stores/tabsStore";
import type { BrowseColumn } from "@/types";
import { api, getErrorMessage } from "@/api/axios";
import { firstDayOfMonth } from "@/utils/format";

/**
 * Laporan Tidak Masuk — padanan `ufrmLapTidakMasuk`.
 *
 * Absensi status 0 (tanpa scan), bukan Minggu/libur, karyawan aktif.
 * Tombol toolbar: Alpha Otomatis (ijin Alpha utk yg belum berijin) dan
 * Jadwal Libur Otomatis — keduanya mengikuti filter pencarian aktif.
 * Aksi baris: Buatkan Ijin (prefill form Ijin, jenis 3/Tidak Masuk) dan
 * Edit Absensi (form Absensi kode+tanggal).
 */
const toast = useToast();
const router = useRouter();
const tabsStore = useTabsStore();

const endpoint = "/laporan/tidak-masuk";

const columns: BrowseColumn[] = [
  { key: "Kode", label: "Kode Absensi", width: "110px" },
  { key: "Nik", label: "NIK", width: "110px" },
  { key: "Nama", label: "Nama Lengkap" },
  { key: "Tanggal", label: "Tanggal", type: "date", width: "95px" },
  { key: "Hari", label: "Hari", width: "70px", align: "center" },
  { key: "Pabrik", label: "Pabrik", width: "80px" },
  { key: "Jabatan", label: "Jabatan" },
  { key: "Bagian", label: "Bagian" },
  { key: "Jenis_Ijin", label: "Jenis Ijin", width: "130px" },
  { key: "Keterangan", label: "Keterangan", width: "90px" },
  { key: "Alasan", label: "Alasan" },
  { key: "SistemGaji", label: "Sistem", width: "80px" },
];

const versi = ref(0);
const memproses = ref<string | null>(null);
const dialog = ref(false);
const aksi = ref<"alpha" | "jadwal-libur" | null>(null);

function bukaTab(title: string, path: string, query?: Record<string, string>) {
  tabsStore.openTab({ title, path, query, icon: "mdi mdi-open-in-new", closable: true });
  router.push({ path, query });
}

function buatIjin(row: Record<string, any>) {
  bukaTab(`Ijin ${row.Nik}`, "/transaksi/ijin/form", {
    nik: String(row.Nik ?? ""),
    tanggal: String(row.Tanggal || "").slice(0, 10),
    jenis_id: "3",
  });
}

function editAbsensi(row: Record<string, any>) {
  bukaTab(`Absensi ${row.Kode}`, "/absensi/form", {
    nik: String(row.Kode ?? ""),
    tanggal: String(row.Tanggal || "").slice(0, 10),
  });
}

function tanya(mode: "alpha" | "jadwal-libur") {
  aksi.value = mode;
  dialog.value = true;
}

async function jalankan() {
  if (!aksi.value) return;
  memproses.value = aksi.value;
  try {
    const url =
      aksi.value === "alpha"
        ? `${endpoint}/alpha-otomatis`
        : `${endpoint}/jadwal-libur-otomatis`;
    const { data } = await api.post(url, {});
    toast.success(data.message || "Proses selesai");
    dialog.value = false;
    versi.value += 1;
  } catch (e) {
    toast.error(getErrorMessage(e, "Proses gagal"));
  } finally {
    memproses.value = null;
  }
}
</script>

<template>
  <BaseBrowse
    :key="versi"
    module-title="Laporan Tidak Masuk"
    module-subtitle="Absensi tanpa scan (status 0), di luar Minggu & hari libur"
    :endpoint="endpoint"
    :columns="columns"
    primary-key="Nik"
    has-period
    :default-start="firstDayOfMonth()"
    :can-delete="false"
    search-placeholder="Cari NIK / nama / bagian / alasan..."
    :per-page="50"
  >
    <template #toolbar-extra>
      <button class="tool-btn aksi" title="Buatkan ijin Alpha untuk baris yang belum berijin" @click="tanya('alpha')">
        <MsIcon name="bolt" :size="15" />
        <span>Alpha Otomatis</span>
      </button>
      <button class="tool-btn aksi" title="Buatkan ijin Jadwal Libur untuk baris yang belum berijin" @click="tanya('jadwal-libur')">
        <MsIcon name="event_busy" :size="15" />
        <span>Jadwal Libur</span>
      </button>
    </template>
    <template #row-actions="{ row }">
      <button
        v-if="!row.Jenis_Ijin"
        class="row-btn edit"
        title="Buatkan ijin (Tidak Masuk)"
        @click="buatIjin(row)"
      >
        <MsIcon name="event_available" :size="14" />
      </button>
      <button class="row-btn edit" title="Edit absensi" @click="editAbsensi(row)">
        <MsIcon name="how_to_reg" :size="14" />
      </button>
    </template>
  </BaseBrowse>

  <v-dialog v-model="dialog" max-width="440" persistent>
    <v-card rounded="false">
      <v-card-title class="dlg-head">
        <span>{{ aksi === "alpha" ? "Alpha Otomatis" : "Jadwal Libur Otomatis" }}</span>
      </v-card-title>
      <v-card-text class="dlg-body">
        <p>
          Yakin ingin membuatkan ijin
          <strong>{{ aksi === "alpha" ? "Alpha" : "Jadwal Libur" }}</strong>
          untuk <strong>semua baris yang belum berijin</strong> pada periode & filter aktif?
        </p>
      </v-card-text>
      <v-card-actions class="pa-4 pt-2">
        <v-spacer />
        <v-btn variant="text" color="grey-darken-2" @click="dialog = false">Batal</v-btn>
        <v-btn color="primary" variant="flat" :loading="!!memproses" @click="jalankan">Proses</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.tool-btn {
  height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid var(--ds-border, #b0b8c4);
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  border-radius: 0;
}
.tool-btn.aksi {
  background: #fff;
  color: var(--ds-on-surface, #1b2d4a);
}
.tool-btn.aksi:hover {
  background: var(--ds-surface-variant, #e0e4ea);
}
.dlg-head { font-size: 13px; font-weight: 800; padding: 8px 12px; background: var(--ds-surface-variant, #e0e4ea); }
.dlg-body { background: #fff; padding: 12px 14px; font-size: 12px; }
.row-btn.edit { color: var(--ds-primary, #3b5998); }
</style>
