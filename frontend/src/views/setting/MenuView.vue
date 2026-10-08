<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useToast } from "vue-toastification";
import FText from "@/components/fields/FText.vue";
import FNumber from "@/components/fields/FNumber.vue";
import { api, getErrorMessage } from "@/api/axios";

const toast = useToast();

const baris = ref<any[]>([]);
const memuat = ref(false);

async function muatDaftar() {
  memuat.value = true;
  try {
    const { data } = await api.get("/master/user/menu");
    baris.value = data.data.map((m: any) => ({
      men_id: m.men_id,
      men_nama: m.men_nama,
      men_keterangan: m.men_keterangan,
      men_modul: m.men_modul,
    }));
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat daftar menu"));
  } finally {
    memuat.value = false;
  }
}

function tambah() {
  baris.value.push({ men_id: "", men_nama: "", men_keterangan: "", men_modul: 1 });
}
function hapus(i: number) {
  baris.value.splice(i, 1);
}

async function simpanSemua() {
  try {
    for (const row of baris.value) {
      if (!row.men_id) continue;
      await api.post("/master/user/menu", row);
    }
    toast.success("Daftar menu tersimpan");
    await muatDaftar();
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal menyimpan menu"));
  }
}

onMounted(muatDaftar);
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>Menu / Modul</h1>
        <p>Daftar modul aplikasi. <b>Kode menu harus sama dengan nama form Delphi</b> karena dipakai untuk pencocokan hak akses.</p>
      </div>
      <div class="acts">
        <button class="btn" @click="muatDaftar">Muat Ulang</button>
        <button class="btn" @click="tambah">+ Baris</button>
        <button class="btn primary" @click="simpanSemua">Simpan Semua</button>
      </div>
    </div>

    <fieldset class="fs">
      <legend>Daftar Menu</legend>
      <div v-if="memuat" class="loading">Memuat...</div>
      <table v-else class="tbl">
        <thead>
          <tr>
            <th style="width: 200px">Kode Form ( men_id )</th>
            <th style="width: 220px">Nama</th>
            <th>Keterangan</th>
            <th style="width: 90px">Modul</th>
            <th style="width: 40px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in baris" :key="i">
            <td><FText v-model="r.men_id" label="" /></td>
            <td><FText v-model="r.men_nama" label="" /></td>
            <td><FText v-model="r.men_keterangan" label="" /></td>
            <td><FNumber v-model="r.men_modul" label="" /></td>
            <td><button class="del" @click="hapus(i)">x</button></td>
          </tr>
          <tr v-if="!baris.length">
            <td colspan="5" class="empty">Belum ada data menu</td>
          </tr>
        </tbody>
      </table>
    </fieldset>
  </div>
</template>

<style scoped>
.page { height: 100%; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.page-head { flex-shrink: 0; }
.acts {
  display: flex;
  gap: 6px;
}
.fs {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  padding: 8px 12px 12px;
}
.fs legend {
  font-size: 12px;
  font-weight: 800;
  color: var(--ds-primary, #3b5998);
  padding: 0 6px;
}
.loading {
  padding: 24px;
  text-align: center;
  font-size: 12px;
  color: #6b7a90;
}
.tbl {
  width: 100%;
  border-collapse: collapse;
}
.tbl th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--ds-surface-variant, #e0e4ea);
  border: 1px solid var(--ds-border, #b0b8c4);
  padding: 4px 7px;
  font-size: 10px;
  font-weight: 800;
  text-align: left;
  color: var(--ds-on-surface, #12324f);
}
.tbl td {
  border: 1px solid #d5dbe3;
  padding: 3px 5px;
  vertical-align: top;
}
.tbl :deep(label) {
  display: none;
}
.empty {
  text-align: center;
  color: #8995a6;
  padding: 12px;
  font-size: 11px;
}
.del {
  border: none;
  background: #b91c1c;
  color: #fff;
  width: 22px;
  height: 22px;
  font-weight: 800;
  cursor: pointer;
}
.btn {
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.btn.primary {
  background: var(--ds-primary, #3b5998);
  border-color: var(--ds-primary, #3b5998);
  color: #fff;
}
</style>
