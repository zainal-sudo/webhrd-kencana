<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import FSelect from "@/components/fields/FSelect.vue";
import { api, getErrorMessage } from "@/api/axios";

const route = useRoute();
const router = useRouter();
const toast = useToast();

const kode = computed(() => (route.query.kode as string) || "");
const users = ref<{ Kode: string; Nama: string }[]>([]);
const kodeAktif = ref(kode.value);
const items = ref<any[]>([]);
const memuat = ref(false);
const menyimpan = ref(false);

const grup = computed(() => {
  const g: Record<number, any[]> = {};
  for (const it of items.value) {
    const m = Number(it.men_modul) || 1;
    if (!g[m]) g[m] = [];
    g[m].push(it);
  }
  return Object.entries(g).map(([modul, list]) => ({ modul, list }));
});

onMounted(async () => {
  memuat.value = true;
  try {
    const [{ data: u }, { data: hak }] = await Promise.all([
      api.get("/master/user"),
      kode.value
        ? api.get(`/master/user/${encodeURIComponent(kode.value)}/hak`)
        : Promise.resolve({ data: { data: [] } }),
    ]);
    users.value = u.data;
    items.value = hak.data;
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat data hak akses"));
  } finally {
    memuat.value = false;
  }
});

async function gantiUser() {
  memuat.value = true;
  try {
    const { data } = await api.get(`/master/user/${encodeURIComponent(kodeAktif.value)}/hak`);
    items.value = data.data;
    router.replace({ path: "/setting/hak-akses", query: { kode: kodeAktif.value } });
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat hak akses"));
  } finally {
    memuat.value = false;
  }
}

function toggle(it: any, aksi: "insert" | "edit" | "delete", v: boolean) {
  it[aksi] = v ? "Y" : "0";
}

function setAll(list: any[], aksi: "insert" | "edit" | "delete", v: boolean) {
  for (const it of list) it[aksi] = v ? "Y" : "0";
}

async function simpan() {
  if (!kodeAktif.value) {
    toast.error("Pilih user terlebih dahulu");
    return;
  }
  menyimpan.value = true;
  try {
    const { data } = await api.put(`/master/user/${encodeURIComponent(kodeAktif.value)}/hak`, {
      user_kode: kodeAktif.value,
      items: items.value.map((it) => ({
        men_id: it.men_id,
        insert: it.insert,
        edit: it.edit,
        delete: it.delete,
      })),
    });
    toast.success(data.message || "Hak akses berhasil disimpan");
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal menyimpan hak akses"));
  } finally {
    menyimpan.value = false;
  }
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>Hak Akses User</h1>
        <p>Centang modul dan aksi yang boleh diakses user</p>
      </div>
      <button class="btn" @click="router.back()">Kembali</button>
    </div>

    <div class="bar-top">
      <div class="field">
        <label>Pilih User</label>
        <FSelect
          v-model="kodeAktif"
          label=""
          :options="users.map((u) => ({ label: `${u.Kode} - ${u.Nama}`, value: u.Kode }))"
          @update:model-value="gantiUser"
        />
      </div>
      <button class="btn primary" :disabled="!kodeAktif || menyimpan" @click="simpan">
        Simpan Hak Akses
      </button>
    </div>

    <div v-if="memuat" class="loading">Memuat...</div>

    <fieldset v-for="g in grup" v-else :key="g.modul" class="fs">
      <legend>Modul {{ g.modul }}</legend>
      <div class="tools">
        <button class="mini" @click="setAll(g.list, 'insert', true)">Semua Tambah</button>
        <button class="mini" @click="setAll(g.list, 'edit', true)">Semua Ubah</button>
        <button class="mini" @click="setAll(g.list, 'delete', true)">Semua Hapus</button>
        <button class="mini clear" @click="setAll(g.list, 'insert', false); setAll(g.list, 'edit', false); setAll(g.list, 'delete', false)">
          Bersihkan
        </button>
      </div>
      <table class="tbl">
        <thead>
          <tr>
            <th>Menu</th>
            <th>Keterangan</th>
            <th class="c">Tambah</th>
            <th class="c">Ubah</th>
            <th class="c">Hapus</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="it in g.list" :key="it.men_id">
            <td class="mono">{{ it.men_id }}</td>
            <td>{{ it.men_keterangan || it.men_nama }}</td>
            <td class="c">
              <input
                type="checkbox"
                :checked="it.insert === 'Y'"
                @change="toggle(it, 'insert', ($event.target as HTMLInputElement).checked)"
              />
            </td>
            <td class="c">
              <input
                type="checkbox"
                :checked="it.edit === 'Y'"
                @change="toggle(it, 'edit', ($event.target as HTMLInputElement).checked)"
              />
            </td>
            <td class="c">
              <input
                type="checkbox"
                :checked="it.delete === 'Y'"
                @change="toggle(it, 'delete', ($event.target as HTMLInputElement).checked)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </fieldset>
  </div>
</template>

<style scoped>
.bar-top {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.field {
  min-width: 280px;
}
.loading {
  padding: 24px;
  text-align: center;
  font-size: 12px;
  color: #6b7a90;
}
.fs {
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  margin-bottom: 12px;
  padding: 8px 12px 12px;
}
.fs legend {
  font-size: 12px;
  font-weight: 800;
  color: var(--ds-primary, #3b5998);
  padding: 0 6px;
}
.tools {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}
.mini {
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 3px 8px;
  cursor: pointer;
  font-family: "Plus Jakarta Sans", sans-serif;
}
.mini:hover {
  background: var(--ds-surface, #f0f3f8);
}
.mini.clear {
  color: #b91c1c;
}
.tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.tbl th {
  background: var(--ds-surface-variant, #e0e4ea);
  border: 1px solid var(--ds-border, #b0b8c4);
  padding: 4px 7px;
  text-align: left;
  font-weight: 800;
  color: var(--ds-on-surface, #12324f);
}
.tbl td {
  border: 1px solid #d5dbe3;
  padding: 3px 7px;
}
.tbl .c {
  text-align: center;
  width: 70px;
}
.mono {
  font-family: "Consolas", monospace;
  color: #46536a;
}
.btn {
  height: 32px;
  padding: 0 16px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.btn.primary {
  background: var(--ds-primary, #3b5998);
  border-color: var(--ds-primary, #3b5998);
  color: #fff;
}
.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>