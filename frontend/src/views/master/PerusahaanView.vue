<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useToast } from "vue-toastification";
import { useRouter } from "vue-router";
import MsIcon from "@/components/MsIcon.vue";
import { useAuthStore } from "@/stores/authStore";
import { api, getErrorMessage } from "@/api/axios";

interface CompanyField {
  key: string;
  label: string;
  size?: "full" | "third";
  textarea?: boolean;
  required?: boolean;
  inputmode?: "email" | "tel" | "url";
}
interface CompanySection { title: string; icon: string; fields: CompanyField[] }

const sections: CompanySection[] = [
  {
    title: "Data Utama", icon: "apartment", fields: [
      { key: "per_nama", label: "Nama Perusahaan", size: "full", required: true },
      { key: "per_badan", label: "Badan Usaha" },
      { key: "per_npwp", label: "NPWP" },
    ],
  },
  {
    title: "Alamat & Kontak", icon: "contact_phone", fields: [
      { key: "per_alamat", label: "Alamat", size: "full", textarea: true },
      { key: "per_kota", label: "Kota", size: "third" },
      { key: "per_propinsi", label: "Provinsi", size: "third" },
      { key: "per_kodepos", label: "Kode Pos", size: "third" },
      { key: "per_telpon", label: "Telepon", inputmode: "tel" },
      { key: "per_fax", label: "Fax", inputmode: "tel" },
      { key: "per_email", label: "Email", inputmode: "email" },
      { key: "per_website", label: "Website", inputmode: "url" },
    ],
  },
  {
    title: "Penanggung Jawab & Legalitas", icon: "assignment_ind", fields: [
      { key: "per_kepala", label: "Kepala Perusahaan" },
      { key: "per_jabatan", label: "Jabatan" },
      { key: "per_no_ijin", label: "No. Izin", size: "third" },
      { key: "per_akrit", label: "Akrit", size: "third" },
      { key: "per_akpen", label: "Akpen", size: "third" },
      { key: "per_keterangan", label: "Keterangan", size: "full", textarea: true },
    ],
  },
];

const router = useRouter();
const toast = useToast();
const auth = useAuthStore();
const values = reactive<Record<string, any>>(Object.fromEntries(sections.flatMap(section => section.fields.map(field => [field.key, ""]))));
const memuat = ref(true);
const menyimpan = ref(false);
const siap = ref(false);
const dataBaru = ref(false);
const canSave = computed(() => auth.can("frmPerusahaan", dataBaru.value ? "insert" : "edit"));
const fieldsDisabled = computed(() => memuat.value || menyimpan.value || !siap.value || !canSave.value);

async function muat() {
  if (menyimpan.value) return;
  memuat.value = true;
  siap.value = false;
  try {
    const { data } = await api.get("/master/perusahaan");
    Object.assign(values, data.data);
    dataBaru.value = false;
    siap.value = true;
  } catch (e: any) {
    if (e?.response?.status === 404) {
      dataBaru.value = true;
      siap.value = true;
    } else {
      toast.error(getErrorMessage(e, "Gagal memuat data perusahaan."));
    }
  } finally {
    memuat.value = false;
  }
}

async function simpan() {
  if (memuat.value || menyimpan.value || !siap.value || !canSave.value) return;
  if (!String(values.per_nama ?? "").trim()) {
    toast.error("Nama perusahaan wajib diisi.");
    return;
  }
  menyimpan.value = true;
  try {
    const payload = { ...values };
    if (dataBaru.value) await api.post("/master/perusahaan", payload);
    else await api.put("/master/perusahaan", payload);
    dataBaru.value = false;
    toast.success("Identitas perusahaan berhasil disimpan.", { timeout: 5000 });
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal menyimpan identitas perusahaan."));
  } finally {
    menyimpan.value = false;
  }
}

onMounted(muat);
</script>

<template>
  <form class="company-panel" :aria-busy="memuat || menyimpan" @submit.prevent="simpan">
    <header class="company-header">
      <span class="company-icon"><MsIcon name="apartment" :size="22" /></span>
      <div class="company-heading">
        <h1>Identitas Perusahaan</h1>
        <p>Informasi perusahaan untuk kop dan footer laporan.</p>
      </div>
      <button type="button" class="company-btn back-btn" :disabled="menyimpan" @click="router.back()">
        <MsIcon name="arrow_back" :size="16" />Kembali
      </button>
    </header>

    <div class="company-body">
      <div v-if="memuat" class="company-state" role="status">Memuat data perusahaan...</div>
      <div v-else-if="!siap" class="company-state" role="alert">
        <p>Data perusahaan belum berhasil dimuat.</p>
        <button type="button" class="company-btn" @click="muat">Coba Lagi</button>
      </div>
      <div v-else class="company-content">
        <section v-for="(section, index) in sections" :key="section.title" class="company-section" :aria-labelledby="`company-section-${index}`">
          <h2 :id="`company-section-${index}`"><MsIcon :name="section.icon" :size="17" />{{ section.title }}</h2>
          <div class="company-grid">
            <label v-for="field in section.fields" :key="field.key" class="company-field" :class="field.size || 'half'">
              <span>{{ field.label }}<b v-if="field.required" class="required"> *</b></span>
              <textarea v-if="field.textarea" v-model="values[field.key]" rows="2" :disabled="fieldsDisabled" />
              <input v-else v-model="values[field.key]" type="text" :inputmode="field.inputmode" :required="field.required" :disabled="fieldsDisabled" />
            </label>
          </div>
        </section>
      </div>
    </div>

    <footer class="company-footer">
      <span class="company-hint"><b class="required">*</b> Wajib diisi</span>
      <div class="company-actions">
        <button type="button" class="company-btn" :disabled="menyimpan" @click="router.back()">Batal</button>
        <button v-if="canSave" type="submit" class="company-btn primary" :disabled="fieldsDisabled">
          <MsIcon :name="menyimpan ? 'progress_activity' : 'save'" :size="16" />
          {{ menyimpan ? "Menyimpan..." : "Simpan" }}
        </button>
      </div>
    </footer>
  </form>
