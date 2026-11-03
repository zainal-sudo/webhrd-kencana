<script setup lang="ts">
import { ref, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { isAuthExpiredError } from "@/api/axios";
import BaseForm from "@/components/BaseForm.vue";
import { useForm } from "@/composables/useForm";
import { IconTruckDelivery, IconSearch } from "@tabler/icons-vue";
import {
  mutasiOutFormApi,
  type MutasiOutFormData,
  type MutasiOutFormDetail,
  type BarangGarmenItem,
} from "@/api/transaksi/mutasiOutFormApi";

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();
const toast = useToast();

const MENU_ID = "31";
const isEditMode = computed(() => !!route.params.nomor);

const formJenis = ref(
  typeof route.query.jenis === "string" ? route.query.jenis : "ACCESORIES"
);

const toLocalDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};
const todayLocal = toLocalDate(new Date());

// ── State modal & grid ────────────────────────────────────────────────
const showBarangModal = ref(false);
const showPermintaanModal = ref(false);
const activeGridIndex = ref(-1);
const barangItems = ref<BarangGarmenItem[]>([]);
const barangSearch = ref("");
const permintaanItems = ref<any[]>([]);
const permintaanSearch = ref("");
const isLoadingBarang = ref(false);
const isLoadingPermintaan = ref(false);
const deleteRowDialog = ref(false);
const pendingDeleteIdx = ref<number | null>(null);
const showPrintDialog = ref(false);
const nomorToPrint = ref("");

const emptyDetail = (): MutasiOutFormDetail => ({
  NoPermintaan: "",
  Kode: "",
  Nama: "",
  Satuan: "",
  Spesifikasi: "",
  Stok: 0,
  StokBelumDiterima: 0,
  StokReal: 0,
  Jumlah: 0,
});

const defaultData: MutasiOutFormData = {
  Nomor: "",
  Jenis: formJenis.value,
  Tanggal: todayLocal,
  CabangAsal: authStore.userCabang || "P01",
  CabangTujuan: "",
  Bagian: "FINANCE",
  Keterangan: "",
  NoTerima: "",
  StatusEdit: "",
  isTutupBuku: false,
  Detail: [emptyDetail()],
};

// ── useForm ───────────────────────────────────────────────────────────
const {
  isLoading,
  isSaving,
  showSaveDialog,
  showCancelDialog,
  showCloseDialog,
  formData,
  executeCancel,
  executeClose,
} = useForm<MutasiOutFormData>({
  menuId: MENU_ID,
  initialData: defaultData,
  fetchApi: isEditMode.value
    ? async () => {
        const d = await mutasiOutFormApi.getDetail(
          route.params.nomor as string
        );
        formJenis.value = d.Jenis;
        return {
          ...d,
          Tanggal: d.Tanggal || todayLocal,
          Detail: d.Detail?.length ? d.Detail : [emptyDetail()],
        };
      }
    : undefined,
  // submitApi diisi dummy — save dilakukan manual di executeSave
  submitApi: async (_data: MutasiOutFormData) => ({}),
});

// ── fd: alias non-nullable untuk template ────────────────────────────
// formData dari useForm bertipe Ref<T> tapi TS tidak bisa infer dengan pasti.
// Pakai fd sebagai computed non-nullable sehingga tidak perlu type assertion
// di mana-mana.
const fd = computed(() => (formData.value ?? defaultData) as MutasiOutFormData);

// ── executeSave manual (bypass goBack dari useForm) ───────────────────
const executeSave = async () => {
  if (isSaving.value) return; // cegah spam-klik / double submit
  isSaving.value = true;
  try {
    const response = await mutasiOutFormApi.save({
      isNewMode: !isEditMode.value,
      data: fd.value,
    });
    showSaveDialog.value = false;
    nomorToPrint.value = response?.nomor || fd.value.Nomor;
    showPrintDialog.value = true;
  } catch (e: any) {
    if (!isAuthExpiredError(e)) {
      toast.error(e.response?.data?.message ?? "Gagal menyimpan data.");
    }
  } finally {
    isSaving.value = false;
  }
};

