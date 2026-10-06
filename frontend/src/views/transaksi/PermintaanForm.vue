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
 * Form Permintaan Karyawan — padanan `ufrmPermintaanKaryawan`.
 *
 * Nomor NNN/HRD/PKAR/MM/YYYY otomatis per tahun. Peminta (NIK + lookup),
 * jabatan, bagian (+lookup bagian unik), tanggal butuh, jumlah (wajib),
 * alasan combo + alasan lain, 10 keterangan + 10 spesifikasi (default
 * spesifikasi 1-4 seperti Delphi).
 */
const route = useRoute();
const toast = useToast();

const nomorEdit = computed(() => String(route.query.id ?? ""));
const isEdit = computed(() => !!nomorEdit.value);

const ALASAN = ["Penggantian", "Sudah Masuk Rencana MPP", "Diluar Rencana MPP", "Lain-lain"];

const values = reactive<Record<string, any>>({
  nomor: "",
  peminta: "",
  tanggal: todaySql(),
  jab_kode: "",
  bagian: "",
  tgl_butuh: todaySql(),
  jumlah: "",
  alasan: "Penggantian",
  alasan_lain: "",
  keterangan: Array(10).fill(""),
  spesifikasi: ["Laki-laki", "Usia 18-35 tahun", "Pendidikan Minimal SMA", "Diutamakan Pengalaman", "", "", "", "", "", ""],
});

const pemintaNama = ref("");
const jabatanOptions = ref<{ label: string; value: string | number }[]>([]);
const memuat = ref(false);

const cariOpen = ref(false);
const cariMode = ref<"peminta" | "bagian">("peminta");
const hasilCari = ref<any[]>([]);
const cariLoading = ref(false);
const kataCari = ref("");

async function muatLookup() {
  try {
    const { data } = await api.get("/master/lookup");
    const d = data.data || {};
    jabatanOptions.value = ((d.jabatan || []) as LookupItem[]).map((r) => ({
      label: `${r.Kode} - ${r.Nama}`,
      value: String(r.Kode),
    }));
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat opsi jabatan"));
  }
}

async function muatNomor() {
  if (isEdit.value) return;
  try {
    const { data } = await api.get("/transaksi/permintaan-karyawan/nomor", { params: { tanggal: values.tanggal } });
    values.nomor = data.data?.nomor || "";
  } catch {
    /* abaikan */
  }
}

async function muatEdit() {
  if (!isEdit.value) return;
  memuat.value = true;
  try {
    const { data } = await api.get("/transaksi/permintaan-karyawan/form", { params: { nomor: nomorEdit.value } });
    const d = data.data;
    Object.assign(values, {
      nomor: d.nomor, peminta: d.peminta, tanggal: String(d.tanggal).slice(0, 10),
      jab_kode: d.jab_kode, bagian: d.bagian, tgl_butuh: String(d.tgl_butuh || "").slice(0, 10),
      jumlah: String(d.jumlah ?? ""), alasan: d.alasan || "Penggantian", alasan_lain: d.alasan_lain || "",
      keterangan: [...(d.keterangan || []), ...Array(10).fill("")].slice(0, 10),
      spesifikasi: [...(d.spesifikasi || []), ...Array(10).fill("")].slice(0, 10),
    });
    pemintaNama.value = d.peminta_nama || "";
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat data"));
  } finally {
    memuat.value = false;
  }
}

function bukaCari(mode: "peminta" | "bagian") {
  cariMode.value = mode;
  kataCari.value = mode === "peminta" ? String(values.peminta || "") : String(values.bagian || "");
  cariOpen.value = true;
  cari();
}

async function cari() {
  cariLoading.value = true;
  try {
    if (cariMode.value === "peminta") {
      const { data } = await api.get("/transaksi/permintaan-karyawan/karyawan", {
        params: { search: kataCari.value, per_page: 25 },
      });
      hasilCari.value = data.data || [];
    } else {
      const { data } = await api.get("/transaksi/permintaan-karyawan/bagian", { params: { search: kataCari.value } });
      hasilCari.value = (data.data || []).map((b: string) => ({ Bagian: b }));
    }
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal mencari"));
  } finally {
    cariLoading.value = false;
  }
}

function pilih(row: Record<string, any>) {
  if (cariMode.value === "peminta") {
    values.peminta = String(row.Nik ?? "");
    pemintaNama.value = row.Nama || "";
  } else {
    values.bagian = String(row.Bagian ?? "");
  }
  cariOpen.value = false;
}

