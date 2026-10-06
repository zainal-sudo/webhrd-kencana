<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
import FText from "@/components/fields/FText.vue";
import FDate from "@/components/fields/FDate.vue";
import FSelect from "@/components/fields/FSelect.vue";
import { api, getErrorMessage } from "@/api/axios";
import { todaySql } from "@/utils/format";

/**
 * Form Perubahan Status — padanan `ufrmPerubahanStatus`.
 *
 * Nomor PST.YYYYMM.NNNN otomatis; NIK (+lookup) mengisi data karyawan dan
 * status lama dari master (`kar_status_kerja`); status baru + periode PKWT
 * diisi manual. Tidak ada otorisasi tanggal di Delphi untuk modul ini.
 */
const route = useRoute();
const toast = useToast();

const nomorEdit = computed(() => String(route.query.id ?? ""));
const isEdit = computed(() => !!nomorEdit.value);

const values = reactive<Record<string, any>>({
  nomor: "",
  tanggal: todaySql(),
  nik: "",
  status_lama: "",
  status_baru: "",
  tgl_awal: todaySql(),
  tgl_akhir: todaySql(),
});

const info = reactive({ nama: "", pabrik: "", jab_kode: "", jabatan: "", bagian: "" });
const statusOptions = ref<{ label: string; value: string | number }[]>([]);
const memuat = ref(false);

const cariOpen = ref(false);
const hasilCari = ref<any[]>([]);
const cariLoading = ref(false);
const kataCari = ref("");

async function muatStatus() {
  try {
    const { data } = await api.get("/transaksi/perubahan-status/status");
    statusOptions.value = (data.data || []).map((r: any) => ({
      label: `${r.Kode} - ${r.Nama}`,
      value: String(r.Kode),
    }));
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat status kerja"));
  }
}

async function muatNomor() {
  if (isEdit.value) return;
  try {
    const { data } = await api.get("/transaksi/perubahan-status/nomor", { params: { tanggal: values.tanggal } });
    values.nomor = data.data?.nomor || "";
  } catch {
    /* abaikan */
  }
}

async function muatEdit() {
  if (!isEdit.value) return;
  memuat.value = true;
  try {
    const { data } = await api.get("/transaksi/perubahan-status/form", { params: { nomor: nomorEdit.value } });
    const d = data.data;
    Object.assign(values, {
      nomor: d.nomor, tanggal: String(d.tanggal).slice(0, 10), nik: d.nik,
      status_lama: String(d.status_lama ?? ""), status_baru: String(d.status_baru ?? ""),
      tgl_awal: String(d.tgl_awal || "").slice(0, 10), tgl_akhir: String(d.tgl_akhir || "").slice(0, 10),
    });
    Object.assign(info, {
      nama: d.nama, pabrik: d.pabrik, jab_kode: d.jab_kode, jabatan: d.jabatan, bagian: d.bagian,
    });
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat data"));
  } finally {
    memuat.value = false;
  }
}

async function infoKaryawan() {
  const nik = String(values.nik || "").trim();
  if (!nik) return;
  try {
    const { data } = await api.get("/transaksi/perubahan-status/karyawan-info", { params: { nik } });
    const d = data.data || {};
    Object.assign(info, {
      nama: d.nama || "", pabrik: d.pabrik || "", jab_kode: d.jab_kode || "",
      jabatan: d.jabatan || "", bagian: d.bagian || "",
    });
    if (d.status_kerja !== null && d.status_kerja !== undefined) values.status_lama = String(d.status_kerja);
    if (d.pkwt1) values.tgl_awal = String(d.pkwt1).slice(0, 10);
    if (d.pkwt2) values.tgl_akhir = String(d.pkwt2).slice(0, 10);
  } catch {
    Object.assign(info, { nama: "", pabrik: "", jab_kode: "", jabatan: "", bagian: "" });
  }
}

async function bukaCari() {
  cariOpen.value = true;
  kataCari.value = String(values.nik || "");
  await cariNik();
}

async function cariNik() {
  cariLoading.value = true;
  try {
    const { data } = await api.get("/transaksi/perubahan-status/karyawan", {
      params: { search: kataCari.value, per_page: 25 },
    });
    hasilCari.value = data.data || [];
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal mencari karyawan"));
  } finally {
    cariLoading.value = false;
  }
}

function pilihKaryawan(row: Record<string, any>) {
  values.nik = String(row.Nik ?? "");
  cariOpen.value = false;
  infoKaryawan();
}

async function simpan(): Promise<string> {
  if (!values.tanggal) throw new Error("Tanggal wajib diisi");
  if (!values.nik) throw new Error("NIK wajib diisi");
  if (!values.status_lama) throw new Error("Status lama wajib dipilih");
  if (!values.status_baru) throw new Error("Status baru wajib dipilih");
  if (!values.tgl_awal || !values.tgl_akhir) throw new Error("Periode PKWT wajib diisi");
  if (values.tgl_akhir < values.tgl_awal) throw new Error("Tanggal akhir PKWT harus >= tanggal awal");

  const body: Record<string, any> = {
    tanggal: String(values.tanggal).slice(0, 10),
    nik: String(values.nik).trim(),
    status_lama: parseInt(String(values.status_lama), 10),
    status_baru: parseInt(String(values.status_baru), 10),
    tgl_awal: String(values.tgl_awal).slice(0, 10),
    tgl_akhir: String(values.tgl_akhir).slice(0, 10),
  };
  if (isEdit.value) body.nomor = nomorEdit.value;
  const { data } = isEdit.value
    ? await api.put("/transaksi/perubahan-status", body)
    : await api.post("/transaksi/perubahan-status", body);
  return data.message;
}

