<script lang="ts">
/** Bentuk data baris sumber periode baru (dipakai juga Master MoU Sewa). */
export interface PeriodeSumber {
  id: string | number;
  noSurat: string;
  tempat: string;
  alamat: string | null;
  awal: string | null;
  berakhir: string | null;
  /** Sisa hari dari backend (DATEDIFF berakhir vs hari ini); bila tidak ada,
   *  dihitung di sisi klien dengan rumus yang sama. */
  sisaHari?: number | null;
}
</script>

<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import { useToast } from "vue-toastification";
import MsIcon from "@/components/MsIcon.vue";
import DateInput from "@/components/fields/DateInput.vue";
import { api, getErrorMessage } from "@/api/axios";
import { todaySql } from "@/utils/format";

/**
 * Dialog "Periode MoU Baru" — dipakai BERSAMA oleh:
 *  - Dashboard "MoU Sewa Berakhir" (tombol Eksekusi → Buat Periode MoU Baru)
 *  - Master MoU Sewa (tombol Tambah Periode di panel Riwayat Periode)
 * supaya formnya selalu sama persis: tempat & alamat TERKUNCI (disalin dari
 * baris sumber), no surat bisa dipilih SAMA (baris dobel dgn no surat sama)
 * atau BARU (diketik manual), tanggal baca-saja sampai tombol "Ubah Tanggal"
 * ditekan. POST ke /master/mou-sewa/:id/eksekusi; baris lama tetap tersimpan
 * sebagai riwayat periode.
 */

const props = defineProps<{ sumber: PeriodeSumber | null }>();
const emit = defineEmits<{ close: []; saved: [] }>();

const toast = useToast();

/** Pilihan no surat periode baru: sama dengan MoU lama, atau ketik baru. */
const pilihanNoSurat = ref<"sama" | "beda">("sama");
/** Tombol "Ubah Tanggal": false → tanggal tampil baca-saja, true → bisa diedit. */
const ubahTanggal = ref(false);
const simpan = ref(false);
const form = reactive({ mou_no_surat: "", mou_awal: "", mou_berakhir: "" });

