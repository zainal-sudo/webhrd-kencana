<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
import KaryawanLookupTable from "@/components/KaryawanLookupTable.vue";
import { useKaryawanLookup } from "@/composables/useKaryawanLookup";
import { useLiveSearch } from "@/composables/useLiveSearch";
import FText from "@/components/fields/FText.vue";
import FDate from "@/components/fields/FDate.vue";
import FSelect from "@/components/fields/FSelect.vue";
import MsIcon from "@/components/MsIcon.vue";
import { useAuthStore } from "@/stores/authStore";
import { useTabsStore } from "@/stores/tabsStore";
import { api as sourceApi, getErrorMessage } from "@/api/axios";
import { useTransactionReset } from "@/composables/useTransactionReset";
import { todaySql } from "@/utils/format";

const route = useRoute();
const router = useRouter();
const toast = useToast();
const karyawanLookup = useKaryawanLookup("/transaksi/keluar/karyawan");
const auth = useAuthStore();
const tabsStore = useTabsStore();
const nomorEdit = computed(() => String(route.query.id || ""));
const isEdit = computed(() => !!nomorEdit.value);
const canSave = computed(() => auth.can("frmKeluar", isEdit.value ? "edit" : "insert"));
const values = reactive({ nomor: "", tanggal: todaySql(), nik: "", alasan: "Lain lain", keterangan: "" });
const info = reactive({ nama: "", pabrik: "", jabatan_kode: "", jabatan: "", bagian: "" });
const alasanOptions = ref<{ label: string; value: string }[]>([{ label: "Lain lain", value: "Lain lain" }]);
const memuat = ref(false);
const siap = ref(false);
const menyimpan = ref(false);
const cariOpen = ref(false);
const cariLoading = ref(false);
const kataCari = ref("");
let nomorRequest = 0;
let infoRequest = 0;
const resetState = useTransactionReset({ values, info }, {
  isEdit: () => isEdit.value,
  blocked: () => memuat.value || !siap.value || menyimpan.value || cariLoading.value || karyawanLookup.loading,
  afterRestore: () => {
    ++nomorRequest;
    ++infoRequest;
    cariOpen.value = false;
    kataCari.value = "";
    karyawanLookup.clear();
  },
});
const api = resetState.trackApi(sourceApi);

function setInfo(data: Record<string, any> = {}) {
  for (const key of Object.keys(info) as (keyof typeof info)[]) info[key] = String(data[key] || "");
}

async function muatNomor() {
  if (resetState.restoring.value) return;
  if (isEdit.value || !values.tanggal) return;
  const request = ++nomorRequest;
  try {
    const { data } = await api.get("/transaksi/keluar/nomor", { params: { tanggal: values.tanggal } });
    if (request === nomorRequest && !isEdit.value) values.nomor = data.data?.nomor || "";
  } catch (e) {
    if (request === nomorRequest) {
      values.nomor = "";
      toast.error(getErrorMessage(e, "Gagal memuat preview nomor"));
    }
  }
}

async function muatDokumen() {
  resetState.invalidate();
  siap.value = false;
  memuat.value = true;
  ++nomorRequest;
  try {
    if (isEdit.value) {
      const { data } = await api.get("/transaksi/keluar/form", { params: { nomor: nomorEdit.value } });
      const d = data.data;
      Object.assign(values, {
        nomor: d.nomor, tanggal: String(d.tanggal || "").slice(0, 10), nik: d.nik || "",
        alasan: d.alasan || "Lain lain", keterangan: d.keterangan || "",
      });
      setInfo(d);
      if (!alasanOptions.value.some((o) => o.value === values.alasan)) {
        alasanOptions.value.push({ label: values.alasan, value: values.alasan });
      }
    } else {
      Object.assign(values, { nomor: "", tanggal: todaySql(), nik: "", alasan: "Lain lain", keterangan: "" });
      setInfo();
      await muatNomor();
    }
    siap.value = true;
    resetState.capture();
    await resetState.initialize();
  } catch (e) { toast.error(getErrorMessage(e, "Gagal memuat dokumen")); }
  finally { memuat.value = false; }
}

async function infoKaryawan() {
  if (resetState.restoring.value) return;
  const request = ++infoRequest;
  const nik = values.nik.trim();
  setInfo();
  if (!nik || isEdit.value) return;
  try {
    const { data } = await api.get("/transaksi/keluar/karyawan-info", { params: { nik } });
    if (request === infoRequest) setInfo(data.data);
  } catch (e) {
    if (request === infoRequest) toast.error(getErrorMessage(e, "NIK tidak ditemukan"));
  }
}

