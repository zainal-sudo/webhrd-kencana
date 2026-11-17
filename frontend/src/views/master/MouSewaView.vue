<script setup lang="ts">
import { computed, ref } from "vue";
import { useToast } from "vue-toastification";
import BaseBrowse from "@/components/BaseBrowse.vue";
import MsIcon from "@/components/MsIcon.vue";
import { useAuthStore } from "@/stores/authStore";
import { api, getErrorMessage } from "@/api/axios";
import type { BrowseColumn } from "@/types";
import type { PeriodeSumber } from "@/components/PeriodeMouDialog.vue";
import RiwayatPeriodeMou from "@/views/master/RiwayatPeriodeMou.vue";

/**
 * Master MoU Sewa (tmou_sewa) — 1 baris = 1 periode MoU (1 nomor surat).
 * Nomor surat diketik manual (tidak digenerate). Riwayat periode tempat
 * yang sama tersimpan dan ditampilkan lewat baris expand per MoU.
 */
const auth = useAuthStore();
const toast = useToast();
const browse = ref<InstanceType<typeof BaseBrowse> | null>(null);
const endpoint = "/master/mou-sewa";
const formPath = "/master/mou-sewa/form";

const canInsert = computed(() => auth.can("frmMouSewa", "insert"));
const canEdit = computed(() => auth.can("frmMouSewa", "edit"));
const canDelete = computed(() => auth.can("frmMouSewa", "delete"));

const columns: BrowseColumn[] = [
  { key: "No Surat", label: "No Surat", width: "170px" },
  { key: "Tempat", label: "Tempat", width: "150px" },
  { key: "Alamat", label: "Alamat" },
  { key: "Awal Mulai", label: "Awal Mulai", type: "date", width: "110px" },
  { key: "Berakhir", label: "Berakhir", type: "date", width: "110px" },
  { key: "Jumlah Periode", label: "Periode", width: "84px", align: "center", filterable: false },
  { key: "Status", label: "Status", width: "104px", align: "center" },
];

/* Kelas warna badge status periode MoU. */
const statusClass = (s: string) =>
  s === "Berjalan"
    ? "st-berjalan"
    : s === "Belum Mulai"
      ? "st-belum"
      : s === "Riwayat"
        ? "st-riwayat"
        : s === "Selesai"
          ? "st-selesai"
          : "";

const editTabTitle = (row: Record<string, any>) => {
  const tempat = String(row["Tempat"] ?? "").trim();
  const no = String(row["No Surat"] ?? "").trim();
  return `Edit MoU · ${no || tempat || row.Id}`;
};

/* Tombol "Tambah Periode" di panel riwayat butuh data baris yang di-expand
 * (sumber periode baru: tempat/alamat terkunci + tanggal MoU lama). */
const periodeSumber = (row: Record<string, any>): PeriodeSumber => ({
  id: row.Id,
  noSurat: String(row["No Surat"] ?? ""),
  tempat: String(row["Tempat"] ?? ""),
  alamat: row["Alamat"] ?? null,
  awal: row["Awal Mulai"] ?? null,
  berakhir: row["Berakhir"] ?? null,
});

/* Periode baru tersimpan: segarkan daftar utama (jumlah periode & status
 * baris sumber ikut berubah); baris expand tetap terbuka. */
async function refreshSetelahPeriode() {
  browse.value?.refresh();
}

/* Hapus manual (BaseBrowse punya dialog bawaan hanya label "Nama"; kustom
 * agar labelnya nomor surat — pola SandiBpjsView). */
const deleteTarget = ref<{ id: string | number; no: string; tempat: string } | null>(null);
const deleting = ref(false);

function confirmDelete(row: Record<string, any>) {
  if (!canDelete.value || deleting.value) return;
  deleteTarget.value = {
    id: row.Id,
    no: String(row["No Surat"] ?? ""),
    tempat: String(row["Tempat"] ?? ""),
  };
}

async function remove() {
  if (!canDelete.value || !deleteTarget.value || deleting.value) return;
  const id = deleteTarget.value.id;
  deleting.value = true;
  try {
    await api.delete(`${endpoint}/${encodeURIComponent(String(id))}`);
    deleteTarget.value = null;
    toast.success("Data MoU Sewa berhasil dihapus.");
    browse.value?.refreshAfterDelete();
  } catch (err) {
    toast.error(getErrorMessage(err, "Gagal menghapus data MoU Sewa."));
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <BaseBrowse
    class="mou-sewa-browse"
    ref="browse"
    module-title="MoU Sewa"
    module-subtitle="Perjanjian sewa tempat/usaha — nomor surat diketik manual; riwayat periode tampil di baris expand"
    :endpoint="endpoint"
    :columns="columns"
    primary-key="Id"
    row-number-label="No"
    add-label="Tambah MoU"
    :add-form-path="canInsert ? formPath : ''"
    :edit-form-path="canEdit ? formPath : ''"
    :edit-tab-title="editTabTitle"
    :can-delete="false"
    :show-actions="canEdit || canDelete"
    paired-actions
    :expandable="true"
    expand-label="Riwayat periode"
    :per-page="25"
    search-placeholder="Cari no surat / tempat / alamat..."
  >
    <template #cell="{ column, text }">
      <span
        v-if="column.key === 'Status'"
        class="badge-status"
        :class="statusClass(String(text))"
      >{{ text || "-" }}</span>
      <template v-else>{{ text }}</template>
    </template>
    <template #row-actions-end="{ row }">
      <button v-if="canDelete" type="button" class="row-btn del" title="Hapus" aria-label="Hapus data MoU" @click.stop="confirmDelete(row)">
        <MsIcon name="delete" :size="14" />
      </button>
    </template>
    <template #expanded-row="{ row }">
      <RiwayatPeriodeMou :mou-id="row.Id" :sumber="periodeSumber(row)" :can-tambah="canInsert" @periode-ditambah="refreshSetelahPeriode" />
    </template>
  </BaseBrowse>

  <v-dialog :model-value="!!deleteTarget" max-width="430" persistent>
    <v-card>
      <v-card-title class="text-body-1 font-weight-bold">Konfirmasi Hapus</v-card-title>
      <v-card-text>
        Hapus MoU <b>{{ deleteTarget?.no }}</b> ({{ deleteTarget?.tempat }})?
        Riwayat periode lain pada tempat yang sama tidak ikut terhapus.
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn :disabled="deleting" variant="text" @click="deleteTarget = null">Batal</v-btn>
        <v-btn :loading="deleting" color="error" variant="flat" @click="remove">Hapus</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.mou-sewa-browse :deep(.browse-table) { font-size: 12px; }
.mou-sewa-browse :deep(.th-label) { text-transform: none; }
.mou-sewa-browse :deep(.alamat-cell) { overflow-wrap: anywhere; }
/* Badge status periode MoU. */
.badge-status {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}
.st-berjalan { background: #e6f7ee; color: #15803d; border: 1px solid #b7e4c9; }
.st-belum { background: #fef9c3; color: #a16207; border: 1px solid #fde68a; }
.st-riwayat { background: #f1f5f9; color: #64748b; border: 1px solid #dbe2ee; }
.st-selesai { background: #fdecec; color: #b91c1c; border: 1px solid #f5c6c6; }
</style>
