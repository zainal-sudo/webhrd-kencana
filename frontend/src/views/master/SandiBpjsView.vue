<script setup lang="ts">
import { computed, ref } from "vue";
import { useToast } from "vue-toastification";
import BaseBrowse from "@/components/BaseBrowse.vue";
import MsIcon from "@/components/MsIcon.vue";
import CopyCodeButton from "@/components/CopyCodeButton.vue";
import { useAuthStore } from "@/stores/authStore";
import { api, getErrorMessage } from "@/api/axios";
import type { BrowseColumn } from "@/types";

const auth = useAuthStore();
const toast = useToast();
const browse = ref<InstanceType<typeof BaseBrowse> | null>(null);
const endpoint = "/master/sandi-bpjs";
const formPath = "/master/sandi-bpjs/form";
const canInsert = computed(() => auth.can("frmSandiBPJS", "insert"));
const canEdit = computed(() => auth.can("frmSandiBPJS", "edit"));
const canDelete = computed(() => auth.can("frmSandiBPJS", "delete"));
const columns: BrowseColumn[] = [
  { key: "sb_judul", label: "Judul", width: "180px" },
  { key: "sb_username", label: "Username", width: "auto" },
  { key: "sb_password", label: "Password", width: "200px", sortable: false, filterable: false },
  { key: "sb_updated_at", label: "Terakhir Diubah", width: "170px", type: "datetime" },
  { key: "sb_updated_by", label: "Oleh", width: "90px" },
];
const deleteTarget = ref<{ id: number; username: string } | null>(null);
const deleting = ref(false);

function confirmDelete(row: Record<string, any>) {
  if (!canDelete.value || deleting.value) return;
  deleteTarget.value = { id: row.sb_id, username: row.sb_username };
}

async function remove() {
  if (!canDelete.value || !deleteTarget.value || deleting.value) return;
  const id = deleteTarget.value.id;
  deleting.value = true;
  try {
    await api.delete(`${endpoint}/${id}`);
    deleteTarget.value = null;
    toast.success("Akun berhasil dihapus.");
    browse.value?.refreshAfterDelete();
  } catch (err) {
    toast.error(getErrorMessage(err, "Gagal menghapus akun."));
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <BaseBrowse
    class="sandi-bpjs-browse"
    ref="browse"
    module-title="Sandi"
    :endpoint="endpoint"
    :columns="columns"
    primary-key="sb_id"
    row-number-label="No"
    add-label="Tambah Akun"
    :add-form-path="canInsert ? formPath : ''"
    :edit-form-path="canEdit ? formPath : ''"
    :can-delete="false"
    :show-actions="canEdit || canDelete"
    :exportable="false"
    :compact="true"
    :action-width="80"
    :refresh-on-activate="true"
    :per-page="25"
    search-placeholder="Cari judul / username / oleh..."
  >
    <template #cell="{ row, column, text }">
      <div v-if="column.key === 'sb_username' || column.key === 'sb_password'" class="credential-cell">
        <span v-if="column.key === 'sb_password'" class="password-text">{{ text }}</span>
        <span v-else class="username-text">{{ text }}</span>
        <CopyCodeButton
          :value="String(row[column.key] ?? '')"
          :icon-only="true"
          :label="column.key === 'sb_password' ? 'Salin Password' : 'Salin Username'"
          :success-message="column.key === 'sb_password' ? 'Password disalin' : 'Username disalin'"
        />
      </div>
      <template v-else>{{ text }}</template>
    </template>
    <template #row-actions-end="{ row }">
      <button v-if="canDelete" type="button" class="delete-btn" title="Hapus" aria-label="Hapus akun" @click.stop="confirmDelete(row)">
        <MsIcon name="delete" :size="16" />
      </button>
    </template>
  </BaseBrowse>
  <v-dialog :model-value="!!deleteTarget" max-width="420" persistent>
    <v-card>
      <v-card-title class="text-body-1 font-weight-bold">Konfirmasi Hapus</v-card-title>
      <v-card-text>Hapus akun dengan username {{ deleteTarget?.username }}?</v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn :disabled="deleting" variant="text" @click="deleteTarget = null">Batal</v-btn>
        <v-btn :loading="deleting" color="error" variant="flat" @click="remove">Hapus</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.sandi-bpjs-browse :deep(.browse-table) { font-size: 12px; }
.sandi-bpjs-browse.compact :deep(.browse-table) { table-layout: fixed; }
.sandi-bpjs-browse.compact :deep(.action-col) { width: 80px; min-width: 80px; max-width: 80px; padding-left: 6px; padding-right: 6px; }
.sandi-bpjs-browse :deep(.th-label) { text-transform: none; }
.sandi-bpjs-browse.compact :deep(th:not(.sorted) .th-sort) { display: inline-flex; }
.sandi-bpjs-browse.compact :deep(.row-actions) { justify-content: center; align-items: center; gap: 12px; }
.sandi-bpjs-browse :deep(.row-btn.edit),
.delete-btn { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 24px; width: 24px; height: 24px; padding: 0; border: none; border-radius: 50%; background: transparent; cursor: pointer; transition: background-color 0.15s ease; }
.sandi-bpjs-browse :deep(.row-btn.edit .ms-icon) { font-size: 16px !important; width: 16px !important; height: 16px !important; }
.sandi-bpjs-browse :deep(.row-btn.edit:hover) { background: rgba(59, 89, 152, 0.14); }
.delete-btn:hover { background: rgba(220, 38, 38, 0.12); }
.credential-cell { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.username-text { min-width: 0; overflow-wrap: anywhere; }
.password-text { min-width: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; user-select: text; }
.delete-btn { color: #dc2626; }
.delete-btn:focus-visible { outline: 2px solid var(--ds-primary, #3b5998); outline-offset: 2px; }
</style>