async function cariNik() {
  cariLoading.value = true;
  try {
    await karyawanLookup.search(kataCari.value);
  } catch (e) { toast.error(getErrorMessage(e, "Gagal mencari karyawan")); }
  finally { cariLoading.value = false; }
}

function bukaCari() {
  kataCari.value = values.nik;
  cariOpen.value = true;
  cariNik();
}

function pilihKaryawan(row: Record<string, any>) {
  values.nik = String(row.Nik || "");
  cariOpen.value = false;
}

function tutup() {
  const activeId = tabsStore.activeTabId;
  if (activeId) tabsStore.closeTab(activeId);
  router.push("/transaksi/keluar");
}

async function simpan(): Promise<string> {
  if (menyimpan.value || !siap.value || !canSave.value) throw new Error("Form belum siap disimpan");
  if (!values.tanggal || !values.nik.trim() || !values.alasan.trim()) {
    throw new Error("Tanggal keluar, NIK, dan alasan wajib diisi");
  }
  if ([...values.keterangan].length > 50) throw new Error("Keterangan maksimal 50 karakter");
  menyimpan.value = true;
  try {
    const body = { tanggal: values.tanggal, nik: values.nik.trim(), alasan: values.alasan, keterangan: values.keterangan };
    const { data } = isEdit.value
      ? await api.put(`/transaksi/keluar/${encodeURIComponent(nomorEdit.value)}`, body)
      : await api.post("/transaksi/keluar", body);
    return data.message || "Karyawan Keluar berhasil disimpan";
  }
  finally { menyimpan.value = false; }
}

onMounted(async () => {
  try {
    const { data } = await api.get("/transaksi/keluar/alasan");
    alasanOptions.value = (data.data || []).map((alasan: string) => ({ label: alasan, value: alasan }));
  } catch (e) { toast.error(getErrorMessage(e, "Gagal memuat alasan")); }
  await muatDokumen();
});
watch(nomorEdit, () => muatDokumen());
watch(() => values.tanggal, () => { if (siap.value) muatNomor(); });
watch(() => values.nik, () => { if (!isEdit.value) infoKaryawan(); });
const liveSearch = useLiveSearch(cariNik, { enabled: () => cariOpen.value, invalidate: () => karyawanLookup.invalidate() });
</script>