// ── detail: computed shortcut ke array Detail ─────────────────────────
const detail = computed<MutasiOutFormDetail[]>({
  get: () => fd.value.Detail ?? [],
  set: (val) => {
    fd.value.Detail = val;
  },
});

// ── Search Barang ─────────────────────────────────────────────────────
const fetchBarang = async (search = "") => {
  isLoadingBarang.value = true;
  try {
    barangItems.value = await mutasiOutFormApi.searchBarang({
      jenis: formJenis.value,
      bagian: fd.value.Bagian,
      cabang: fd.value.CabangAsal,
      search,
    });
  } catch (e: any) {
    if (!isAuthExpiredError(e)) toast.error("Gagal memuat data barang.");
  } finally {
    isLoadingBarang.value = false;
  }
};

const openBarangModal = async (idx: number) => {
  activeGridIndex.value = idx;
  barangSearch.value = "";
  await fetchBarang("");
  showBarangModal.value = true;
};

const onBarangSearch = async (val: string) => {
  barangSearch.value = val;
  await fetchBarang(val);
};

const setBarang = (v: BarangGarmenItem) => {
  const i = activeGridIndex.value;
  if (i < 0) return;
  const isDup = detail.value.some((d, idx) => idx !== i && d.Kode === v.Kode);
  if (isDup) return toast.error(`Kode ${v.Kode} sudah ada di grid.`);

  detail.value[i] = {
    ...detail.value[i],
    Kode: v.Kode,
    Nama: v.Nama,
    Satuan: v.Satuan,
    Stok: Number(v.Stok) || 0,
    StokBelumDiterima: 0,
    StokReal: Number(v.Stok) || 0,
    Jumlah: Number(v.Stok) || 0, // ← otomatis isi dari stok
  };
  if (i === detail.value.length - 1) addItem();
  showBarangModal.value = false;
};

// ── Search Permintaan Finance ─────────────────────────────────────────
const fetchPermintaan = async (search = "") => {
  if (!fd.value.CabangTujuan) {
    toast.warning("Pilih Cabang Tujuan terlebih dahulu.");
    return;
  }
  isLoadingPermintaan.value = true;
  try {
    permintaanItems.value = await mutasiOutFormApi.searchPermintaanFinance({
      jenis: formJenis.value,
      cabangTujuan: fd.value.CabangTujuan,
      search,
    });
  } catch (e: any) {
    if (!isAuthExpiredError(e)) toast.error("Gagal memuat data permintaan.");
  } finally {
    isLoadingPermintaan.value = false;
  }
};

const openPermintaanModal = async (idx: number) => {
  activeGridIndex.value = idx;
  permintaanSearch.value = "";
  await fetchPermintaan("");
  showPermintaanModal.value = true;
};

const setPermintaan = async (noPermintaan: string) => {
  showPermintaanModal.value = false;
  try {
    const details = await mutasiOutFormApi.getDetailPermintaanFinance({
      noPermintaan,
      cabangAsal: fd.value.CabangAsal,
      nomorMso: fd.value.Nomor,
    });
    if (!details.length)
      return toast.warning("Tidak ada item di permintaan ini.");

    let targetIdx = activeGridIndex.value;
    for (const dtl of details) {
      const isDup = detail.value.some(
        (d) => d.NoPermintaan === dtl.NoPermintaan && d.Kode === dtl.Kode
      );
      if (isDup) continue;

      // Pastikan Jumlah = StokReal (stok - belum diterima)
      const row = {
        ...dtl,
        Jumlah: dtl.StokReal > 0 ? dtl.StokReal : dtl.Jumlah,
      };

      if (detail.value[targetIdx] && !detail.value[targetIdx].Kode) {
        detail.value[targetIdx] = row;
      } else {
        detail.value.push(row);
      }
      targetIdx++;
    }
    if (detail.value[detail.value.length - 1]?.Kode) addItem();
  } catch (e: any) {
    if (!isAuthExpiredError(e)) toast.error("Gagal memuat detail permintaan.");
  }
};

