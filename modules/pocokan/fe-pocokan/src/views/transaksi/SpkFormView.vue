<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import BaseForm from "@/components/BaseForm.vue";
import SearchModal from "@/components/SearchModal.vue";
import { IconClipboardList, IconSearch, IconInfoCircle, IconProgress } from "@tabler/icons-vue";
import { spkFormApi, type SpkForm } from "@/api/transaksi/spkFormApi";
import { spkDetailApi, type SpkDetail, type SpkKategoriProses } from "@/api/transaksi/spkDetailApi";

const route = useRoute();
const router = useRouter();
const toast = useToast();

const MENU_ID = "60";
const isEdit = computed(() => !!route.params.nomor);
const isLoading = ref(false);
const isSaving = ref(false);
const isSavingNew = ref(false);

const showSaveDialog = ref(false);
const showCancelDialog = ref(false);
const showCloseDialog = ref(false);
const saveMode = ref<"normal" | "new">("normal");

// Tab aktif: Informasi & Barang / Realisasi Produksi
const activeTab = ref<"info" | "realisasi">("info");

const today = new Date().toISOString().slice(0, 10);

const emptyForm = (): SpkForm => ({
  isEdit: false,
  nomor: "",
  nama: "",
  brgKode: "",
  brgNama: "",
  satuan: "",
  custKode: "",
  custNama: "",
  tanggal: today,
  dateline: today,
  jumlah: 0,
  jumlahJadi: 0,
  jumlahKirim: 0,
  keterangan: "",
  harga: 0,
  idBatch: "",
  kategoriProses: "",
});

const form = ref<SpkForm>(emptyForm());

const barangOptions = ref<any[]>([]);
const customerOptions = ref<any[]>([]);
const barangLoading = ref(false);
const customerLoading = ref(false);

const showBarangModal = ref(false);
const showCustomerModal = ref(false);

const kategoriList = ref<SpkKategoriProses[]>([]);

const detailList = ref<SpkDetail[]>([]);
const detailLoading = ref(false);
const detailSavingId = ref<number | null>(null);

const loadKategoriList = async () => {
  try {
    kategoriList.value = await spkDetailApi.getKategoriList();
  } catch (e) {
    console.error("Gagal memuat daftar kategori proses:", e);
  }
};

const loadDetail = async () => {
  if (!isEdit.value || !form.value.nomor) return;
  detailLoading.value = true;
  try {
    detailList.value = await spkDetailApi.getBySpk(form.value.nomor);
  } catch (e) {
    console.error("Gagal memuat tahapan proses:", e);
  } finally {
    detailLoading.value = false;
  }
};

const saveDetailStage = async (stage: SpkDetail) => {
  detailSavingId.value = stage.id;
  try {
    if (stage.selesai >= stage.target && stage.target > 0) stage.status = "Selesai";
    else if (stage.selesai > 0) stage.status = "Proses";
    else stage.status = "Belum Mulai";
    await spkDetailApi.update(stage.id, stage);
    toast.success(`Tahap "${stage.nama}" tersimpan.`);
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal menyimpan tahap.");
  } finally {
    detailSavingId.value = null;
  }
};

const loadSearchOptions = async () => {
  barangLoading.value = true;
  customerLoading.value = true;
  try {
    const [resBarang, resCustomer] = await Promise.all([
      spkFormApi.getBarang(""),
      spkFormApi.getCustomer(""),
    ]);
    barangOptions.value = resBarang || [];
    customerOptions.value = resCustomer || [];
  } catch (e) {
    console.error("Gagal memuat opsi pencarian:", e);
  } finally {
    barangLoading.value = false;
    customerLoading.value = false;
  }
};

const searchBarang = async (query: string) => {
  barangLoading.value = true;
  try {
    barangOptions.value = await spkFormApi.getBarang(query || "");
  } catch {
    /* silent */
  } finally {
    barangLoading.value = false;
  }
};

const searchCustomer = async (query: string) => {
  customerLoading.value = true;
  try {
    customerOptions.value = await spkFormApi.getCustomer(query || "");
  } catch {
    /* silent */
  } finally {
    customerLoading.value = false;
  }
};

