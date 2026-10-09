<script setup lang="ts">
import { ref, computed } from "vue";
import { useToast } from "vue-toastification";
import FText from "@/components/fields/FText.vue";
import FSelect from "@/components/fields/FSelect.vue";
import { api, getErrorMessage } from "@/api/axios";
import { useAuthStore } from "@/stores/authStore";

/**
 * Generator Otorisasi — padanan aplikasi pembuat angka balasan Delphi.
 *
 * Atasan (wajib hak edit pada modul terkait — diperiksa server) mengetik
 * kode tantangan dari popup form penyimpan, lalu memberikan kode user
 * sendiri + angka balasan yang muncul kepada penyimpan.
 */
const toast = useToast();
const auth = useAuthStore();

const MODUL_OPTIONS = [
  { label: "Absensi", value: "absensi", form: "frmAbsensi" },
  { label: "Ijin", value: "ijin", form: "frmIjin" },
  { label: "Lembur", value: "lembur", form: "frmLembur" },
];

const pilihan = computed(() => MODUL_OPTIONS.filter((m) => auth.can(m.form, "edit")));

const modul = ref("");
const tantangan = ref("");
const memproses = ref(false);
const hasil = ref<{ respons: string; pemberi: string; modul: string } | null>(null);

async function generate() {
  hasil.value = null;
  if (!modul.value) {
    toast.error("Pilih modul terlebih dahulu");
    return;
  }
  if (!/^\d{6}$/.test(tantangan.value.trim())) {
    toast.error("Kode tantangan harus 6 digit angka");
    return;
  }
  memproses.value = true;
  try {
    const { data } = await api.post("/otorisasi/generasi", {
      modul: modul.value,
      tantangan: tantangan.value.trim(),
    });
    hasil.value = {
      respons: String(data.data?.respons || ""),
      pemberi: String(data.data?.pemberi || ""),
      modul: String(data.data?.modul || modul.value),
    };
    if (!hasil.value.respons) toast.error("Server tidak mengembalikan angka balasan");
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal membuat angka balasan"));
  } finally {
    memproses.value = false;
  }
}
</script>

<template>
  <div class="panel">
    <div class="toolbar">
      <div class="tb-left">
        <span class="tool-title">Generator Otorisasi</span>
        <span class="tool-sub">Tukar kode tantangan menjadi angka balasan untuk penyimpan</span>
      </div>
    </div>

    <div class="body">
      <fieldset class="fs">
        <legend>Kode Tantangan</legend>
        <div class="grid">
          <FSelect
            v-model="modul"
            label="Modul"
            :options="pilihan.map((m) => ({ label: m.label, value: m.value }))"
          />
          <FText v-model="tantangan" label="Kode Tantangan (6 digit)" placeholder="mis. 482913" />
        </div>
        <p v-if="!pilihan.length" class="note warn">
          Anda tidak punya hak edit pada modul Absensi / Ijin / Lembur, sehingga tidak bisa
          menjadi pemberi otorisasi.
        </p>
        <div class="aksi-row">
          <button class="btn-mini primary" type="button" :disabled="memproses || !pilihan.length" @click="generate">
            {{ memproses ? "Memproses..." : "Buat Angka Balasan" }}
          </button>
        </div>
      </fieldset>

      <fieldset v-if="hasil" class="fs">
        <legend>Angka Balasan</legend>
        <p class="note">
          Berikan <strong>kode user</strong> dan <strong>angka balasan</strong> ini kepada penyimpan
          (berlaku ±10 menit untuk kode tantangan tersebut).
        </p>
        <div class="hasil">
          <div class="kotak">
            <span>Kode user Anda</span>
            <b>{{ hasil.pemberi }}</b>
          </div>
          <div class="kotak">
            <span>Angka balasan</span>
            <b class="kode">{{ hasil.respons }}</b>
          </div>
        </div>
      </fieldset>
    </div>
  </div>
</template>

<style scoped>
.panel {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: var(--ds-surface, #f0f3f8);
}
.toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: var(--ds-surface-variant, #e0e4ea);
  border-bottom: 1px solid var(--ds-border, #b0b8c4);
}
.tb-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tool-title {
  font-size: 13px;
  font-weight: 800;
  color: var(--ds-on-surface, #1b2d4a);
}
.tool-sub {
  font-size: 11px;
  color: #6b7a90;
  border-left: 1px solid #b0b8c4;
  padding-left: 8px;
}
.body {
  padding: 12px;
  flex: 1;
  min-height: 0;
  overflow: auto;
  max-width: 640px;
}
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
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 14px;
}
.note {
  font-size: 11.5px;
  color: #55637a;
  margin: 8px 0 0;
  line-height: 1.5;
}
.note.warn {
  color: #b91c1c;
  font-weight: 700;
}
.aksi-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.btn-mini {
  height: 27px;
  padding: 0 11px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 11.5px;
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
.hasil {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.kotak {
  flex: 1;
  min-width: 160px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: var(--ds-surface, #f7f9fc);
  padding: 8px 10px;
  text-align: center;
}
.kotak span {
  display: block;
  font-size: 10.5px;
  text-transform: uppercase;
  color: #6b7a90;
  font-weight: 700;
}
.kotak b {
  display: block;
  font-size: 20px;
  color: var(--ds-primary, #3b5998);
}
.kotak b.kode {
  font-family: Consolas, monospace;
  letter-spacing: 4px;
}
</style>
