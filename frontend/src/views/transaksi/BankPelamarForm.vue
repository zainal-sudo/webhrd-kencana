<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
import MsIcon from "@/components/MsIcon.vue";
import FText from "@/components/fields/FText.vue";
import FDate from "@/components/fields/FDate.vue";
import FSelect from "@/components/fields/FSelect.vue";
import DateInput from "@/components/fields/DateInput.vue";
import { api as sourceApi, getErrorMessage } from "@/api/axios";
import { useTransactionReset } from "@/composables/useTransactionReset";
import { todaySql } from "@/utils/format";

/**
 * Form Bank Pelamar — padanan `ufrmRekruitmen` (menu Bank Pelamar).
 *
 * Nomor NNN/HRD/REKRUIT/MM/yy otomatis per tahun. Status tersimpan sebagai
 * index combo 0–8. Grid pengalaman + nilai tes (dari master alat tes aktif)
 * ditimpa ulang setiap simpan seperti Delphi.
 */
const route = useRoute();
const toast = useToast();

const nomorEdit = computed(() => String(route.query.id ?? ""));
const isEdit = computed(() => !!nomorEdit.value);

const STATUS = [
  "Belum diputuskan", "Diterima", "Ditolak", "Dipanggil Tidak Datang",
  "Pelatihan", "Diterima Tapi Tidak Datang", "Tes Psikotes/skill",
  "Interview User", "Interview HRD",
];
const KAWIN = ["Belum Menikah", "Sudah Menikah", "Cerai", "Janda/Duda"];
const WN = ["WNI", "WNA"];
const AGAMA = ["Islam", "Kristen", "Katolik", "Hindu", "Budha"];
const GOLDAR = ["A", "AB", "B", "O"];
const TINGGAL = ["Milik Pribadi", "Ikut Orang Tua", "Ikut Saudara", "Kontrak"];
const JENKEL = [
  { label: "Laki-laki", value: 1 },
  { label: "Perempuan", value: 0 },
];
const opts = (arr: string[]) => arr.map((a) => ({ label: a, value: a }));

const values = reactive<Record<string, any>>({
  nomor: "", tanggal: todaySql(), nama: "", jenkel: 1,
  alamat: "", telp: "", identitas: "", tempat_lahir: "", tgl_lahir: "",
  ibu_kandung: "", email: "", status: 0, posisi: "",
  status_kawin: "Belum Menikah", warganegara: "WNI", gol_darah: "A",
  agama: "Islam", keterangan: "", pendidikan: "", jurusan: "",
  size: "", status_tinggal: "Milik Pribadi",
});
const pengalaman = ref<Record<string, any>[]>([barisPengalaman()]);
const tes = ref<Record<string, any>[]>([]);
const memuat = ref(false);

function barisPengalaman() {
  return { namaperusahaan: "", bidangusaha: "", kota: "", tglmasuk: "", tglkeluar: "", jabatanterakhir: "" };
}

const resetState = useTransactionReset({ values, pengalaman, tes }, {
  isEdit: () => isEdit.value,
  blocked: () => memuat.value,
  afterRestore: () => {},
});
const api = resetState.trackApi(sourceApi);

async function muatNomor() {
  if (resetState.restoring.value || isEdit.value) return;
  try {
    const { data } = await api.get("/transaksi/bank-pelamar/nomor", { params: { tanggal: values.tanggal } });
    values.nomor = data.data?.nomor || "";
  } catch { /* abaikan */ }
}

async function muatTesMaster(hasil: Record<number, string> = {}) {
  try {
    const { data } = await api.get("/transaksi/bank-pelamar/alat-tes");
    tes.value = (data.data || []).map((t: any) => ({ id: t.id, nama: t.Nama, hasil: hasil[t.id] ?? "" }));
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat alat tes"));
  }
}

