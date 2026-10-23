<script setup lang="ts">
import { ref, reactive, onMounted, computed } from "vue";
import { useRoute } from "vue-router";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
import FText from "@/components/fields/FText.vue";
import { api, getErrorMessage } from "@/api/axios";
import { useAuthStore } from "@/stores/authStore";
import { usePermissionStore } from "@/stores/permissionStore";
import { useDraftSnapshot } from "@/composables/useUnsavedChanges";
const route = useRoute();
const toast = useToast();
const auth = useAuthStore();
const permissions = usePermissionStore();
const kode = String(route.params.kode || route.query.id || "");
const isEdit = !!kode;
const canSave = computed(() => auth.can("frmUser", isEdit ? "edit" : "insert"));
const values = reactive({ user_kode: "", user_nama: "", user_akses: "", user_password: "" });
const errors = reactive<Record<string, string>>({});
const pabriks = ref<{ Kode: string; Nama: string }[]>([]);
const loading = ref(true), ready = ref(false), saving = ref(false);
useDraftSnapshot(() => values, { ready: () => ready.value && canSave.value, busy: () => saving.value });
onMounted(async () => {
  try {
    try { const { data } = await api.get("/master/lookup"); pabriks.value = data.data.pabrik || []; }
    catch (err) { toast.error(getErrorMessage(err, "Gagal memuat pilihan pabrik.")); }
    if (isEdit) {
      const { data } = await api.get(`/master/user/${encodeURIComponent(kode)}`);
      values.user_kode = data.data.Kode;
      values.user_nama = data.data.Nama ?? "";
      values.user_akses = data.data.Cabang ?? "";
    }
    ready.value = true;
  } catch (err) { toast.error(getErrorMessage(err, "Gagal memuat user.")); }
  finally { loading.value = false; }
});
async function simpan(): Promise<string> {
  if (!canSave.value) throw new Error("Tidak memiliki hak menyimpan user.");
  if (loading.value || !ready.value || saving.value) throw new Error("Form belum siap disimpan.");
  Object.keys(errors).forEach(key => delete errors[key]);
  if (!values.user_kode.trim() || [...values.user_kode].length > 10) errors.user_kode = "Kode user wajib diisi dan maksimal 10 karakter.";
  if (!values.user_nama.trim() || [...values.user_nama].length > 30) errors.user_nama = "Nama user wajib diisi dan maksimal 30 karakter.";
  if ([...values.user_akses].length > 5) errors.user_akses = "Kode pabrik maksimal 5 karakter.";
  if (!isEdit && (!values.user_password.trim() || [...values.user_password].length > 15)) errors.user_password = "Password awal wajib diisi dan maksimal 15 karakter.";
  if (Object.keys(errors).length) throw new Error("Periksa kembali isian yang ditandai.");
  saving.value = true;
  try {
    const body = { user_kode: isEdit ? kode : values.user_kode, user_nama: values.user_nama, user_akses: values.user_akses };
    if (isEdit) await api.put(`/master/user/${encodeURIComponent(kode)}`, body);
    else await api.post("/master/user", { ...body, user_password: values.user_password });
    if (isEdit && auth.user?.user_kode === kode) { await auth.refreshProfile(); permissions.build(); }
    return isEdit ? `User ${kode} berhasil diperbarui.` : `User ${values.user_kode} berhasil ditambahkan.`;
  } finally { saving.value = false; }
}
</script>

<template>
  <BaseForm
    :title="isEdit ? 'Edit User' : 'Tambah User'"
    :subtitle="isEdit ? kode : 'Isi data user dan password awal, lalu atur hak akses modul'"
    icon="manage_accounts"
    :crumbs="[
      { label: 'User', path: '/setting/user' },
      { label: isEdit ? 'Edit' : 'Tambah' },
    ]"
    :save-fn="canSave ? simpan : undefined"
    :show-save="canSave"
    :save-disabled="loading || !ready || saving"
    return-path="/setting/user"
  >
    <template #form-content>
      <fieldset class="fs">
        <legend>Data User</legend>
        <p v-for="(message, field) in errors" :key="field" class="err" role="alert">{{ message }}</p>
        <div class="grid">
          <FText v-model="values.user_kode" label="Kode User" required :disabled="isEdit || loading || !ready || saving || !canSave" />
          <FText v-model="values.user_nama" label="Nama User" required :disabled="loading || !ready || saving || !canSave" />
          <FText v-if="!isEdit" v-model="values.user_password" label="Password Awal" type="password" required :disabled="loading || !ready || saving || !canSave" />
          <div class="field">
            <label>Pabrik / Cabang</label>
            <select v-model="values.user_akses" :disabled="loading || !ready || saving || !canSave">
              <option value="">Semua Pabrik</option>
              <option v-for="p in pabriks" :key="p.Kode" :value="p.Kode">
                {{ p.Kode }} - {{ p.Nama }}
              </option>
            </select>
            <span v-if="errors.user_akses" class="err">{{ errors.user_akses }}</span>
          </div>
        </div>
        <p class="hint">
          Untuk mengubah password user existing, gunakan <b>Reset Password</b> di daftar user.
        </p>
      </fieldset>
    </template>
  </BaseForm>
</template>

<style scoped>
.fs {
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  padding: 10px 12px 14px;
}
.fs legend {
  font-size: 12px;
  font-weight: 800;
  color: var(--ds-primary, #3b5998);
  padding: 0 6px;
}
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  max-width: 560px;
}
.field {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}
.field label {
  flex: 0 0 140px;
  font-size: 11px;
  font-weight: 700;
  color: var(--ds-primary, #3b5998);
}
.req {
  color: #b91c1c;
}
select {
  flex: 1;
  min-width: 0;
  height: 30px;
  border: 1px solid var(--ds-border, #b0b8c4);
  padding: 0 6px;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 12px;
  background: #fff;
}
.err {
  font-size: 10px;
  color: #b91c1c;
}
.hint {
  margin: 10px 0 0;
  font-size: 10px;
  color: #6b7a90;
  line-height: 1.6;
}
</style>
