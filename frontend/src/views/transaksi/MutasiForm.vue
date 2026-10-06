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
import type { LookupItem } from "@/types";

/**
 * Form Mutasi Karyawan — padanan `ufrmMutasiKaryawan`.
 *
 * Bagian atas: Nomor (NNN/HRD-KP/MM/YY otomatis), Tanggal, NIK (+lookup),
 * data LAMA (nama/pabrik/jabatan/bagian, read-only) + Menimbang/Mengingat/
 * Melapor. Bagian bawah: Pabrik/Jabatan/Departemen Baru (dropdown),
 * Bagian Baru (+lookup bagian unik), Alasan (Mutasi/Demosi/Promosi/Rotasi).
 */
const route = useRoute();
const toast = useToast();

const nomorEdit = computed(() => String(route.query.id ?? ""));
const isEdit = computed(() => !!nomorEdit.value);

const values = reactive<Record<string, any>>({
  nomor: "",
  tanggal: todaySql(),
  nik: "",
  pabrik_baru: "",
  jabatan_baru: "",
  bagian_baru: "",
  departemen: "",
  alasan: "Mutasi",
  menimbang: "",
  mengingat: "",
  lapor: "",
});

const lama = reactive({ nama: "", pabrik: "", jab_kode: "", jabatan: "", bagian: "" });
const memuat = ref(false);

const pabrikOptions = ref<{ label: string; value: string | number }[]>([]);
const jabatanOptions = ref<{ label: string; value: string | number }[]>([]);
const departemenOptions = ref<{ label: string; value: string | number }[]>([]);

const cariOpen = ref(false);
const cariMode = ref<"nik" | "bagian">("nik");
const hasilCari = ref<any[]>([]);
const cariLoading = ref(false);
const kataCari = ref("");

async function muatLookup() {
  try {
    const { data } = await api.get("/master/lookup");
    const d = data.data || {};
    const keOpsi = (arr: LookupItem[]) => (arr || []).map((r) => ({ label: `${r.Kode} - ${r.Nama}`, value: String(r.Kode) }));
    pabrikOptions.value = keOpsi(d.pabrik);
    jabatanOptions.value = keOpsi(d.jabatan);
    departemenOptions.value = keOpsi(d.departemen);
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat opsi form"));
  }
}

async function muatNomor() {
  if (isEdit.value) return;
  try {
    const { data } = await api.get("/transaksi/mutasi/nomor", { params: { tanggal: values.tanggal } });
    values.nomor = data.data?.nomor || "";
  } catch {
    /* abaikan — nomor final dibuat server */
  }
}

async function muatEdit() {
  if (!isEdit.value) return;
  memuat.value = true;
  try {
    const { data } = await api.get("/transaksi/mutasi/form", { params: { nomor: nomorEdit.value } });
    const d = data.data;
    Object.assign(values, {
      nomor: d.nomor, tanggal: String(d.tanggal).slice(0, 10), nik: d.nik,
      pabrik_baru: d.pabrik_baru, jabatan_baru: d.jabatan_baru, bagian_baru: d.bagian_baru,
      departemen: d.departemen, alasan: d.alasan, menimbang: d.menimbang || "",
      mengingat: d.mengingat || "", lapor: d.lapor || "",
    });
    Object.assign(lama, {
      nama: d.nama, pabrik: d.pabrik_lama, jab_kode: d.jabatan_lama,
      jabatan: d.jabatan_lama_nama, bagian: d.bagian_lama,
    });
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat data mutasi"));
  } finally {
    memuat.value = false;
  }
}

async function infoKaryawan() {
  const nik = String(values.nik || "").trim();
  if (!nik) return;
  try {
    const { data } = await api.get("/transaksi/mutasi/karyawan-info", { params: { nik } });
    const d = data.data || {};
    Object.assign(lama, {
      nama: d.nama || "", pabrik: d.pabrik || "", jab_kode: d.jab_kode || "",
      jabatan: d.jabatan || "", bagian: d.bagian || "",
    });
  } catch {
    Object.assign(lama, { nama: "", pabrik: "", jab_kode: "", jabatan: "", bagian: "" });
  }
}