async function muatEdit() {
  if (!isEdit.value) return;
  memuat.value = true;
  try {
    const { data } = await api.get("/transaksi/bank-pelamar/form", { params: { nomor: nomorEdit.value } });
    const d = data.data;
    Object.assign(values, {
      nomor: d.nomor, tanggal: String(d.tanggal || "").slice(0, 10), nama: d.nama || "",
      jenkel: d.jenkel ?? 1, alamat: d.alamat || "", telp: d.telp || "",
      identitas: d.identitas || "", tempat_lahir: d.tempat_lahir || "",
      tgl_lahir: d.tgl_lahir ? String(d.tgl_lahir).slice(0, 10) : "",
      ibu_kandung: d.ibu_kandung || "", email: d.email || "", status: d.status ?? 0,
      posisi: d.posisi || "", status_kawin: d.status_kawin || "", warganegara: d.warganegara || "",
      gol_darah: d.gol_darah || "", agama: d.agama || "", keterangan: d.keterangan || "",
      pendidikan: d.pendidikan || "", jurusan: d.jurusan || "", size: d.size || "",
      status_tinggal: d.status_tinggal || "",
    });
    pengalaman.value = (d.pengalaman?.length ? d.pengalaman : [barisPengalaman()]).map((p: any) => ({
      namaperusahaan: p.namaperusahaan || "", bidangusaha: p.bidangusaha || "",
      kota: p.kota || "", tglmasuk: p.tglmasuk ? String(p.tglmasuk).slice(0, 10) : "",
      tglkeluar: p.tglkeluar ? String(p.tglkeluar).slice(0, 10) : "",
      jabatanterakhir: p.jabatanterakhir || "",
    }));
    const hasil: Record<number, string> = {};
    for (const t of d.tes || []) hasil[t.id] = t.hasil || "";
    await muatTesMaster(hasil);
    resetState.capture();
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat data"));
  } finally {
    memuat.value = false;
  }
}

function tambahPengalaman() {
  pengalaman.value.push(barisPengalaman());
}
function hapusPengalaman(i: number) {
  if (pengalaman.value.length <= 1) {
    pengalaman.value[0] = barisPengalaman();
    return;
  }
  pengalaman.value.splice(i, 1);
}

async function simpan(): Promise<string> {
  if (!values.nama) throw new Error("Nama pelamar wajib diisi");
  const body: Record<string, any> = {
    ...values,
    tanggal: String(values.tanggal).slice(0, 10),
    pengalaman: pengalaman.value,
    tes: tes.value,
  };
  if (isEdit.value) body.nomor = nomorEdit.value;
  const { data } = isEdit.value
    ? await api.put("/transaksi/bank-pelamar", body)
    : await api.post("/transaksi/bank-pelamar", body);
  return data.message;
}

onMounted(async () => {
  await muatEdit();
  if (!isEdit.value) {
    await muatNomor();
    await muatTesMaster();
  }
  await resetState.initialize();
});
</script>

