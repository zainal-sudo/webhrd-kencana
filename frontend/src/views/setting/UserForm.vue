<script setup lang="ts">
import { ref, reactive, onMounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
import FText from "@/components/fields/FText.vue";
import { api, getErrorMessage } from "@/api/axios";

const route = useRoute();
const router = useRouter();
const toast = useToast();

const isEdit = computed(() => !!(route.params.kode || route.query.id));
const kode = computed(() => (route.params.kode as string) || (route.query.id as string) || "");

const values = reactive<Record<string, any>>({ user_kode: "", user_nama: "", user_akses: "" });
const errors = reactive<Record<string, string>>({});
const pabriks = ref<{ Kode: string; Nama: string }[]>([]);

onMounted(async () => {
  try {
    const { data } = await api.get("/master/lookup");
    pabriks.value = data.data.pabrik || [];
  } catch {
    /* lookup bersifat opsional */
  }
  if (isEdit.value) {
    try {
      const { data } = await api.get(`/master/user/${encodeURIComponent(kode.value)}`);
      Object.assign(values, data.data);
    } catch (e) {
      toast.error(getErrorMessage(e, "Gagal memuat user"));
    }
  }
});

async function simpan(): Promise<string> {
  Object.keys(errors).forEach((k) => delete errors[k]);

  if (!values.user_kode?.trim()) errors.user_kode = "Kode user wajib diisi";
  if (!values.user_nama?.trim()) errors.user_nama = "Nama user wajib diisi";
  if (!values.user_akses?.trim()) errors.user_akses = "Kode pabrik/cabang wajib diisi";
  if (Object.keys(errors).length) throw new Error("Periksa kembali isian yang ditandai");

  if (isEdit.value) {
    await api.put(`/master/user/${encodeURIComponent(kode.value)}`, { ...values });
    return `User ${kode.value} berhasil diperbarui.`;
  }
  await api.post("/master/user", { ...values });
  return `User ${values.user_kode} berhasil ditambahkan.`;
}
</script>

<template>
  <BaseForm
    :title="isEdit ? 'Edit User' : 'Tambah User'"
    :subtitle="isEdit ? kode : 'User baru otomatis berstatus non-aktif sampai diberi hak akses'"
    icon="manage_accounts"
    :crumbs="[
      { label: 'User', path: '/setting/user' },
      { label: isEdit ? 'Edit' : 'Tambah' },
    ]"
    :save-fn="simpan"
    return-path="/setting/user"
  >
    <template #form-content>
      <fieldset class="fs">
        <legend>Data User</legend>
        <div class="grid">
          <FText v-model="values.user_kode" label="Kode User" required :disabled="isEdit" />
          <FText v-model="values.user_nama" label="Nama User" required />
          <div class="field">
            <label>Pabrik / Cabang <span class="req">*</span></label>
            <select v-model="values.user_akses">
              <option value="">Pilih...</option>
              <option v-for="p in pabriks" :key="p.Kode" :value="p.Kode">
                {{ p.Kode }} - {{ p.Nama }}
              </option>
            </select>
            <span v-if="errors.user_akses" class="err">{{ errors.user_akses }}</span>
          </div>
        </div>
        <p class="hint">
          Password diatur terpisah lewat menu <b>Reset Password</b> di daftar user, mengikuti
          penyimpanan plaintext pada tabel <code>tuser.USER_PASSWORD</code>.
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