const selectBarang = async (brg: any) => {
  if (!brg) return;
  form.value.brgKode = brg.kode ?? brg.Kode ?? "";
  form.value.brgNama = brg.nama ?? brg.Nama ?? "";
  form.value.satuan = brg.satuan ?? brg.Satuan ?? "";
  showBarangModal.value = false;

  // Auto-suggest Kategori Proses berdasarkan kategori barang asli (brg_ktg_kode).
  // Kalau ketemu -> otomatis terisi (user masih bisa ganti manual sebelum save).
  // Kalau tidak ketemu -> dropdown dikosongkan, user wajib pilih sendiri.
  try {
    const res = await spkDetailApi.getProsesByBarang(String(form.value.brgKode));
    if (res?.ktgKode) {
      form.value.kategoriProses = res.ktgKode;
    } else {
      form.value.kategoriProses = "";
      toast.info("Kategori proses belum terdaftar untuk barang ini, silakan pilih manual.");
    }
  } catch (e) {
    console.error("Gagal mengambil saran kategori proses:", e);
  }
};

const selectCustomer = (cus: any) => {
  if (!cus) return;
  form.value.custKode = cus.kode ?? cus.Kode ?? "";
  form.value.custNama = cus.nama ?? cus.Nama ?? "";
  showCustomerModal.value = false;
};

const clearCustomer = () => {
  form.value.custKode = "";
  form.value.custNama = "";
};

const loadData = async () => {
  const nomor = route.params.nomor as string;
  if (!nomor) {
    form.value.isEdit = false;
    return;
  }
  isLoading.value = true;
  try {
    form.value.isEdit = true;
    const res = await spkFormApi.getDetailForm(decodeURIComponent(nomor));
    Object.assign(form.value, res);
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal mengambil data SPK.");
    router.push({ name: "spkBrowse" });
  } finally {
    isLoading.value = false;
  }
};

const resetForm = () => {
  form.value = emptyForm();
  detailList.value = [];
  activeTab.value = "info";
  router.replace({ name: "spkCreate" }).catch(() => {});
};

const validateSave = (): boolean => {
  if (!form.value.nama) {
    toast.warning("Nama SPK harus diisi.");
    activeTab.value = "info";
    return false;
  }
  if (!form.value.brgKode) {
    toast.warning("Barang harus dipilih.");
    activeTab.value = "info";
    return false;
  }
  if (!form.value.kategoriProses) {
    toast.warning("Kategori Proses harus dipilih.");
    activeTab.value = "info";
    return false;
  }
  if ((form.value.jumlah || 0) <= 0) {
    toast.warning("Target Produksi harus lebih dari 0.");
    activeTab.value = "info";
    return false;
  }
  if ((form.value.jumlahJadi || 0) > (form.value.jumlah || 0)) {
    toast.warning("Jumlah Jadi tidak boleh melebihi Target Produksi.");
    activeTab.value = "realisasi";
    return false;
  }
  if ((form.value.jumlahKirim || 0) > (form.value.jumlahJadi || 0)) {
    toast.warning("Jumlah Kirim tidak boleh melebihi Jumlah Jadi.");
    activeTab.value = "realisasi";
    return false;
  }
  return true;
};

const onValidateSave = () => {
  if (!validateSave()) return;
  saveMode.value = "normal";
  showSaveDialog.value = true;
};

const onValidateSaveAndNew = () => {
  if (!validateSave()) return;
  saveMode.value = "new";
  showSaveDialog.value = true;
};

const confirmSave = async () => {
  if (isSaving.value || isSavingNew.value) return; // guard: cegah double-submit (spam klik)
  const isNewMode = saveMode.value === "new";
  isNewMode ? (isSavingNew.value = true) : (isSaving.value = true);
  try {
    const res = await spkFormApi.save(form.value);
    toast.success("SPK berhasil disimpan.");
    showSaveDialog.value = false;
    if (isNewMode) {
      resetForm();
      toast.info(`SPK ${res?.nomor || ""} tersimpan. Form siap untuk entri baru.`);
    } else {
      router.push({ name: "spkBrowse" });
    }
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal menyimpan SPK.");
  } finally {
    isSaving.value = false;
    isSavingNew.value = false;
  }
};

const confirmCancel = () => {
  showCancelDialog.value = false;
  router.push({ name: "spkBrowse" });
};

const confirmClose = () => {
  showCloseDialog.value = false;
  router.push({ name: "spkBrowse" });
};

onMounted(async () => {
  await loadData();
  await loadDetail();
  loadSearchOptions();
  loadKategoriList();
});

const fmt = (v: number) => new Intl.NumberFormat("id-ID").format(v || 0);

