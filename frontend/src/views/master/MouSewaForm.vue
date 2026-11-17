<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute } from "vue-router";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
import DateInput from "@/components/fields/DateInput.vue";
import { useAuthStore } from "@/stores/authStore";
import { useTransactionReset } from "@/composables/useTransactionReset";
import { api, getErrorMessage } from "@/api/axios";

const auth = useAuthStore();
const toast = useToast();
// ID milik tab ini tidak mengikuti query tab lain ketika keep-alive.
const id = String(useRoute().query.id || "");
const isEdit = !!id;
const endpoint = "/master/mou-sewa";
const formPath = "/master/mou-sewa/form";

const values = reactive({
  mou_no_surat: "",
  mou_tempat: "",
  mou_alamat: "",
  mou_awal: "",
  mou_berakhir: "",
  /** Status (mode Edit saja): hanya tanda "Selesai" (mou_selesai) yang bisa
   *  diubah manual; status lain dihitung otomatis dari tanggal. */
  status: "",
});
const loading = ref(true);
const ready = ref(false);
const saving = ref(false);
const canSave = computed(() => auth.can("frmMouSewa", isEdit ? "edit" : "insert"));
const resetState = useTransactionReset({ values }, {
  isEdit: () => isEdit,
  blocked: () => loading.value || !ready.value || saving.value,
  afterRestore: () => {},
});

onMounted(async () => {
  try {
    if (isEdit) {
      const { data } = await api.get(`${endpoint}/${encodeURIComponent(id)}`);
      const row = data.data;
      values.mou_no_surat = row["No Surat"] ?? "";
      values.mou_tempat = row["Tempat"] ?? "";
      values.mou_alamat = row["Alamat"] ?? "";
      values.mou_awal = row["Awal Mulai"] ?? "";
      values.mou_berakhir = row["Berakhir"] ?? "";
      // Hanya "Selesai" yang bisa diubah manual; sisanya otomatis dari tanggal.
      values.status = row.Status === "Selesai" ? "selesai" : "otomatis";
    }
    ready.value = true;
    resetState.capture();
  } catch (err) {
    toast.error(getErrorMessage(err, "Gagal memuat data MoU Sewa."));
  } finally {
    loading.value = false;
  }
});