function bukaCari(mode: "nik" | "bagian") {
  cariMode.value = mode;
  kataCari.value = mode === "nik" ? String(values.nik || "") : String(values.bagian_baru || "");
  cariOpen.value = true;
  cari();
}

async function cari() {
  cariLoading.value = true;
  try {
    if (cariMode.value === "nik") {
      const { data } = await api.get("/transaksi/mutasi/karyawan", {
        params: { search: kataCari.value, per_page: 25 },
      });
      hasilCari.value = data.data || [];
    } else {
      const { data } = await api.get("/transaksi/mutasi/bagian", { params: { search: kataCari.value } });
      hasilCari.value = (data.data || []).map((b: string) => ({ Bagian: b }));
    }
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal mencari"));
  } finally {
    cariLoading.value = false;
  }
}

function pilih(row: Record<string, any>) {
  if (cariMode.value === "nik") {
    values.nik = String(row.Nik ?? "");
    lama.nama = row.Nama || "";
    lama.jabatan = row.Jabatan || "";
    lama.bagian = row.Bagian || "";
    lama.pabrik = row.Pabrik || "";
    infoKaryawan();
  } else {
    values.bagian_baru = String(row.Bagian ?? "");
  }
  cariOpen.value = false;
}

async function simpan(): Promise<string> {
  if (!values.tanggal) throw new Error("Tanggal wajib diisi");
  if (!values.nik) throw new Error("NIK wajib diisi");
  if (!values.pabrik_baru) throw new Error("Pabrik baru wajib dipilih");
  if (!values.jabatan_baru) throw new Error("Jabatan baru wajib dipilih");
  if (!values.bagian_baru) throw new Error("Bagian baru wajib diisi");
  if (!values.departemen) throw new Error("Departemen wajib dipilih");

  const body: Record<string, any> = {
    tanggal: String(values.tanggal).slice(0, 10),
    nik: String(values.nik).trim(),
    pabrik_baru: values.pabrik_baru,
    jabatan_baru: values.jabatan_baru,
    bagian_baru: values.bagian_baru,
    departemen: values.departemen,
    alasan: values.alasan,
    menimbang: values.menimbang || "",
    mengingat: values.mengingat || "",
    lapor: values.lapor || "",
  };
  if (isEdit.value) body.nomor = nomorEdit.value;
  const { data } = isEdit.value
    ? await api.put("/transaksi/mutasi", body)
    : await api.post("/transaksi/mutasi", body);
  return `${data.message} — data lama ${lama.pabrik}/${lama.jabatan}/${lama.bagian} → baru ${values.pabrik_baru}/${values.jabatan_baru}/${values.bagian_baru}`;
}

onMounted(async () => {
  await muatLookup();
  await muatEdit();
  if (!isEdit.value) await muatNomor();
});
</script>

