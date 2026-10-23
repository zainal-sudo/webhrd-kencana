<script setup lang="ts">
import { computed, ref } from "vue";
import { useToast } from "vue-toastification";
import BaseBrowse from "@/components/BaseBrowse.vue";
import FText from "@/components/fields/FText.vue";
import MsIcon from "@/components/MsIcon.vue";
import { useAuthStore } from "@/stores/authStore";
import type { BrowseColumn } from "@/types";
import { api, getErrorMessage } from "@/api/axios";
import { useUnsavedChanges } from "@/composables/useUnsavedChanges";

const toast = useToast();
const auth = useAuthStore();
const browse = ref<InstanceType<typeof BaseBrowse> | null>(null);
const canInsert = computed(() => auth.can("frmUser", "insert"));
const canEdit = computed(() => auth.can("frmUser", "edit"));
const canDelete = computed(() => auth.can("frmUser", "delete"));

const columns: BrowseColumn[] = [
  { key: "Kode", label: "Kode User", width: "120px", filterValueType: "string" },
  { key: "Nama", label: "Nama User", filterValueType: "string" },
  { key: "Cabang", label: "Pabrik / Cabang", width: "160px", filterValueType: "string" },
];

const dialogReset = ref(false);
const target = ref<any>(null);
const passwordBaru = ref("");
const menyimpan = ref(false);
useUnsavedChanges({ dirty: () => dialogReset.value && !!passwordBaru.value,
  state: () => ({ target: target.value?.Kode, password: passwordBaru.value }), busy: () => menyimpan.value });

function bukaReset(row: any) {
  if (!canEdit.value || menyimpan.value) return;
  target.value = row;
  passwordBaru.value = "";
  dialogReset.value = true;
}

async function simpanReset() {
  if (!canEdit.value || menyimpan.value || !target.value) return;
  if (!passwordBaru.value.trim() || [...passwordBaru.value].length > 15) {
    toast.error("Password baru wajib diisi dan maksimal 15 karakter.");
    return;
  }
  menyimpan.value = true;
  try {
    await api.put(`/master/user/${encodeURIComponent(target.value.Kode)}/password`, {
      password: passwordBaru.value,
    });
    toast.success(`Password user ${target.value.Kode} berhasil diubah`);
    dialogReset.value = false;
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal mengubah password"));
  } finally {
    menyimpan.value = false;
  }
}

async function hapus(row: any) {
  if (!canDelete.value || menyimpan.value) return;
  if (!confirm(`Hapus user "${row.Nama}" beserta hak aksesnya?`)) return;
  menyimpan.value = true;
  try {
    await api.delete(`/master/user/${encodeURIComponent(row.Kode)}`);
    toast.success("User berhasil dihapus");
    browse.value?.refreshAfterDelete();
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal menghapus user"));
    browse.value?.refresh();
  } finally { menyimpan.value = false; }
}

</script>