<template>
  <BaseForm
    :title="isEdit ? `Ubah Pelamar ${nomorEdit}` : 'Tambah Bank Pelamar'"
    subtitle="Nomor NNN/HRD/REKRUIT/MM/yy dibuat otomatis per tahun"
    icon="contact_page"
    :crumbs="[{ label: 'Bank Pelamar', path: '/transaksi/bank-pelamar' }, { label: isEdit ? 'Ubah' : 'Tambah' }]"
    :save-fn="simpan"
    :reset-fn="resetState.reset"
    :reset-disabled="resetState.disabled.value"
    return-path="/transaksi/bank-pelamar"
    new-form-path="/transaksi/bank-pelamar/form" transaction-module="frmRekruitmen"
    save-label="Simpan Pelamar"
  >
    <template #form-content>
      <div v-if="memuat" class="loading">Memuat data...</div>
      <template v-else>
        <fieldset class="fs">
          <legend>Data Pribadi</legend>
          <div class="grid">
            <FText v-model="values.nomor" label="Nomor" disabled placeholder="Otomatis" />
            <FDate v-model="values.tanggal" label="Tanggal" required />
            <FText v-model="values.nama" label="Nama" required placeholder="Nama lengkap pelamar" />
            <FSelect v-model="values.jenkel" label="Jenis Kelamin" :options="JENKEL" />
            <FText v-model="values.tempat_lahir" label="Tempat Lahir" />
            <FDate v-model="values.tgl_lahir" label="Tgl Lahir" />
            <FText v-model="values.alamat" label="Alamat" />
            <FText v-model="values.telp" label="Telp" />
            <FText v-model="values.identitas" label="Identitas" placeholder="KTP / SIM..." />
            <FText v-model="values.email" label="Email" />
            <FText v-model="values.ibu_kandung" label="Ibu Kandung" />
            <FText v-model="values.posisi" label="Posisi Dilamar" />
            <FSelect v-model="values.status" label="Status" :options="STATUS.map((s, i) => ({ label: s, value: i }))" />
            <FText v-model="values.keterangan" label="Keterangan" />
          </div>
        </fieldset>

        <fieldset class="fs">
          <legend>Data Lainnya</legend>
          <div class="grid">
            <FSelect v-model="values.status_kawin" label="Status Kawin" :options="opts(KAWIN)" />
            <FSelect v-model="values.warganegara" label="Warga Negara" :options="opts(WN)" />
            <FSelect v-model="values.agama" label="Agama" :options="opts(AGAMA)" />
            <FSelect v-model="values.gol_darah" label="Gol. Darah" :options="opts(GOLDAR)" />
            <FSelect v-model="values.status_tinggal" label="Status Tinggal" :options="opts(TINGGAL)" />
            <FText v-model="values.pendidikan" label="Pendidikan Terakhir" />
            <FText v-model="values.jurusan" label="Jurusan" />
            <FText v-model="values.size" label="Size Kaos" />
          </div>
        </fieldset>

        <fieldset class="fs">
          <legend>Pengalaman Kerja</legend>
          <div class="table-wrap">
            <table class="mini">
              <thead><tr><th>Perusahaan</th><th>Bidang Usaha</th><th>Kota</th><th>Tgl Masuk</th><th>Tgl Keluar</th><th>Jabatan Terakhir</th><th></th></tr></thead>
              <tbody>
                <tr v-for="(p, i) in pengalaman" :key="i">
                  <td><input v-model="p.namaperusahaan" aria-label="Nama perusahaan" /></td>
                  <td><input v-model="p.bidangusaha" aria-label="Bidang usaha" /></td>
                  <td><input v-model="p.kota" aria-label="Kota" /></td>
                  <td><DateInput v-model="p.tglmasuk" aria-label="Tanggal masuk" /></td>
                  <td><DateInput v-model="p.tglkeluar" aria-label="Tanggal keluar" /></td>
                  <td><input v-model="p.jabatanterakhir" aria-label="Jabatan terakhir" /></td>
                  <td class="aksi"><button class="row-btn" type="button" title="Hapus baris" @click="hapusPengalaman(i)"><MsIcon name="delete" :size="14" /></button></td>
                </tr>
              </tbody>
            </table>
          </div>
          <button class="btn-mini" type="button" @click="tambahPengalaman"><MsIcon name="add" :size="14" /> Tambah baris</button>
        </fieldset>

        <fieldset class="fs">
          <legend>Nilai Tes</legend>
          <div class="table-wrap">
            <table class="mini">
              <thead><tr><th style="width:60px">ID</th><th>Alat Tes</th><th>Hasil</th></tr></thead>
              <tbody>
                <tr v-for="t in tes" :key="t.id">
                  <td>{{ t.id }}</td>
                  <td>{{ t.nama }}</td>
                  <td><input v-model="t.hasil" :aria-label="`Hasil ${t.nama}`" placeholder="Hasil tes..." /></td>
                </tr>
                <tr v-if="!tes.length"><td colspan="3" class="empty">Belum ada alat tes aktif</td></tr>
              </tbody>
            </table>
          </div>
        </fieldset>
      </template>
    </template>
  </BaseForm>
</template>

<style scoped>
.fs { border: 1px solid var(--ds-border, #b0b8c4); border-radius: 12px; background: #fff; padding: 10px 12px 14px; margin-bottom: 12px; }
.fs > legend { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; color: var(--ds-primary, #3b5998); padding: 0 6px; }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 14px; }
.loading { padding: 24px; text-align: center; font-size: 12px; color: #6b7a90; }
.table-wrap { overflow: auto; margin-bottom: 8px; }
table.mini { width: 100%; border-collapse: collapse; font-size: 11px; }
table.mini th { background: var(--ds-surface-variant, #e0e4ea); border: 1px solid var(--ds-border, #b0b8c4); padding: 5px 7px; text-align: left; font-weight: 800; white-space: nowrap; }
table.mini td { border: 1px solid #d5dbe3; padding: 3px 5px; }
table.mini td input { width: 100%; min-width: 90px; border: none; outline: none; font: inherit; background: transparent; }
table.mini td input:focus { background: #eef4fc; }
table.mini .empty { text-align: center; color: #8995a6; padding: 10px; }
table.mini td.aksi { width: 34px; text-align: center; }
.row-btn { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: none; border-radius: 6px; background: transparent; color: #dc2626; cursor: pointer; }
.row-btn:hover { background: rgba(220, 38, 38, 0.12); }
.btn-mini { display: inline-flex; align-items: center; gap: 6px; min-height: 28px; padding: 0 10px; border: 1px solid var(--ds-border, #b0b8c4); border-radius: 8px; background: #fff; font-family: "Plus Jakarta Sans", sans-serif; font-size: 11px; font-weight: 700; cursor: pointer; color: var(--ds-on-surface, #1b2d4a); }
.btn-mini:hover { background: var(--ds-surface, #f0f3f8); }
@media (max-width: 680px) { .grid { grid-template-columns: 1fr; } }
</style>
