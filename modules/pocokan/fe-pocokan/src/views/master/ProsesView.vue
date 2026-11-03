<script setup lang="ts">
import { ref } from "vue";
import { useToast } from "vue-toastification";
import { IconListDetails, IconPlus, IconTrash, IconGripVertical } from "@tabler/icons-vue";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { useBrowse } from "@/composables/useBrowse";
import { prosesApi, type Proses, type ProsesDetail } from "@/api/master/prosesApi";

const MENU_ID = "30"; // samakan dengan menuId di prosesRoutes.js
const toast = useToast();

const {
  items,
  isLoading,
  selected,
  canInsert,
  canEdit,
  canDelete,
  fetchData,
} = useBrowse<Proses>({
  menuId: MENU_ID,
  fetchApi: () => prosesApi.getAll(),
});

const headers = [
  { title: "Kode", key: "kode", width: "120px", align: "center" },
  { title: "Nama Proses", key: "nama", minWidth: "220px" },
  { title: "Keterangan", key: "keterangan", minWidth: "220px" },
  { title: "Jml. Tahap", key: "jumlahTahap", width: "110px", align: "center" },
  { title: "Status", key: "aktif", width: "100px", align: "center" },
];

// ── Dialog Tambah/Ubah ────────────────────────────────────────────────
const dialog = ref(false);
const dialogTitle = ref("");
const isSaving = ref(false);

type FormDetail = ProsesDetail & { _key: number };
let detailKeySeq = 0;
const newDetailRow = (urutan: number): FormDetail => ({
  _key: detailKeySeq++,
  urutan,
  nama: "",
  brgKode: null,
  keterangan: "",
});

// Urutan tahap selalu mengikuti posisinya di list (1, 2, 3, ...) —
// tidak perlu diisi manual, otomatis renumber tiap kali tambah/hapus/urutkan.
const renumber = () => {
  form.value.details.forEach((d, idx) => (d.urutan = idx + 1));
};

const emptyForm = () => ({
  isEdit: false,
  kode: "",
  nama: "",
  keterangan: "",
  aktif: true,
  details: [newDetailRow(1)] as FormDetail[],
});
const form = ref(emptyForm());

const errors = ref<{ nama?: string; details?: string }>({});
const validateForm = (): boolean => {
  const e: typeof errors.value = {};
  if (!form.value.nama.trim()) e.nama = "Nama proses wajib diisi.";
  if (form.value.details.length === 0) {
    e.details = "Minimal 1 tahapan (mis. Mesin, Packing, Finishing).";
  } else if (form.value.details.some((d) => !d.nama.trim())) {
    e.details = "Semua nama tahapan wajib diisi.";
  }
  errors.value = e;
  return Object.keys(e).length === 0;
};
const clearError = (f: keyof typeof errors.value) => {
  if (errors.value[f]) delete errors.value[f];
};

const addDetailRow = () => {
  form.value.details.push(newDetailRow(form.value.details.length + 1));
};
const removeDetailRow = (idx: number) => {
  if (form.value.details.length <= 1) {
    toast.warning("Minimal harus ada 1 tahapan.");
    return;
  }
  form.value.details.splice(idx, 1);
  renumber();
};

const openCreate = () => {
  form.value = emptyForm();
  errors.value = {};
  dialogTitle.value = "Tambah Proses";
  dialog.value = true;
};

const openEdit = async (item: Proses) => {
  try {
    const d = await prosesApi.getById(item.kode);
    form.value = {
      isEdit: true,
      kode: d.kode,
      nama: d.nama,
      keterangan: d.keterangan || "",
      aktif: !!d.aktif,
      details: (d.details.length ? d.details : [{ urutan: 1, nama: "", brgKode: null }]).map(
        (x, idx) => ({ ...x, urutan: idx + 1, _key: detailKeySeq++ })
      ),
    };
    errors.value = {};
    dialogTitle.value = "Ubah Proses";
    dialog.value = true;
  } catch (e: any) {
    if (e?.isAuthExpired) return;
    toast.error(e.response?.data?.message ?? "Gagal memuat data.");
  }
};