<template>
  <BaseForm
    :title="isEdit ? `Ubah Mutasi ${nomorEdit}` : 'Tambah Mutasi Karyawan'"
    subtitle="Nomor NNN/HRD-KP/MM/YY dibuat otomatis per tahun berjalan"
    icon="swap_vert"
    :crumbs="[{ label: 'Mutasi Karyawan', path: '/transaksi/mutasi' }, { label: isEdit ? 'Ubah' : 'Tambah' }]"
    :save-fn="simpan"
    return-path="/transaksi/mutasi"
    save-label="Simpan Mutasi"
  >
    <template #form-content>
      <div v-if="memuat" class="loading">Memuat data...</div>
      <template v-else>
        <fieldset class="fs">
          <legend>Data Karyawan (Lama)</legend>
          <div class="grid">
            <FText v-model="values.nomor" label="Nomor" disabled placeholder="Otomatis" />
            <FDate v-model="values.tanggal" label="Tanggal" required />
            <FText v-model="values.nik" label="NIK" required placeholder="Ketik NIK / Cari" />
            <div class="cari-btn"><button class="btn-mini" type="button" @click="bukaCari('nik')">Cari karyawan</button></div>
            <FText :model-value="lama.nama" label="Nama" disabled @update:model-value="() => {}" />
            <FText :model-value="lama.pabrik" label="Pabrik Lama" disabled @update:model-value="() => {}" />
            <FText :model-value="`${lama.jab_kode} - ${lama.jabatan}`" label="Jabatan Lama" disabled @update:model-value="() => {}" />
            <FText :model-value="lama.bagian" label="Bagian Lama" disabled @update:model-value="() => {}" />
            <FText v-model="values.menimbang" label="Menimbang" placeholder="Kebutuhan organisasi..." />
            <FText v-model="values.mengingat" label="Mengingat" placeholder="Instruksi atasan..." />
            <FText v-model="values.lapor" label="Melapor Kepada" placeholder="Manager ..." />
          </div>
        </fieldset>

        <fieldset class="fs">
          <legend>Tujuan Mutasi (Baru)</legend>
          <div class="grid">
            <FSelect v-model="values.pabrik_baru" label="Pabrik Baru" required :options="pabrikOptions" />
            <FSelect v-model="values.jabatan_baru" label="Jabatan Baru" required :options="jabatanOptions" />
            <FText v-model="values.bagian_baru" label="Bagian Baru" required placeholder="Pilih via Cari" />
            <div class="cari-btn"><button class="btn-mini" type="button" @click="bukaCari('bagian')">Cari bagian</button></div>
            <FSelect v-model="values.departemen" label="Departemen" required :options="departemenOptions" />
            <FSelect
              v-model="values.alasan"
              label="Keterangan"
              :options="['Mutasi', 'Demosi', 'Promosi', 'Rotasi'].map((a) => ({ label: a, value: a }))"
            />
          </div>
        </fieldset>
      </template>
    </template>
  </BaseForm>

  <v-dialog v-model="cariOpen" max-width="760" scrollable>
    <v-card rounded="false">
      <v-card-title class="dlg-head">
        <span>{{ cariMode === "nik" ? "Cari Karyawan" : "Cari Bagian" }}</span>
        <v-btn icon="close" size="small" variant="text" @click="cariOpen = false" />
      </v-card-title>
      <v-card-text class="dlg-body">
        <div class="cari-bar">
          <input v-model="kataCari" placeholder="Kata kunci..." @keyup.enter="cari" />
          <button class="btn-mini primary" type="button" :disabled="cariLoading" @click="cari">
            {{ cariLoading ? "Mencari..." : "Cari" }}
          </button>
        </div>
        <table v-if="cariMode === 'nik'" class="mini">
          <thead><tr><th>NIK</th><th>Nama</th><th>Jabatan</th><th>Bagian</th><th>Pabrik</th><th>Status</th></tr></thead>
          <tbody>
            <tr v-for="(r, i) in hasilCari" :key="i" class="klik" @click="pilih(r)">
              <td>{{ r.Nik }}</td><td>{{ r.Nama }}</td><td>{{ r.Jabatan }}</td>
              <td>{{ r.Bagian }}</td><td>{{ r.Pabrik }}</td><td>{{ r.Status }}</td>
            </tr>
            <tr v-if="!hasilCari.length"><td colspan="6" class="empty">Tidak ditemukan</td></tr>
          </tbody>
        </table>
        <table v-else class="mini">
          <thead><tr><th>Bagian</th></tr></thead>
          <tbody>
            <tr v-for="(r, i) in hasilCari" :key="i" class="klik" @click="pilih(r)"><td>{{ r.Bagian }}</td></tr>
            <tr v-if="!hasilCari.length"><td class="empty">Tidak ditemukan</td></tr>
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