const progressPct = computed(() => {
  const target = Number(form.value.jumlah) || 0;
  if (!target) return 0;
  return Math.min(100, Math.round(((Number(form.value.jumlahJadi) || 0) / target) * 100));
});
const kirimPct = computed(() => {
  const jadi = Number(form.value.jumlahJadi) || 0;
  if (!jadi) return 0;
  return Math.min(100, Math.round(((Number(form.value.jumlahKirim) || 0) / jadi) * 100));
});
const sisaBelumJadi = computed(() =>
  Math.max(0, (Number(form.value.jumlah) || 0) - (Number(form.value.jumlahJadi) || 0)),
);
const sisaBelumKirim = computed(() =>
  Math.max(0, (Number(form.value.jumlahJadi) || 0) - (Number(form.value.jumlahKirim) || 0)),
);
</script>

<template>
  <BaseForm
    :title="isEdit ? 'Ubah Surat Perintah Kerja (SPK)' : 'Tambah Surat Perintah Kerja Baru'"
    :icon="IconClipboardList"
    :menu-id="MENU_ID"
    :is-loading="isLoading"
    :is-saving="isSaving"
    :is-edit-mode="isEdit"
    v-model:show-save-dialog="showSaveDialog"
    v-model:show-cancel-dialog="showCancelDialog"
    v-model:show-close-dialog="showCloseDialog"
    @validate-save="onValidateSave"
    @confirm-save="confirmSave"
    @confirm-cancel="confirmCancel"
    @confirm-close="confirmClose"
  >
    <template #extra-actions v-if="!isEdit">
      <v-btn size="small" variant="outlined" color="primary" :loading="isSavingNew" @click="onValidateSaveAndNew">
        Simpan &amp; Baru
      </v-btn>
    </template>

    <div class="tab-nav">
      <button type="button" class="tab-btn" :class="{ active: activeTab === 'info' }" @click="activeTab = 'info'">
        <IconInfoCircle :size="14" /> Informasi &amp; Barang
      </button>
      <button type="button" class="tab-btn" :class="{ active: activeTab === 'realisasi' }" @click="activeTab = 'realisasi'">
        <IconProgress :size="14" /> Realisasi Produksi
      </button>
    </div>

    <div v-show="activeTab === 'info'" class="tab-panel">
      <div class="form-header-grid">
        <div class="header-fields">
          <div class="grid-fields-container">
            <div class="f-row">
              <label class="f-lbl">No. SPK</label>
              <input type="text" v-model="form.nomor" class="f-inp-native readonly-bg" placeholder="[ OTOMATIS ]" readonly />
            </div>

            <div class="f-row">
              <label class="f-lbl">ID Batch</label>
              <input type="text" v-model="form.idBatch" class="f-inp-native" placeholder="ID Batch produksi..." />
            </div>

            <div class="f-row align-start" style="grid-column: 1 / -1">
              <label class="f-lbl mt-1">Nama SPK</label>
              <input type="text" v-model="form.nama" class="f-inp-native" placeholder="Masukkan nama/deskripsi SPK" />
            </div>

            <div class="f-row">
              <label class="f-lbl">Barang</label>
              <div class="search-group" @click="showBarangModal = true">
                <input type="text" :value="form.brgKode" class="f-inp-native w-30 readonly-bg" readonly placeholder="Kode" />
                <input type="text" :value="form.brgNama" class="f-inp-native w-70 readonly-bg" readonly placeholder="Pilih Barang..." />
                <button class="btn-search" type="button" @click.stop="showBarangModal = true">
                  <IconSearch :size="14" />
                </button>
              </div>
            </div>

            <div class="f-row">
              <label class="f-lbl">Kategori Proses</label>
              <select v-model="form.kategoriProses" class="f-inp-native" :disabled="isEdit">
                <option value="" disabled>-- Pilih Kategori --</option>
                <option v-for="k in kategoriList" :key="k.kode" :value="k.kode">
                  {{ k.nama || k.kode }} ({{ k.kode }})
                </option>
              </select>
              <!-- Terisi otomatis saat Barang dipilih (lihat selectBarang), tetap bisa diubah manual. -->
            </div>

            <div class="f-row">
              <label class="f-lbl">Customer</label>
              <div class="search-group" @click="showCustomerModal = true">
                <input type="text" :value="form.custKode" class="f-inp-native w-30 readonly-bg" readonly placeholder="Kode" />
                <input type="text" :value="form.custNama" class="f-inp-native w-70 readonly-bg" readonly placeholder="(Opsional)" />
                <button class="btn-search" type="button" @click.stop="showCustomerModal = true">
                  <IconSearch :size="14" />
                </button>
                <button v-if="form.custKode" class="btn-search" style="background:#9ca3af" type="button" @click.stop="clearCustomer">
                  ✕
                </button>
              </div>
            </div>

            <div class="f-row">
              <label class="f-lbl">Tanggal SPK</label>
              <input type="date" v-model="form.tanggal" class="f-inp-native" />
            </div>

            <div class="f-row">
              <label class="f-lbl">DateLine</label>
              <input type="date" v-model="form.dateline" class="f-inp-native" />
            </div>

            <div class="f-row">
              <label class="f-lbl">Target Produksi</label>
              <div class="search-group">
                <input type="number" v-model.number="form.jumlah" class="f-inp-native" min="0" />
                <span class="unit-badge">{{ form.satuan || "Unit" }}</span>
              </div>
            </div>

            <div class="f-row">
              <label class="f-lbl">Harga</label>
              <input type="number" v-model.number="form.harga" class="f-inp-native" min="0" />
            </div>
          </div>

          <div class="f-row align-start mt-1">
            <label class="f-lbl mt-1">Keterangan</label>
            <textarea v-model="form.keterangan" class="f-txa-native" rows="3" placeholder="Instruksi atau keterangan khusus untuk produksi..."></textarea>
          </div>
        </div>

        <div class="header-summary">
          <div class="summary-box">
            <div class="summary-lbl">TARGET PRODUKSI</div>
            <div class="summary-val">{{ fmt(form.jumlah) }} <span class="summary-unit">{{ form.satuan || "" }}</span></div>
          </div>
          <div class="summary-sub-rows">
            <div class="sub-total-item">
              <span>Realisasi Jadi :</span>
              <span class="font-weight-bold">{{ fmt(form.jumlahJadi) }} ({{ progressPct }}%)</span>
            </div>
            <div class="sub-total-item">
              <span>Sudah Dikirim :</span>
              <span class="font-weight-bold">{{ fmt(form.jumlahKirim) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-show="activeTab === 'realisasi'" class="tab-panel">
      <div v-if="!isEdit" class="real-note">
        <IconInfoCircle :size="14" style="flex-shrink:0; margin-top:1px" />
        <span>Tahapan proses akan muncul otomatis setelah SPK disimpan pertama kali.</span>
      </div>

      <div v-else>
        <div v-if="detailLoading" class="real-note">
          <IconInfoCircle :size="14" style="flex-shrink:0; margin-top:1px" />
          <span>Memuat tahapan proses...</span>
        </div>

        <div v-else-if="detailList.length === 0" class="real-note">
          <IconInfoCircle :size="14" style="flex-shrink:0; margin-top:1px" />
          <span>Belum ada tahapan proses untuk SPK ini. SPK ini dibuat sebelum kategori proses tersedia, atau kategorinya belum punya template tahapan.</span>
        </div>

        <div v-else style="display: flex; flex-direction: column; gap: 10px">
          <div v-for="stage in detailList" :key="stage.id" class="real-card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px">
              <span class="real-card-lbl">{{ stage.urutan }}. {{ stage.nama }}</span>
              <span :class="stage.status === 'Selesai' ? 'badge-open' : 'badge-closed'">
                {{ stage.status }}
              </span>
            </div>
            <div class="grid-fields-container">
              <div class="f-row">
                <label class="f-lbl">Target</label>
                <input type="text" :value="fmt(stage.target)" class="f-inp-native readonly-bg" readonly />
              </div>
              <div class="f-row">
                <label class="f-lbl">Realisasi</label>
                <input type="number" v-model.number="stage.selesai" class="f-inp-native" min="0" :max="stage.target" />
              </div>
              <div class="f-row">
                <label class="f-lbl">PIC / Tim</label>
                <input type="text" v-model="stage.pic" class="f-inp-native" placeholder="Nama tim/operator" />
              </div>
              <div class="f-row">
                <label class="f-lbl">Tgl Selesai</label>
                <input type="date" v-model="stage.tglSelesai" class="f-inp-native" />
              </div>
            </div>
            <div style="text-align: right; margin-top: 8px">
              <v-btn
                size="x-small"
                color="primary"
                variant="flat"
                :loading="detailSavingId === stage.id"
                @click="saveDetailStage(stage)"
              >
                Simpan Tahap
              </v-btn>
            </div>
          </div>
        </div>
      </div>
    </div>

    <SearchModal
      v-model="showBarangModal"
      title="Pilih Barang"
      :columns="[
        { key: 'kode', title: 'KODE BARANG', width: '120px' },
        { key: 'nama', title: 'NAMA BARANG' },
        { key: 'satuan', title: 'SATUAN', width: '80px', align: 'center' },
      ]"
      :items="barangOptions"
      :loading="barangLoading"
      :server-search="true"
      search-placeholder="Cari kode atau nama barang..."
      :search-keys="['kode', 'nama']"
      @select="selectBarang"
      @search="searchBarang"
    />

    <SearchModal
      v-model="showCustomerModal"
      title="Pilih Customer"
      :columns="[
        { key: 'kode', title: 'KODE', width: '100px' },
        { key: 'nama', title: 'NAMA CUSTOMER' },
      ]"
      :items="customerOptions"
      :loading="customerLoading"
      :server-search="true"
      search-placeholder="Cari kode atau nama customer..."
      :search-keys="['kode', 'nama']"
      @select="selectCustomer"
      @search="searchCustomer"
    />
  </BaseForm>
