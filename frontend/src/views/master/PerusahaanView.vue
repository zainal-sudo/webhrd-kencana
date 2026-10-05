<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import { useToast } from "vue-toastification";
import { useRouter } from "vue-router";
import FText from "@/components/fields/FText.vue";
import FTextarea from "@/components/fields/FTextarea.vue";
import { api, getErrorMessage } from "@/api/axios";

const router = useRouter();
const toast = useToast();

const values = reactive<Record<string, any>>({});
const memuat = ref(false);
const CompaniesList = [
  { key: "per_nama", label: "Nama Perusahaan" },
  { key: "per_alamat", label: "Alamat", span: 2 },
  { key: "per_kota", label: "Kota" },
  { key: "per_propinsi", label: "Propinsi" },
  { key: "per_kodepos", label: "Kode Pos" },
  { key: "per_telpon", label: "Telpon" },
  { key: "per_fax", label: "Fax" },
  { key: "per_email", label: "Email" },
  { key: "per_website", label: "Website" },
  { key: "per_npwp", label: "NPWP" },
  { key: "per_badan", label: "Badan Usaha" },
  { key: "per_kepala", label: "Kepala Perusahaan" },
  { key: "per_jabatan", label: "Jabatan" },
  { key: "per_no_ijin", label: "No. Ijin" },
  { key: "per_akrit", label: "Akrit" },
  { key: "per_akpen", label: "Akpen" },
  { key: "per_keterangan", label: "Keterangan", type: "textarea", span: 2 },
];

onMounted(async () => {
  memuat.value = true;
  try {
    const { data } = await api.get("/master/perusahaan");
    Object.assign(values, data.data);
  } catch (e: any) {
    if (e?.response?.status !== 404) toast.error(getErrorMessage(e, "Gagal memuat data perusahaan"));
  } finally {
    memuat.value = false;
  }
});

async function simpan() {
  const { data } = await api.put("/master/perusahaan", { ...values });
  return data.message || "Identitas perusahaan tersimpan.";
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>Identitas Perusahaan</h1>
        <p>Data ini dipakai pada kop dan footer seluruh laporan PDF</p>
      </div>
      <button class="btn primary" @click="router.back()">Kembali</button>
    </div>

    <fieldset class="fs">
      <legend>Data Perusahaan</legend>
      <div v-if="memuat" class="loading">Memuat...</div>
      <div v-else class="grid">
        <template v-for="f in CompaniesList" :key="f.key">
          <FText
            v-if="f.type !== 'textarea'"
            v-model="values[f.key]"
            :label="f.label"
            :required="f.key === 'per_nama'"
          />
          <FTextarea
            v-else
            v-model="values[f.key]"
            :label="f.label"
            :rows="2"
          />
        </template>
      </div>
    </fieldset>

    <div class="bar">
      <button class="btn" @click="router.back()">Batal</button>
      <button class="btn primary" @click="simpan">Simpan</button>
    </div>
  </div>
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px 12px;
}
.bar {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}
.btn {
  height: 32px;
  padding: 0 16px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.btn.primary {
  background: var(--ds-primary, #3b5998);
  border-color: var(--ds-primary, #3b5998);
  color: #fff;
}
</style>