function formatTanggalTampil(d: string | null): string {
  const s = String(d || "");
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

function labelSisaHari(h: number): string {
  return h >= 0 ? `habis dalam ${h} hari` : `lewat ${-h} hari`;
}

/** Sisa hari baris sumber: pakai nilai backend bila ada, atau hitung sendiri
 *  (DATEDIFF(berakhir, CURDATE()) = selisih hari kalender). */
const sisaHari = (s: PeriodeSumber): number => {
  if (typeof s.sisaHari === "number") return s.sisaHari;
  const akhir = Date.parse(String(s.berakhir || ""));
  const kini = Date.parse(todaySql());
  return Number.isNaN(akhir) ? 0 : Math.round((akhir - kini) / 86400000);
};

/* Setiap dialog dibuka (sumber baru), form direset: no surat default SAMA,
 * tanggal default = tanggal MoU lama (ubah lewat tombol "Ubah Tanggal"). */
watch(
  () => props.sumber,
  (s) => {
    if (!s) return;
    pilihanNoSurat.value = "sama";
    ubahTanggal.value = false;
    form.mou_no_surat = "";
    form.mou_awal = s.awal || todaySql();
    form.mou_berakhir = s.berakhir || "";
  },
  { immediate: true }
);

/** No surat periode baru sesuai pilihan radio. */
const noSuratFinal = () => (pilihanNoSurat.value === "sama" ? String(props.sumber?.noSurat || "").trim() : form.mou_no_surat.trim());

async function jalankan() {
  const s = props.sumber;
  if (!s || simpan.value) return;
  if (!noSuratFinal()) {
    toast.error(pilihanNoSurat.value === "sama" ? "MoU lama tidak punya nomor surat — pilih 'No surat baru'." : "Nomor surat wajib diisi.");
    return;
  }
  if (!form.mou_awal) {
    toast.error("Awal mulai wajib diisi.");
    return;
  }
  if (!form.mou_berakhir) {
    toast.error("Tanggal berakhir wajib diisi.");
    return;
  }
  if (form.mou_berakhir < form.mou_awal) {
    toast.error("Tanggal berakhir tidak boleh sebelum awal mulai.");
    return;
  }
  simpan.value = true;
  try {
    await api.post(`/master/mou-sewa/${encodeURIComponent(String(s.id))}/eksekusi`, {
      mou_no_surat: noSuratFinal(),
      mou_awal: form.mou_awal,
      mou_berakhir: form.mou_berakhir,
    });
    toast.success(`Periode MoU baru (${noSuratFinal()}) untuk ${s.tempat} berhasil dibuat; riwayat periode lama tetap tersimpan.`);
    emit("saved");
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal membuat periode MoU baru."));
  } finally {
    simpan.value = false;
  }
}

function tutup() {
  if (simpan.value) return;
  emit("close");
}
</script>

<template>
  <v-dialog :model-value="!!sumber" width="640" content-class="mou-eksekusi-dlg" persistent>
    <v-card v-if="sumber">
      <v-card-title class="text-body-1 font-weight-bold">
        Periode MoU Baru — {{ sumber.noSurat || sumber.tempat }}
      </v-card-title>
      <v-card-text>
        <!-- Tempat & alamat TERKUNCI: tidak bisa diedit -->
        <div class="eksekusi-sumber">
          <div class="terkunci">
            <span>Tempat <MsIcon name="lock" :size="12" title="Terkunci" /></span>
            <b>{{ sumber.tempat }}</b>
          </div>
          <div class="terkunci">
            <span>Alamat <MsIcon name="lock" :size="12" title="Terkunci" /></span>
            <b>{{ sumber.alamat || "(tidak ada)" }}</b>
          </div>
          <div>
            <span>MoU lama:</span> {{ sumber.noSurat || "-" }} &middot;
            {{ formatTanggalTampil(sumber.awal) }} &ndash; {{ formatTanggalTampil(sumber.berakhir) }}
            ({{ labelSisaHari(sisaHari(sumber)) }})
          </div>
        </div>

        <!-- Pilihan no surat: sama (dobel) atau baru -->
        <div class="eksekusi-field">
          <span style="padding-top: 0">No Surat Baru <b>*</b></span>
          <div class="pilihan-nosurat">
            <label class="opsi">
              <input v-model="pilihanNoSurat" type="radio" value="sama" :disabled="simpan || !sumber.noSurat" />
              <span>Sama &mdash; {{ sumber.noSurat || "(MoU lama tanpa no surat)" }}</span>
            </label>
            <label class="opsi">
              <input v-model="pilihanNoSurat" type="radio" value="beda" :disabled="simpan" />
              <span>Baru (diketik manual)</span>
            </label>
            <input
              v-if="pilihanNoSurat === 'beda'"
              v-model="form.mou_no_surat"
              type="text"
              maxlength="100"
              autocomplete="off"
              class="input-nosurat"
              placeholder="mis. No.12/MoU/XI/2026"
              :disabled="simpan"
            />
          </div>
        </div>

        <!-- Tanggal: baca-saja sampai tombol "Ubah Tanggal" ditekan -->
        <div class="eksekusi-field">
          <span style="padding-top: 0">Tanggal Periode</span>
          <div class="pilihan-tgl">
            <template v-if="!ubahTanggal">
              <!-- Teks tanggal dan tombol sengaja DIPISAH baris (kolom, bukan
                   satu baris flex) supaya tombol tidak mungkin menimpa teks. -->
              <span class="tgl-statik">{{ formatTanggalTampil(form.mou_awal) }} &ndash; {{ formatTanggalTampil(form.mou_berakhir) }}</span>
              <button
                type="button"
                class="ubah-tgl-btn"
                :disabled="simpan"
                @click="ubahTanggal = true"
              >
                <MsIcon name="edit_calendar" :size="14" /> Ubah Tanggal
              </button>
            </template>
            <template v-else>
              <label class="tgl-ubah">
                <span class="tgl-label">Awal Mulai <b>*</b></span>
                <DateInput v-model="form.mou_awal" :required="true" :disabled="simpan" />
              </label>
              <label class="tgl-ubah">
                <span class="tgl-label">Berakhir <b>*</b></span>
                <DateInput v-model="form.mou_berakhir" :required="true" :disabled="simpan" />
              </label>
              <button type="button" class="ubah-tgl-btn batal" :disabled="simpan" @click="ubahTanggal = false">
                <MsIcon name="close" :size="14" /> Tutup Ubah Tanggal
              </button>
            </template>
          </div>
        </div>

        <p class="eksekusi-note">
          Tempat &amp; alamat ikut MoU lama (terkunci). Periode lama tidak diubah &mdash;
          otomatis menjadi riwayat periode pada grup yang sama.
        </p>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn :disabled="simpan" variant="text" @click="tutup">Batal</v-btn>
        <v-btn :loading="simpan" color="primary" variant="flat" @click="jalankan">Simpan Periode Baru</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* Dialog eksekusi */
.eksekusi-sumber {
  display: grid;
  gap: 3px;
  padding: 8px 10px;
  margin-bottom: 12px;
  border: 1px solid var(--ds-border, #dbe2ee);
  border-radius: 8px;
  background: var(--ds-primary-50, #f3f6fb);
  font-size: 11.5px;
}
.eksekusi-sumber span { color: var(--ds-text-secondary, #5a6a7e); font-weight: 600; display: inline-flex; align-items: center; gap: 3px; }
.eksekusi-sumber .terkunci b { margin-left: 5px; color: #12224e; }
.pilihan-nosurat { display: flex; flex-direction: column; gap: 6px; flex: 1; }
.pilihan-nosurat .opsi {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  cursor: pointer;
  font-size: 11.5px;
  width: fit-content;
}
.pilihan-nosurat .opsi input {
  appearance: none;
  -webkit-appearance: none;
  width: 15px;
  height: 15px;
  margin: 0;
  flex: 0 0 auto;
  border: 1.5px solid var(--ds-border, #b0b8c4);
  border-radius: 50%;
  background: var(--ds-surface-raised, #fff);
  display: inline-grid;
  place-content: center;
  cursor: pointer;
  transition: border-color 0.1s ease, background 0.1s ease;
}
.pilihan-nosurat .opsi input:checked {
  border-color: var(--ds-primary, #3b5998);
  background: var(--ds-primary-50, #e8edf5);
}
.pilihan-nosurat .opsi input:checked::before {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ds-primary, #3b5998);
}
.pilihan-nosurat .opsi input:focus-visible {
  outline: 2px solid var(--ds-primary, #3b5998);
  outline-offset: 2px;
}
.pilihan-nosurat .opsi span { width: auto; padding-top: 0; font-weight: 600; color: var(--ds-on-surface, #12324f); }

.eksekusi-field { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px; font-size: 12px; }
.eksekusi-field span { width: 130px; flex-shrink: 0; padding-top: 0; color: var(--ds-on-surface, #12324f); font-weight: 700; }
.eksekusi-field b { color: #dc2626; }
.input-nosurat { min-width: 0; width: 100%; padding: 7px 10px; border: 1px solid var(--ds-border, #b0b8c4); border-radius: 4px; font: inherit; }
.input-nosurat:focus { outline: 2px solid var(--ds-primary, #3b5998); outline-offset: 1px; }
.pilihan-tgl { display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 0; }
/* Teks tanggal: satu string utuh (nowrap, tidak pernah patah) di baris
   sendiri; tombol "Ubah Tanggal" ada di baris terpisah di bawahnya sehingga
   tidak mungkin saling menimpa. */
.tgl-statik { font-size: 11.5px; color: var(--ds-on-surface, #12324f); white-space: nowrap; }
/* Paksa lebar dialog eksekusi (kalahkan style inline/aturan lain). */
:global(.mou-eksekusi-dlg) {
  width: min(640px, calc(100vw - 48px)) !important;
  max-width: calc(100vw - 48px) !important;
}
.tgl-ubah { display: flex; align-items: center; gap: 12px; }
.tgl-ubah .tgl-label { width: 96px; flex-shrink: 0; font-size: 12px; font-weight: 700; color: var(--ds-on-surface, #12324f); }
.tgl-ubah .tgl-label b { color: #dc2626; }
.tgl-ubah > :not(.tgl-label) { flex: 1; min-width: 0; }
/* DateInput di dialog: padding kiri lega + tinggi normal agar teks tidak
   menabrak border dan tidak tampak sempit saat fokus (ikon kalender kanan). */
.tgl-ubah :deep(.date-input > input[type="text"]) {
  width: 100%;
  height: 32px;
  box-sizing: border-box;
  padding: 0 32px 0 10px;
  border: 1px solid var(--ds-border, #b0b8c4);
  border-radius: 6px;
  background: var(--ds-surface-raised, #fff);
  font: inherit;
  color: var(--ds-text, #1b2d4a);
}
.ubah-tgl-btn {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid #dbe2ee;
  border-radius: 999px;
  background: #fff;
  color: #1b2d4a;
  font-size: 10.5px;
  font-weight: 700;
  cursor: pointer;
}
.ubah-tgl-btn:hover { background: var(--ds-primary-50, #e8edf5); }
.ubah-tgl-btn.batal { align-self: flex-start; border: 1px solid #dbe2ee; background: #fff; color: #1b2d4a; padding: 4px 10px; }
.ubah-tgl-btn.batal:hover { background: var(--ds-primary-50, #e8edf5); color: #1b2d4a; text-decoration: none; }
.ubah-tgl-btn:disabled { opacity: 0.55; cursor: default; }
.eksekusi-note { margin: 12px 0 0; font-size: 10.5px; color: var(--ds-text-secondary, #5a6a7e); }
@media (max-width: 640px) {
  .eksekusi-field { align-items: stretch; flex-direction: column; gap: 4px; }
  .eksekusi-field span { width: auto; padding-top: 0; }
  .tgl-ubah { flex-direction: column; align-items: stretch; gap: 4px; }
  .tgl-ubah .tgl-label { width: auto; }
}
</style>