</template>

<style scoped>
.tab-nav { display: flex; gap: 20px; border-bottom: 1px solid #e5e7eb; margin-bottom: 16px; }
.tab-btn { display: flex; align-items: center; gap: 6px; background: none; border: none; border-bottom: 2px solid transparent; padding: 8px 2px 10px; font-size: 12px; font-weight: 600; color: #6b7280; cursor: pointer; transition: all 0.15s ease; }
.tab-btn:hover { color: #3B5998; }
.tab-btn.active { color: #3B5998; border-bottom-color: #3B5998; }
.tab-panel { animation: fadeInTab 0.15s ease-in; }
@keyframes fadeInTab { from { opacity: 0; } to { opacity: 1; } }

.form-header-grid { display: grid; grid-template-columns: 1fr 300px; gap: 20px; align-items: start; }
@media (max-width: 960px) { .form-header-grid { grid-template-columns: 1fr; gap: 12px; } }
.header-fields { display: flex; flex-direction: column; gap: 6px; }
.grid-fields-container { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
@media (max-width: 600px) { .grid-fields-container { grid-template-columns: 1fr; } }
.f-row { display: flex; align-items: center; }
.f-row.align-start { align-items: flex-start; }
.f-lbl { width: 110px; font-size: 11px; font-weight: 600; color: #4b5563; flex-shrink: 0; }
.f-inp-native, .f-txa-native { flex: 1; height: 28px; border: 1px solid #d1d5db; border-radius: 4px; padding: 0 8px; font-size: 11px; outline: none; }
.f-txa-native { height: auto; padding: 4px 8px; }
.f-inp-native:focus, .f-txa-native:focus { border-color: #3B5998; }
.readonly-bg { background-color: #f3f4f6; color: #6b7280; }
select.f-inp-native { background: #fff; cursor: pointer; }
select.f-inp-native:disabled { background-color: #f3f4f6; color: #6b7280; cursor: not-allowed; }
.search-group { display: flex; flex: 1; gap: 4px; cursor: pointer; align-items: center; }
.btn-search { height: 28px; width: 32px; background: #3B5998; color: white; border: none; border-radius: 4px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.unit-badge { font-size: 10px; font-weight: 700; color: #6b7280; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 4px; padding: 0 8px; height: 28px; display: flex; align-items: center; flex-shrink: 0; }
.w-30 { width: 30%; flex: none !important; }
.w-70 { width: 70%; }
.mt-1 { margin-top: 4px; }

.header-summary { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; }
.summary-box { background: #3B5998; color: white; padding: 10px; border-radius: 4px; text-align: right; }
.summary-lbl { font-size: 10px; font-weight: 600; opacity: 0.85; }
.summary-val { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; }
.summary-unit { font-size: 11px; font-weight: 600; opacity: 0.8; }
.summary-sub-rows { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; font-size: 11px; }
.sub-total-item { display: flex; justify-content: space-between; align-items: center; color: #4b5563; border-bottom: 1px dashed #e5e7eb; padding-bottom: 2px; }

.real-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; }
.real-card-lbl { font-size: 12px; font-weight: 700; color: #3B5998; text-transform: uppercase; }

.real-note { margin-top: 4px; display: flex; gap: 8px; background: #eff6ff; border: 1px solid #dbeafe; border-radius: 6px; padding: 10px 12px; font-size: 11px; color: #1e40af; line-height: 1.5; }
.real-note code { background: #dbeafe; padding: 1px 4px; border-radius: 3px; }

.badge-closed { background: #e0e0e0; color: #616161; padding: 1px 8px; border-radius: 10px; font-size: 10px; font-weight: 700; }
.badge-open { background: #e8e8f5; color: #3B5998; padding: 1px 8px; border-radius: 10px; font-size: 10px; font-weight: 700; }
</style>