</template>

<style scoped>
.company-panel { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; border: 1px solid var(--ds-border, #b0b8c4); border-radius: 12px; background: var(--ds-surface, #f0f3f8); color: var(--ds-on-surface, #12324f); }
.company-header { display: flex; align-items: center; gap: 12px; flex-shrink: 0; padding: 14px 18px; border-bottom: 1px solid var(--ds-border, #b0b8c4); }
.company-icon { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; flex-shrink: 0; border-radius: 10px; color: var(--ds-primary, #3b5998); background: var(--ds-surface-variant, #e0e4ea); }
.company-heading { flex: 1; min-width: 0; }
.company-heading h1 { margin: 0; font-size: 18px; line-height: 1.4; font-weight: 800; }
.company-heading p { margin: 3px 0 0; font-size: 12px; opacity: 0.75; }
.company-body { flex: 1; min-height: 0; overflow: auto; padding: 16px 18px; }
.company-content { max-width: 1080px; margin: 0 auto; display: grid; gap: 16px; }
.company-section { padding: 16px; border: 1px solid var(--ds-border, #b0b8c4); border-radius: 8px; background: color-mix(in srgb, var(--ds-bg, #e8ecf1) 94%, var(--ds-on-surface, #12324f) 6%); }
.company-section h2 { display: flex; align-items: center; gap: 8px; margin: 0 0 14px; padding-bottom: 10px; border-bottom: 1px solid var(--ds-border, #b0b8c4); color: var(--ds-primary, #3b5998); font-size: 13px; font-weight: 800; }
.company-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px 16px; }
.company-field { display: flex; flex-direction: column; min-width: 0; gap: 6px; font-size: 12px; }
.company-field.half { grid-column: span 3; }
.company-field.third { grid-column: span 2; }
.company-field.full { grid-column: 1 / -1; }
.company-field > span { font-weight: 700; }
.required { color: #dc2626; }
.company-field input, .company-field textarea { width: 100%; min-width: 0; box-sizing: border-box; padding: 7px 10px; border: 1px solid var(--ds-border, #b0b8c4); border-radius: 6px; background: var(--ds-surface, #fff); color: var(--ds-on-surface, #12324f); font: inherit; line-height: 1.5; }
.company-field input { height: 34px; }
.company-field textarea { min-height: 64px; resize: vertical; }
.company-field input:focus-visible, .company-field textarea:focus-visible { outline: 2px solid var(--ds-primary, #3b5998); outline-offset: 1px; }
.company-field input:disabled, .company-field textarea:disabled { opacity: 0.65; }
.company-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-shrink: 0; padding: 12px 18px; border-top: 1px solid var(--ds-border, #b0b8c4); background: var(--ds-surface, #fff); }
.company-hint { font-size: 11px; }
.company-actions { display: flex; gap: 8px; }
.company-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 32px; padding: 6px 14px; border: 1px solid var(--ds-border, #b0b8c4); border-radius: 6px; background: var(--ds-surface, #fff); color: var(--ds-on-surface, #12324f); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
.company-btn.primary { background: var(--ds-primary, #3b5998); border-color: var(--ds-primary, #3b5998); color: #fff; }
.company-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.company-btn:focus-visible { outline: 2px solid var(--ds-primary, #3b5998); outline-offset: 2px; }
.company-state { display: grid; justify-items: center; gap: 12px; padding: 32px 12px; font-size: 12px; }
@media (max-width: 900px) { .company-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .company-field.half, .company-field.third { grid-column: span 1; } }
@media (max-width: 560px) { .company-header { flex-wrap: wrap; padding: 12px; } .company-heading h1 { font-size: 16px; } .back-btn { margin-left: auto; } .company-body { padding: 12px; } .company-section { padding: 12px; } .company-grid { grid-template-columns: minmax(0, 1fr); } .company-footer { padding: 10px 12px; } }
</style>