<template>
  <BaseForm
    :title="isEdit ? `Ubah Karyawan Keluar ${nomorEdit}` : 'Tambah Karyawan Keluar'"
    subtitle="Nomor KEL.YYYYMM.NNNN mengikuti bulan tanggal keluar"
    icon="logout"
    :crumbs="[{ label: 'Karyawan Keluar', path: '/transaksi/keluar' }, { label: isEdit ? 'Ubah' : 'Tambah' }]"
    return-path="/transaksi/keluar"
    new-form-path="/transaksi/keluar/form" transaction-module="frmKeluar"
    :save-fn="simpan" :show-save="canSave" :save-disabled="menyimpan || !siap"
    :reset-fn="resetState.reset"
    :reset-disabled="resetState.disabled.value"
  >
    <template #form-content>
      <div v-if="memuat" class="loading">Memuat data...</div>
      <template v-else>
        <fieldset class="fs">
          <legend>Dokumen & Karyawan</legend>
          <div class="grid">
            <FText v-model="values.nomor" label="Nomor" disabled placeholder="Otomatis saat simpan" />
            <FDate v-model="values.tanggal" label="Tanggal Keluar" required />
            <div class="nik-cari">
              <FText v-model="values.nik" label="NIK" required :disabled="isEdit" placeholder="Ketik NIK atau cari karyawan" />
              <button v-if="!isEdit" class="btn-mini cari-inline employee-search-button" type="button" @click="bukaCari"><MsIcon name="search" :size="18" />Cari karyawan</button>
            </div>
            <FText :model-value="info.nama" label="Nama" disabled />
            <FText :model-value="info.pabrik" label="Pabrik" disabled />
            <div class="field jabatan-wrap">
              <label class="jabatan-label">Kode Jabatan</label>
              <div class="jabatan-inputs">
                <input :value="info.jabatan_kode" disabled aria-label="Kode jabatan" class="jabatan-kode" />
                <input :value="info.jabatan" disabled aria-label="Jabatan" class="jabatan-nama" />
              </div>
            </div>
            <FText :model-value="info.bagian" label="Bagian" disabled />
          </div>
          <p v-if="isEdit" class="note">NIK dokumen tersimpan tidak dapat diganti untuk menjaga tanggal keluar master karyawan.</p>
          <p v-else class="note">Nomor di atas adalah preview. Nomor final dihitung kembali saat simpan.</p>
        </fieldset>
        <fieldset class="fs">
          <legend>Alasan Keluar</legend>
          <div class="grid">
            <FSelect v-model="values.alasan" label="Alasan" required :options="alasanOptions" />
            <div>
              <FText v-model="values.keterangan" label="Keterangan" placeholder="Keterangan tambahan (opsional)" />
              <small class="note">{{ [...values.keterangan].length }}/50 karakter</small>
            </div>
          </div>
        </fieldset>
      </template>
    </template>
    <template #footer-left>
      <button class="btn-mini" :disabled="menyimpan" @click="tutup">Tutup</button>
    </template>
  </BaseForm>

  <v-dialog v-model="cariOpen" max-width="850" scrollable>
    <v-card rounded="false">
      <v-card-title class="dlg-head">Cari Karyawan</v-card-title>
      <v-card-text>
        <div class="cari-bar">
          <input v-model="kataCari" placeholder="NIK / nama / jabatan / bagian / pabrik..." @input="liveSearch.schedule" @keyup.enter="liveSearch.run" />
          <button class="btn-mini primary" :disabled="cariLoading" @click="liveSearch.run">Cari</button>
        </div>
        <p class="note">Daftar mencakup karyawan aktif dan nonaktif; status ditampilkan pada setiap baris.</p>
        <KaryawanLookupTable :lookup="karyawanLookup" :columns="['Nik','Nama','Pabrik','Jabatan','Bagian','Status']" @select="pilihKaryawan" />
      </v-card-text>
      <v-card-actions><v-spacer /><v-btn variant="text" @click="cariOpen = false">Tutup</v-btn></v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.fs { border: 1px solid var(--ds-border, #b0b8c4); border-radius: 12px; background: #fff; padding: 10px 12px 14px; margin-bottom: 12px; }
.fs > legend { font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--ds-primary, #3b5998); padding: 0 6px; }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 14px; }
/* Baris kode + nama jabatan sejajar seperti satu field FText. */
.jabatan-wrap { display: flex; align-items: center; gap: 8px; min-width: 0; }
.jabatan-label { flex: 0 0 140px; font-size: 11px; font-weight: 700; color: var(--ds-primary, #3b5998); }
.jabatan-inputs { flex: 1; min-width: 0; display: flex; gap: 8px; }
.jabatan-inputs input { height: 30px; min-width: 0; padding: 0 9px; border: 1px solid var(--ds-border, #b0b8c4); border-radius: 8px; background: var(--ds-surface-variant, #e6e9ef); font-family: "Plus Jakarta Sans", sans-serif; font-size: 12px; color: #6b7a90; outline: none; }
.jabatan-kode { flex: 0 0 110px; width: 110px; }
.jabatan-nama { flex: 1; }
.note { font-size: 11px; color: #64748b; margin: 8px 0; }
.loading { padding: 24px; text-align: center; }
.btn-mini { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 0 10px; border: 1px solid var(--ds-border, #b0b8c4); border-radius: 8px; background: #fff; font-family: inherit; font-size: 12px; cursor: pointer; }
.btn-mini.primary { background: var(--ds-primary, #3b5998); color: #fff; }
.btn-mini:disabled { opacity: .6; cursor: not-allowed; }
.nik-cari { display: flex; gap: 8px; align-items: flex-end; min-width: 0; }
.nik-cari > :first-child { flex: 1; min-width: 0; }
.cari-inline { height: 30px; flex-shrink: 0; }
.dlg-head { font-size: 14px; font-weight: 800; background: var(--ds-surface-variant, #e0e4ea); }
.cari-bar { display: flex; gap: 8px; margin-bottom: 10px; }
.cari-bar input { flex: 1; min-width: 0; padding: 6px 8px; border: 1px solid var(--ds-border, #b0b8c4); border-radius: 8px; }
.mini { width: 100%; border-collapse: collapse; font-size: 11px; }
.mini th, .mini td { padding: 6px; border: 1px solid var(--ds-border, #b0b8c4); }
.mini th { background: var(--ds-surface-variant, #e0e4ea); text-align: left; }
.klik { cursor: pointer; }
.klik:hover { background: #eef4fc; }
.pager { display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-top: 10px; font-size: 12px; }
@media (max-width: 680px) { .grid { grid-template-columns: 1fr; } .jabatan-wrap { flex-wrap: wrap; } .jabatan-label { flex: 1 1 100%; } }
</style>
