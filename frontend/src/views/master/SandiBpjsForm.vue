<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute } from "vue-router";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
import { useAuthStore } from "@/stores/authStore";
import { useTransactionReset } from "@/composables/useTransactionReset";
import { api, getErrorMessage } from "@/api/axios";

const auth = useAuthStore();
const toast = useToast();
// ID milik tab ini tidak mengikuti query tab lain ketika keep-alive.
const id = String(useRoute().query.id || "");
const isEdit = !!id;
const endpoint = "/master/sandi-bpjs";
const formPath = "/master/sandi-bpjs/form";
const values = reactive({ sb_judul: "", sb_username: "", sb_password: "" });
const loading = ref(true);
const ready = ref(false);
const saving = ref(false);
const canSave = computed(() => auth.can("frmSandiBPJS", isEdit ? "edit" : "insert"));
const resetState = useTransactionReset({ values }, {
  isEdit: () => isEdit,
  blocked: () => loading.value || !ready.value || saving.value,
  afterRestore: () => {},
});

onMounted(async () => {
  try {
    if (isEdit) {
      const { data } = await api.get(`${endpoint}/${encodeURIComponent(id)}`);
      values.sb_judul = data.data.sb_judul ?? "";
      values.sb_username = data.data.sb_username;
      values.sb_password = data.data.sb_password;
    }
    ready.value = true;
    resetState.capture();
  } catch (err) {
    toast.error(getErrorMessage(err, "Gagal memuat akun."));
  } finally {
    loading.value = false;
  }
});

async function save(): Promise<string> {
  if (!canSave.value) throw new Error("Tidak memiliki hak menyimpan akun.");
  if (loading.value || !ready.value || saving.value || resetState.restoring.value) throw new Error("Form belum siap disimpan.");
  if ([...values.sb_judul].length > 255) throw new Error("Judul maksimal 255 karakter.");
  if (!values.sb_username.trim()) throw new Error("Username wajib diisi.");
  if ([...values.sb_username].length > 100) throw new Error("Username maksimal 100 karakter.");
  if (!values.sb_password.length) throw new Error("Password wajib diisi.");
  if ([...values.sb_password].length > 255) throw new Error("Password maksimal 255 karakter.");
  saving.value = true;
  try {
    // Payload hanya data akun; metadata perubahan ditentukan backend/database.
    const payload = { sb_judul: values.sb_judul, sb_username: values.sb_username, sb_password: values.sb_password };
    if (isEdit) await api.put(`${endpoint}/${encodeURIComponent(id)}`, payload);
    else await api.post(endpoint, payload);
    return isEdit ? "Akun berhasil diperbarui." : "Akun berhasil ditambahkan.";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <BaseForm
    :title="isEdit ? 'Edit Sandi' : 'Tambah Sandi'"
    :crumbs="[{ label: 'Sandi', path: '/master/sandi-bpjs' }, { label: isEdit ? 'Edit' : 'Tambah' }]"
    :save-fn="canSave ? save : undefined"
    :show-save="canSave"
    :save-disabled="loading || !ready || saving || resetState.restoring.value"
    :reset-fn="resetState.reset"
    :reset-disabled="resetState.disabled.value"
    :new-form-path="formPath"
    transaction-module="frmSandiBPJS"
    return-path="/master/sandi-bpjs"
  >
    <template #form-content>
      <div class="credential-form">
        <div v-if="loading" class="load-note">Memuat data...</div>
        <label class="credential-field">
          <span>Judul</span>
          <input v-model="values.sb_judul" type="text" maxlength="255" autocomplete="off" :disabled="loading || !ready || saving || !canSave" />
        </label>
        <label class="credential-field">
          <span>Username <b>*</b></span>
          <input v-model="values.sb_username" type="text" maxlength="100" autocomplete="off" autocapitalize="off" :spellcheck="false" :disabled="loading || !ready || saving || !canSave" />
        </label>
        <label class="credential-field">
          <span>Password <b>*</b></span>
          <input v-model="values.sb_password" type="text" maxlength="255" autocomplete="off" autocapitalize="off" :spellcheck="false" :disabled="loading || !ready || saving || !canSave" />
        </label>
      </div>
    </template>
  </BaseForm>
</template>

<style scoped>
.credential-form { max-width: 640px; padding: 16px; border: 1px solid var(--ds-border, #b0b8c4); background: var(--ds-surface, #fff); }
.credential-field { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; font-size: 12px; }
.credential-field span { width: 100px; flex-shrink: 0; color: var(--ds-on-surface, #12324f); font-weight: 700; }
.credential-field b { color: #dc2626; }
.credential-field input { min-width: 0; flex: 1; padding: 7px 10px; border: 1px solid var(--ds-border, #b0b8c4); border-radius: 4px; background: var(--ds-surface, #fff); color: var(--ds-on-surface, #12324f); font: inherit; }
.credential-field input:focus { outline: 2px solid var(--ds-primary, #3b5998); outline-offset: 1px; }
.credential-field input:disabled { opacity: 0.65; }
.load-note { margin-bottom: 12px; font-size: 12px; }
@media (max-width: 480px) { .credential-field { align-items: stretch; flex-direction: column; gap: 6px; } }
</style>