<template>
  <BaseBrowse
    ref="browse"
    class="user-browse"
    :action-width="240"
    edit-button-label="Edit User"
    module-title="User"
    module-subtitle="Pengelolaan user aplikasi beserta hak akses modul"
    endpoint="/master/user"
    :columns="columns"
    primary-key="Kode"
    add-label="Tambah User"
    :add-form-path="canInsert ? '/setting/user/form' : ''"
    :edit-form-path="canEdit ? '/setting/user/form' : ''"
    search-placeholder="Cari kode / nama user..."
    :per-page="25"
    :can-delete="false"
  >
    <template #cell="{ row, column, text }">
      <template v-if="column.key === 'Cabang' && !row.Cabang">Semua Pabrik</template>
      <template v-else>{{ text }}</template>
    </template>
    <template #row-actions="{ row }">
      <router-link :to="`/setting/hak-akses?kode=${encodeURIComponent(row.Kode)}`" class="user-action access-button" title="Hak Akses" @click.stop>
        <MsIcon name="shield" :size="14" />
        <span>Hak Akses</span>
      </router-link>
    </template>
    <template #row-actions-end="{ row }">
      <button v-if="canEdit" type="button" class="user-action icon-button reset-button" title="Reset Password" :aria-label="`Reset Password user ${row.Kode}`" :disabled="menyimpan" @click.stop="bukaReset(row)"><MsIcon name="key" :size="14" /></button>
      <button v-if="canDelete" type="button" class="user-action icon-button delete-button" title="Hapus User" :aria-label="`Hapus user ${row.Kode}`" :disabled="menyimpan" @click.stop="hapus(row)"><MsIcon name="delete" :size="14" /></button>
    </template>
  </BaseBrowse>

  <v-dialog v-model="dialogReset" max-width="420">
    <v-card class="dlg">
      <v-card-title class="dlg-head">
        <span>Reset Password — {{ target?.Nama }}</span>
        <v-btn icon="close" size="small" variant="text" @click="dialogReset = false" />
      </v-card-title>
      <v-card-text class="dlg-body">
        <p class="note">
          Password baru akan berlaku setelah user login ulang.
        </p>
        <FText v-model="passwordBaru" label="Password Baru" type="password" required :disabled="menyimpan || !canEdit" />
      </v-card-text>
      <v-card-actions class="dlg-foot">
        <v-btn variant="text" @click="dialogReset = false">Batal</v-btn>
        <v-btn color="primary" variant="flat" :loading="menyimpan" :disabled="!canEdit || menyimpan" @click="simpanReset">
          Simpan
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.user-browse :deep(.action-col) { width: 240px; min-width: 240px; max-width: 240px; }
/* Leave breathing room between action borders in the existing 35px rows. */
.user-browse :deep(tbody td.action-col) { padding: 2px 4px; }
.user-browse :deep(.row-actions) { align-items: center; justify-content: center; flex-wrap: nowrap; gap: 6px; }
.user-action, .user-browse :deep(.row-btn.edit) {
  --user-action-color: var(--ds-primary, #3b5998);
  box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; height: 30px; border: 1px solid color-mix(in srgb, var(--user-action-color) 22%, transparent); border-radius: 8px;
  background: color-mix(in srgb, var(--user-action-color) 3%, transparent); color: var(--user-action-color);
  font: inherit; font-size: 11px; font-weight: 500; line-height: 1; white-space: nowrap; cursor: pointer;
  text-decoration: none; transition: background-color 150ms ease, border-color 150ms ease;
}
.access-button { width: 105px; padding: 0 8px; gap: 6px; }
.icon-button, .user-browse :deep(.row-btn.edit) { width: 36px; padding: 0; }
.reset-button { --user-action-color: color-mix(in srgb, var(--ds-primary, #3b5998) 75%, var(--ds-text-secondary, #64748b)); }
.delete-button { --user-action-color: var(--ds-error, #dc2626); background: transparent; }
.user-action:not(:disabled):is(:hover, :focus-visible), .user-browse :deep(.row-btn.edit:is(:hover, :focus-visible)) {
  background: color-mix(in srgb, var(--user-action-color) 12%, transparent);
  border-color: color-mix(in srgb, var(--user-action-color) 42%, transparent);
}
.user-action:focus-visible, .user-browse :deep(.row-btn.edit:focus-visible) { outline: 2px solid currentColor; outline-offset: -2px; }
.user-action:disabled { opacity: .5; cursor: not-allowed; }
@media (prefers-reduced-motion: reduce) {
  .user-action, .user-browse :deep(.row-btn.edit) { transition: none; }
}
.dlg-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 800;
  padding: 8px 12px;
  background: var(--ds-surface-variant, #e0e4ea);
}
.dlg-body {
  background: #fff;
  padding: 14px;
}
.dlg-foot {
  justify-content: flex-end;
  background: #fff;
}
.note {
  font-size: 10px;
  color: #6b7a90;
  line-height: 1.6;
  margin: 0 0 12px;
}
</style>