const handleSave = async () => {
  if (isSaving.value) return;
  if (!validateForm()) {
    toast.warning("Periksa kembali data yang diisi.");
    return;
  }
  isSaving.value = true;
  try {
    await prosesApi.save({
      isEdit: form.value.isEdit,
      kode: form.value.kode,
      nama: form.value.nama,
      keterangan: form.value.keterangan,
      aktif: form.value.aktif,
      details: form.value.details.map((d, idx) => ({
        urutan: idx + 1,
        nama: d.nama,
        brgKode: null,
        keterangan: "",
      })),
    });
    toast.success("Proses berhasil disimpan.");
    dialog.value = false;
    await fetchData();
  } catch (e: any) {
    toast.error(e.response?.data?.message ?? "Gagal menyimpan.");
  } finally {
    isSaving.value = false;
  }
};

const handleDelete = async (item: Proses) => {
  try {
    await prosesApi.delete(item.kode);
    toast.success("Proses berhasil dihapus.");
    await fetchData();
  } catch (e: any) {
    toast.error(e.response?.data?.message ?? "Gagal menghapus.");
  }
};
</script>

<template>
  <BaseBrowse
    title="Master Data Proses"
    :menu-id="MENU_ID"
    :icon="IconListDetails"
    :headers="headers"
    :items="items ?? []"
    :is-loading="isLoading"
    :selected="selected"
    @update:selected="selected = $event"
    item-value="kode"
    :can-insert="canInsert"
    :can-edit="canEdit"
    :can-delete="canDelete"
    search-placeholder="Cari proses..."
    @refresh="fetchData"
    @add="openCreate"
    @edit="openEdit"
    @delete="handleDelete"
  >
    <template #item.keterangan="{ item }">
      <span class="cell-muted">{{ item.keterangan || "-" }}</span>
    </template>
    <template #item.aktif="{ item }">
  <span class="status-pill" :class="item.aktif ? 'status-pill--active' : 'status-pill--inactive'">
    {{ item.aktif ? "Aktif" : "Nonaktif" }}
  </span>
