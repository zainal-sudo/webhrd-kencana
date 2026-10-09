<script setup lang="ts">
import { ref, watch } from "vue";
import { useToast } from "vue-toastification";
import FText from "@/components/fields/FText.vue";
import { api, getErrorMessage } from "@/api/axios";
import { selisihHari } from "@/utils/jam";

/**
 * Otorisasi tantangan-respons ala Delphi (`UfrmOtorisasi`).
 *
 * Dipakai form Absensi / Ijin / Lembur saat tanggal sudah lama:
 *  1. User menekan "Minta Kode" -> server memberi kode tantangan 6 digit.
 *  2. Kode itu diberikan ke atasan; atasan membuka halaman Generator
 *     Otorisasi dan menukar kode tersebut menjadi angka balasan.
 *  3. User mengetik kode atasan + angka balasan -> server memverifikasi
 *     lalu menerbitkan token simpan (`verified`).
 */
const props = defineProps<{
  modul: "absensi" | "ijin" | "lembur";
  tanggal: string;
}>();

const emit = defineEmits<{
  (e: "verified", payload: { token: string; pemberi: string }): void;
}>();

const toast = useToast();
const tantangan = ref("");
const pemberi = ref("");
const respons = ref("");
const meminta = ref(false);
const memverifikasi = ref(false);
const diterimaOleh = ref("");

function bersihkan() {
  tantangan.value = "";
  pemberi.value = "";
  respons.value = "";
  diterimaOleh.value = "";
}

watch(
  () => props.tanggal,
  () => bersihkan()
);

async function mintaKode() {
  meminta.value = true;
  try {
    const { data } = await api.post("/otorisasi/tantangan");
    tantangan.value = String(data.data?.tantangan || "");
    diterimaOleh.value = "";
    if (!tantangan.value) toast.error("Server tidak mengembalikan kode");
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal meminta kode"));
  } finally {
    meminta.value = false;
  }
}

async function verifikasi() {
  if (!tantangan.value) {
    toast.error("Minta kode tantangan terlebih dahulu");
    return;
  }
  if (!pemberi.value.trim() || !respons.value.trim()) {
    toast.error("Kode pemberi dan angka balasan wajib diisi");
    return;
  }
  memverifikasi.value = true;
  try {
    const { data } = await api.post("/otorisasi/verifikasi", {
      modul: props.modul,
      tantangan: tantangan.value,
      pemberi: pemberi.value,
      respons: respons.value,
    });
    const token = String(data.data?.token || "");
    const oleh = String(data.data?.user_kode || pemberi.value).toUpperCase();
    if (!token) throw new Error("Token kosong dari server");
    diterimaOleh.value = oleh;
    respons.value = "";
    toast.success(`Otorisasi diterima oleh ${oleh}`);
    emit("verified", { token, pemberi: oleh });
  } catch (e) {
    toast.error(getErrorMessage(e, "Otorisasi ditolak"));
  } finally {
    memverifikasi.value = false;
  }
}
</script>

<template>
  <fieldset class="fs warn">
    <legend>Otorisasi Atasan</legend>
    <p class="note">
      Tanggal <strong>{{ tanggal }}</strong> berjarak
      <strong>{{ selisihHari(tanggal) }} hari</strong> dari hari ini — perlu persetujuan atasan
      (seperti popup otorisasi Delphi).
    </p>
    <div class="tantangan-row">
      <div class="kode-box" :class="{ kosong: !tantangan }">
        {{ tantangan || "------" }}
      </div>
      <button class="btn-mini primary" type="button" :disabled="meminta" @click="mintaKode">
        {{ meminta ? "Meminta..." : tantangan ? "Minta Kode Baru" : "Minta Kode" }}
      </button>
    </div>
    <p class="note">
      Berikan kode di atas ke atasan. Atasan membuka
      <router-link to="/setting/generator-otorisasi" target="_blank" class="lnk">Generator Otorisasi</router-link>
      lalu memberikan <strong>kode user</strong> dan <strong>angka balasannya</strong> kepada Anda.
      Kode kedaluwarsa ±10 menit.
    </p>
    <div v-if="tantangan" class="grid">
      <FText v-model="pemberi" label="Kode Pemberi (atasan)" placeholder="mis. ADMIN" />
      <FText v-model="respons" label="Angka Balasan (6 digit)" placeholder="mis. 482913" />
    </div>
    <div v-if="tantangan" class="aksi-row">
      <button class="btn-mini primary" type="button" :disabled="memverifikasi" @click="verifikasi">
        {{ memverifikasi ? "Memeriksa..." : "Verifikasi Otorisasi" }}
      </button>
      <span v-if="diterimaOleh" class="ok">Otorisasi diterima oleh {{ diterimaOleh }}</span>
    </div>
  </fieldset>
</template>

<style scoped>
.fs {
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  padding: 10px 12px 14px;
  margin-bottom: 12px;
}
.fs > legend {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--ds-primary, #3b5998);
  padding: 0 6px;
}
.fs.warn {
  border-color: #d9a441;
  background: #fffaef;
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 14px;
}
.note {
  font-size: 12px;
  color: #7a5b16;
  margin: 8px 0 0;
}
.tantangan-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.kode-box {
  font-family: Consolas, monospace;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 6px;
  padding: 4px 14px 4px 20px;
  border: 2px dashed var(--ds-primary, #3b5998);
  background: #fff;
  color: var(--ds-primary-dark, #243656);
}
.kode-box.kosong {
  color: #b0b8c4;
  border-color: #b0b8c4;
}
.lnk {
  color: var(--ds-primary, #3b5998);
  font-weight: 700;
}
.aksi-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.ok {
  font-size: 12px;
  font-weight: 700;
  color: #15803d;
}
.btn-mini {
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  color: var(--ds-on-surface, #1b2d4a);
}
.btn-mini.primary {
  background: var(--ds-primary, #3b5998);
  border-color: var(--ds-primary-dark, #2c4472);
  color: #fff;
}
.btn-mini:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