// ── Grid helpers ──────────────────────────────────────────────────────
const addItem = () => detail.value.push(emptyDetail());

const removeItem = (idx: number) => {
  pendingDeleteIdx.value = idx;
  deleteRowDialog.value = true;
};

const confirmRemoveItem = () => {
  if (pendingDeleteIdx.value !== null) {
    detail.value.splice(pendingDeleteIdx.value, 1);
    if (!detail.value.length) addItem();
  }
  deleteRowDialog.value = false;
  pendingDeleteIdx.value = null;
};

// ── Validasi ──────────────────────────────────────────────────────────
const validateSave = () => {
  if (!fd.value.CabangTujuan)
    return toast.warning("Cabang Tujuan harus dipilih.");
  if (!fd.value.Keterangan?.trim())
    return toast.warning("Keterangan harus diisi.");
  if (isEditMode.value && ["WAIT", "TOLAK"].includes(fd.value.StatusEdit))
    return toast.error("Transaksi terkunci. Minta approve terlebih dahulu.");

  const validDetails = detail.value.filter((d) => d.Kode?.trim());
  if (!validDetails.length)
    return toast.warning("Minimal satu barang harus diisi.");
  for (let i = 0; i < validDetails.length; i++) {
    if (Number(validDetails[i].Jumlah) <= 0)
      return toast.warning(`Jumlah baris ke-${i + 1} harus > 0.`);
  }
  fd.value.Detail = validDetails;
  showSaveDialog.value = true;
};

// ── Print & navigasi ──────────────────────────────────────────────────
const onPrintConfirm = () => {
  window.open(
    `/transaksi/mutasi-out/print/${encodeURIComponent(nomorToPrint.value)}`,
    "_blank"
  );
  showPrintDialog.value = false;
  router.push({ name: "MutasiOut" });
};

const onPrintCancel = () => {
  showPrintDialog.value = false;
  router.push({ name: "MutasiOut" });
};