</template>
  </BaseBrowse>

  <!-- Dialog Tambah/Ubah -->
  <v-dialog v-model="dialog" max-width="580" persistent>
    <v-card rounded="lg" class="proses-card">
      <v-card-title class="proses-card-header">
        <IconListDetails :size="20" /> {{ dialogTitle }}
      </v-card-title>

      <v-card-text class="pa-4 pt-4">
        <div class="f-row mb-2">
          <label class="f-lbl">Nama Proses <span class="req">*</span></label>
          <input
            v-model="form.nama"
            type="text"
            class="f-inp-native"
            :class="{ 'f-err': errors.nama }"
            placeholder="Contoh: Earloop, Headloop, Alkohol Swab, dll"
            :disabled="isSaving"
            @input="clearError('nama')"
          />
        </div>

        <div class="f-row mb-2 align-start">
          <label class="f-lbl pt-1">Keterangan</label>
          <textarea
            v-model="form.keterangan"
            class="f-inp-native f-textarea"
            placeholder="Catatan tambahan tentang proses ini (opsional)"
            rows="2"
            :disabled="isSaving"
          />
        </div>

        <div class="f-row mb-1">
          <label class="f-lbl">Status</label>
          <v-switch
            v-model="form.aktif"
            :label="form.aktif ? 'Aktif' : 'Nonaktif'"
            color="success"
            density="compact"
            hide-details
            :disabled="isSaving"
          />
        </div>

        <!-- ── Section Tahapan Proses ─────────────────────────────────── -->
        <div class="step-section">
          <div class="step-section-head">
            <span class="step-section-title">Tahapan Proses</span>
            <v-btn
              size="small"
              variant="flat"
              color="success"
              class="step-add-btn"
              @click="addDetailRow"
              :disabled="isSaving"
            >
              <IconPlus :size="16" class="mr-1" /> Tambah Proses
            </v-btn>
          </div>

          <div v-if="errors.nama || errors.details" class="f-err-text mb-2">
            <div v-if="errors.nama">{{ errors.nama }}</div>
            <div v-if="errors.details">{{ errors.details }}</div>
          </div>

          <!-- ── List Tahapan bernomor ────────────────────────────────── -->
          <div class="step-list">
            <div v-for="(row, idx) in form.details" :key="row._key" class="step-row">
              <IconGripVertical :size="14" class="step-grip" />
              <span class="step-num">{{ idx + 1 }}</span>
              <input
                v-model="row.nama"
                type="text"
                class="step-input"
                placeholder="Contoh: Mesin / Packing / Finishing"
                :disabled="isSaving"
              />
              <v-btn
                icon
                size="x-small"
                variant="text"
                color="error"
                class="step-remove"
                @click="removeDetailRow(idx)"
                :disabled="isSaving"
              >
                <IconTrash :size="15" />
              </v-btn>
            </div>
          </div>
        </div>
      </v-card-text>

      <v-divider />
      <v-card-actions class="pa-3">
        <v-spacer />
        <v-btn variant="text" @click="dialog = false" :disabled="isSaving">Batal</v-btn>
        <v-btn color="primary" variant="flat" :loading="isSaving" :disabled="isSaving" @click="handleSave">
          Simpan
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* ── Cell tabel ── */
.cell-muted { color: #6b7280; }

/* ── Header dialog ── */
.proses-card {
  overflow: hidden;
}
.proses-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  background: linear-gradient(135deg, #3B5998, #3d3d9e);
  color: white;
  font-size: 15px;
  font-weight: 700;
}

/* ── Field umum (samakan dengan Master Kategori) ── */
.f-row { display: flex; align-items: center; min-width: 0; }
.f-row.align-start { align-items: flex-start; }
.f-lbl {
  width: 150px;
  font-size: 11px;
  font-weight: 600;
  color: #4b5563;
  flex-shrink: 0;
}
.f-lbl.pt-1 { padding-top: 6px; }
.req { color: red; }
.f-inp-native {
  flex: 1;
  min-width: 0;
  height: 28px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 0 8px;
  font-size: 11px;
  outline: none;
  background: white;
  font-family: inherit;
  transition: border-color 0.15s;
}
.f-inp-native:focus { border-color: #3B5998; }
.f-inp-native:disabled { background-color: #f3f4f6; color: #6b7280; }
.f-err { border-color: #ef4444 !important; }
.f-err-text { flex: 1; font-size: 10px; color: #ef4444; padding-left: 0; }
.f-textarea {
  height: auto;
  min-height: 52px;
  padding: 6px 8px;
  resize: vertical;
  line-height: 1.4;
}

/* ── Section Tahapan Proses ── */
.step-section {
  margin-top: 14px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fafafa;
  padding: 12px 14px 14px;
}
.step-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 10px;
  margin-bottom: 10px;
  border-bottom: 2px solid #3B5998;
}
.step-section-title {
  font-size: 12px;
  font-weight: 700;
  color: #3B5998;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
.step-add-btn {
  box-shadow: 0 2px 6px rgba(46, 125, 50, 0.3) !important;
}

/* ── List tahapan bernomor ── */

/* ── Status pill (Aktif / Nonaktif) ── */
.status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 5px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.6;
  white-space: nowrap;
}
.status-pill--active {
  background: #e6f6ea;
  color: #1e8e3e;
}
.status-pill--inactive {
  background: #fdecea;
  color: #d93025;
}

.step-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.step-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 6px 10px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.step-row:focus-within {
  border-color: #3B5998;
  box-shadow: 0 0 0 3px rgba(46, 46, 125, 0.08);
}
.step-grip {
  flex-shrink: 0;
  color: #c4c4c4;
  cursor: grab;
}
.step-num {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  background: #3B5998;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: white;
}
.step-input {
  flex: 1;
  height: 30px;
  border: none;
  padding: 0 2px;
  font-size: 13px;
  color: #111;
  outline: none;
  background: transparent;
}
.step-input::placeholder { color: #9ca3af; }
.step-input:disabled { opacity: 0.6; }
.step-remove {
  flex-shrink: 0;
  opacity: 0.4;
  transition: opacity 0.15s;
}
.step-row:hover .step-remove { opacity: 1; }
</style>