async function save(): Promise<string> {
  if (!canSave.value) throw new Error("Tidak memiliki hak menyimpan MoU Sewa.");
  if (loading.value || !ready.value || saving.value || resetState.restoring.value) throw new Error("Form belum siap disimpan.");
  const no = values.mou_no_surat.trim();
  if (!no) throw new Error("Nomor surat wajib diisi (diketik manual, tidak digenerate).");
  if ([...no].length > 100) throw new Error("Nomor surat maksimal 100 karakter.");
  if (!values.mou_tempat.trim()) throw new Error("Tempat wajib diisi.");
  if ([...values.mou_tempat].length > 150) throw new Error("Tempat maksimal 150 karakter.");
  if ([...values.mou_alamat].length > 255) throw new Error("Alamat maksimal 255 karakter.");
  if (!values.mou_awal) throw new Error("Awal mulai wajib diisi.");
  if (!values.mou_berakhir) throw new Error("Tanggal berakhir wajib diisi.");
  if (values.mou_berakhir < values.mou_awal) throw new Error("Tanggal berakhir tidak boleh sebelum awal mulai.");
  saving.value = true;
  try {
    // Payload hanya data MoU; mou_grup ditentukan backend (baris baru = grup sendiri).
    // Status: "Selesai" menandai sudah ditangani (mou_selesai=1) — MoU hilang
    // dari card Dashboard; memilih status lain membuka tanda itu kembali.
    const payload = {
      mou_no_surat: no,
      mou_tempat: values.mou_tempat.trim(),
      mou_alamat: values.mou_alamat.trim(),
      mou_awal: values.mou_awal,
      mou_berakhir: values.mou_berakhir,
      // Status (Edit saja): hanya tanda "Selesai" yang diubah manual;
      // "Otomatis" membuka tanda itu — Berjalan/Belum Mulai/Riwayat dihitung
      // sistem dari tanggal periode.
      ...(isEdit ? { mou_selesai: values.status === "selesai" ? 1 : 0 } : {}),
    };
    if (isEdit) await api.put(`${endpoint}/${encodeURIComponent(id)}`, payload);
    else await api.post(endpoint, payload);
    return isEdit ? "MoU Sewa berhasil diperbarui." : "MoU Sewa berhasil ditambahkan.";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <BaseForm
    :title="isEdit ? 'Edit MoU Sewa' : 'Tambah MoU Sewa'"
    :crumbs="[{ label: 'MoU Sewa', path: '/master/mou-sewa' }, { label: isEdit ? 'Edit' : 'Tambah' }]"
    :save-fn="canSave ? save : undefined"
    :show-save="canSave"
    :save-disabled="loading || !ready || saving || resetState.restoring.value"
    :reset-fn="resetState.reset"
    :reset-disabled="resetState.disabled.value"
    :new-form-path="formPath"
    transaction-module="frmMouSewa"
    return-path="/master/mou-sewa"
  >
    <template #form-content>
      <div class="mou-form">
        <div v-if="loading" class="load-note">Memuat data...</div>
        <label class="mou-field">
          <span>Nomor Surat <b>*</b></span>
          <input
            v-model="values.mou_no_surat"
            type="text"
            maxlength="100"
            autocomplete="off"
            placeholder="mis. No.01/MoU/IV/2026"
            :disabled="loading || !ready || saving || !canSave"
          />
        </label>
        <label class="mou-field">
          <span>Tempat <b>*</b></span>
          <input
            v-model="values.mou_tempat"
            type="text"
            maxlength="150"
            autocomplete="off"
            placeholder="mis. STORE BOYOLALI"
            :disabled="loading || !ready || saving || !canSave"
          />
        </label>
        <label class="mou-field">
          <span>Alamat</span>
          <textarea
            v-model="values.mou_alamat"
            rows="2"
            maxlength="255"
            autocomplete="off"
            placeholder="Alamat lengkap tempat yang disewa"
            :disabled="loading || !ready || saving || !canSave"
          />
        </label>
        <label class="mou-field">
          <span>Awal Mulai <b>*</b></span>
          <DateInput
            v-model="values.mou_awal"
            :disabled="loading || !ready || saving || !canSave"
            :required="true"
          />
        </label>
        <label class="mou-field">
          <span>Berakhir <b>*</b></span>
          <DateInput
            v-model="values.mou_berakhir"
            :disabled="loading || !ready || saving || !canSave"
            :required="true"
          />
        </label>
        <label v-if="isEdit" class="mou-field">
          <span>Status <b>*</b></span>
          <span class="status-wrap">
            <select v-model="values.status" :disabled="loading || !ready || saving || !canSave" aria-label="Status periode MoU">
              <option value="otomatis">Otomatis — dihitung dari tanggal</option>
              <option value="selesai">Selesai (sudah ditangani)</option>
            </select>
            <span v-if="values.status === 'selesai'" class="badge-status st-selesai">Selesai</span>
          </span>
        </label>
        <p v-if="isEdit" class="mou-note">
          Hanya tanda <b>Selesai</b> yang bisa diubah manual — MoU ditandai sudah ditangani dan
          hilang dari card Dashboard. Status <b>Berjalan / Belum Mulai / Riwayat</b> selalu
          dihitung otomatis dari tanggal periode (pilih <b>Otomatis</b> untuk membuka tanda
          "Selesai" kembali).
        </p>
        <p class="mou-note">
          MoU baru yang dibuat lewat tombol <b>Eksekusi</b> otomatis satu grup dengan MoU lama —
          riwayat periode tetap tersimpan dan tampil di baris expand daftar MoU Sewa.
        </p>
      </div>
    </template>
  </BaseForm>
</template>

<style scoped>
.mou-form { max-width: 640px; padding: 16px; border: 1px solid var(--ds-border, #b0b8c4); background: var(--ds-surface, #fff); }
.mou-field { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px; font-size: 12px; }
.mou-field > span:first-child { width: 100px; flex-shrink: 0; padding-top: 7px; color: var(--ds-on-surface, #12324f); font-weight: 700; }
.mou-field b { color: #dc2626; }
.mou-field input,
.mou-field textarea { min-width: 0; flex: 1; padding: 7px 10px; border: 1px solid var(--ds-border, #b0b8c4); border-radius: 4px; background: var(--ds-surface, #fff); color: var(--ds-on-surface, #12324f); font: inherit; resize: vertical; }
.mou-field input:focus,
.mou-field textarea:focus { outline: 2px solid var(--ds-primary, #3b5998); outline-offset: 1px; }
.mou-field input:disabled,
.mou-field textarea:disabled { opacity: 0.65; }
/* DateInput (komponen): input internalnya punya scope sendiri, jadi gaya
   kotak input form di atas tidak kena — beri gaya eksplisit agar tanggal
   tampil dalam kotak rapi dan ikon kalender di dalam kotak (bukan di ujung
   kanan baris), sejajar dengan input field lain. */
.mou-field :deep(.date-input > input[type="text"]) {
  width: 100%;
  height: 32px;
  box-sizing: border-box;
  padding: 0 32px 0 10px;
  border: 1px solid var(--ds-border, #b0b8c4);
  border-radius: 6px;
  background: var(--ds-surface-raised, #fff);
  font: inherit;
  color: var(--ds-text, #1b2d4a);
}
.mou-field :deep(.date-input > input[type="text"]:focus) { outline: 2px solid var(--ds-primary, #3b5998); outline-offset: 1px; }
.mou-field :deep(.date-input > input[type="text"]:disabled) { opacity: 0.65; }
/* Field Status (mode Edit): dropdown + badge pratinjau warna. */
.status-wrap { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
.status-wrap select {
  min-width: 0;
  flex: 0 0 auto;
  padding: 7px 10px;
  border: 1px solid var(--ds-border, #b0b8c4);
  border-radius: 4px;
  background: var(--ds-surface, #fff);
  color: var(--ds-on-surface, #12324f);
  font: inherit;
  cursor: pointer;
}
.status-wrap select:focus { outline: 2px solid var(--ds-primary, #3b5998); outline-offset: 1px; }
.status-wrap select:disabled { opacity: 0.65; cursor: default; }
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
.load-note { margin-bottom: 12px; font-size: 12px; }
.mou-note { margin: 4px 0 0; font-size: 10.5px; line-height: 1.5; color: var(--ds-text-secondary, #5a6a7e); }
@media (max-width: 480px) { .mou-field { align-items: stretch; flex-direction: column; gap: 6px; } .mou-field > span:first-child { padding-top: 0; } }
</style>