onMounted(async () => {
  await muatStatus();
  await muatEdit();
  if (!isEdit.value) await muatNomor();
});
</script>

<template>
  <BaseForm
    :title="isEdit ? `Ubah Perubahan Status ${nomorEdit}` : 'Tambah Perubahan Status'"
    subtitle="Nomor PST.YYYYMM.NNNN dibuat otomatis per bulan"
    icon="published_with_changes"
    :crumbs="[{ label: 'Perubahan Status', path: '/transaksi/perubahan-status' }, { label: isEdit ? 'Ubah' : 'Tambah' }]"
    :save-fn="simpan"
    return-path="/transaksi/perubahan-status"
    save-label="Simpan"
  >
    <template #form-content>
      <div v-if="memuat" class="loading">Memuat data...</div>
      <template v-else>
        <fieldset class="fs">
          <legend>Dokumen & Karyawan</legend>
          <div class="grid">
            <FText v-model="values.nomor" label="Nomor" disabled placeholder="Otomatis" />
            <FDate v-model="values.tanggal" label="Tanggal" required />
            <FText v-model="values.nik" label="NIK" required placeholder="Ketik NIK / Cari" />
            <div class="cari-btn"><button class="btn-mini" type="button" @click="bukaCari">Cari karyawan</button></div>
            <FText :model-value="info.nama" label="Nama" disabled @update:model-value="() => {}" />
            <FText :model-value="info.pabrik" label="Pabrik" disabled @update:model-value="() => {}" />
            <FText :model-value="`${info.jab_kode} - ${info.jabatan}`" label="Jabatan" disabled @update:model-value="() => {}" />
            <FText :model-value="info.bagian" label="Bagian" disabled @update:model-value="() => {}" />
          </div>
        </fieldset>

        <fieldset class="fs">
          <legend>Status & Periode PKWT</legend>
          <div class="grid">
            <FSelect v-model="values.status_lama" label="Status Lama (dari master)" required :options="statusOptions" />
            <FSelect v-model="values.status_baru" label="Status Baru" required :options="statusOptions" />
            <FDate v-model="values.tgl_awal" label="PKWT Awal" required />
            <FDate v-model="values.tgl_akhir" label="PKWT Akhir" required />
          </div>
        </fieldset>
      </template>
    </template>
  </BaseForm>

  <v-dialog v-model="cariOpen" max-width="760" scrollable>
    <v-card rounded="false">
      <v-card-title class="dlg-head">
        <span>Cari Karyawan</span>
        <v-btn icon="close" size="small" variant="text" @click="cariOpen = false" />
      </v-card-title>
      <v-card-text class="dlg-body">
        <div class="cari-bar">
          <input v-model="kataCari" placeholder="NIK / nama..." @keyup.enter="cariNik" />
          <button class="btn-mini primary" type="button" :disabled="cariLoading" @click="cariNik">
            {{ cariLoading ? "Mencari..." : "Cari" }}
          </button>
        </div>
        <table class="mini">
          <thead><tr><th>NIK</th><th>Nama</th><th>Jabatan</th><th>Bagian</th><th>Pabrik</th><th>Status</th></tr></thead>
          <tbody>
            <tr v-for="(r, i) in hasilCari" :key="i" class="klik" @click="pilihKaryawan(r)">
              <td>{{ r.Nik }}</td><td>{{ r.Nama }}</td><td>{{ r.Jabatan }}</td>
              <td>{{ r.Bagian }}</td><td>{{ r.Pabrik }}</td><td>{{ r.Status }}</td>
            </tr>
            <tr v-if="!hasilCari.length"><td colspan="6" class="empty">Tidak ditemukan</td></tr>
          </tbody>
        </table>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.fs { border: 1px solid var(--ds-border, #b0b8c4); background: #fff; padding: 10px 12px 14px; margin-bottom: 12px; }
.fs > legend { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; color: var(--ds-primary, #3b5998); padding: 0 6px; }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 14px; }
.cari-btn { display: flex; align-items: flex-end; padding-bottom: 1px; }
.btn-mini { height: 26px; padding: 0 10px; border: 1px solid var(--ds-border, #b0b8c4); background: #fff; font-family: "Plus Jakarta Sans", sans-serif; font-size: 11px; font-weight: 700; cursor: pointer; color: var(--ds-on-surface, #1b2d4a); }
.btn-mini.primary { background: var(--ds-primary, #3b5998); border-color: var(--ds-primary-dark, #2c4472); color: #fff; }
.btn-mini:disabled { opacity: 0.6; cursor: not-allowed; }
.loading { padding: 24px; text-align: center; font-size: 12px; color: #6b7a90; }
.dlg-head { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 800; padding: 8px 12px; background: var(--ds-surface-variant, #e0e4ea); }
.dlg-body { background: #fff; padding: 12px 14px; }
.cari-bar { display: flex; gap: 6px; margin-bottom: 10px; }
.cari-bar input { flex: 1; height: 28px; border: 1px solid var(--ds-border, #b0b8c4); padding: 0 8px; font-size: 12px; font-family: "Plus Jakarta Sans", sans-serif; }
table.mini { width: 100%; border-collapse: collapse; font-size: 11px; }
table.mini th { background: var(--ds-surface-variant, #e0e4ea); border: 1px solid var(--ds-border, #b0b8c4); padding: 5px 7px; text-align: left; font-weight: 800; }
table.mini td { border: 1px solid #d5dbe3; padding: 4px 7px; }
table.mini tr.klik:hover { background: var(--ds-primary-lighten-1, #dbe4f3); cursor: pointer; }
table.mini .empty { text-align: center; color: #8995a6; padding: 10px; }
</style>
