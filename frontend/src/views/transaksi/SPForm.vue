<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from "vue";
import { useRoute } from "vue-router";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
import FText from "@/components/fields/FText.vue";
import FDate from "@/components/fields/FDate.vue";
import FSelect from "@/components/fields/FSelect.vue";
import FTextarea from "@/components/fields/FTextarea.vue";
import { api, getErrorMessage } from "@/api/axios";
import { todaySql } from "@/utils/format";

/**
 * Form SP — padanan `ufrmSP`.
 *
 * Nomor NNN/HRD/GA-KP/SP/MM/YY otomatis per tahun; NIK (+lookup) mengisi
 * nama/jabatan/bagian/pabrik dari master; periode berlaku + keterangan +
 * tingkatan (Pembinaan, 1/2/3). Peringatan SP aktif ditampilkan live
 * (ambilsp): simpan ditolak bila peringkat aktif >= yang diminta.
 */
const route = useRoute();
const toast = useToast();

const nomorEdit = computed(() => String(route.query.id ?? ""));
const isEdit = computed(() => !!nomorEdit.value);

const SP_KE = ["Pembinaan", "1 (Satu)", "2 (Dua)", "3 (Tiga)"];

const values = reactive<Record<string, any>>({
  nomor: "",
  tanggal: todaySql(),
  nik: "",
  periode1: todaySql(),
  periode2: todaySql(),
  keterangan: "",
  sp_ke: "Pembinaan",
});

const info = reactive({ nama: "", pabrik: "", jab_kode: "", jabatan: "", bagian: "" });
const spAktif = ref("");
const memuat = ref(false);

const cariOpen = ref(false);
const hasilCari = ref<any[]>([]);
const cariLoading = ref(false);
const kataCari = ref("");

async function muatNomor() {
  if (isEdit.value) return;
  try {
    const { data } = await api.get("/transaksi/sp/nomor", { params: { tanggal: values.tanggal } });
    values.nomor = data.data?.nomor || "";
  } catch {
    /* abaikan */
  }
}

async function muatEdit() {
  if (!isEdit.value) return;
  memuat.value = true;
  try {
    const { data } = await api.get("/transaksi/sp/form", { params: { nomor: nomorEdit.value } });
    const d = data.data;
    Object.assign(values, {
      nomor: d.nomor, tanggal: String(d.tanggal).slice(0, 10), nik: d.nik,
      periode1: String(d.periode1).slice(0, 10), periode2: String(d.periode2).slice(0, 10),
      keterangan: d.keterangan || "", sp_ke: d.sp_ke || "Pembinaan",
    });
    Object.assign(info, {
      nama: d.nama, pabrik: d.pabrik, jab_kode: d.jab_kode, jabatan: d.jabatan, bagian: d.bagian,
    });
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat data SP"));
  } finally {
    memuat.value = false;
  }
}

async function infoKaryawan() {
  const nik = String(values.nik || "").trim();
  if (!nik) return;
  try {
    const { data } = await api.get("/transaksi/sp/karyawan-info", { params: { nik } });
    const d = data.data || {};
    Object.assign(info, {
      nama: d.nama || "", pabrik: d.pabrik || "", jab_kode: d.jab_kode || "",
      jabatan: d.jabatan || "", bagian: d.bagian || "",
    });
  } catch {
    Object.assign(info, { nama: "", pabrik: "", jab_kode: "", jabatan: "", bagian: "" });
  }
  cekAktif();
}

/** Live check SP aktif (ambilsp) setiap NIK/tanggal berubah. */
async function cekAktif() {
  spAktif.value = "";
  const nik = String(values.nik || "").trim();
  if (!nik || !values.tanggal) return;
  try {
    const { data } = await api.get("/transaksi/sp/cek", {
      params: { nik, tanggal: values.tanggal, kecuali: isEdit.value ? nomorEdit.value : "" },
    });
    spAktif.value = data.data?.sp_aktif || "";
  } catch {
    /* abaikan */
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
    const { data } = await api.get("/transaksi/sp/karyawan", {
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
  if (!values.nik) throw new Error("NIK wajib diisi");
  if (!values.keterangan) throw new Error("Keterangan/alasan SP wajib diisi");
  if (!values.periode1 || !values.periode2) throw new Error("Periode SP wajib diisi");
  if (values.periode2 < values.periode1) throw new Error("Periode akhir harus >= periode awal");

  const body: Record<string, any> = {
    tanggal: String(values.tanggal).slice(0, 10),
    nik: String(values.nik).trim(),
    periode1: String(values.periode1).slice(0, 10),
    periode2: String(values.periode2).slice(0, 10),
    keterangan: values.keterangan,
    sp_ke: values.sp_ke,
  };
  if (isEdit.value) body.nomor = nomorEdit.value;
  try {
    const { data } = isEdit.value
      ? await api.put("/transaksi/sp", body)
      : await api.post("/transaksi/sp", body);
    return data.message;
  } catch (e) {
    throw new Error(getErrorMessage(e));
  }
}

onMounted(async () => {
  await muatEdit();
  if (!isEdit.value) await muatNomor();
});

watch(
  () => values.tanggal,
  () => {
    if (!isEdit.value) muatNomor();
    cekAktif();
  }
);
</script>

<template>
  <BaseForm
    :title="isEdit ? `Ubah SP ${nomorEdit}` : 'Tambah Surat Peringatan'"
    subtitle="Nomor NNN/HRD/GA-KP/SP/MM/YY dibuat otomatis per tahun"
    icon="description"
    :crumbs="[{ label: 'Surat Peringatan', path: '/transaksi/sp' }, { label: isEdit ? 'Ubah' : 'Tambah' }]"
    :save-fn="simpan"
    return-path="/transaksi/sp"
    save-label="Simpan SP"
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
          <p v-if="spAktif" class="warn-sp">
            Perhatian: karyawan ini masih dalam masa SP {{ spAktif }} (periode tumpang tindih).
            Simpan akan ditolak bila tingkatan yang diminta tidak lebih tinggi.
          </p>
        </fieldset>

        <fieldset class="fs">
          <legend>Isi SP</legend>
          <div class="grid">
            <FDate v-model="values.periode1" label="Periode Awal" required />
            <FDate v-model="values.periode2" label="Periode Akhir" required />
            <FSelect
              v-model="values.sp_ke"
              label="Tingkatan"
              :options="SP_KE.map((a) => ({ label: a, value: a }))"
            />
          </div>
          <div class="ket">
            <FTextarea v-model="values.keterangan" label="Keterangan / Pelanggaran" placeholder="Uraian pelanggaran..." />
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
.ket { margin-top: 8px; }
.warn-sp { font-size: 12px; font-weight: 700; color: #b45309; background: #fffaef; border: 1px solid #d9a441; padding: 6px 10px; margin: 8px 0 0; }
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