async function simpan(): Promise<string> {
  if (!values.peminta) throw new Error("Peminta (NIK) wajib diisi");
  if (!values.jumlah) throw new Error("Jumlah belum diisi");
  if (!values.jab_kode) throw new Error("Jabatan wajib dipilih");
  if (!values.bagian) throw new Error("Bagian wajib diisi");

  const body: Record<string, any> = {
    peminta: String(values.peminta).trim(),
    tanggal: String(values.tanggal).slice(0, 10),
    jab_kode: values.jab_kode,
    bagian: values.bagian,
    tgl_butuh: String(values.tgl_butuh).slice(0, 10),
    jumlah: parseInt(String(values.jumlah), 10),
    alasan: values.alasan || "",
    alasan_lain: values.alasan_lain || "",
    keterangan: values.keterangan,
    spesifikasi: values.spesifikasi,
  };
  if (isEdit.value) body.nomor = nomorEdit.value;
  const { data } = isEdit.value
    ? await api.put("/transaksi/permintaan-karyawan", body)
    : await api.post("/transaksi/permintaan-karyawan", body);
  return data.message;
}

onMounted(async () => {
  await muatLookup();
  await muatEdit();
  if (!isEdit.value) await muatNomor();
});
</script>

<template>
  <BaseForm
    :title="isEdit ? `Ubah Permintaan ${nomorEdit}` : 'Tambah Permintaan Karyawan'"
    subtitle="Nomor NNN/HRD/PKAR/MM/YYYY dibuat otomatis per tahun"
    icon="request_quote"
    :crumbs="[{ label: 'Permintaan Karyawan', path: '/transaksi/permintaan-karyawan' }, { label: isEdit ? 'Ubah' : 'Tambah' }]"
    :save-fn="simpan"
    return-path="/transaksi/permintaan-karyawan"
    save-label="Simpan Permintaan"
  >
    <template #form-content>
      <div v-if="memuat" class="loading">Memuat data...</div>
      <template v-else>
        <fieldset class="fs">
          <legend>Permintaan</legend>
          <div class="grid">
            <FText v-model="values.nomor" label="Nomor" disabled placeholder="Otomatis" />
            <FDate v-model="values.tanggal" label="Tanggal" required />
            <FText v-model="values.peminta" label="Peminta (NIK)" required placeholder="Ketik NIK / Cari" />
            <div class="cari-btn"><button class="btn-mini" type="button" @click="bukaCari('peminta')">Cari karyawan</button></div>
            <FText :model-value="pemintaNama" label="Nama Peminta" disabled @update:model-value="() => {}" />
            <FSelect v-model="values.jab_kode" label="Jabatan Diminta" required :options="jabatanOptions" />
            <FText v-model="values.bagian" label="Bagian" required placeholder="Pilih via Cari" />
            <div class="cari-btn"><button class="btn-mini" type="button" @click="bukaCari('bagian')">Cari bagian</button></div>
            <FDate v-model="values.tgl_butuh" label="Tanggal Dibutuhkan" required />
            <FText v-model="values.jumlah" label="Jumlah" required type="number" placeholder="0" />
            <FSelect
              v-model="values.alasan"
              label="Alasan"
              :options="ALASAN.map((a) => ({ label: a, value: a }))"
            />
            <FText v-model="values.alasan_lain" label="Alasan Lain" placeholder="Bila Lain-lain" />
          </div>
        </fieldset>

        <fieldset class="fs">
          <legend>Keterangan (10 baris)</legend>
          <div class="grid">
            <FText v-for="i in 10" :key="'k' + i" v-model="values.keterangan[i - 1]" :label="`Keterangan ${i}`" />
          </div>
        </fieldset>

        <fieldset class="fs">
          <legend>Spesifikasi (10 baris)</legend>
          <div class="grid">
            <FText v-for="i in 10" :key="'s' + i" v-model="values.spesifikasi[i - 1]" :label="`Spesifikasi ${i}`" />
          </div>
        </fieldset>
      </template>
    </template>
  </BaseForm>

  <v-dialog v-model="cariOpen" max-width="760" scrollable>
    <v-card rounded="false">
      <v-card-title class="dlg-head">
        <span>{{ cariMode === "peminta" ? "Cari Karyawan" : "Cari Bagian" }}</span>
        <v-btn icon="close" size="small" variant="text" @click="cariOpen = false" />
      </v-card-title>
      <v-card-text class="dlg-body">
        <div class="cari-bar">
          <input v-model="kataCari" placeholder="Kata kunci..." @keyup.enter="cari" />
          <button class="btn-mini primary" type="button" :disabled="cariLoading" @click="cari">
            {{ cariLoading ? "Mencari..." : "Cari" }}
          </button>
        </div>
        <table v-if="cariMode === 'peminta'" class="mini">
          <thead><tr><th>NIK</th><th>Nama</th><th>Jabatan</th><th>Bagian</th><th>Pabrik</th></tr></thead>
          <tbody>
            <tr v-for="(r, i) in hasilCari" :key="i" class="klik" @click="pilih(r)">
              <td>{{ r.Nik }}</td><td>{{ r.Nama }}</td><td>{{ r.Jabatan }}</td>
              <td>{{ r.Bagian }}</td><td>{{ r.Pabrik }}</td>
            </tr>
            <tr v-if="!hasilCari.length"><td colspan="5" class="empty">Tidak ditemukan</td></tr>
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
