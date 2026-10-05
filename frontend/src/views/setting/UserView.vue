<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useToast } from "vue-toastification";
import BaseBrowse from "@/components/BaseBrowse.vue";
import FText from "@/components/fields/FText.vue";
import type { BrowseColumn } from "@/types";
import { api, getErrorMessage } from "@/api/axios";

const toast = useToast();
const memuat = ref(false);

const columns: BrowseColumn[] = [
  { key: "Kode", label: "Kode User", width: "120px" },
  { key: "Nama", label: "Nama User" },
  { key: "Pabrik", label: "Pabrik / Cabang", width: "160px" },
  { key: "JumlahModul", label: "Jumlah Modul", width: "110px", align: "center", type: "align-right" },
  { key: "Status", label: "Status", width: "90px", align: "center" },
];

const dialogReset = ref(false);
const target = ref<any>(null);
const passwordBaru = ref("");
const menyimpan = ref(false);

function bukaReset(row: any) {
  target.value = row;
  passwordBaru.value = "";
  dialogReset.value = true;
}

async function simpanReset() {
  if (!passwordBaru.value) {
    toast.error("Password baru wajib diisi");
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
  if (!confirm(`Hapus user "${row.Nama}" beserta hak aksesnya?`)) return;
  try {
    await api.delete(`/master/user/${encodeURIComponent(row.Kode)}`);
    toast.success("User berhasil dihapus");
    window.location.reload();
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal menghapus user"));
  }
}

onMounted(() => {
  memuat.value = false;
});
</script>

<template>
  <BaseBrowse
    module-title="User"
    module-subtitle="Pengelolaan user aplikasi beserta hak akses modul"
    endpoint="/master/user"
    :columns="columns"
    primary-key="Kode"
    add-label="Tambah User"
    add-form-path="/setting/user/form"
    edit-form-path="/setting/user/form"
    search-placeholder="Cari kode / nama user..."
    :per-page="25"
    :can-delete="false"
  >
    <template #default="{ row }">
      <div class="row-actions">
        <router-link :to="`/setting/hak-akses?kode=${encodeURIComponent(row.Kode)}`" class="lnk">
          Hak Akses
        </router-link>
        <button class="lnk" @click.stop="bukaReset(row)">Reset Password</button>
        <button class="lnk danger" @click.stop="hapus(row)">Hapus</button>
      </div>
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
          Password disimpan plaintext pada <code>tuser.USER_PASSWORD</code>, sama seperti program
          Delphi. Password baru akan berlaku setelah user login ulang.
        </p>
        <FText v-model="passwordBaru" label="Password Baru" required />
      </v-card-text>
      <v-card-actions class="dlg-foot">
        <v-btn variant="text" @click="dialogReset = false">Batal</v-btn>
        <v-btn color="primary" variant="flat" :loading="menyimpan" @click="simpanReset">
          Simpan
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.row-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.lnk {
  border: none;
  background: none;
  color: var(--ds-primary, #3b5998);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  text-decoration: underline;
  font-family: "Plus Jakarta Sans", sans-serif;
}
.lnk.danger {
  color: #b91c1c;
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