const fmtQty = (v: any) =>
  Number(v || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const CABANG_LIST = ["P01", "P02", "P03", "P04", "P05", "HO-"];
</script>

<template>
  <BaseForm
    :title="
      isEditMode
        ? `Ubah Mutasi Out — ${formJenis}`
        : `Mutasi Out Baru — ${formJenis}`
    "
    :menu-id="MENU_ID"
    :icon="IconTruckDelivery"
    :is-loading="isLoading"
    :is-saving="isSaving"
    v-model:show-save-dialog="showSaveDialog"
    v-model:show-cancel-dialog="showCancelDialog"
    v-model:show-close-dialog="showCloseDialog"
    @validate-save="validateSave"
    @confirm-save="executeSave"
    @confirm-cancel="executeCancel"
    @confirm-close="executeClose"
  >
    <!-- ── Warning dialog slot ── -->
    <template #dialog-warning>
      <v-alert
        v-if="fd.isTutupBuku"
        type="error"
        variant="tonal"
        density="compact"
        class="mt-2 text-caption"
      >
        Periode ini sudah ditutup. Perubahan akan ditolak.
      </v-alert>
      <v-alert
        v-if="fd.NoTerima"
        type="warning"
        variant="tonal"
        density="compact"
        class="mt-2 text-caption"
      >
        Mutasi ini sudah DITERIMA di cabang tujuan ({{ fd.NoTerima }}). Tidak
        bisa diubah.
      </v-alert>
    </template>

    <!-- ── LEFT COLUMN ── -->
    <template #left-column>
      <div class="fr">
        <label class="lbl">Nomor</label>
        <input
          :value="fd.Nomor || 'Otomatis'"
          class="inp ro"
          style="color: #e53935; font-weight: 700"
          readonly
        />
      </div>
      <div class="fr">
        <label class="lbl">Jenis</label>
        <input
          :value="fd.Jenis"
          class="inp ro"
          style="font-weight: 700"
          readonly
        />
      </div>
      <div class="fr">
        <label class="lbl">Tanggal</label>
        <input
          type="date"
          v-model="fd.Tanggal"
          class="idate"
          :disabled="isEditMode"
        />
      </div>
      <div class="fr">
        <label class="lbl">Cabang</label>
        <input
          :value="fd.CabangAsal"
          class="inp ro"
          readonly
          style="width: 55px; flex: none"
        />
        <input :value="fd.Bagian" class="inp ro" readonly />
      </div>

      <div class="sep" />

      <div class="fr">
        <label class="lbl">Tujuan</label>
        <select
          v-model="fd.CabangTujuan"
          class="inp"
          style="flex: none; width: 80px"
          :disabled="isEditMode"
        >
          <option value="">— Pilih —</option>
          <option v-for="c in CABANG_LIST" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>
      <div class="fr">
        <label class="lbl">No. Terima</label>
        <input :value="fd.NoTerima || '—'" class="inp ro" readonly />
      </div>

      <div class="sep" />

      <div class="fr" style="align-items: flex-start">
        <label class="lbl" style="padding-top: 3px">Keterangan</label>
        <textarea
          v-model="fd.Keterangan"
          class="ta"
          rows="4"
          placeholder="Keterangan mutasi..."
        />
      </div>
    </template>

    <!-- ── RIGHT COLUMN ── -->
    <template #right-column>
      <div class="d-flex flex-column h-100 gap-2 pa-2">
        <div class="tbl-header">
          <span>Rincian Barang</span>
          <button
            v-if="!isEditMode"
            type="button"
            class="btn-add"
            @click="addItem"
          >
            + Tambah Baris
          </button>
        </div>
        <div class="tbl-wrap flex-grow-1">
          <table class="gt">
            <thead>
              <tr>
                <th style="width: 36px" class="tc">No</th>
                <th style="width: 130px">No. Permintaan</th>
                <th style="width: 110px">Kode</th>
                <th style="min-width: 180px">Nama Barang</th>
                <th style="min-width: 130px">Spesifikasi</th>
                <th style="width: 55px" class="tc">Sat</th>
                <th style="width: 75px" class="tr">Stok</th>
                <th style="width: 90px" class="tr">Blm Terima</th>
                <th style="width: 75px" class="tr">Stok Real</th>
                <th style="width: 85px; background: #fff9c4" class="tr">
                  Jumlah
                </th>
                <th style="width: 36px" class="tc">✕</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(item, idx) in detail"
                :key="idx"
                :class="{ 'row-active': activeGridIndex === idx }"
                @click="activeGridIndex = idx"
              >
                <td class="tc gt-num">{{ idx + 1 }}</td>

                <!-- No. Permintaan -->
                <td class="p0">
                  <div class="cell-grp">
                    <input :value="item.NoPermintaan" class="ci ro" readonly />
                    <button
                      v-if="!isEditMode && fd.Bagian === 'FINANCE'"
                      type="button"
                      class="ci-btn"
                      @click.stop="openPermintaanModal(idx)"
                      title="Cari No. Permintaan"
                    >
                      <IconSearch :size="11" />
                    </button>
                  </div>
                </td>

                <!-- Kode Barang -->
                <td class="p0">
                  <div class="cell-grp">
                    <input :value="item.Kode" class="ci ro" readonly />
                    <button
                      v-if="!isEditMode && fd.Bagian !== 'FINANCE'"
                      type="button"
                      class="ci-btn"
                      @click.stop="openBarangModal(idx)"
                      title="Cari Barang"
                    >
                      <IconSearch :size="11" />
                    </button>
                  </div>
                </td>

                <td class="p0">
                  <input :value="item.Nama" class="ci ro" readonly />
                </td>
                <td class="p0">
                  <input
                    v-model="item.Spesifikasi"
                    class="ci"
                    :class="{ ro: isEditMode }"
                    :readonly="isEditMode"
                  />
                </td>
                <td class="p0">
                  <input :value="item.Satuan" class="ci ro tc" readonly />
                </td>
                <td class="p0">
                  <input :value="fmtQty(item.Stok)" class="ci ro tr" readonly />
                </td>
                <td class="p0">
                  <input
                    :value="fmtQty(item.StokBelumDiterima)"
                    class="ci ro tr"
                    readonly
                  />
                </td>
                <td class="p0">
                  <input
                    :value="fmtQty(item.StokReal)"
                    class="ci ro tr fw"
                    readonly
                  />
                </td>
                <td class="p0">
                  <input
                    v-model.number="item.Jumlah"
                    type="number"
                    class="ci tr fw accent"
                    :class="{ ro: isEditMode }"
                    :readonly="isEditMode"
                    @focus="(e) => (e.target as HTMLInputElement).select()"
                  />
                </td>
                <td class="tc p0">
                  <button
                    v-if="!isEditMode"
                    type="button"
                    class="btn-del"
                    @click.stop="removeItem(idx)"
                  >
                    ✕
                  </button>
                </td>
              </tr>
              <tr v-if="!detail.length">
                <td
                  colspan="11"
                  class="tc"
                  style="
                    color: #9e9e9e;
                    font-style: italic;
                    font-size: 11px;
                    padding: 10px;
                  "
                >
                  Tidak ada detail barang.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </BaseForm>

  <!-- ── Modal: Cari Barang ── -->
  <v-dialog v-model="showBarangModal" max-width="600" scrollable>
    <v-card rounded="lg">
      <v-card-title
        class="pa-3 pb-2"
        style="font-size: 13px; font-weight: 700; border-top: 3px solid #3B5998"
      >
        Cari Barang — {{ formJenis }}
      </v-card-title>
      <v-card-text class="pa-3 pt-1">
        <input
          v-model="barangSearch"
          class="modal-search"
          placeholder="Cari kode / nama barang..."
          @input="onBarangSearch(barangSearch)"
        />
        <div v-if="isLoadingBarang" class="modal-loading">Memuat...</div>
        <table v-else class="modal-tbl">
          <thead>
            <tr>
              <th style="width: 100px">Kode</th>
              <th>Nama</th>
              <th style="width: 60px" class="tc">Satuan</th>
              <th style="width: 80px" class="tr">Stok</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="b in barangItems"
              :key="b.Kode"
              class="modal-row"
              @click="setBarang(b)"
            >
              <td class="mono">{{ b.Kode }}</td>
              <td>{{ b.Nama }}</td>
              <td class="tc">{{ b.Satuan }}</td>
              <td class="tr">{{ fmtQty(b.Stok) }}</td>
            </tr>
            <tr v-if="!barangItems.length">
              <td colspan="4" class="tc modal-empty">Tidak ada data.</td>
            </tr>
          </tbody>
        </table>
      </v-card-text>
      <v-card-actions class="pa-2" style="border-top: 1px solid #e0e0e0">
        <v-spacer />
        <v-btn variant="text" size="small" @click="showBarangModal = false"
          >Tutup</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- ── Modal: Cari No. Permintaan Finance ── -->
  <v-dialog v-model="showPermintaanModal" max-width="860" scrollable>
    <v-card rounded="lg">
      <v-card-title
        class="pa-3 pb-2"
        style="font-size: 13px; font-weight: 700; border-top: 3px solid #3B5998"
      >
        Cari No. Permintaan — {{ formJenis }}
      </v-card-title>
      <v-card-text class="pa-3 pt-1">
        <input
          v-model="permintaanSearch"
          class="modal-search"
          placeholder="Cari nomor / keterangan..."
          @input="fetchPermintaan(permintaanSearch)"
        />
        <div v-if="isLoadingPermintaan" class="modal-loading">Memuat...</div>
        <table v-else class="modal-tbl">
          <colgroup>
            <col style="width: 130px" />
            <col style="width: 90px" />
            <col />
            <!-- Keterangan: fill sisa lebar -->
            <col style="width: 55px" />
            <col style="width: 80px" />
          </colgroup>
          <thead>
            <tr>
              <th>No. Permintaan</th>
              <th class="tc">Tanggal</th>
              <th>Keterangan</th>
              <th class="tc">Cab</th>
              <th>Peminta</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="p in permintaanItems"
              :key="p.NoPermintaan"
              class="modal-row"
              @click="setPermintaan(p.NoPermintaan)"
            >
              <td class="mono">{{ p.NoPermintaan }}</td>
              <td class="tc">{{ p.Tanggal }}</td>
              <td>{{ p.Keterangan }}</td>
              <td class="tc">{{ p.Cab }}</td>
              <td>{{ p.Peminta }}</td>
            </tr>
            <tr v-if="!permintaanItems.length">
              <td colspan="5" class="tc modal-empty">Tidak ada data.</td>
            </tr>
          </tbody>
        </table>
      </v-card-text>
      <v-card-actions class="pa-2" style="border-top: 1px solid #e0e0e0">
        <v-spacer />
        <v-btn variant="text" size="small" @click="showPermintaanModal = false"
          >Tutup</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- ── Dialog: Konfirmasi Hapus Baris ── -->
  <v-dialog v-model="deleteRowDialog" max-width="360" persistent>
    <v-card rounded="lg">
      <v-card-title
        class="pa-3"
        style="font-size: 13px; font-weight: 700; border-top: 3px solid #c62828"
      >
        Hapus Baris?
      </v-card-title>
      <v-card-text class="pa-3 pt-1" style="font-size: 12px">
        Yakin ingin menghapus baris ini dari rincian mutasi?
      </v-card-text>
      <v-card-actions class="pa-3" style="border-top: 1px solid #e0e0e0">
        <v-spacer />
        <v-btn variant="text" @click="deleteRowDialog = false">Batal</v-btn>
        <v-btn
          color="error"
          variant="flat"
          size="small"
          @click="confirmRemoveItem"
        >
          Ya, Hapus
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- ── Dialog: Konfirmasi Cetak ── -->
  <v-dialog v-model="showPrintDialog" max-width="380" persistent>
    <v-card rounded="lg">
      <v-card-title
        class="pa-3"
        style="font-size: 13px; font-weight: 700; border-top: 3px solid #3B5998"
      >
        Simpan Berhasil
      </v-card-title>
      <v-card-text class="pa-3 pt-1" style="font-size: 12px">
        Mutasi <strong style="color: #3B5998">{{ nomorToPrint }}</strong>
        berhasil disimpan. Cetak sekarang?
      </v-card-text>
      <v-card-actions class="pa-3" style="border-top: 1px solid #e0e0e0">
        <v-btn variant="text" @click="onPrintCancel">Tidak</v-btn>
        <v-spacer />
        <v-btn
          color="primary"
          variant="flat"
          size="small"
          @click="onPrintConfirm"
        >
          Ya, Cetak
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.fr {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
  margin-bottom: 4px;
  width: 100%;
}
.lbl {
  width: 80px;
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  color: #333;
  white-space: nowrap;
}
.inp {
  flex: 1;
  height: 24px;
  border: 1px solid #a0a0a0;
  padding: 0 5px;
  font-size: 11px;
  background: white;
  outline: none;
  box-sizing: border-box;
  min-width: 0;
  border-radius: 2px;
}
.inp:focus {
  border-color: #3B5998;
}
.idate {
  height: 24px;
  border: 1px solid #a0a0a0;
  padding: 0 4px;
  font-size: 11px;
  border-radius: 2px;
  outline: none;
  flex: 1;
}
.idate:focus {
  border-color: #3B5998;
}
.ro {
  background: #e8e8f5 !important;
  color: #444 !important;
}
.ta {
  flex: 1;
  border: 1px solid #a0a0a0;
  border-radius: 2px;
  padding: 4px 5px;
  font-size: 11px;
  outline: none;
  resize: vertical;
  min-width: 0;
  box-sizing: border-box;
}
.ta:focus {
  border-color: #3B5998;
}
.sep {
  height: 1px;
  background: #e0e0e0;
  margin: 8px 0;
  width: 100%;
}

.tbl-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 10px;
  font-size: 11px;
  font-weight: 700;
  background: #3B5998;
  color: white;
  border-radius: 3px 3px 0 0;
}
.btn-add {
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.5);
  color: white;
  padding: 2px 8px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
}
.btn-add:hover {
  background: rgba(255, 255, 255, 0.35);
}
.tbl-wrap {
  border: 1px solid #c8c8e6;
  border-top: none;
  background: white;
  overflow: auto;
}
.gt {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 11px;
}
.gt thead th {
  background: #f1f1f8;
  border: 1px solid #c8c8e6;
  padding: 4px 5px;
  font-size: 10px;
  font-weight: 700;
  position: sticky;
  top: 0;
  z-index: 1;
  text-align: left;
  color: #3B5998;
}
.gt tbody td {
  border: 1px solid #e8e8f5;
  height: 26px;
  white-space: nowrap;
  overflow: hidden;
}
.row-active td {
  background: #f0f0fd !important;
}
.gt-num {
  font-size: 10px;
  color: #9e9e9e;
  padding: 0 4px;
}
.p0 {
  padding: 0 !important;
}
.ci {
  width: 100%;
  height: 25px;
  border: none;
  background: transparent;
  outline: none;
  font-size: 11px;
  padding: 0 5px;
  box-sizing: border-box;
}
.ci.ro {
  background: #e8e8f5 !important;
}
.ci:focus:not(.ro) {
  background: #f0f0fd;
  outline: 1px solid #3B5998;
  outline-offset: -1px;
}
.cell-grp {
  display: flex;
  align-items: center;
  height: 25px;
}
.ci-btn {
  width: 22px;
  flex-shrink: 0;
  background: #e8e8f5;
  border: none;
  border-left: 1px solid #c8c8e6;
  cursor: pointer;
  height: 25px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #3B5998;
}
.ci-btn:hover {
  background: #c8c8e6;
}
.btn-del {
  width: 100%;
  height: 25px;
  background: transparent;
  color: #d32f2f;
  border: none;
  cursor: pointer;
  font-weight: bold;
}

.modal-search {
  width: 100%;
  height: 30px;
  border: 1px solid #c8c8e6;
  border-radius: 4px;
  padding: 0 8px;
  font-size: 12px;
  outline: none;
  margin-bottom: 8px;
  box-sizing: border-box;
}
.modal-search:focus {
  border-color: #3B5998;
}
.modal-loading {
  font-size: 12px;
  color: #9e9e9e;
  padding: 10px;
  text-align: center;
}
.modal-tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.modal-tbl th {
  background: #3B5998;
  color: white;
  font-weight: 700;
  padding: 4px 8px;
  text-align: left;
  white-space: nowrap;
}
.modal-tbl td {
  padding: 3px 8px;
  border-bottom: 1px solid #f0f0f0;
  white-space: nowrap;
}
.modal-row {
  cursor: pointer;
}
.modal-row:hover td {
  background: #f0f0fd;
}
.modal-empty {
  color: #9e9e9e;
  font-style: italic;
  padding: 12px;
}

.fw {
  font-weight: 700;
}
.tc {
  text-align: center;
}
.tr {
  text-align: right;
}
.mono {
  font-family: monospace;
}
.accent {
  color: #3B5998;
}
</style>
